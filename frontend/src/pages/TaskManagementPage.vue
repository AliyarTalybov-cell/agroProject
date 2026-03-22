<script setup lang="ts">
import { computed, ref, watch, onMounted, onActivated } from 'vue'
import { useRoute } from 'vue-router'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import { useAuth } from '@/stores/auth'
import CalendarPopover from '@/components/CalendarPopover.vue'
import {
  isSupabaseConfigured,
  loadProfiles,
  loadTasksFromSupabase,
  loadTasksFiltered,
  tasksWithAssignees,
  createTask as createTaskApi,
  updateTask as updateTaskApi,
  deleteTask as deleteTaskApi,
  loadTaskComments,
  addTaskComment,
  loadTaskEvents,
  addTaskEvent,
} from '@/lib/tasksSupabase'
import { loadFields as loadFieldsApi } from '@/lib/fieldsSupabase'
import { loadWorkOperations, type WorkOperationRow } from '@/lib/reasonsAndOperations'
import type { Task as TaskType, ProfileRow, TaskCommentRow, TaskEventRow } from '@/lib/tasksSupabase'
import { avatarColorByPosition } from '@/lib/avatarColors'
import UiDeleteButton from '@/components/UiDeleteButton.vue'
import UiLoadingBar from '@/components/UiLoadingBar.vue'

type ViewMode = 'kanban' | 'list'
type FilterKey = 'all' | 'mine'
type Priority = 'high' | 'medium' | 'low'
type Status = 'todo' | 'in_progress' | 'review' | 'done'

interface AssigneeOption {
  id: string
  name: string
  initials: string
}

type Task = TaskType

const auth = useAuth()
const route = useRoute()
const viewMode = ref<ViewMode>('kanban')
function dateToYyyyMmDd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const today = dateToYyyyMmDd(new Date())
const weekAgo = dateToYyyyMmDd(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))

const activeFilter = ref<FilterKey>('all')
const filterEmployeeId = ref<string>('')
const filterStatus = ref<Status | ''>('')
const filterDateFrom = ref<string>(weekAgo)
const filterDateTo = ref<string>(today)
const dateFromInput = ref<string>(weekAgo)
const dateToInput = ref<string>(today)
const searchTaskNumber = ref('')
let searchByNumberTimeout: ReturnType<typeof setTimeout> | null = null
const currentPage = ref(1)
const pageSize = ref(10)
const showCreateModal = ref(false)
const editingTaskId = ref<string | null>(null)
const selectedTaskId = ref<string | null>(null)
const dragTaskId = ref<string | null>(null)
const dragOverColumn = ref<Status | null>(null)
let clickAfterDragGuard = false

const tasksLoading = ref(true)
const tasks = ref<Task[]>([])
const profiles = ref<ProfileRow[]>([])
const taskComments = ref<TaskCommentRow[]>([])
const taskEvents = ref<TaskEventRow[]>([])
const commentsLoading = ref(false)
const eventsLoading = ref(false)
const newCommentMessage = ref('')
const isEditingDetail = ref(false)
const isSavingDetail = ref(false)
const isSendingComment = ref(false)
const isMetaInitialLoading = ref(false)
const assignees = computed<AssigneeOption[]>(() => {
  if (!auth.user.value) return []
  const list = profiles.value.map((p) => ({
    id: p.id,
    name: p.display_name || p.email,
    initials: p.display_name
      ? (p.display_name.trim().split(/\s+/).length >= 2
          ? (p.display_name.trim().split(/\s+/)[0][0] + p.display_name.trim().split(/\s+/)[1][0]).toUpperCase()
          : p.display_name.trim().slice(0, 2).toUpperCase())
      : p.email.slice(0, 2).toUpperCase(),
  }))
  if (!isManager.value) {
    const me = auth.user.value
    const email = me.email ?? ''
    const name = (me.user_metadata?.full_name as string) || email
    return [{ id: me.id, name, initials: name.slice(0, 2).toUpperCase() }]
  }
  return list
})
const currentUserAssignee = computed<AssigneeOption | null>(() => {
  if (!auth.user.value) return null
  const me = auth.user.value
  const email = me.email ?? ''
  const name = (me.user_metadata?.full_name as string) || email
  return { id: me.id, name, initials: name.slice(0, 2).toUpperCase() }
})

const isManager = computed(() => auth.userRole.value === 'manager')

const profilesMap = computed(() => new Map(profiles.value.map((p) => [p.id, p])))

function profileName(userId: string | null | undefined): string {
  if (!userId) return 'Система'
  const p = profilesMap.value.get(userId)
  if (!p) return 'Система'
  return (p.display_name || p.email || '').trim() || 'Сотрудник'
}

function profileInitials(userId: string | null | undefined): string {
  if (!userId) return 'С'
  const p = profilesMap.value.get(userId)
  if (!p) return 'С'
  const base = (p.display_name || p.email || '').trim()
  const parts = base.split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return base.slice(0, 2).toUpperCase()
}

function avatarStyleByUserId(userId: string | null | undefined): Record<string, string> | undefined {
  if (!userId) return undefined
  const p = profilesMap.value.get(userId)
  return { background: avatarColorByPosition(p?.position) }
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function loadData() {
  if (!isSupabaseConfigured() || !auth.user.value) {
    tasks.value = []
    tasksLoading.value = false
    return
  }
  tasksLoading.value = true
  try {
    const user = auth.user.value
    const [profileList, fieldRows, workOps] = await Promise.all([
      loadProfiles(),
      loadFieldsApi(),
      loadWorkOperations(),
    ])
    profiles.value = profileList
    fields.value = fieldRows.map((f) => f.name).sort((a, b) => a.localeCompare(b, 'ru-RU'))
    workTypes.value = workOps.map((op: WorkOperationRow) => op.name)
    const onlyMine = auth.userRole.value === 'worker'
    const rows = await loadTasksFiltered(onlyMine, user.id, {
      status: filterStatus.value || undefined,
      assigneeId: filterEmployeeId.value || undefined,
    })
    tasks.value = tasksWithAssignees(rows, profileList)
  } catch {
    tasks.value = []
  } finally {
    tasksLoading.value = false
  }
}

const fields = ref<string[]>([])
const workTypes = ref<string[]>([])

const filters: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Все задачи' },
  { key: 'mine', label: 'На мне' },
]

const statusColumns: { key: Status; title: string }[] = [
  { key: 'todo', title: 'К выполнению' },
  { key: 'in_progress', title: 'В процессе' },
  { key: 'review', title: 'На проверке' },
  { key: 'done', title: 'Выполнено' },
]

/** Параметры с страницы «Аналитика» (карточка задач по сроку). */
function applyAnalyticsQueryParams() {
  const q = route.query
  if (q.due_upto === '1' && typeof q.due_to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(q.due_to)) {
    filterDateFrom.value = ''
    dateFromInput.value = ''
    filterDateTo.value = q.due_to
    dateToInput.value = q.due_to
  } else {
    if (typeof q.due_from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(q.due_from)) {
      filterDateFrom.value = q.due_from
      dateFromInput.value = q.due_from
    }
    if (typeof q.due_to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(q.due_to)) {
      filterDateTo.value = q.due_to
      dateToInput.value = q.due_to
    }
  }
  if (q.kpi_completed_due === '1') {
    filterStatus.value = 'done'
  }
}

onMounted(() => {
  applyAnalyticsQueryParams()
  loadData()
})
onActivated(loadData)

const form = ref({
  title: '',
  assigneeId: '',
  field: '',
  priority: 'medium' as Priority,
  dueDate: '',
  workType: '',
  description: '',
})

function parseDueDate(dueDate: string): Date | null {
  if (!dueDate || dueDate === '—') return null
  const trimmed = dueDate.trim()
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) {
    const y = parseInt(iso[1], 10)
    const mo = parseInt(iso[2], 10) - 1
    const day = parseInt(iso[3], 10)
    const d = new Date(y, mo, day)
    return isNaN(d.getTime()) ? null : d
  }
  const m = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (!m) return null
  const [, day, month, year] = m
  const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10))
  return isNaN(d.getTime()) ? null : d
}

const filteredTasks = computed(() => {
  let list = tasks.value
  if (activeFilter.value === 'mine' && auth.user.value) {
    const myId = auth.user.value.id
    list = list.filter((t) => (t.assignee as { id?: string }).id === myId)
  }
  if (filterEmployeeId.value) {
    list = list.filter((t) => (t.assignee as { id?: string }).id === filterEmployeeId.value)
  }
  if (filterStatus.value) {
    list = list.filter((t) => t.status === filterStatus.value)
  }
  const from = filterDateFrom.value ? new Date(filterDateFrom.value) : null
  const to = filterDateTo.value ? new Date(filterDateTo.value) : null
  if (from || to) {
    list = list.filter((t) => {
      const d = parseDueDate(t.dueDate)
      if (!d) return true
      if (from && d < new Date(from.getFullYear(), from.getMonth(), from.getDate())) return false
      if (to) {
        const toEnd = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1)
        if (d >= toEnd) return false
      }
      return true
    })
  }
  return list
})

const totalFiltered = computed(() => filteredTasks.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalFiltered.value / pageSize.value)))

const paginationStart = computed(() => (currentPage.value - 1) * pageSize.value + 1)
const paginationEnd = computed(() =>
  Math.min(currentPage.value * pageSize.value, totalFiltered.value),
)

const pageNumbers = computed(() => {
  const total = totalPages.value
  const current = currentPage.value
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | 'ellipsis')[] = [1]
  if (current > 2) pages.push('ellipsis')
  if (current > 1 && current < total) pages.push(current)
  if (current < total - 1) pages.push('ellipsis')
  if (total > 1) pages.push(total)
  return pages
})

function goToPage(page: number) {
  currentPage.value = Math.max(1, Math.min(page, totalPages.value))
}

const paginatedTasks = computed(() => {
  const list = filteredTasks.value
  const start = (currentPage.value - 1) * pageSize.value
  return list.slice(start, start + pageSize.value)
})

