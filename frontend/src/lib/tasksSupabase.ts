import { supabase, isSupabaseConfigured } from '@/lib/supabase'

export type TaskPriority = 'high' | 'medium' | 'low'
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done'

export type ProfileRow = {
  id: string
  email: string
  display_name: string | null
  role: string | null
  phone: string | null
  position: string | null
  additional_info: string | null
  created_at: string
  updated_at: string
  /** Редко обновляется клиентом (см. activityHeartbeat) */
  last_activity_at?: string | null
}

export type TaskRow = {
  id: string
  number: number
  assignee_id: string
  created_by: string | null
  title: string
  priority: TaskPriority
  field: string
  due_date: string | null
  status: TaskStatus
  work_type: string | null
  description: string | null
  created_at: string
  updated_at: string
}

export type Task = {
  id: string
  number: number
  title: string
  assignee: { id: string; name: string; initials: string }
  priority: TaskPriority
  field: string
  dueDate: string
  status: TaskStatus
  workType?: string
  description?: string
  createdAt: string
  createdBy?: { id: string; name: string } | null
}

export type TaskCommentRow = {
  id: string
  task_id: string
  user_id: string
  message: string
  created_at: string
}

export type TaskEventRow = {
  id: string
  task_id: string
  user_id: string | null
  event_type: string
  payload: Record<string, unknown> | null
  created_at: string
}

export type TaskFileRow = {
  id: string
  task_id: string
  file_path: string
  file_name: string
  file_size: number | null
  created_at: string
}

/** Плейсхолдер «нет срока» в текстовом поле due_date. */
const DUE_DATE_EMPTY_RE = /^[—\-–]+$/
const TASK_FILES_TABLE = 'task_files'
const TASK_FILES_BUCKET = 'task-attachments'

/**
 * Приводит `tasks.due_date` (text) к `YYYY-MM-DD` для сравнения с фильтрами аналитики.
 * В форме задач срок часто хранится как ДД.ММ.ГГГГ; также поддерживается ISO-префикс.
 */
export function taskDueDateToYmd(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const trimmed = raw.trim()
  if (!trimmed || DUE_DATE_EMPTY_RE.test(trimmed)) return null
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dmY = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (!dmY) return null
  const day = String(parseInt(dmY[1], 10)).padStart(2, '0')
  const month = String(parseInt(dmY[2], 10)).padStart(2, '0')
  return `${dmY[3]}-${month}-${day}`
}

function initialsFromName(name: string, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    if (parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase()
    return parts[0][0].toUpperCase()
  }
  const local = email.split('@')[0]
  if (local.length >= 2) return local.slice(0, 2).toUpperCase()
  return local[0].toUpperCase()
}

export async function loadProfiles(): Promise<ProfileRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, display_name, role, phone, position, additional_info, last_activity_at, created_at, updated_at')
    .order('email')
  if (error) throw error
  return (data ?? []) as ProfileRow[]
}

const PROFILE_FULL_COLUMNS = 'id, email, display_name, role, phone, position, additional_info, created_at, updated_at'
const PROFILE_MIN_COLUMNS = 'id, email, display_name, role, created_at, updated_at'

export async function loadProfileById(userId: string): Promise<ProfileRow | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_FULL_COLUMNS)
    .eq('id', userId)
    .maybeSingle()
  if (!error) {
    return data as ProfileRow | null
  }
  const isColumnError = error.code === '42703' || /column .* does not exist/i.test(error.message)
  if (isColumnError) {
    const { data: fallback, error: err2 } = await supabase
      .from('profiles')
      .select(PROFILE_MIN_COLUMNS)
      .eq('id', userId)
      .maybeSingle()
    if (err2) return null
    if (!fallback) return null
    return {
      ...fallback,
      phone: null,
      position: null,
      additional_info: null,
    } as ProfileRow
  }
  throw error
}

