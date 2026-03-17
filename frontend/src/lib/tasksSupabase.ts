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
    .select('id, email, display_name, role, phone, position, additional_info, created_at, updated_at')
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

export function tasksWithAssignees(rows: TaskRow[], profiles: ProfileRow[]): Task[] {
  const profileMap = new Map(profiles.map((p) => [p.id, p]))
  return rows.map((r) => {
    const p = profileMap.get(r.assignee_id)
    const name = p ? (p.display_name || p.email) : 'Неизвестный'
    const initials = p ? initialsFromName(p.display_name || '', p.email) : '?'
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

export async function deleteTask(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase не настроен')
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}

export { isSupabaseConfigured }