const tasksByStatus = computed(() => {
  const byStatus: Record<Status, Task[]> = {
    todo: [],
    in_progress: [],
    review: [],
    done: [],
  }
  paginatedTasks.value.forEach((t) => byStatus[t.status].push(t))
  return byStatus
})

/* Номер задачи приходит с бэкенда (поле number в таблице tasks) */
function getTaskNumber(taskId: string): number {
  const task = tasks.value.find((t) => t.id === taskId) ?? filteredTasks.value.find((t) => t.id === taskId)
  return task?.number ?? 0
}

function applyDateFilter() {
  filterDateFrom.value = dateFromInput.value
  filterDateTo.value = dateToInput.value
  currentPage.value = 1
  const numStr = searchTaskNumber.value.trim()
  if (numStr && parseInt(numStr, 10) >= 1) {
    searchTaskByNumber()
    return
  }
  if (isSupabaseConfigured() && auth.user.value) loadData()
}

watch(
  () => [filterDateFrom.value, filterDateTo.value, filterEmployeeId.value, filterStatus.value, activeFilter.value],
  () => {
    currentPage.value = 1
    const numStr = searchTaskNumber.value.trim()
    if (numStr && parseInt(numStr, 10) >= 1) {
      searchTaskByNumber()
      return
    }
    if (isSupabaseConfigured() && auth.user.value) loadData()
  },
)
watch(searchTaskNumber, () => { currentPage.value = 1 })
watch(totalPages, (pages) => {
  if (currentPage.value > pages) currentPage.value = Math.max(1, pages)
})

async function searchTaskByNumber() {
  const numSearch = searchTaskNumber.value.trim()
  if (!numSearch || !auth.user.value || !isSupabaseConfigured()) return
  const num = parseInt(numSearch, 10)
  if (isNaN(num) || num < 1) {
    tasks.value = []
    return
  }
  tasksLoading.value = true
  try {
    const profileList = await loadProfiles()
    const onlyMine = auth.userRole.value === 'worker'
    const rows = await loadTasksFiltered(onlyMine, auth.user.value.id, {
      assigneeId: filterEmployeeId.value || undefined,
      status: filterStatus.value || undefined,
      limit: 500,
    })
    let list = tasksWithAssignees(rows, profileList)
    if (activeFilter.value === 'mine' && auth.user.value) {
      const myId = auth.user.value.id
      list = list.filter((t) => (t.assignee as { id?: string }).id === myId)
    }
    const from = filterDateFrom.value ? new Date(filterDateFrom.value) : null
    const to = filterDateTo.value ? new Date(filterDateTo.value) : null
    if (from || to) {
      list = list.filter((t) => {
        const d = parseDueDate(t.dueDate)
        if (!d) return true
        if (from && d < new Date(from.getFullYear(), from.getMonth(), from.getDate())) return false
        if (to) {
          const toEnd = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1)
          if (d >= toEnd) return false
        }
        return true
      })
    }
    const task = list.find((t) => t.number === num) ?? null
    tasks.value = task ? [task] : []
  } catch {
    tasks.value = []
  } finally {
    tasksLoading.value = false
  }
}

function onSearchTaskNumberChange() {
  const val = searchTaskNumber.value.trim()
  if (!val) {
    loadData()
    return
  }
  const num = parseInt(val, 10)
  if (!isNaN(num) && num >= 1) searchTaskByNumber()
  else tasks.value = []
}

watch(searchTaskNumber, (val) => {
  if (searchByNumberTimeout) clearTimeout(searchByNumberTimeout)
  const trimmed = val.trim()
  if (!trimmed) {
    loadData()
    return
  }
  const num = parseInt(trimmed, 10)
  if (isNaN(num) || num < 1) {
    tasks.value = []
    return
  }
  searchByNumberTimeout = setTimeout(() => searchTaskByNumber(), 400)
})

const countByStatus = (status: Status) => tasksByStatus.value[status].length

const selectedTask = computed(() =>
  selectedTaskId.value
    ? (tasks.value.find((t) => t.id === selectedTaskId.value) ?? null)
    : null
)

const selectedTaskCreatorName = computed(() => (selectedTask.value?.createdBy?.name ?? '—'))
const selectedTaskCreatedAt = computed(() => formatDateTime(selectedTask.value?.createdAt))

async function loadMetaForTask(taskId: string) {
  if (!isSupabaseConfigured() || !auth.user.value) {
    taskComments.value = []
    taskEvents.value = []
    return
  }
  commentsLoading.value = true
  eventsLoading.value = true
  isMetaInitialLoading.value = true
  try {
    const [comments, events] = await Promise.all([loadTaskComments(taskId), loadTaskEvents(taskId)])
    taskComments.value = comments
    taskEvents.value = events
  } catch {
    taskComments.value = []
    taskEvents.value = []
  } finally {
    commentsLoading.value = false
    eventsLoading.value = false
    isMetaInitialLoading.value = false
  }
}

function openCreate() {
  editingTaskId.value = null
  const d = new Date()
  const defaultAssigneeId = !isManager.value && currentUserAssignee.value
    ? currentUserAssignee.value.id
    : (assignees.value[0]?.id ?? '')
  form.value = {
    title: '',
    assigneeId: defaultAssigneeId,
    field: fields.value[0] || '',
    priority: 'medium',
    dueDate: d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '.'),
    workType: workTypes.value[0] || '',
    description: '',
  }
  showCreateModal.value = true
}

function openEdit() {
  const task = selectedTask.value
  if (!task) return
  const assigneeId = (task.assignee as { id?: string }).id ?? assignees.value[0]?.id ?? ''
  form.value = {
    title: task.title,
    assigneeId,
    field: task.field,
    priority: task.priority,
    dueDate: task.dueDate === '—' ? '' : task.dueDate,
    workType: task.workType ?? (workTypes.value[0] || ''),
    description: task.description ?? '',
  }
  editingTaskId.value = task.id
  isEditingDetail.value = true
}

function closeCreate() {
  showCreateModal.value = false
  editingTaskId.value = null
}

async function createTask() {
  const title = form.value.title.trim()
  if (!title) return
  const assignee = assignees.value.find((a) => a.id === form.value.assigneeId) ?? assignees.value[0]
  if (!assignee) return
  if (!editingTaskId.value) {
    if (!isSupabaseConfigured() || !auth.user.value) return
    try {
      await createTaskApi(
        {
          title,
          priority: form.value.priority,
          field: form.value.field,
          due_date: form.value.dueDate || '—',
          status: 'todo',
          work_type: form.value.workType,
          description: form.value.description.trim() || undefined,
        },
        assignee.id,
        auth.user.value.id,
      )
      await loadData()
    } catch {
      // skip if no Supabase
    }
  }
  closeCreate()
}

async function saveDetailEdit() {
  const task = selectedTask.value
  if (!task || !editingTaskId.value) return
  if (isSavingDetail.value) return
  const prevField = task.field
  const prevWorkType = task.workType ?? ''
  const title = form.value.title.trim()
  if (!title) return
  const assignee = assignees.value.find((a) => a.id === form.value.assigneeId) ?? assignees.value[0]
  if (!assignee) return
  isSavingDetail.value = true
  if (!isSupabaseConfigured()) {
    // локальное обновление без Supabase
    const t = tasks.value.find((x) => x.id === editingTaskId.value)
    if (t) {
      t.title = title
      t.assignee = { id: assignee.id, name: assignee.name, initials: assignee.initials }
      t.priority = form.value.priority
      t.field = form.value.field
      t.dueDate = form.value.dueDate || '—'
      t.workType = form.value.workType || undefined
      t.description = form.value.description.trim() || undefined
    }
    isEditingDetail.value = false
    isSavingDetail.value = false
    return
  }
  try {
    const payload: Parameters<typeof updateTaskApi>[1] = {
      title,
      priority: form.value.priority,
      field: form.value.field,
      due_date: form.value.dueDate || '—',
      work_type: form.value.workType,
      description: form.value.description.trim() || undefined,
    }
    if (isManager.value && assignee.id) payload.assignee_id = assignee.id
    await updateTaskApi(editingTaskId.value, payload)
    await loadData()
  } catch {
    const t = tasks.value.find((x) => x.id === editingTaskId.value)
    if (t) {
      t.title = title
      t.assignee = { id: assignee.id, name: assignee.name, initials: assignee.initials }
      t.priority = form.value.priority
      t.field = form.value.field
      t.dueDate = form.value.dueDate || '—'
      t.workType = form.value.workType || undefined
      t.description = form.value.description.trim() || undefined
    }
  } finally {
    // события истории по изменению типа работ и локации
    const newField = form.value.field
    const newWorkType = form.value.workType || ''
    const userId = auth.user.value?.id ?? null
    if (newField !== prevField) {
      addTaskEvent({
        taskId: editingTaskId.value,
        userId,
        eventType: 'field_changed',
        payload: { from: prevField, to: newField },
      })
    }
    if (newWorkType !== prevWorkType) {
      addTaskEvent({
        taskId: editingTaskId.value,
        userId,
        eventType: 'work_type_changed',
        payload: { from: prevWorkType || null, to: newWorkType || null },
      })
    }
    isEditingDetail.value = false
    isSavingDetail.value = false
  }
}

function cancelDetailEdit() {
  const task = selectedTask.value
  if (!task) {
    isEditingDetail.value = false
    return
  }
  const assigneeId = (task.assignee as { id?: string }).id ?? assignees.value[0]?.id ?? ''
  form.value = {
    title: task.title,
    assigneeId,
    field: task.field,
    priority: task.priority,
    dueDate: task.dueDate === '—' ? '' : task.dueDate,
    workType: task.workType ?? (workTypes.value[0] || ''),
    description: task.description ?? '',
  }
  isEditingDetail.value = false
}