/** Создаёт или обновляет только базовые поля профиля (если в БД ещё нет колонок phone/position). */
export async function ensureProfileRow(
  userId: string,
  email: string,
  displayName: string | null,
  role: string | null,
): Promise<void> {
  if (!supabase) return
  const name = displayName?.trim() || null
  const { error } = await supabase.from('profiles').upsert(
    {
      id: userId,
      email,
      display_name: name,
      role,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )
  if (error) throw error
}

export async function upsertMyProfile(
  userId: string,
  email: string,
  displayName: string | null,
  role: string | null,
  opts?: { phone?: string | null; position?: string | null; additionalInfo?: string | null },
): Promise<void> {
  if (!supabase) throw new Error('Supabase не настроен')
  const name = displayName?.trim() || null
  const updatedAt = new Date().toISOString()
  try {
    if (opts) {
      const phone = opts.phone != null ? String(opts.phone).trim() || null : null
      const position = opts.position != null ? String(opts.position).trim() || null : null
      const additionalInfo = opts.additionalInfo != null ? String(opts.additionalInfo).trim() || null : null
      const { error } = await supabase.from('profiles').upsert(
        {
          id: userId,
          email,
          display_name: name,
          role,
          phone,
          position,
          additional_info: additionalInfo,
          updated_at: updatedAt,
        },
        { onConflict: 'id' },
      )
      if (error) throw error
      return
    }
    const { data: existing } = await supabase
      .from('profiles')
      .select('phone, position, additional_info')
      .eq('id', userId)
      .maybeSingle()
    const { error } = await supabase.from('profiles').upsert(
      {
        id: userId,
        email,
        display_name: name,
        role,
        phone: (existing as { phone?: string | null } | null)?.phone ?? null,
        position: (existing as { position?: string | null } | null)?.position ?? null,
        additional_info: (existing as { additional_info?: string | null } | null)?.additional_info ?? null,
        updated_at: updatedAt,
      },
      { onConflict: 'id' },
    )
    if (error) throw error
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string }
    const isColumnError = err?.code === '42703' || /column .* does not exist/i.test(err?.message ?? '')
    if (isColumnError) {
      await ensureProfileRow(userId, email, name, role)
      return
    }
    throw e
  }
}

export async function loadTasksFromSupabase(
  onlyMine: boolean,
  userId: string,
): Promise<TaskRow[]> {
  if (!supabase) return []
  let q = supabase
    .from('tasks')
    .select('id, number, assignee_id, created_by, title, priority, field, due_date, status, work_type, description, created_at, updated_at')
    .order('created_at', { ascending: false })
  if (onlyMine) q = q.eq('assignee_id', userId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as TaskRow[]
}

export type LoadTasksFilterOpts = {
  assigneeId?: string
  status?: TaskStatus
  limit?: number
}

export type LoadTasksPageOpts = {
  assigneeId?: string
  status?: TaskStatus
  page?: number
  pageSize?: number
}

export type TaskRowsPage = {
  rows: TaskRow[]
  total: number
}

/** Загрузка задач с фильтрами для поиска по номеру (бекенд). */
export async function loadTasksFiltered(
  onlyMine: boolean,
  userId: string,
  opts: LoadTasksFilterOpts = {},
): Promise<TaskRow[]> {
  if (!supabase) return []
  let q = supabase
    .from('tasks')
    .select('id, number, assignee_id, created_by, title, priority, field, due_date, status, work_type, description, created_at, updated_at')
    .order('created_at', { ascending: false })
  if (onlyMine) q = q.eq('assignee_id', userId)
  if (opts.assigneeId) q = q.eq('assignee_id', opts.assigneeId)
  if (opts.status) q = q.eq('status', opts.status)
  const limit = Math.min(Math.max(opts.limit ?? 500, 1), 500)
  const { data, error } = await q.limit(limit)
  if (error) throw error
  return (data ?? []) as TaskRow[]
}

/** Серверная пагинация задач (без клиентской нарезки). */
export async function loadTasksFilteredPage(
  onlyMine: boolean,
  userId: string,
  opts: LoadTasksPageOpts = {},
): Promise<TaskRowsPage> {
  if (!supabase) return { rows: [], total: 0 }
  const safePage = Math.max(1, Math.floor(opts.page ?? 1))
  const safePageSize = Math.min(100, Math.max(1, Math.floor(opts.pageSize ?? 10)))
  const from = (safePage - 1) * safePageSize
  const to = from + safePageSize - 1

  let q = supabase
    .from('tasks')
    .select('id, number, assignee_id, created_by, title, priority, field, due_date, status, work_type, description, created_at, updated_at', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (onlyMine) q = q.eq('assignee_id', userId)
  if (opts.assigneeId) q = q.eq('assignee_id', opts.assigneeId)
  if (opts.status) q = q.eq('status', opts.status)

  const { data, count, error } = await q
  if (error) throw error
  return { rows: (data ?? []) as TaskRow[], total: Number(count ?? 0) }
}

export function tasksWithAssignees(rows: TaskRow[], profiles: ProfileRow[]): Task[] {
  const profileMap = new Map(profiles.map((p) => [p.id, p]))
  return rows.map((r) => {
    const p = profileMap.get(r.assignee_id)
    const name = p ? (p.display_name || p.email) : 'Неизвестный'
    const initials = p ? initialsFromName(p.display_name || '', p.email) : '?'
    const creatorProfile = r.created_by ? profileMap.get(r.created_by) : undefined
    const creatorName = creatorProfile ? (creatorProfile.display_name || creatorProfile.email) : null
    return {
      id: r.id,
      number: r.number,
      title: r.title,
      assignee: { id: r.assignee_id, name, initials },
      priority: r.priority,
      field: r.field,
      dueDate: r.due_date || '—',
      status: r.status,
      workType: r.work_type ?? undefined,
      description: r.description ?? undefined,
      createdAt: r.created_at,
      createdBy: r.created_by && creatorName ? { id: r.created_by, name: creatorName } : null,
    }
  })
}

export async function createTask(
  payload: {
    title: string
    priority: TaskPriority
    field: string
    due_date: string
    status: TaskStatus
    work_type?: string
    description?: string
  },
  assigneeId: string,
  createdBy: string | null,
): Promise<TaskRow> {
  if (!supabase) throw new Error('Supabase не настроен')
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      assignee_id: assigneeId,
      created_by: createdBy,
      title: payload.title,
      priority: payload.priority,
      field: payload.field,
      due_date: payload.due_date || null,
      status: payload.status,
      work_type: payload.work_type || null,
      description: payload.description || null,
    })
    .select()
    .single()
  if (error) throw error
  return data as TaskRow
}