async function openTask(id: string) {
  if (clickAfterDragGuard) return
  selectedTaskId.value = id
  await loadMetaForTask(id)
}
function closeTask() {
  selectedTaskId.value = null
  taskComments.value = []
  taskEvents.value = []
  newCommentMessage.value = ''
  isEditingDetail.value = false
}

async function updateTaskStatus(taskId: string, newStatus: Status) {
  const t = tasks.value.find((x) => x.id === taskId)
  const prevStatus = t?.status
  if (t) t.status = newStatus
  if (isSupabaseConfigured()) {
    try {
      await updateTaskApi(taskId, { status: newStatus })
      await addTaskEvent({
        taskId,
        userId: auth.user.value?.id ?? null,
        eventType: 'status_changed',
        payload: { from: prevStatus, to: newStatus },
      })
    } catch {
      if (t && prevStatus !== undefined) t.status = prevStatus
    }
  }
}

async function submitComment() {
  const task = selectedTask.value
  const user = auth.user.value
  if (!task || !user) return
  const text = newCommentMessage.value.trim()
  if (!text) return
  if (isSendingComment.value) return
  isSendingComment.value = true
  try {
    const comment = await addTaskComment(task.id, user.id, text)
    taskComments.value.push(comment)
    newCommentMessage.value = ''
    await addTaskEvent({
      taskId: task.id,
      userId: user.id,
      eventType: 'comment_added',
      payload: { preview: text.slice(0, 140) },
    })
  } catch {
    // ignore for now
  } finally {
    isSendingComment.value = false
  }
}

async function deleteTask() {
  if (!selectedTaskId.value) return
  if (!confirm('Удалить эту задачу?')) return
  if (isSupabaseConfigured()) {
    try {
      await deleteTaskApi(selectedTaskId.value)
      await loadData()
    } catch {
      tasks.value = tasks.value.filter((t) => t.id !== selectedTaskId.value)
    }
  } else {
    tasks.value = tasks.value.filter((t) => t.id !== selectedTaskId.value)
  }
  closeTask()
}

function onDragStart(e: DragEvent, taskId: string) {
  dragTaskId.value = taskId
  e.dataTransfer!.effectAllowed = 'move'
  e.dataTransfer!.setData('text/plain', taskId)
  if (e.target instanceof HTMLElement) e.target.classList.add('task-card--dragging')
}
function onDragEnd(e: DragEvent) {
  dragTaskId.value = null
  dragOverColumn.value = null
  clickAfterDragGuard = true
  setTimeout(() => { clickAfterDragGuard = false }, 150)
  if (e.target instanceof HTMLElement) e.target.classList.remove('task-card--dragging')
}
function onDragOver(e: DragEvent, status: Status) {
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'move'
  dragOverColumn.value = status
}
function onDragLeave() {
  dragOverColumn.value = null
}
async function onDrop(e: DragEvent, newStatus: Status) {
  e.preventDefault()
  dragOverColumn.value = null
  const taskId = e.dataTransfer?.getData('text/plain')
  if (taskId) await updateTaskStatus(taskId, newStatus)
}

function statusTitle(s: Status): string {
  return statusColumns.find((c) => c.key === s)?.title ?? s
}
function priorityLabel(p: Priority): string {
  return { high: 'Высокий', medium: 'Средний', low: 'Низкий' }[p]
}

const CSV_SEP = '\t'