export async function updateTask(
  id: string,
  updates: Partial<{
    title: string
    priority: TaskPriority
    field: string
    due_date: string
    status: TaskStatus
    work_type: string
    description: string
    assignee_id: string
  }>,
): Promise<void> {
  if (!supabase) throw new Error('Supabase не настроен')
  const { error } = await supabase
    .from('tasks')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function loadTaskComments(taskId: string): Promise<TaskCommentRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('task_comments')
    .select('id, task_id, user_id, message, created_at')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as TaskCommentRow[]
}

export async function addTaskComment(taskId: string, userId: string, message: string): Promise<TaskCommentRow> {
  if (!supabase) throw new Error('Supabase не настроен')
  const trimmed = message.trim()
  if (!trimmed) throw new Error('Пустой комментарий')
  const { data, error } = await supabase
    .from('task_comments')
    .insert({
      task_id: taskId,
      user_id: userId,
      message: trimmed,
    })
    .select('id, task_id, user_id, message, created_at')
    .single()
  if (error) throw error
  return data as TaskCommentRow
}

export async function loadTaskEvents(taskId: string): Promise<TaskEventRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('task_events')
    .select('id, task_id, user_id, event_type, payload, created_at')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as TaskEventRow[]
}

export async function addTaskEvent(
  args: {
    taskId: string
    userId: string | null
    eventType: string
    payload?: Record<string, unknown> | null
  },
): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('task_events').insert({
    task_id: args.taskId,
    user_id: args.userId,
    event_type: args.eventType,
    payload: args.payload ?? null,
  })
  if (error) {
    console.warn('Не удалось записать событие задачи', error)
  }
}

export async function loadTaskFiles(taskId: string): Promise<TaskFileRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from(TASK_FILES_TABLE)
    .select('id, task_id, file_path, file_name, file_size, created_at')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as TaskFileRow[]
}

export async function uploadTaskFile(taskId: string, file: File): Promise<TaskFileRow> {
  if (!supabase) throw new Error('Supabase не настроен')
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
  const path = `tasks/${taskId}/${Date.now()}-${safeName}`
  const { error: uploadError } = await supabase.storage.from(TASK_FILES_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (uploadError) throw uploadError
  const { data, error } = await supabase
    .from(TASK_FILES_TABLE)
    .insert({
      task_id: taskId,
      file_path: path,
      file_name: file.name,
      file_size: file.size,
    })
    .select('id, task_id, file_path, file_name, file_size, created_at')
    .single()
  if (error) throw error
  return data as TaskFileRow
}

export async function deleteTaskFile(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase не настроен')
  const { data: row, error: fetchError } = await supabase
    .from(TASK_FILES_TABLE)
    .select('id, file_path')
    .eq('id', id)
    .single()
  if (fetchError || !row) throw fetchError || new Error('Файл не найден')
  const storagePath = row.file_path as string
  const { error: deleteError } = await supabase.from(TASK_FILES_TABLE).delete().eq('id', id)
  if (deleteError) throw deleteError
  if (storagePath && !storagePath.startsWith('http')) {
    await supabase.storage.from(TASK_FILES_BUCKET).remove([storagePath])
  }
}

export function getTaskFilePublicUrl(filePath: string): string {
  if (!supabase) return ''
  const { data } = supabase.storage.from(TASK_FILES_BUCKET).getPublicUrl(filePath)
  return data.publicUrl
}

export async function deleteTask(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase не настроен')
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}

export { isSupabaseConfigured }