function escapeCsvCell(val: string): string {
  const s = String(val ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""')
  return s.includes(CSV_SEP) || s.includes('"') || s.includes('\r') ? `"${s}"` : s
}

function exportToExcel() {
  const list = filteredTasks.value
  if (!list.length) return
  const headers = ['№', 'Название', 'Исполнитель', 'Приоритет', 'Поле', 'Срок', 'Статус', 'Тип работы', 'Описание']
  const rows = list.map((t, i) => [
    String(i + 1),
    t.title,
    t.assignee.name,
    priorityLabel(t.priority),
    t.field,
    t.dueDate,
    statusTitle(t.status),
    t.workType ?? '',
    (t.description ?? '').replace(/\r?\n/g, ' '),
  ])
  const line = (arr: string[]) => arr.map(escapeCsvCell).join(CSV_SEP)
  const csv = '\uFEFF' + [line(headers), ...rows.map((r) => line(r))].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `задачи_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}

async function exportToPdf() {
  const list = filteredTasks.value
  if (!list.length) return
  const headers = ['№', 'Название', 'Исполнитель', 'Приоритет', 'Поле', 'Срок', 'Статус', 'Тип работы', 'Описание']
  const rows = list.map((t, i) => [
    String(i + 1),
    escapeHtml(t.title),
    escapeHtml(t.assignee.name),
    escapeHtml(priorityLabel(t.priority)),
    escapeHtml(t.field),
    escapeHtml(t.dueDate),
    escapeHtml(statusTitle(t.status)),
    escapeHtml(t.workType ?? ''),
    escapeHtml((t.description ?? '').slice(0, 80)),
  ])
  const tableRows = rows
    .map(
      (r) =>
        `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`,
    )
    .join('')
  const headerCells = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')
  const html = `
    <div class="pdf-export-table-wrap" style="position:fixed;left:-9999px;top:0;width:1100px;font-family:Arial,sans-serif;font-size:12px;background:#fff;">
      <h2 style="margin:0 0 12px 0;font-size:16px;">Список задач</h2>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;">
        <thead><tr style="background:#225533;color:#fff;">${headerCells}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `
  const wrap = document.createElement('div')
  wrap.innerHTML = html.trim()
  const el = wrap.firstElementChild as HTMLElement
  document.body.appendChild(el)
  try {
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging: false })
    document.body.removeChild(el)
    const imgData = canvas.toDataURL('image/png')
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const margin = 10
    const maxW = pageW - margin * 2
    const maxH = pageH - margin * 2
    let w = maxW
    let h = (canvas.height / canvas.width) * w
    if (h > maxH) {
      h = maxH
      w = (canvas.width / canvas.height) * h
    }
    doc.addImage(imgData, 'PNG', margin, margin, w, h)
    const blob = doc.output('blob')
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener,noreferrer')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  } catch {
    document.body.removeChild(el)
  }
}

function priorityClass(p: Priority) {
  return { high: 'priority-high', medium: 'priority-medium', low: 'priority-low' }[p]
}
function statusClass(s: Status) {
  return {
    todo: 'status-todo',
    in_progress: 'status-in-progress',
    review: 'status-review',
    done: 'status-done',
  }[s]
}
</script>

<template>
  <section class="task-management-page page-enter-item">
    <header class="task-header">
      <div class="task-header-left">
        <div class="task-filter-row">
          <div class="task-filter-tabs">
            <button
              v-for="f in filters"
              :key="f.key"
              type="button"
              class="task-filter-tab"
              :class="{ 'task-filter-tab--active': activeFilter === f.key }"
              @click="activeFilter = f.key"
            >
              {{ f.label }}
            </button>
          </div>
          <select
            v-if="isManager"
            v-model="filterEmployeeId"
            class="task-filter-pill task-filter-pill--select"
            title="Сотрудник"
            :disabled="!assignees.length"
          >
            <option value="">Все сотрудники</option>
            <option
              v-for="a in assignees"
              :key="a.id"
              :value="a.id"
            >
              {{ a.name }}
            </option>
          </select>
          <select
            v-model="filterStatus"
            class="task-filter-pill task-filter-pill--select"
            title="Статус"
          >
            <option value="">Все статусы</option>
            <option
              v-for="col in statusColumns"
              :key="col.key"
              :value="col.key"
            >
              {{ col.title }}
            </option>
          </select>
          <div class="task-filter-dates">
            <span class="task-filter-date-label">С</span>
            <CalendarPopover v-model="dateFromInput" placeholder="Дата с" />
            <span class="task-filter-date-label">По</span>
            <CalendarPopover v-model="dateToInput" placeholder="Дата по" />
            <button type="button" class="task-filter-tab task-filter-apply-dates" @click="applyDateFilter">
              Применить
            </button>
          </div>
        </div>
        <div class="task-view-toggle">
          <button
            type="button"
            class="task-view-btn"
            :class="{ 'task-view-btn--active': viewMode === 'kanban' }"
            aria-label="Канбан"
            @click="viewMode = 'kanban'"
          >
            <svg class="task-header-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="7" height="7" x="3" y="3" rx="1"/>
              <rect width="7" height="7" x="14" y="3" rx="1"/>
              <rect width="7" height="7" x="14" y="14" rx="1"/>
              <rect width="7" height="7" x="3" y="14" rx="1"/>
            </svg>
            Канбан
          </button>
          <button
            type="button"
            class="task-view-btn"
            :class="{ 'task-view-btn--active': viewMode === 'list' }"
            aria-label="Список"
            @click="viewMode = 'list'"
          >
            <svg class="task-header-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="8" x2="21" y1="6" y2="6"/>
              <line x1="8" x2="21" y1="12" y2="12"/>
              <line x1="8" x2="21" y1="18" y2="18"/>
              <line x1="3" x2="3.01" y1="6" y2="6"/>
              <line x1="3" x2="3.01" y1="12" y2="12"/>
              <line x1="3" x2="3.01" y1="18" y2="18"/>
            </svg>
            Список
          </button>
        </div>
      </div>
      <div class="task-header-actions">
        <div class="task-search-wrap">
          <span class="task-search-icon" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </span>
          <input
            v-model.trim="searchTaskNumber"
            type="text"
            inputmode="numeric"
            class="task-search-input"
            placeholder="Поиск по номеру"
          />
        </div>
        <div class="task-export-btns">
          <button
            type="button"
            class="task-btn-export"
            :disabled="!filteredTasks.length"
            title="Экспорт в PDF (предпросмотр)"
            @click="exportToPdf"
          >
            <svg class="task-header-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15h6"/></svg>
            PDF
          </button>
          <button
            type="button"
            class="task-btn-export"
            :disabled="!filteredTasks.length"
            title="Экспорт в Excel"
            @click="exportToExcel"
          >
            <svg class="task-header-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/></svg>
            Excel
          </button>
        </div>
        <button type="button" class="task-btn-create" @click="openCreate">
          <svg class="task-header-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
          Создать задачу
        </button>
      </div>
    </header>

    <div v-if="tasksLoading" class="task-loading" role="status" aria-live="polite">
      <UiLoadingBar />
    </div>
    <!-- Kanban -->
    <div v-show="viewMode === 'kanban' && !tasksLoading" class="task-kanban">
      <div
        v-for="col in statusColumns"
        :key="col.key"
        class="task-kanban-column"
        :class="{ 'task-kanban-column--drag-over': dragOverColumn === col.key }"
        @dragover="(e) => onDragOver(e, col.key)"
        @dragleave="onDragLeave"
        @drop="(e) => onDrop(e, col.key)"
      >
        <h3 class="task-column-title">
          {{ col.title }} {{ countByStatus(col.key) }}
        </h3>
        <div class="task-column-underline" aria-hidden="true"></div>
        <div class="task-column-cards">
          <article
            v-for="task in tasksByStatus[col.key]"
            :key="task.id"
            class="task-card"
            draggable="true"
            tabindex="0"
            @click="openTask(task.id)"
            @keydown.enter="openTask(task.id)"
            @dragstart="(e) => onDragStart(e, task.id)"
            @dragend="onDragEnd"
          >
            <div class="task-card-head">
              <span class="task-card-num">№ {{ getTaskNumber(task.id) }}</span>
              <span class="task-card-title">{{ task.title }}</span>
              <span class="task-card-avatar" :style="avatarStyleByUserId(task.assignee.id)">{{ task.assignee.initials }}</span>
            </div>
            <div class="task-card-meta">
              <span class="task-pill" :class="priorityClass(task.priority)">
                {{ task.priority === 'high' ? 'Высокий' : task.priority === 'medium' ? 'Средний' : 'Низкий' }}
              </span>
              <span class="task-pill task-pill-field">{{ task.field }}</span>
            </div>
            <div v-if="task.workType" class="task-card-type">
              {{ task.workType }}
            </div>
            <div class="task-card-due">
              <template v-if="task.description === 'Просрочено'">
                <span class="task-overdue">Просрочено</span>
              </template>
              <template v-else>
                до {{ task.dueDate }}
              </template>
            </div>
          </article>
          <div v-if="!tasksByStatus[col.key].length" class="task-column-empty">
            <div class="task-empty-icon" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>
            </div>
            <p class="task-empty-title">Задач пока нет</p>
            <p class="task-empty-desc">В этой колонке сейчас пусто. Самое время запланировать новые работы.</p>
            <button type="button" class="task-empty-btn" @click="openCreate">Создать первую задачу</button>
          </div>
        </div>
      </div>
    </div>

    <!-- List -->
    <div v-show="viewMode === 'list' && !tasksLoading" class="task-list-wrap">
      <div class="task-list-table-wrapper">
        <table class="task-list-table">
          <thead>
            <tr>
              <th class="task-list-cell-num">№</th>
              <th>Название задачи</th>
              <th>Исполнитель</th>
              <th>Приоритет</th>
              <th>Объект / поле</th>
              <th>Срок</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(task, index) in paginatedTasks"
              :key="task.id"
              class="task-list-row"
              @click="openTask(task.id)"
            >
              <td class="task-list-cell-num">{{ getTaskNumber(task.id) }}</td>
              <td class="task-list-cell-title">{{ task.title }}</td>
              <td class="task-list-cell-assignee">
                <span class="task-list-avatar" :style="avatarStyleByUserId(task.assignee.id)">{{ task.assignee.initials }}</span>
                {{ task.assignee.name }}
              </td>
              <td>
                <span class="task-pill" :class="priorityClass(task.priority)">
                  {{ task.priority === 'high' ? 'Высокий' : task.priority === 'medium' ? 'Средний' : 'Низкий' }}
                </span>
              </td>
              <td>
                <span class="task-pill task-pill-field">{{ task.field }}</span>
              </td>
              <td :class="{ 'task-cell-overdue': task.description === 'Просрочено' }">
                <template v-if="task.description === 'Просрочено'">
                  <span class="task-overdue-icon" aria-hidden="true">△</span>
                  {{ task.dueDate }}
                </template>
                <template v-else>{{ task.dueDate }}</template>
              </td>
              <td>
                <span
                  class="task-pill task-pill-status"
                  :class="statusClass(task.status)"
                >
                  {{ statusColumns.find((c) => c.key === task.status)?.title }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div v-show="viewMode === 'list' && !tasksLoading && totalFiltered > 0" class="task-pagination">
      <span class="task-pagination-info">
        Показано {{ paginationStart }}–{{ paginationEnd }} из {{ totalFiltered }}
      </span>
      <div class="task-pagination-right">
        <div class="task-pagination-nav">
          <button
            type="button"
            class="task-pagination-arrow"
            :disabled="currentPage <= 1"
            aria-label="Предыдущая страница"
            @click="currentPage = currentPage - 1"
          >
            &lt;
          </button>
          <template v-for="(p, i) in pageNumbers" :key="p === 'ellipsis' ? `e-${i}` : p">
            <button
              v-if="p !== 'ellipsis'"
              type="button"
              class="task-pagination-num"
              :class="{ 'task-pagination-num--active': p === currentPage }"
              @click="goToPage(p)"
            >
              {{ p }}
            </button>
            <span v-else class="task-pagination-ellipsis">…</span>
          </template>
          <button
            type="button"
            class="task-pagination-arrow"
            :disabled="currentPage >= totalPages"
            aria-label="Следующая страница"
            @click="currentPage = currentPage + 1"
          >
            &gt;
          </button>
        </div>
        <label class="task-pagination-size">
          <span class="task-filter-select-label">На странице</span>
          <select v-model.number="pageSize" class="task-filter-select task-pagination-select">
            <option :value="5">5</option>
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
          </select>
        </label>
      </div>
    </div>

    <!-- Pagination for Kanban (same block, show when kanban visible) -->
    <div v-show="viewMode === 'kanban' && !tasksLoading && totalFiltered > 0" class="task-pagination task-pagination--kanban">
      <span class="task-pagination-info">
        Показано {{ paginationStart }}–{{ paginationEnd }} из {{ totalFiltered }}
      </span>
      <div class="task-pagination-right">
        <div class="task-pagination-nav">
          <button
            type="button"
            class="task-pagination-arrow"
            :disabled="currentPage <= 1"
            aria-label="Предыдущая страница"
            @click="currentPage = currentPage - 1"
          >
            &lt;
          </button>
          <template v-for="(p, i) in pageNumbers" :key="p === 'ellipsis' ? `e-${i}` : p">
            <button
              v-if="p !== 'ellipsis'"
              type="button"
              class="task-pagination-num"
              :class="{ 'task-pagination-num--active': p === currentPage }"
              @click="goToPage(p)"
            >
              {{ p }}
            </button>
            <span v-else class="task-pagination-ellipsis">…</span>
          </template>
          <button
            type="button"
            class="task-pagination-arrow"
            :disabled="currentPage >= totalPages"
            aria-label="Следующая страница"
            @click="currentPage = currentPage + 1"
          >
            &gt;
          </button>
        </div>
        <label class="task-pagination-size">
          <span class="task-filter-select-label">На странице</span>
          <select v-model.number="pageSize" class="task-filter-select task-pagination-select">
            <option :value="5">5</option>
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
          </select>
        </label>
      </div>
    </div>

    <!-- Modal: New Task -->
    <Teleport to="body">
      <div v-if="showCreateModal" class="task-modal-backdrop" @click.self="closeCreate">
        <div class="task-modal task-modal--create" role="dialog" aria-labelledby="task-modal-title">
          <button type="button" class="task-modal-close" aria-label="Закрыть" @click="closeCreate">×</button>
          <h2 id="task-modal-title" class="task-modal-title">{{ editingTaskId ? 'Редактировать задачу' : 'Новая задача' }}</h2>
          <form class="task-form task-form--compact" @submit.prevent="createTask">
            <div class="task-form-row">
              <label class="task-form-label">Название задачи</label>
              <input v-model="form.title" type="text" class="task-form-input" placeholder="Введите название..." />
            </div>
            <div class="task-form-row task-form-row--two">
              <div class="task-form-field">
                <label class="task-form-label">Исполнитель</label>
                <div v-if="isManager" class="task-form-select-wrap">
                  <span
                    class="task-form-avatar"
                    :style="avatarStyleByUserId((assignees.find((a) => a.id === form.assigneeId) ?? assignees[0])?.id)"
                  >{{ (assignees.find((a) => a.id === form.assigneeId) ?? assignees[0])?.initials ?? '—' }}</span>
                  <select v-model="form.assigneeId" class="task-form-select">
                    <option v-for="a in assignees" :key="a.id" :value="a.id">{{ a.name }}</option>
                  </select>
                </div>
                <div v-else class="task-form-static-assignee">Назначить себе</div>
              </div>
              <div class="task-form-field">
                <label class="task-form-label">Объект / поле</label>
                <select v-model="form.field" class="task-form-select">
                  <option value="">Не выбрано</option>
                  <option v-for="f in fields" :key="f" :value="f">{{ f }}</option>
                </select>
              </div>
            </div>
            <div class="task-form-row">
              <label class="task-form-label">Приоритет</label>
              <div class="task-form-priority">
                <button type="button" class="task-form-priority-btn" :class="{ 'task-form-priority-btn--active': form.priority === 'high' }" @click="form.priority = 'high'">высокий</button>
                <button type="button" class="task-form-priority-btn" :class="{ 'task-form-priority-btn--active': form.priority === 'medium' }" @click="form.priority = 'medium'">Средний</button>
                <button type="button" class="task-form-priority-btn" :class="{ 'task-form-priority-btn--active': form.priority === 'low' }" @click="form.priority = 'low'">низкий</button>
              </div>
            </div>
            <div class="task-form-row task-form-row--two">
              <div class="task-form-field">
                <label class="task-form-label">Срок выполнения</label>
                <input v-model="form.dueDate" type="text" class="task-form-input task-form-input--date" placeholder="ДД.ММ.ГГГГ" />
              </div>
              <div class="task-form-field">
                <label class="task-form-label">Тип работ</label>
                <select v-model="form.workType" class="task-form-select">
                  <option value="">Не указано</option>
                  <option v-for="w in workTypes" :key="w" :value="w">{{ w }}</option>
                </select>
              </div>
            </div>
            <div class="task-form-row">
              <label class="task-form-label">Описание и инструкции</label>
              <textarea v-model="form.description" class="task-form-textarea" placeholder="Добавьте подробности для исполнителя..." rows="3"></textarea>
            </div>
            <div class="task-form-actions">
              <button type="button" class="task-form-cancel" @click="closeCreate">Отмена</button>
              <button type="submit" class="task-form-submit">{{ editingTaskId ? 'Сохранить' : 'Создать задачу' }}</button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- Modal: Task detail -->
    <Teleport to="body">
      <div v-if="selectedTask" class="task-modal-backdrop" @click.self="closeTask">
        <div class="task-modal task-modal--detail" role="dialog" aria-labelledby="task-detail-title">
          <button type="button" class="task-modal-close" aria-label="Закрыть" @click="closeTask">×</button>
          <div class="task-detail-layout">
            <div v-if="isMetaInitialLoading" class="task-detail-loading-overlay" aria-hidden="true">
              <UiLoadingBar size="md" />
            </div>
            <div class="task-detail-main">
              <div class="task-detail-badges">
                <span
                  class="task-pill task-pill-status"
                  :class="selectedTask ? statusClass(selectedTask.status) : ''"
                >
                  {{ statusColumns.find((c) => c.key === selectedTask?.status)?.title }}
                </span>
                <span class="task-pill" :class="priorityClass(selectedTask.priority)">
                  {{ selectedTask.priority === 'high' ? 'Высокий приоритет' : selectedTask.priority === 'medium' ? 'Средний' : 'Низкий' }}
                </span>
              </div>
              <h2 id="task-detail-title" class="task-detail-title">
                <template v-if="isEditingDetail">
                  <input
                    v-model="form.title"
                    type="text"
                    class="task-detail-title-input"
                    placeholder="Название задачи"
                  />
                </template>
                <template v-else>
                  {{ selectedTask.title }}
                </template>
              </h2>
              <dl class="task-detail-list">
                <div class="task-detail-item">
                  <dt class="task-detail-label">Номер задачи</dt>
                  <dd class="task-detail-value">№ {{ getTaskNumber(selectedTask.id) || '—' }}</dd>
                </div>
                <div class="task-detail-item">
                  <dt class="task-detail-label">Исполнитель</dt>
                  <dd class="task-detail-value">
                    <template v-if="isEditingDetail">
                      <div class="task-form-select-wrap task-detail-select-wrap">
                        <span
                          class="task-detail-avatar"
                          :style="avatarStyleByUserId((assignees.find((a) => a.id === form.assigneeId) ?? assignees[0])?.id)"
                        >
                          {{ (assignees.find((a) => a.id === form.assigneeId) ?? assignees[0])?.initials ?? '—' }}
                        </span>
                        <select v-model="form.assigneeId" class="task-form-select">
                          <option v-for="a in assignees" :key="a.id" :value="a.id">
                            {{ a.name }}
                          </option>
                        </select>
                      </div>
                    </template>
                    <template v-else>
                      <span class="task-detail-avatar" :style="avatarStyleByUserId(selectedTask.assignee.id)">{{ selectedTask.assignee.initials }}</span>
                      {{ selectedTask.assignee.name }}
                    </template>
                  </dd>
                </div>
                <div class="task-detail-item">
                  <dt class="task-detail-label">Статус</dt>
                  <dd class="task-detail-value">
                    <select
                      :value="selectedTask.status"
                      class="task-detail-status-select"
                      @change="(e) => selectedTask && updateTaskStatus(selectedTask.id, (e.target as HTMLSelectElement).value as Status)"
                    >
                      <option v-for="col in statusColumns" :key="col.key" :value="col.key">
                        {{ col.title }}
                      </option>
                    </select>
                  </dd>
                </div>
                <div class="task-detail-item">
                  <dt class="task-detail-label">Срок выполнения</dt>
                  <dd class="task-detail-value" :class="{ 'task-detail-overdue': selectedTask.description === 'Просрочено' }">
                    <template v-if="isEditingDetail">
                      <input
                        v-model="form.dueDate"
                        type="text"
                        class="task-form-input task-form-input--date task-detail-input-inline"
                        placeholder="ДД.ММ.ГГГГ"
                      />
                    </template>
                    <template v-else>
                      до {{ selectedTask.dueDate }}
                      <span v-if="selectedTask.description === 'Просрочено'" class="task-overdue"> (Просрочено)</span>
                    </template>
                  </dd>
                </div>
                <div class="task-detail-item">
                  <dt class="task-detail-label">Тип работ</dt>
                  <dd class="task-detail-value">
                    <template v-if="isEditingDetail">
                      <select v-model="form.workType" class="task-form-select task-detail-input-inline">
                        <option value="">Не указано</option>
                        <option v-for="w in workTypes" :key="w" :value="w">
                          {{ w }}
                        </option>
                      </select>
                    </template>
                    <template v-else>
                      {{ selectedTask.workType || 'Не указано' }}
                    </template>
                  </dd>
                </div>
                <div class="task-detail-item">
                  <dt class="task-detail-label">Локация</dt>
                  <dd>
                    <template v-if="isEditingDetail">
                      <select v-model="form.field" class="task-form-select task-detail-input-inline">
                        <option value="">Не выбрано</option>
                        <option v-for="f in fields" :key="f" :value="f">
                          {{ f }}
                        </option>
                      </select>
                    </template>
                    <template v-else>
                      <span class="task-pill task-pill-field">{{ selectedTask.field }}</span>
                    </template>
                  </dd>
                </div>
              </dl>
              <div class="task-detail-desc-wrap">
                <span class="task-detail-label">Описание задачи</span>
                <template v-if="isEditingDetail">
                  <textarea
                    v-model="form.description"
                    class="task-form-textarea"
                    rows="3"
                    placeholder="Добавьте подробности для исполнителя..."
                  ></textarea>
                </template>
                <template v-else>
                  <div class="task-detail-desc">
                    {{ selectedTask.description || 'Описание не указано' }}
                  </div>
                </template>
              </div>
            </div>
            <aside class="task-detail-sidebar">
              <section class="task-detail-card">
                <h3 class="task-detail-card-title">Информация о задаче</h3>
                <div class="task-detail-info-row">
                  <div class="task-detail-info-avatar" :style="avatarStyleByUserId(selectedTask.createdBy?.id ?? null)">
                    <span>{{ profileInitials(selectedTask.createdBy?.id ?? null) }}</span>
                  </div>
                  <div class="task-detail-info-main">
                    <div class="task-detail-info-name">{{ selectedTaskCreatorName }}</div>
                    <div class="task-detail-info-role">Автор задачи</div>
                  </div>
                </div>
                <div class="task-detail-info-meta">
                  <div class="task-detail-info-meta-item">
                    <span class="task-detail-info-meta-label">Создана</span>
                    <span class="task-detail-info-meta-value">{{ selectedTaskCreatedAt }}</span>
                  </div>
                </div>
              </section>
              <section class="task-detail-card task-detail-card--history">
                <h3 class="task-detail-card-title">История изменений</h3>
                <div v-if="eventsLoading" class="task-history-loading">
                  <UiLoadingBar size="compact" />
                </div>
                <ul v-else class="task-history-list">
                  <li v-if="!taskEvents.length" class="task-history-empty">История пока пуста</li>
                  <li v-for="event in taskEvents" :key="event.id" class="task-history-item">
                    <div class="task-history-dot" aria-hidden="true"></div>
                    <div class="task-history-content">
                      <div class="task-history-text">
                        <span class="task-history-author">{{ profileName(event.user_id) }}</span>
                        <span class="task-history-sep">·</span>
                        <span class="task-history-event">
                          <template v-if="event.event_type === 'status_changed'">
                            Статус:
                            {{
                              statusTitle(
                                (event.payload?.from as Status) || 'todo',
                              )
                            }}
                            →
                            {{
                              statusTitle(
                                (event.payload?.to as Status) || 'todo',
                              )
                            }}
                          </template>
                          <template v-else-if="event.event_type === 'comment_added'">
                            Добавлен комментарий
                          </template>
                          <template v-else-if="event.event_type === 'created'">
                            Задача создана
                          </template>
                          <template v-else>
                            {{ event.event_type }}
                          </template>
                        </span>
                      </div>
                      <div class="task-history-time">
                        {{ formatDateTime(event.created_at) }}
                      </div>
                    </div>
                  </li>
                </ul>
              </section>
            </aside>
          </div>
          <section class="task-chat">
            <h3 class="task-chat-title">Обсуждение задачи</h3>
            <div v-if="commentsLoading" class="task-chat-loading">
              <UiLoadingBar size="compact" />
            </div>
            <div v-else class="task-chat-body">
              <div v-if="!taskComments.length" class="task-chat-empty">
                Пока нет комментариев. Напишите первый.
              </div>
              <ul v-else class="task-chat-list">
                <li v-for="comment in taskComments" :key="comment.id" class="task-chat-item">
                  <div class="task-chat-avatar" :style="avatarStyleByUserId(comment.user_id)">
                    {{ profileInitials(comment.user_id) }}
                  </div>
                  <div class="task-chat-message">
                    <div class="task-chat-meta">
                      <span class="task-chat-author">{{ profileName(comment.user_id) }}</span>
                      <span class="task-chat-dot">·</span>
                      <span class="task-chat-time">{{ formatDateTime(comment.created_at) }}</span>
                    </div>
                    <div class="task-chat-text">
                      {{ comment.message }}
                    </div>
                  </div>
                </li>
              </ul>
            </div>
            <form class="task-chat-input-row" @submit.prevent="submitComment">
              <textarea
                v-model="newCommentMessage"
                class="task-chat-input"
                rows="2"
                placeholder="Напишите комментарий для исполнителя..."
              ></textarea>
              <button type="submit" class="task-chat-send" :class="{ 'task-chat-send--loading': isSendingComment }" :disabled="!newCommentMessage.trim() || isSendingComment">
                <span v-if="!isSendingComment">Отправить</span>
                <UiLoadingBar v-else size="micro" hide-label class="task-chat-send-loader" />
              </button>
            </form>
          </section>
          <div class="task-detail-actions">
            <template v-if="isEditingDetail">
              <button type="button" class="task-detail-btn task-detail-btn--edit" @click="cancelDetailEdit">
                Отмена
              </button>
              <div class="task-detail-del-wrap">
                <UiDeleteButton size="md" @click="deleteTask" />
              </div>
              <button
                type="button"
                class="task-detail-btn task-detail-btn--close task-detail-btn--saving"
                :class="{ 'task-detail-btn--saving-active': isSavingDetail }"
                @click="saveDetailEdit"
                :disabled="isSavingDetail"
              >
                <span v-if="!isSavingDetail">Сохранить</span>
                <UiLoadingBar v-else size="compact" class="task-detail-save-loader" />
              </button>
            </template>
            <template v-else>
              <button type="button" class="task-detail-btn task-detail-btn--edit" @click="openEdit">
                Редактировать
              </button>
              <div class="task-detail-del-wrap">
                <UiDeleteButton size="md" @click="deleteTask" />
              </div>
              <button type="button" class="task-detail-btn task-detail-btn--close" @click="closeTask">
                Закрыть
              </button>
            </template>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.task-management-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

.task-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-lg);
  min-height: 280px;
  padding: var(--space-xl);
}

.task-form-static-assignee {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--chip-bg);
  color: var(--text-secondary);
  font-size: 0.9rem;
}

/* Единая высота и стиль элементов шапки задач */
.task-header {
  --task-control-h: 38px;
  --task-control-radius: 10px;
  --task-control-fs: 0.875rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.task-header-left {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-lg);
}

.task-header-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.task-filter-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-sm);
}

.task-filter-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.task-filter-tab,
.task-filter-pill {
  height: var(--task-control-h);
  display: inline-flex;
  align-items: center;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--task-control-fs);
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.task-filter-tab {
  cursor: pointer;
}

.task-filter-pill {
  min-width: 0;
  cursor: pointer;
  font-family: inherit;
}

.task-filter-pill--select {
  min-width: 140px;
}

.task-filter-dates {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: var(--space-sm);
  padding-left: var(--space-sm);
  border-left: 1px solid var(--border-color);
  flex-wrap: wrap;
}

.task-filter-date-label {
  font-size: var(--task-control-fs);
  font-weight: 600;
  color: var(--text-secondary);
}

.task-filter-apply-dates {
  margin-left: 4px;
  background: var(--accent-green);
  border-color: var(--accent-green);
  color: #fff;
}

.task-filter-apply-dates:hover {
  background: var(--accent-green-hover);
  border-color: var(--accent-green-hover);
  color: #fff;
}

.task-filter-pill:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.task-filter-tab:hover:not(.task-filter-tab--active),
.task-filter-pill:hover:not(:disabled) {
  background: var(--sidebar-hover-bg);
  color: var(--text-primary);
}

/* Поиск по номеру — отдельный блок справа */
.task-search-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  height: var(--task-control-h);
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
}

.task-search-icon {
  display: flex;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.task-search-input {
  width: 140px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: var(--task-control-fs);
  font-family: inherit;
  outline: none;
}

.task-search-input::placeholder {
  color: var(--text-secondary);
}

.task-filter-select-label {
  font-size: var(--task-control-fs);
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
}

/* Для пагинации (выпадающий список «На странице») */
.task-filter-select {
  height: var(--task-control-h);
  min-width: 70px;
  padding: 0 12px;
  border-radius: var(--task-control-radius);
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  color: var(--text-primary);
  font-size: var(--task-control-fs);
  font-weight: 500;
  cursor: pointer;
}

.task-filter-select:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.task-filter-tab--active {
  background: var(--accent-green);
  border-color: var(--accent-green);
  color: #fff;
}

[data-theme='dark'] .task-filter-tab--active {
  border-color: rgba(255, 255, 255, 0.5);
  color: #fff;
}

.task-view-toggle {
  display: flex;
  height: var(--task-control-h);
  border-radius: var(--task-control-radius);
  overflow: hidden;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
}

.task-view-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--task-control-fs);
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.task-view-btn:first-child {
  border-right: 1px solid var(--border-color);
}

.task-view-btn--active {
  background: var(--accent-green);
  border-color: var(--accent-green);
  color: #fff;
}

[data-theme='dark'] .task-view-btn--active {
  background: var(--accent-green);
  color: #fff;
}

.task-btn-create {
  height: var(--task-control-h);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 18px;
  border-radius: var(--task-control-radius);
  border: none;
  background: var(--accent-green);
  color: #fff;
  font-size: var(--task-control-fs);
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.15s ease;
}

.task-btn-create:hover {
  background: var(--accent-green-hover);
}

.task-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.task-export-btns {
  display: flex;
  gap: 8px;
}

.task-btn-export {
  height: var(--task-control-h);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  border-radius: var(--task-control-radius);
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  color: var(--text-secondary);
  font-size: var(--task-control-fs);
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.task-btn-export:hover:not(:disabled) {
  background: var(--sidebar-hover-bg);
  color: var(--text-primary);
}

.task-btn-export:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.task-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  margin-top: var(--space-md);
  padding: var(--space-md) var(--space-lg) 0;
  border-top: 1px solid var(--border-color);
  min-height: 40px;
}

.task-pagination--kanban {
  margin-top: var(--space-md);
}

.task-pagination-info {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.task-pagination-right {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  flex-wrap: wrap;
}

.task-pagination-nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.task-pagination-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-base);
  color: var(--text-primary);
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.task-pagination-arrow:hover:not(:disabled) {
  background: var(--bg-panel-hover);
  border-color: var(--text-secondary);
}

.task-pagination-arrow:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.task-pagination-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 36px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.task-pagination-num:hover {
  background: var(--bg-panel-hover);
}

.task-pagination-num--active {
  background: rgba(76, 175, 80, 0.15);
  border-color: rgba(76, 175, 80, 0.5);
  color: var(--text-primary);
}

[data-theme='dark'] .task-pagination-num--active {
  background: rgba(76, 175, 80, 0.2);
  border-color: rgba(76, 175, 80, 0.5);
}

.task-pagination-num--active:hover {
  background: rgba(76, 175, 80, 0.22);
}

.task-pagination-ellipsis {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 36px;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.task-pagination-size {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.task-pagination-size .task-filter-select-label {
  line-height: 1.5;
}

.task-pagination-select {
  min-width: 72px;
  height: 36px;
  padding: 0 28px 0 10px;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
}

/* Kanban */
.task-kanban {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-lg);
  min-height: 400px;
}

.task-kanban-column {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  min-width: 0;
}

.task-column-title {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-primary);
}

.task-column-underline {
  height: 2px;
  background: var(--agri-primary);
  opacity: 0.6;
  border-radius: 1px;
  margin-bottom: 4px;
}

.task-column-cards {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  flex: 1;
  min-height: 120px;
}

.task-card {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: var(--space-md);
  cursor: pointer;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
  text-align: left;
}

.task-card:hover {
  box-shadow: var(--shadow-card);
  border-color: var(--agri-primary);
}

.task-card--dragging {
  opacity: 0.6;
  cursor: grabbing;
}

.task-kanban-column--drag-over .task-column-cards {
  background: var(--agri-light);
  border-radius: 12px;
  outline: 2px dashed var(--accent-green);
  outline-offset: 2px;
}

.task-card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
}

.task-card-num {
  flex-shrink: 0;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.task-card-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
  min-width: 0;
}

.task-card-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--chip-bg);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.task-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}

.task-pill {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.task-pill-field {
  background: #5a7c5e;
  color: #fff;
}

.priority-high {
  background: #b85450;
  color: #fff;
}

.priority-medium {
  background: #b87a50;
  color: #fff;
}

.priority-low {
  background: #5a8a85;
  color: #fff;
}

.task-card-type {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.task-card-due {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.task-overdue {
  color: #b85450;
  font-weight: 600;
}

.task-column-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-xl);
  border: 2px dashed var(--border-color);
  border-radius: 12px;
  background: var(--bg-panel-hover);
  min-height: 200px;
}

.task-empty-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--chip-bg);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--space-md);
}

.task-empty-icon svg {
  width: 24px;
  height: 24px;
}

.task-empty-title {
  margin: 0 0 4px;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
}

.task-empty-desc {
  margin: 0 0 var(--space-md);
  font-size: 0.8125rem;
  color: var(--text-secondary);
  text-align: center;
  max-width: 220px;
}

.task-empty-btn {
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid var(--accent-green);
  background: var(--bg-panel);
  color: var(--accent-green);
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.task-empty-btn:hover {
  background: var(--agri-light);
  color: var(--accent-green-hover);
}

/* List */
.task-list-wrap {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
}

.task-list-table-wrapper {
  overflow-x: auto;
  padding-bottom: 52px;
}

.task-list-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.task-list-table th {
  padding: 12px 16px;
  text-align: left;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
}

.task-list-table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-primary);
}

.task-list-row {
  cursor: pointer;
  transition: background 0.15s ease;
}

.task-list-row:hover td {
  background: var(--row-hover-bg);
}

.task-list-cell-num {
  width: 2.5rem;
  text-align: center;
  font-weight: 600;
  color: var(--text-secondary);
}
.task-list-cell-title {
  font-weight: 500;
}

.task-list-cell-assignee {
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-list-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--chip-bg);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.task-cell-overdue {
  color: #b85450;
  font-weight: 500;
}

.task-overdue-icon {
  margin-right: 4px;
}

.task-status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: middle;
}

.status-todo { background: #9ca3af; }
.status-in-progress { background: #3b82f6; }
.status-review { background: #b87a50; }
.status-done { background: #5a7c5e; }

/* Modals */
.task-modal-backdrop {
  position: fixed;
  inset: 0;
  background: var(--modal-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
  animation: taskFadeIn 0.2s ease;
}

@keyframes taskFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.task-modal {
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.2);
  max-width: 520px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
  padding: var(--space-lg);
  border: 1px solid var(--border-color);
  animation: taskModalIn 0.25s ease;
}

.task-modal--detail {
  max-width: 960px;
}

@keyframes taskModalIn {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.task-modal-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
  border: none;
  background: rgba(0, 0, 0, 0.04);
  color: var(--text-secondary);
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.2s ease, color 0.2s ease;
}

.task-modal-close:hover {
  background: rgba(0, 0, 0, 0.08);
  color: var(--text-primary);
}

.task-modal-title {
  margin: 0 0 var(--space-md);
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.task-form--compact .task-form-label {
  font-size: 0.6rem;
}

.task-form--compact .task-form-row > .task-form-label {
  margin-bottom: 4px;
}

.task-form--compact .task-form-field .task-form-label {
  margin-bottom: 0;
}

.task-form--compact .task-form-field {
  gap: 4px;
}

.task-form--compact .task-form-input,
.task-form--compact .task-form-select,
.task-form--compact .task-form-textarea {
  font-size: 0.8125rem;
  padding: 6px 10px;
  min-height: 32px;
}

.task-form--compact .task-form-select-wrap {
  min-height: 32px;
}

.task-form--compact .task-form-textarea {
  min-height: 60px;
}

.task-form--compact .task-form-row {
  margin-bottom: var(--space-sm);
}

.task-form--compact .task-form-row--two {
  gap: 16px;
}

.task-form--compact .task-form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.task-form--compact .task-form-priority-btn {
  font-size: 0.7rem;
  padding: 6px 8px;
}

.task-form-field {
  min-width: 0;
}

.task-form-row {
  margin-bottom: var(--space-md);
}

.task-form-row:last-of-type {
  margin-bottom: 0;
}

.task-form {
  width: 100%;
  box-sizing: border-box;
}

.task-form-row--two {
  display: grid;
  grid-template-columns: calc((100% - 16px) / 2) calc((100% - 16px) / 2);
  gap: 16px;
  width: 100%;
  box-sizing: border-box;
}

.task-form-row--two .task-form-field {
  min-width: 0;
  overflow: hidden;
  width: 100%;
}

.task-form-row--two .task-form-field .task-form-select,
.task-form-row--two .task-form-field .task-form-input {
  width: 100% !important;
  min-width: 0 !important;
  max-width: 100% !important;
  box-sizing: border-box;
}

.task-form-row--two .task-form-select-wrap {
  width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box;
}

.task-form-row--two .task-form-select-wrap .task-form-select {
  flex: 1 1 0%;
  min-width: 0;
}

.task-form-row--two .task-form-label {
  font-size: 0.6rem;
  min-height: 1.35em;
  line-height: 1.35;
  display: flex;
  align-items: flex-end;
}

.task-form-row--two .task-form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: stretch;
}

.task-form-row--two .task-form-input,
.task-form-row--two .task-form-select {
  font-size: 0.8125rem;
  min-height: 32px;
  height: 32px;
  padding: 6px 10px;
  box-sizing: border-box;
}

.task-form-row--two .task-form-select-wrap {
  min-height: 32px;
  height: 32px;
  box-sizing: border-box;
}

.task-form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.task-form-field .task-form-label {
  margin-bottom: 0;
}

.task-form-label {
  display: block;
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
  margin-bottom: 4px;
  line-height: 1.3;
}

.task-form-input,
.task-form-select,
.task-form-textarea {
  width: 100%;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--chip-bg);
  color: var(--text-primary);
  font-size: 0.8125rem;
  transition: border-color 0.2s ease;
  box-sizing: border-box;
  min-height: 32px;
}

.task-form-select {
  min-height: 32px;
}

.task-form-textarea {
  min-height: 64px;
  font-size: 0.8125rem;
}

.task-form-input--date {
  color: #4a6b4e;
}

.task-form-select-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
}

.task-form-select-wrap .task-form-select {
  flex: 1;
  min-width: 0;
}

.task-form-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #5a7c5e;
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.task-form-priority {
  display: flex;
  gap: 0;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid #b87a50;
}

.task-form-priority-btn {
  flex: 1;
  padding: 6px 8px;
  border: none;
  background: var(--bg-panel);
  color: var(--text-primary);
  font-size: 0.7rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.task-form-priority-btn--active {
  background: #b87a50;
  color: #fff;
}

.task-form-textarea {
  resize: vertical;
}

.task-form-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-md);
  margin-top: var(--space-xl);
  padding-top: var(--space-md);
  border-top: 1px solid var(--border-color);
}

.task-form-cancel {
  padding: 10px 16px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.9375rem;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.2s ease;
}

.task-form-cancel:hover {
  color: var(--text-primary);
}

.task-form-submit {
  padding: 10px 20px;
  border-radius: 10px;
  border: none;
  background: var(--accent-green);
  color: #fff;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease;
}

.task-form-submit:hover {
  background: var(--accent-green-hover);
}

.task-form-actions--detail {
  justify-content: flex-start;
  gap: var(--space-sm);
}

.task-form-actions--detail .task-form-submit {
  margin-left: auto;
}

.task-detail-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  margin-top: var(--space-lg);
  padding-top: var(--space-md);
  border-top: 1px solid var(--border-color);
}

.task-detail-btn {
  padding: 10px 18px;
  border-radius: 10px;
  font-size: 0.9375rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.task-detail-btn--edit {
  border: 1px solid var(--border-color);
  background: var(--chip-bg);
  color: var(--text-primary);
}

.task-detail-btn--edit:hover {
  background: var(--bg-panel-hover);
}

.task-detail-del-wrap {
  display: flex;
  align-items: center;
}

.task-detail-btn--close {
  border: none;
  background: var(--accent-green);
  color: #fff;
  margin-left: auto;
}

.task-detail-btn--close:hover {
  background: var(--accent-green-hover);
}

.task-detail-btn--saving {
  position: relative;
  min-width: 120px;
}

.task-detail-save-loader {
  display: flex;
  align-items: center;
  justify-content: center;
}
.task-detail-save-loader :deep(.ui-loading-bar) {
  transform: scale(0.88);
  transform-origin: center;
}

/* Detail modal */
.task-detail-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: var(--space-md);
}

.task-detail-layout {
  display: grid;
  grid-template-columns: minmax(0, 2.2fr) minmax(260px, 1.4fr);
  gap: var(--space-lg);
  position: relative;
}

.task-detail-main {
  display: flex;
  flex-direction: column;
}

.task-detail-loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.02);
  backdrop-filter: blur(1px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}

.task-detail-sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.task-detail-card {
  background: var(--bg-panel);
  border-radius: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border-color);
}

.task-detail-card-title {
  margin: 0 0 8px;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
}

.task-detail-info-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.task-detail-info-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #5a7c5e;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
}

.task-detail-info-main {
  display: flex;
  flex-direction: column;
}

.task-detail-info-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
}

.task-detail-info-role {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.task-detail-info-meta {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.task-detail-info-meta-item {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.75rem;
}

.task-detail-info-meta-label {
  color: var(--text-secondary);
}

.task-detail-info-meta-value {
  color: var(--text-primary);
}

.task-history-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 0;
  min-height: 48px;
}

.task-history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 220px;
  overflow-y: auto;
}

.task-history-empty {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.task-history-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding-block: 6px;
}

.task-history-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-green);
  margin-top: 5px;
}

.task-history-content {
  flex: 1;
}

.task-history-text {
  font-size: 0.8rem;
  color: var(--text-primary);
}

.task-history-author {
  font-weight: 600;
}

.task-history-sep {
  margin: 0 4px;
  color: var(--text-secondary);
}

.task-history-event {
  color: var(--text-primary);
}

.task-history-time {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 2px;
}

.task-chat {
  margin-top: var(--space-lg);
  padding-top: var(--space-md);
  border-top: 1px solid var(--border-color);
}

.task-chat-title {
  margin: 0 0 8px;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-primary);
}

.task-chat-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px 0;
  min-height: 56px;
}

.task-chat-body {
  max-height: 260px;
  overflow-y: auto;
  margin-bottom: var(--space-md);
}

.task-chat-empty {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.task-chat-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.task-chat-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.task-chat-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #5a7c5e;
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.task-chat-message {
  flex: 1;
}

.task-chat-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px;
  font-size: 0.78rem;
}

.task-chat-author {
  font-weight: 600;
  color: var(--text-primary);
}

.task-chat-dot {
  color: var(--text-secondary);
}

.task-chat-time {
  color: var(--text-secondary);
}

.task-chat-text {
  margin-top: 2px;
  font-size: 0.85rem;
  line-height: 1.4;
  color: var(--text-primary);
  white-space: pre-wrap;
}

.task-chat-input-row {
  display: flex;
  flex-direction: row;
  gap: 8px;
  align-items: flex-end;
}

.task-chat-input {
  flex: 1;
  min-height: 40px;
  max-height: 120px;
  resize: vertical;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--chip-bg);
  font-size: 0.85rem;
  color: var(--text-primary);
}

.task-chat-send {
  padding: 8px 14px;
  border-radius: 10px;
  border: none;
  background: var(--accent-green);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  min-height: 40px;
}

.task-chat-send:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.task-chat-send--loading {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 104px;
}

.task-chat-send-loader {
  display: flex;
  align-items: center;
  justify-content: center;
}
.task-chat-send-loader :deep(.ui-loading-bar) {
  transform: scale(0.82);
  transform-origin: center;
}

.task-pill-status {
  color: #fff;
}

.task-pill-status.status-todo { background: #9ca3af; }
.task-pill-status.status-in-progress { background: #3b82f6; }
.task-pill-status.status-review { background: #b87a50; }
.task-pill-status.status-done { background: #5a7c5e; }

.task-detail-title {
  margin: 0 0 var(--space-md);
  font-size: 1.0625rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.3;
}

.task-detail-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin: 0 0 var(--space-md);
}

.task-detail-list dd {
  margin: 0;
  padding-left: 0;
}

.task-detail-item {
  margin: 0;
}

.task-detail-label {
  display: block;
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.task-detail-value {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-primary);
}

.task-detail-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #5a7c5e;
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.task-detail-status-select {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--chip-bg);
  color: var(--text-primary);
  font-size: 0.8125rem;
  min-width: 160px;
  cursor: pointer;
}

.task-detail-overdue {
  color: #b85450;
}

.task-detail-desc-wrap {
  margin-bottom: var(--space-md);
}

.task-detail-desc-wrap .task-detail-label {
  margin-bottom: 6px;
}

.task-detail-desc {
  padding: var(--space-sm) var(--space-md);
  border-radius: 8px;
  background: var(--chip-bg);
  font-size: 0.8125rem;
  color: var(--text-primary);
  line-height: 1.4;
}

/* ——— Тёмная тема (Context7: опора на CSS-переменные и контраст) ——— */
[data-theme='dark'] .task-management-page {
  --task-input-bg: rgba(0, 0, 0, 0.35);
  --task-input-border: rgba(255, 255, 255, 0.2);
  --task-placeholder: rgba(255, 255, 255, 0.45);
}

[data-theme='dark'] .task-modal {
  background: #121f14;
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
}

[data-theme='dark'] .task-form-input,
[data-theme='dark'] .task-form-select,
[data-theme='dark'] .task-form-textarea,
[data-theme='dark'] .task-detail-status-select {
  background: var(--task-input-bg, var(--chip-bg));
  border-color: var(--task-input-border, var(--border-color));
  color: var(--text-primary);
}

[data-theme='dark'] .task-form-input::placeholder,
[data-theme='dark'] .task-form-textarea::placeholder {
  color: var(--task-placeholder, var(--text-secondary));
}

[data-theme='dark'] .task-form-input--date {
  color: #7aad7e;
}

[data-theme='dark'] .task-form-priority {
  border-color: var(--warning-orange);
}

[data-theme='dark'] .task-form-priority-btn {
  background: rgba(0, 0, 0, 0.25);
  color: var(--text-primary);
}

[data-theme='dark'] .task-form-priority-btn--active {
  background: #b87a50;
  color: #fff;
}

[data-theme='dark'] .task-filter-tab {
  color: rgba(255, 255, 255, 0.7);
}

[data-theme='dark'] .task-filter-tab:hover {
  color: var(--text-primary);
}

[data-theme='dark'] .task-filter-pill {
  color: rgba(255, 255, 255, 0.7);
}

[data-theme='dark'] .task-filter-pill:hover:not(:disabled) {
  color: var(--text-primary);
}

[data-theme='dark'] .task-search-wrap {
  background: rgba(0, 0, 0, 0.2);
  border-color: var(--border-color);
}

[data-theme='dark'] .task-view-toggle {
  background: rgba(0, 0, 0, 0.2);
  border-color: var(--border-color);
}

[data-theme='dark'] .task-view-btn {
  color: rgba(255, 255, 255, 0.65);
}

[data-theme='dark'] .task-view-btn--active {
  background: var(--accent-green);
  color: #fff;
}

[data-theme='dark'] .task-card {
  background: rgba(22, 38, 28, 0.7);
  border-color: rgba(255, 255, 255, 0.1);
}

[data-theme='dark'] .task-card:hover {
  border-color: var(--accent-green);
}

[data-theme='dark'] .task-card-avatar {
  background: rgba(104, 173, 51, 0.3);
  color: rgba(255, 255, 255, 0.9);
}

[data-theme='dark'] .task-column-empty {
  background: rgba(0, 0, 0, 0.2);
  border-color: var(--border-color);
}

[data-theme='dark'] .task-empty-btn {
  background: transparent;
  border-color: var(--accent-green);
  color: var(--accent-green);
}

[data-theme='dark'] .task-empty-btn:hover {
  background: rgba(104, 173, 51, 0.2);
  color: var(--accent-green-hover);
}

[data-theme='dark'] .task-list-wrap {
  background: rgba(22, 38, 28, 0.6);
  border-color: rgba(255, 255, 255, 0.1);
}

[data-theme='dark'] .task-list-avatar {
  background: rgba(104, 173, 51, 0.3);
  color: rgba(255, 255, 255, 0.9);
}

[data-theme='dark'] .task-kanban-column--drag-over .task-column-cards {
  background: rgba(104, 173, 51, 0.15);
  outline-color: var(--accent-green);
}

[data-theme='dark'] .task-modal-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

[data-theme='dark'] .task-form-cancel:hover {
  color: var(--text-primary);
}

[data-theme='dark'] .task-detail-btn--edit {
  background: rgba(0, 0, 0, 0.35);
  border-color: rgba(255, 255, 255, 0.2);
  color: var(--text-primary);
}

[data-theme='dark'] .task-detail-btn--edit:hover {
  background: rgba(255, 255, 255, 0.1);
}

[data-theme='dark'] .task-detail-card {
  background: rgba(22, 38, 28, 0.7);
  border-color: rgba(255, 255, 255, 0.1);
}

[data-theme='dark'] .task-chat-input {
  background: rgba(22, 38, 28, 0.7);
  border-color: rgba(255, 255, 255, 0.18);
}

@media (max-width: 1200px) {
  .task-kanban {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 900px) {
  .task-header {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-md);
  }

  .task-header-left {
    flex-direction: column;
    gap: var(--space-md);
  }

  .task-header-actions {
    flex-wrap: wrap;
    width: 100%;
  }

  .task-search-wrap {
    flex: 1;
    min-width: 160px;
  }

  .task-search-input {
    width: 100%;
    min-width: 0;
  }
}

@media (max-width: 768px) {
  .task-management-page {
    padding-bottom: env(safe-area-inset-bottom, 0);
  }

  .task-kanban {
    grid-template-columns: 1fr;
    gap: var(--space-md);
    min-height: 320px;
  }

  .task-form-row--two {
    grid-template-columns: 1fr;
  }

  .task-filter-row {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-sm);
  }

  .task-filter-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-sm);
  }

  .task-filter-tab {
    justify-content: center;
  }

  .task-filter-dates {
    margin-left: 0;
    padding-left: 0;
    border-left: none;
    padding-top: var(--space-xs);
    border-top: 1px solid var(--border-color);
    margin-top: var(--space-xs);
  }

  .task-filter-pill--select {
    min-width: 0;
    width: 100%;
    flex: 1;
  }

  .task-view-toggle {
    width: 100%;
    justify-content: stretch;
  }

  .task-view-btn {
    flex: 1;
    justify-content: center;
  }

  .task-header-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .task-search-wrap {
    width: 100%;
    min-width: 0;
  }

  .task-export-btns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-sm);
  }

  .task-btn-export {
    justify-content: center;
  }

  .task-btn-create {
    width: 100%;
    justify-content: center;
  }

  .task-detail-layout {
    grid-template-columns: 1fr;
  }

  .task-detail-sidebar {
    margin-top: var(--space-md);
  }

  .task-chat {
    margin-top: var(--space-md);
  }

  .task-detail-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .task-detail-actions .task-detail-btn {
    width: 100%;
  }

  .task-detail-actions .task-detail-del-wrap {
    width: 100%;
    justify-content: center;
  }

  .task-pagination {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-sm);
    padding: var(--space-md) 0;
  }

  .task-pagination-info {
    text-align: center;
  }

  .task-pagination-right {
    justify-content: center;
  }

  .task-pagination-nav {
    flex-wrap: wrap;
    justify-content: center;
  }

  .task-pagination-size {
    justify-content: center;
  }

  .task-list-table-wrapper {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    border-radius: 12px;
    border: 1px solid var(--border-color);
  }

  .task-list-table {
    min-width: 560px;
  }

  .task-card {
    min-height: 44px;
    padding: var(--space-md);
  }

  .task-modal {
    max-width: 100%;
    margin: var(--space-md);
    max-height: calc(100vh - 2 * var(--space-md));
    overflow-y: auto;
  }

  .task-modal--detail,
  .task-modal--create {
    max-height: calc(100vh - 2 * var(--space-md));
  }
}

@media (max-width: 480px) {
  .task-filter-tabs {
    grid-template-columns: 1fr;
  }

  .task-export-btns {
    grid-template-columns: 1fr;
  }

  .task-loading {
    min-height: 200px;
    padding: var(--space-lg);
  }

  .task-column-title {
    font-size: 0.8125rem;
  }

  .task-card-title {
    font-size: 0.875rem;
  }

  .task-modal {
    margin: var(--space-sm);
    max-height: calc(100vh - 2 * var(--space-sm));
  }

  .task-modal--detail,
  .task-modal--create {
    max-height: calc(100vh - 2 * var(--space-sm));
  }

  .task-form-actions {
    flex-direction: column;
  }

  .task-form-actions .task-form-cancel,
  .task-form-actions .task-form-submit {
    width: 100%;
  }

  .task-detail-actions {
    flex-direction: column;
  }

  .task-detail-actions .task-detail-btn {
    width: 100%;
  }

  .task-detail-actions .task-detail-del-wrap {
    width: 100%;
    justify-content: center;
  }
}
</style>
