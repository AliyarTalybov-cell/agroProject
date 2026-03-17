<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { useAuth } from '@/stores/auth'
import {
  loadCalendarTasks,
  loadTaskAssignees,
  loadTaskFiles,
  uploadTaskFile,
  deleteTaskFile,
  getTaskFilePublicUrl,
  insertCalendarTask,
  updateCalendarTask,
  deleteCalendarTask,
  isSupabaseConfigured,
  type CalendarTaskRow,
  type CalendarTaskFileRow,
} from '@/lib/calendarTasksSupabase'
import { loadProfiles, type ProfileRow } from '@/lib/tasksSupabase'

type CalendarTask = {
  id: string
  date: string
  title: string
  description: string
  startTime: string | null
  endTime: string | null
  priority: 'low' | 'normal' | 'high'
  assignee: string | null
  completedAt: string | null
  createdAt: string
}

function rowToTask(r: CalendarTaskRow): CalendarTask {
  return {
    id: r.id,
    date: r.date,
    title: r.title,
    description: r.description ?? '',
    startTime: r.start_time ?? null,
    endTime: r.end_time ?? null,
    priority: (r.priority as CalendarTask['priority']) || 'normal',
    assignee: r.assignee ?? null,
    completedAt: r.completed_at ?? null,
    createdAt: r.created_at,
  }
}

const auth = useAuth()
const today = new Date()
const currentYear = ref(today.getFullYear())
const currentMonth = ref(today.getMonth())
const selectedDate = ref(formatDateKey(today))

const tasks = ref<CalendarTask[]>([])
const tasksLoading = ref(false)
const filesLoading = ref(false)
const profiles = ref<ProfileRow[]>([])

const isTaskModalOpen = ref(false)
const editingTaskId = ref<string | null>(null)
const taskSaveLoading = ref(false)
const showDeleteConfirm = ref(false)
const deleteInProgress = ref(false)

const taskTitle = ref('')
const taskDescription = ref('')
const taskDate = ref('')
const taskStartTime = ref('09:00')
const taskEndTime = ref('11:30')
const taskPriority = ref<'low' | 'normal' | 'high'>('normal')
const taskAssignees = ref<string[]>([])
const taskFiles = ref<CalendarTaskFileRow[]>([])
const fileUploading = ref(false)
const assigneePickerOpen = ref(false)
const assigneeSearch = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)
const taskFilesByTaskId = ref<Record<string, CalendarTaskFileRow[]>>({})

function shortTaskId(id: string): string {
  return id.replace(/-/g, '').slice(-8).toUpperCase()
}

function profileLabel(p: ProfileRow): string {
  return (p.display_name?.trim() || p.email) ?? ''
}

function profileById(uid: string): ProfileRow | undefined {
  return profiles.value.find((x) => x.id === uid)
}

function assigneeInitials(p: ProfileRow): string {
  const name = (p.display_name || p.email || '').trim()
  if (!name) return '?'
  const parts = name.split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2)
  return name.slice(0, 2).toUpperCase()
}

const profilesNotAssigned = computed(() =>
  profiles.value.filter((p) => !taskAssignees.value.includes(p.id)),
)

const assigneeSearchLower = computed(() => assigneeSearch.value.trim().toLowerCase())

const assigneeOptions = computed(() => {
  const q = assigneeSearchLower.value
  const base = profilesNotAssigned.value
  if (!q) return base
  return base.filter((p) => profileLabel(p).toLowerCase().includes(q))
})

const monthsShort = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
]

const weekdaysShort = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС']

function formatDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const todayKey = formatDateKey(today)

const currentMonthLabel = computed(
  () => `${monthsShort[currentMonth.value]} ${currentYear.value}`,
)

const calendarWeeks = computed(() => {
  const year = currentYear.value
  const month = currentMonth.value
  const firstDay = new Date(year, month, 1)
  const firstWeekday = (firstDay.getDay() || 7)
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const days: {
    key: string
    date: number
    inCurrentMonth: boolean
    isToday: boolean
    isSelected: boolean
    hasTasks: boolean
  }[] = []

  const prevDaysCount = firstWeekday - 1
  if (prevDaysCount > 0) {
    const prevMonth = month === 0 ? 11 : month - 1
    const prevYear = month === 0 ? year - 1 : year
    const prevMonthDays = new Date(prevYear, prevMonth + 1, 0).getDate()
    for (let i = prevMonthDays - prevDaysCount + 1; i <= prevMonthDays; i += 1) {
      const d = new Date(prevYear, prevMonth, i)
      const key = formatDateKey(d)
      days.push({
        key,
        date: i,
        inCurrentMonth: false,
        isToday: key === todayKey,
        isSelected: key === selectedDate.value,
        hasTasks: tasks.value.some((t) => t.date === key),
      })
    }
  }

  for (let i = 1; i <= daysInMonth; i += 1) {
    const d = new Date(year, month, i)
    const key = formatDateKey(d)
    days.push({
      key,
      date: i,
      inCurrentMonth: true,
      isToday: key === todayKey,
      isSelected: key === selectedDate.value,
      hasTasks: tasks.value.some((t) => t.date === key),
    })
  }

  const totalCells = Math.ceil(days.length / 7) * 7
  const nextDaysCount = totalCells - days.length
  if (nextDaysCount > 0) {
    const nextMonth = month === 11 ? 0 : month + 1
    const nextYear = month === 11 ? year + 1 : year
    for (let i = 1; i <= nextDaysCount; i += 1) {
      const d = new Date(nextYear, nextMonth, i)
      const key = formatDateKey(d)
      days.push({
        key,
        date: i,
        inCurrentMonth: false,
        isToday: key === todayKey,
        isSelected: key === selectedDate.value,
        hasTasks: tasks.value.some((t) => t.date === key),
      })
    }
  }

  const weeks: typeof days[] = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7))
  }
  return weeks
})

const tasksForSelectedDate = computed(() =>
  tasks.value
    .filter((t) => t.date === selectedDate.value)
    .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')),
)

function getWeekRange(dateKey: string): { start: string; end: string } {
  const d = new Date(dateKey + 'T12:00:00')
  const day = d.getDay()
  const monOffset = day === 0 ? -6 : 1 - day
  const mon = new Date(d)
  mon.setDate(d.getDate() + monOffset)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return {
    start: formatDateKey(mon),
    end: formatDateKey(sun),
  }
}

const progressRangeStart = ref<string | null>(null)
const progressRangeEnd = ref<string | null>(null)

const weekProgress = computed(() => {
  const week = getWeekRange(selectedDate.value)
  const start = progressRangeStart.value ?? week.start
  const end = progressRangeEnd.value ?? progressRangeStart.value ?? week.end
  const rangeStart = start <= end ? start : end
  const rangeEnd = start <= end ? end : start
  const rangeTasks = tasks.value.filter((t) => t.date >= rangeStart && t.date <= rangeEnd)
  const total = rangeTasks.length
  const completed = rangeTasks.filter((t) => t.completedAt).length
  return { total, completed, start: rangeStart, end: rangeEnd }
})

const weekProgressLabel = computed(() => {
  const { start, end } = weekProgress.value
  const d1 = new Date(start + 'T12:00:00')
  const d2 = new Date(end + 'T12:00:00')
  const day1 = d1.getDate()
  const day2 = d2.getDate()
  const m1 = monthsShort[d1.getMonth()].slice(0, 3)
  const m2 = monthsShort[d2.getMonth()].slice(0, 3)
  if (start === end) return `${day1} ${m1}`
  if (m1 === m2) return `${day1} – ${day2} ${m2}`
  return `${day1} ${m1} – ${day2} ${m2}`
})

const progressBlockActive = ref(false)
const showProgressHint = ref(false)
let progressHintTimer: ReturnType<typeof setTimeout> | null = null

/** Диапазон текущего отображаемого месяца (с 1-го по последнее число) для подсветки при выборе прогресса */
const progressMonthRange = computed(() => {
  const y = currentYear.value
  const m = currentMonth.value
  const start = `${y}-${String(m + 1).padStart(2, '0')}-01`
  const lastDay = new Date(y, m + 1, 0).getDate()
  const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
})

const isCustomProgressRange = computed(
  () => progressRangeStart.value !== null || progressRangeEnd.value !== null,
)

function onProgressBlockClick() {
  progressBlockActive.value = !progressBlockActive.value
  if (progressBlockActive.value) {
    showProgressHint.value = true
    if (progressHintTimer) clearTimeout(progressHintTimer)
    progressHintTimer = setTimeout(() => {
      showProgressHint.value = false
      progressHintTimer = null
    }, 4500)
  }
}

function clearProgressRange() {
  progressRangeStart.value = null
  progressRangeEnd.value = null
}

function selectDayForProgress(key: string) {
  if (!progressRangeStart.value) {
    progressRangeStart.value = key
    progressRangeEnd.value = null
  } else if (!progressRangeEnd.value) {
    const a = progressRangeStart.value
    const b = key
    progressRangeStart.value = a <= b ? a : b
    progressRangeEnd.value = a <= b ? b : a
  } else {
    progressRangeStart.value = key
    progressRangeEnd.value = null
  }
}

function selectDay(key: string) {
  if (progressBlockActive.value) {
    selectDayForProgress(key)
  }
  selectedDate.value = key
}

/** Подсветка в календаре: при активном фрейме — весь месяц, иначе — текущий диапазон прогресса */
function isDayInProgressRange(dayKey: string): boolean {
  if (progressBlockActive.value) {
    const { start, end } = progressMonthRange.value
    return dayKey >= start && dayKey <= end
  }
  const { start, end } = weekProgress.value
  return dayKey >= start && dayKey <= end
}

/** Первая дата для пульсации: при активном фрейме — всегда 1-е число месяца */
function isProgressRangeStartDay(dayKey: string): boolean {
  if (!progressBlockActive.value) return false
  return dayKey === progressMonthRange.value.start
}

async function loadFilesForVisibleTasks() {
  const ids = tasksForSelectedDate.value.map((t) => t.id)
  if (ids.length === 0 || !isSupabaseConfigured()) {
    taskFilesByTaskId.value = {}
    return
  }
  filesLoading.value = true
  const next: Record<string, CalendarTaskFileRow[]> = {}
  try {
    await Promise.all(
      ids.map(async (taskId) => {
        try {
          const files = await loadTaskFiles(taskId)
          next[taskId] = files
        } catch {
          next[taskId] = []
        }
      }),
    )
    taskFilesByTaskId.value = next
  } finally {
    filesLoading.value = false
  }
}

function getTaskFiles(taskId: string): CalendarTaskFileRow[] {
  return taskFilesByTaskId.value[taskId] ?? []
}

function prevMonth() {
  if (currentMonth.value === 0) {
    currentMonth.value = 11
    currentYear.value -= 1
  } else {
    currentMonth.value -= 1
  }
}

function nextMonth() {
  if (currentMonth.value === 11) {
    currentMonth.value = 0
    currentYear.value += 1
  } else {
    currentMonth.value += 1
  }
}

async function loadTasksFromDb() {
  if (!isSupabaseConfigured() || !auth.user.value) {
    tasks.value = []
    return
  }
  tasksLoading.value = true
  try {
    const rows = await loadCalendarTasks(auth.user.value.id)
    tasks.value = rows.map(rowToTask)
  } catch {
    tasks.value = []
  } finally {
    tasksLoading.value = false
  }
}

async function loadProfilesOnce() {
  if (!isSupabaseConfigured()) return
  try {
    profiles.value = await loadProfiles()
  } catch {
    profiles.value = []
  }
}

watch(
  () => [tasksForSelectedDate.value.length, selectedDate.value] as const,
  () => loadFilesForVisibleTasks(),
  { immediate: true },
)

onMounted(() => {
  loadTasksFromDb()
  loadProfilesOnce()
})

function openNewTaskModal() {
  editingTaskId.value = null
  taskTitle.value = ''
  taskDescription.value = ''
  taskDate.value = selectedDate.value
  taskStartTime.value = '09:00'
  taskEndTime.value = '11:30'
  taskPriority.value = 'normal'
  taskAssignees.value = auth.user.value?.id ? [auth.user.value.id] : []
  taskFiles.value = []
  assigneePickerOpen.value = false
  isTaskModalOpen.value = true
}

async function openEditTaskModal(task: CalendarTask) {
  editingTaskId.value = task.id
  taskTitle.value = task.title
  taskDescription.value = task.description
  taskDate.value = task.date
  taskStartTime.value = task.startTime ?? '09:00'
  taskEndTime.value = task.endTime ?? '11:30'
  taskPriority.value = task.priority
  taskFiles.value = []
  assigneePickerOpen.value = false
  isTaskModalOpen.value = true
  if (isSupabaseConfigured()) {
    try {
      taskAssignees.value = await loadTaskAssignees(task.id)
      taskFiles.value = await loadTaskFiles(task.id)
    } catch {
      taskAssignees.value = []
    }
  } else {
    taskAssignees.value = []
  }
}

function removeAssignee(uid: string) {
  taskAssignees.value = taskAssignees.value.filter((id) => id !== uid)
}

function addAssignee(uid: string) {
  if (!taskAssignees.value.includes(uid)) taskAssignees.value = [...taskAssignees.value, uid]
  assigneePickerOpen.value = false
}

function formatFileSize(bytes: number | null): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !editingTaskId.value || !isSupabaseConfigured()) return
  fileUploading.value = true
  try {
    const row = await uploadTaskFile(editingTaskId.value, file)
    taskFiles.value = [row, ...taskFiles.value]
  } catch (err) {
    console.error(err)
  } finally {
    fileUploading.value = false
    input.value = ''
  }
}

function triggerFileInput() {
  if (editingTaskId.value) fileInputRef.value?.click()
}

async function removeFile(fileRow: CalendarTaskFileRow) {
  if (!isSupabaseConfigured()) return
  try {
    await deleteTaskFile(fileRow.id)
    taskFiles.value = taskFiles.value.filter((f) => f.id !== fileRow.id)
  } catch (err) {
    console.error(err)
  }
}

function closeTaskModal() {
  isTaskModalOpen.value = false
}

async function onSubmitTask() {
  const title = taskTitle.value.trim()
  if (!title) return

  if (!isSupabaseConfigured()) return

  taskSaveLoading.value = true
  try {
    const id = editingTaskId.value
    const date = taskDate.value || selectedDate.value
    if (id) {
      await updateCalendarTask(id, {
        date,
        title,
        description: taskDescription.value.trim() || null,
        start_time: taskStartTime.value?.trim() || null,
        end_time: taskEndTime.value?.trim() || null,
        priority: taskPriority.value,
        assignee_ids: taskAssignees.value,
      })
    } else {
      await insertCalendarTask({
        user_id: auth.user.value?.id ?? null,
        date,
        title,
        description: taskDescription.value.trim() || null,
        start_time: taskStartTime.value?.trim() || null,
        end_time: taskEndTime.value?.trim() || null,
        priority: taskPriority.value,
        assignee_ids: taskAssignees.value,
      })
    }
    await loadTasksFromDb()
    await loadFilesForVisibleTasks()
    isTaskModalOpen.value = false
  } catch (e) {
    console.error(e)
  } finally {
    taskSaveLoading.value = false
  }
}

async function toggleTaskCompleted(task: CalendarTask) {
  try {
    await updateCalendarTask(task.id, {
      completed_at: task.completedAt ? null : new Date().toISOString(),
    })
    await loadTasksFromDb()
  } catch (e) {
    console.error(e)
  }
}

async function deleteTask(id: string) {
  try {
    await deleteCalendarTask(id)
    await loadTasksFromDb()
  } catch (e) {
    console.error(e)
  }
}

function openDeleteConfirm() {
  showDeleteConfirm.value = true
}

function closeDeleteConfirm() {
  if (!deleteInProgress.value) showDeleteConfirm.value = false
}

async function confirmDeleteTask() {
  if (!editingTaskId.value) return
  deleteInProgress.value = true
  try {
    await deleteTask(editingTaskId.value)
    showDeleteConfirm.value = false
    closeTaskModal()
  } catch (e) {
    console.error(e)
  } finally {
    deleteInProgress.value = false
  }
}
</script>

<template>
  <section class="calendar-page">
    <header class="calendar-header page-enter-item">
      <div>
        <div class="type-label">Календарь</div>
        <h1 class="page-title">Планирование дня</h1>
      </div>
      <button type="button" class="calendar-add-btn" @click="openNewTaskModal">
        <svg
          class="calendar-add-btn-icon"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="12" x2="12" y1="5" y2="19" />
          <line x1="5" x2="19" y1="12" y2="12" />
        </svg>
        Добавить задачу
      </button>
    </header>

    <div class="calendar-layout page-enter-item" style="--enter-delay: 60ms">
      <section class="calendar-card calendar-card-left">
        <div class="calendar-month-header">
          <button
            type="button"
            class="month-nav-btn"
            aria-label="Предыдущий месяц"
            @click="prevMonth"
          >
            ‹
          </button>
          <div class="month-label">
            {{ currentMonthLabel }}
          </div>
          <button
            type="button"
            class="month-nav-btn"
            aria-label="Следующий месяц"
            @click="nextMonth"
          >
            ›
          </button>
        </div>

        <div class="calendar-grid">
          <div v-for="day in weekdaysShort" :key="day" class="calendar-weekday">
            {{ day }}
          </div>
          <button
            v-for="day in calendarWeeks.flat()"
            :key="day.key"
            type="button"
            class="calendar-day"
            :class="{
              'calendar-day--muted': !day.inCurrentMonth,
              'calendar-day--today': day.isToday,
              'calendar-day--selected': day.isSelected,
              'calendar-day--in-range': progressBlockActive && isDayInProgressRange(day.key),
              'calendar-day--range-start': isProgressRangeStartDay(day.key),
            }"
            @click="selectDay(day.key)"
          >
            <span class="calendar-day-number">{{ day.date }}</span>
            <span v-if="day.hasTasks" class="calendar-day-dot" />
          </button>
        </div>

        <div
          class="week-progress"
          :class="{ 'week-progress--active': progressBlockActive }"
          role="button"
          tabindex="0"
          @click="onProgressBlockClick"
          @keydown.enter="onProgressBlockClick"
          @keydown.space.prevent="onProgressBlockClick"
        >
          <div v-if="showProgressHint" class="week-progress-hint">
            Выберите диапазон дат для подсчёта прогресса
          </div>
          <div class="week-progress-head">
            <h3 class="week-progress-title">Прогресс</h3>
            <button
              v-if="isCustomProgressRange"
              type="button"
              class="week-progress-reset"
              @click.stop="clearProgressRange()"
            >
              Сбросить
            </button>
          </div>
          <p class="week-progress-range">{{ weekProgressLabel }}</p>
          <p class="week-progress-count">
            <span class="week-progress-number">{{ weekProgress.completed }}</span>
            из {{ weekProgress.total }} задач
          </p>
          <div class="week-progress-bar-wrap">
            <div
              class="week-progress-bar-fill"
              :style="{ width: weekProgress.total ? (100 * weekProgress.completed) / weekProgress.total + '%' : '0%' }"
            />
          </div>
          <div class="week-progress-labels">
            <span>Выполнено {{ weekProgress.total ? Math.round((100 * weekProgress.completed) / weekProgress.total) : 0 }}%</span>
            <span>Осталось {{ Math.max(0, weekProgress.total - weekProgress.completed) }}</span>
          </div>
        </div>
      </section>

      <section class="calendar-card calendar-card-right">
        <header class="day-header">
          <div class="day-header-text">
            <div class="type-label">Задачи на день</div>
            <h2 class="day-title">
              {{
                new Date(selectedDate + 'T12:00:00').toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                  weekday: 'long',
                })
              }}
            </h2>
            <p class="day-header-summary">
              Запланировано {{ tasksForSelectedDate.length }} {{ tasksForSelectedDate.length === 1 ? 'задача' : tasksForSelectedDate.length < 5 ? 'задачи' : 'задач' }}
              ({{ tasksForSelectedDate.filter(t => t.completedAt).length }} выполнено)
            </p>
            <p v-if="filesLoading" class="day-header-loading">
              <span class="day-header-loading-dots"><span /><span /><span /></span>
              Загрузка вложений…
            </p>
          </div>
        </header>

        <div v-if="tasksLoading" class="day-loading">
          <div class="day-loading-spinner" aria-hidden="true" />
          <p class="day-loading-text">Загрузка задач…</p>
          <div class="day-loading-skeletons">
            <div class="day-loading-skeleton" />
            <div class="day-loading-skeleton day-loading-skeleton--short" />
            <div class="day-loading-skeleton day-loading-skeleton--medium" />
          </div>
        </div>
        <div v-else-if="!tasksForSelectedDate.length" class="day-empty">
          <p>На этот день ещё нет задач. Нажмите «Добавить задачу» в шапке страницы.</p>
        </div>

        <ul v-else class="day-task-list">
          <li
            v-for="task in tasksForSelectedDate"
            :key="task.id"
            class="day-task"
            :class="{ 'day-task--completed': task.completedAt }"
          >
            <button
              type="button"
              class="day-task-checkbox"
              :aria-label="task.completedAt ? 'Снять отметку' : 'Отметить выполненным'"
              @click.stop="toggleTaskCompleted(task)"
            >
              <svg
                v-if="task.completedAt"
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span v-else class="day-task-checkbox-empty" />
            </button>
            <div
              class="day-task-main"
              role="button"
              tabindex="0"
              @click="openEditTaskModal(task)"
              @keydown.enter="openEditTaskModal(task)"
            >
              <div class="day-task-time" v-if="task.startTime || task.endTime">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l3 3" />
                </svg>
                <span>
                  {{ task.startTime || '—' }}<span v-if="task.endTime"> – {{ task.endTime }}</span>
                </span>
              </div>
              <div class="day-task-title">
                {{ task.title }}
              </div>
              <div v-if="task.description" class="day-task-desc">
                {{ task.description }}
              </div>
              <div v-if="getTaskFiles(task.id).length > 0" class="day-task-files">
                <span class="day-task-files-icon" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </span>
                <span class="day-task-files-count">{{ getTaskFiles(task.id).length }} {{ getTaskFiles(task.id).length === 1 ? 'файл' : getTaskFiles(task.id).length < 5 ? 'файла' : 'файлов' }}</span>
                <div class="day-task-files-preview">
                  <a
                    v-for="f in getTaskFiles(task.id).slice(0, 3)"
                    :key="f.id"
                    :href="getTaskFilePublicUrl(f.file_path)"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="day-task-file-pill"
                    :title="f.file_name"
                    @click.stop
                  >
                    {{ f.file_name.length > 12 ? f.file_name.slice(0, 10) + '…' : f.file_name }}
                  </a>
                </div>
              </div>
              <div class="day-task-meta">
                <span
                  class="priority-pill"
                  :class="{
                    'priority-pill--high': task.priority === 'high',
                    'priority-pill--low': task.priority === 'low',
                  }"
                >
                  {{
                    task.priority === 'high'
                      ? 'Высокий приоритет'
                      : task.priority === 'low'
                        ? 'Низкий приоритет'
                        : 'Обычный приоритет'
                  }}
                </span>
                <span v-if="task.assignee" class="assignee-pill">
                  {{ task.assignee }}
                </span>
              </div>
            </div>
          </li>
        </ul>
      </section>
    </div>

    <div
      v-if="isTaskModalOpen"
      class="modal-backdrop"
      @click="closeTaskModal"
    >
      <div class="modal modal-calendar" @click.stop>
        <!-- Шапка по макету: px-8 py-6, border-b, иконка 40x40 rounded-xl bg-green-50 -->
        <div class="modal-header modal-header--design">
          <div class="modal-header-main">
            <div class="modal-icon modal-icon--design">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                <path d="m15 5 4 4" />
              </svg>
            </div>
            <div class="modal-header-text">
              <h2 class="modal-title modal-title--design">
                {{ editingTaskId ? 'Редактирование задачи' : 'Новая задача' }}
              </h2>
              <p v-if="editingTaskId" class="modal-task-id modal-task-id--design">ID: {{ shortTaskId(editingTaskId) }}</p>
              <p v-else class="modal-subtitle">
                {{ new Date((taskDate || selectedDate) + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' }) }}
              </p>
            </div>
          </div>
          <button type="button" class="modal-close modal-close--design" aria-label="Закрыть" @click="closeTaskModal">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" x2="6" y1="6" y2="18" />
              <line x1="6" x2="18" y1="6" y2="18" />
            </svg>
          </button>
        </div>

        <form class="modal-form modal-form--design" @submit.prevent="onSubmitTask" :aria-busy="taskSaveLoading">
          <fieldset class="modal-form-fieldset" :disabled="taskSaveLoading">
          <div class="modal-body">
            <label class="modal-field modal-field--design">
              <span class="modal-label modal-label--design">Название задачи</span>
              <input
                v-model="taskTitle"
                type="text"
                class="modal-input modal-input--design modal-input--title"
                placeholder="Введите название..."
                required
              />
            </label>

            <label class="modal-field modal-field--design">
              <span class="modal-label modal-label--design">Описание</span>
              <textarea
                v-model="taskDescription"
                class="modal-textarea modal-textarea--design"
                rows="4"
                placeholder="Добавьте детали задачи..."
              />
            </label>

            <!-- Сетка как в макете: Срок выполнения | Приоритет -->
            <div class="modal-grid-2">
              <label class="modal-field modal-field--design">
                <span class="modal-label modal-label--design">Срок выполнения</span>
                <div class="modal-deadline-row modal-deadline-row--design">
                  <div class="modal-deadline-date">
                    <svg class="modal-input-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect width="18" height="18" x="3" y="4" rx="2" />
                      <line x1="16" x2="16" y1="2" y2="6" />
                      <line x1="8" x2="8" y1="2" y2="6" />
                      <line x1="3" x2="21" y1="10" y2="10" />
                    </svg>
                    <input v-model="taskDate" type="date" class="modal-input modal-input--design modal-input--with-icon" />
                  </div>
                  <div class="modal-deadline-time-range">
                    <div class="modal-deadline-time-start">
                      <svg class="modal-input-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v6l3 3" />
                      </svg>
                      <input v-model="taskStartTime" type="time" class="modal-input modal-input--design modal-input--with-icon" />
                    </div>
                    <span class="time-separator">–</span>
                    <input v-model="taskEndTime" type="time" class="modal-input modal-input--design modal-input--time-end" />
                  </div>
                </div>
              </label>
              <label class="modal-field modal-field--design">
                <span class="modal-label modal-label--design">Приоритет</span>
                <select v-model="taskPriority" class="modal-input modal-input--design modal-select modal-select--design">
                  <option value="normal">Обычный</option>
                  <option value="high">Высокий</option>
                  <option value="low">Низкий</option>
                </select>
              </label>
            </div>

            <!-- Ответственные: label + кнопка «Добавить» в одну строку, чипы как в макете -->
            <div class="modal-field modal-field--design">
              <div class="modal-label-row modal-label-row--design">
                <span class="modal-label modal-label--design">Ответственные специалисты</span>
                <div class="modal-assignee-picker">
                  <button
                    type="button"
                    class="modal-add-assignee-btn modal-add-assignee-btn--design"
                    @click="assigneePickerOpen = !assigneePickerOpen"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" x2="12" y1="8" y2="16" />
                      <line x1="8" x2="16" y1="12" y2="12" />
                    </svg>
                    Добавить
                  </button>
                  <div v-if="assigneePickerOpen" class="modal-assignee-dropdown">
                    <div class="modal-assignee-search">
                      <svg
                        class="modal-assignee-search-icon"
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="11" cy="11" r="7" />
                        <line x1="16.65" y1="16.65" x2="21" y2="21" />
                      </svg>
                      <input
                        v-model="assigneeSearch"
                        type="text"
                        class="modal-assignee-search-input"
                        placeholder="Поиск по имени или email"
                      />
                    </div>
                    <button
                      v-for="p in assigneeOptions"
                      :key="p.id"
                      type="button"
                      class="modal-assignee-option"
                      @click="addAssignee(p.id)"
                    >
                      {{ profileLabel(p) }}{{ p.id === auth.user.value?.id ? ' (Вы)' : '' }}
                    </button>
                    <p
                      v-if="assigneeOptions.length === 0"
                      class="modal-assignee-empty"
                    >
                      {{ profilesNotAssigned.length === 0 ? 'Все добавлены' : 'Ничего не найдено' }}
                    </p>
                  </div>
                </div>
              </div>
              <div class="modal-chips modal-chips--design">
                <div
                  v-for="uid in taskAssignees"
                  :key="uid"
                  class="modal-chip modal-chip--design"
                >
                  <span class="modal-chip-avatar modal-chip-avatar--design">{{ profileById(uid) ? assigneeInitials(profileById(uid)!) : '?' }}</span>
                  <span class="modal-chip-label">{{ profileById(uid) ? profileLabel(profileById(uid)!) : uid }}</span>
                  <button type="button" class="modal-chip-remove" aria-label="Убрать" @click="removeAssignee(uid)">×</button>
                </div>
              </div>
            </div>

            <!-- Прикреплённые файлы: карточки как в макете (иконка в квадрате, имя, размер, корзина) -->
            <div class="modal-field modal-field--design">
              <span class="modal-label modal-label--design">Прикреплённые файлы</span>
              <div class="modal-files-grid modal-files-grid--design">
                <a
                  v-for="f in taskFiles"
                  :key="f.id"
                  :href="getTaskFilePublicUrl(f.file_path)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="modal-file-card modal-file-card--design"
                >
                  <div class="modal-file-icon-box">
                    <svg v-if="/\.pdf$/i.test(f.file_name)" class="modal-file-icon-pdf" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6" />
                      <path d="M9 13h6" />
                      <path d="M9 17h6" />
                    </svg>
                    <svg v-else class="modal-file-icon-doc" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6" />
                    </svg>
                  </div>
                  <div class="modal-file-info">
                    <span class="modal-file-name">{{ f.file_name }}</span>
                    <span class="modal-file-size">{{ formatFileSize(f.file_size) }}</span>
                  </div>
                  <button type="button" class="modal-file-delete" aria-label="Удалить файл" @click.prevent="removeFile(f)">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      <line x1="10" x2="10" y1="11" y2="17" />
                      <line x1="14" x2="14" y1="11" y2="17" />
                    </svg>
                  </button>
                </a>
                <button
                  v-if="editingTaskId"
                  type="button"
                  class="modal-attach-placeholder modal-attach-placeholder--design"
                  :disabled="fileUploading"
                  @click="triggerFileInput"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                  <span>{{ fileUploading ? 'Загрузка...' : 'Прикрепить файл' }}</span>
                </button>
                <div v-else class="modal-attach-placeholder modal-attach-placeholder--design modal-attach-placeholder--muted">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                  <span>Сохраните задачу, чтобы прикрепить файлы</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Подвал по макету: bg-gray-50, border-t, Удалить слева, Отмена + Сохранить справа -->
          <div class="modal-actions modal-actions--design">
            <button v-if="editingTaskId" type="button" class="modal-btn-danger modal-btn-danger--design" :disabled="taskSaveLoading" @click="openDeleteConfirm">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                <line x1="10" x2="10" y1="11" y2="17" />
                <line x1="14" x2="14" y1="11" y2="17" />
              </svg>
              Удалить задачу
            </button>
            <div class="modal-actions-right">
              <button type="button" class="modal-btn-ghost modal-btn-ghost--design" :disabled="taskSaveLoading" @click="closeTaskModal">Отмена</button>
              <button type="submit" class="modal-btn modal-btn--design" :disabled="taskSaveLoading">
                <span v-if="taskSaveLoading" class="modal-btn-loading">
                  <span class="modal-btn-spinner" aria-hidden="true" />
                  Сохранение…
                </span>
                <span v-else>{{ editingTaskId ? 'Сохранить изменения' : 'Создать задачу' }}</span>
              </button>
            </div>
          </div>
          </fieldset>
        </form>
        <input ref="fileInputRef" type="file" class="modal-file-input-hidden" accept="image/*,.pdf,.doc,.docx" @change="onFileSelect" />
      </div>
    </div>

    <!-- Подтверждение удаления задачи -->
    <div
      v-if="showDeleteConfirm"
      class="modal-backdrop modal-backdrop--confirm"
      @click="closeDeleteConfirm"
    >
      <div class="modal modal-confirm" @click.stop>
        <h3 class="modal-confirm-title">Удалить задачу?</h3>
        <p class="modal-confirm-text">Задача будет удалена без возможности восстановления.</p>
        <div class="modal-confirm-actions">
          <button type="button" class="modal-btn-ghost modal-btn-ghost--design" :disabled="deleteInProgress" @click="closeDeleteConfirm">
            Отмена
          </button>
          <button type="button" class="modal-btn modal-btn--design modal-btn--danger" :disabled="deleteInProgress" @click="confirmDeleteTask">
            <span v-if="deleteInProgress" class="modal-btn-loading">
              <span class="modal-btn-spinner" aria-hidden="true" />
              Удаление…
            </span>
            <span v-else>Удалить</span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Палитра по дизайну: agro #3d5c40 */
.calendar-page {
  --agro: #3d5c40;
  --agro-light: #4d7350;
  --agro-dark: #2d4430;
  --agro-bg: #f5f5f5;
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

.calendar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.calendar-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 12px;
  border: none;
  background: var(--agro);
  color: #fff;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(61, 92, 64, 0.35);
}

.calendar-add-btn:hover {
  background: var(--agro-dark);
}

.calendar-add-btn-icon {
  width: 18px;
  height: 18px;
}

.calendar-layout {
  display: grid;
  grid-template-columns: 380px minmax(0, 1fr);
  gap: 24px;
  align-items: flex-start;
}

@media (max-width: 900px) {
  .calendar-layout {
    grid-template-columns: 1fr;
    gap: 20px;
  }
}

/* Планшет: компактнее отступы и календарь */
@media (max-width: 768px) {
  .calendar-page {
    gap: var(--space-lg);
  }

  .calendar-card {
    padding: var(--space-md) var(--space-lg);
  }

  .calendar-grid {
    gap: 3px;
  }

  .calendar-day {
    padding: 5px 0;
  }

  .calendar-day-number {
    font-size: 0.85rem;
  }

  .week-progress {
    margin-top: var(--space-md);
    padding: var(--space-md) var(--space-lg);
  }

  .day-title {
    font-size: 1.15rem;
  }

  .day-task {
    padding: 12px 14px;
  }
}

/* Большой телефон / маленький планшет */
@media (max-width: 600px) {
  .calendar-page {
    gap: var(--space-md);
  }

  .calendar-header {
    flex-wrap: wrap;
    gap: var(--space-sm);
  }

  .calendar-add-btn {
    padding: 8px 16px;
    font-size: 0.85rem;
  }

  .calendar-add-btn-icon {
    width: 16px;
    height: 16px;
  }

  .calendar-card {
    padding: var(--space-md);
  }

  .calendar-month-header {
    margin-bottom: var(--space-sm);
  }

  .month-label {
    font-size: 0.95rem;
  }

  .month-nav-btn {
    width: 32px;
    height: 32px;
    font-size: 1rem;
  }

  .calendar-grid {
    gap: 2px;
  }

  .calendar-weekday {
    font-size: 0.7rem;
    padding-bottom: 2px;
  }

  .calendar-day {
    padding: 4px 0;
    min-height: 36px;
  }

  .calendar-day-number {
    font-size: 0.8rem;
  }

  .calendar-day-dot {
    width: 4px;
    height: 4px;
  }

  .week-progress {
    padding: var(--space-sm) var(--space-md);
    margin-top: var(--space-md);
  }

  .week-progress-hint {
    left: 0;
    right: 0;
    max-width: none;
    white-space: normal;
    text-align: center;
    padding: 10px 12px;
    font-size: 0.75rem;
  }

  .week-progress-hint::after {
    left: 50%;
    right: auto;
    transform: translateX(-50%);
  }

  .week-progress-title {
    font-size: 0.9rem;
  }

  .week-progress-count {
    font-size: 1rem;
    margin-bottom: 8px;
  }

  .week-progress-number {
    font-size: 1.35rem;
  }

  .week-progress-labels {
    font-size: 0.7rem;
  }

  .calendar-card-right {
    min-height: 0;
  }

  .day-header {
    margin-bottom: var(--space-sm);
  }

  .day-title {
    font-size: 1.1rem;
  }

  .day-header-summary {
    font-size: 0.8rem;
  }

  .day-task-list {
    gap: 10px;
  }

  .day-task {
    padding: 10px 12px;
    gap: 10px;
  }

  .day-task-title {
    font-size: 0.9rem;
  }

  .day-task-desc,
  .day-task-time {
    font-size: 0.8rem;
  }

  .day-loading-skeleton {
    height: 60px;
  }

  .day-loading-skeleton--short {
    height: 48px;
  }

  .day-loading-skeleton--medium {
    height: 52px;
  }
}

/* Мобильный: максимально компактно */
@media (max-width: 480px) {
  .calendar-page {
    gap: var(--space-sm);
  }

  .calendar-header {
    flex-direction: column;
    align-items: stretch;
  }

  .calendar-add-btn {
    width: 100%;
    justify-content: center;
    padding: 10px 16px;
  }

  .calendar-card {
    padding: var(--space-sm) var(--space-md);
  }

  .calendar-month-header {
    margin-bottom: 10px;
  }

  .month-label {
    font-size: 0.9rem;
  }

  .month-nav-btn {
    width: 36px;
    height: 36px;
  }

  .calendar-day {
    min-height: 38px;
  }

  .calendar-day-number {
    font-size: 0.75rem;
  }

  .week-progress {
    padding: 10px 12px;
  }

  .week-progress-head {
    margin-bottom: 2px;
  }

  .week-progress-title {
    font-size: 0.85rem;
  }

  .week-progress-range {
    font-size: 0.75rem;
    margin-bottom: 6px;
  }

  .week-progress-count {
    font-size: 0.95rem;
    margin-bottom: 6px;
  }

  .week-progress-number {
    font-size: 1.2rem;
  }

  .week-progress-bar-wrap {
    height: 6px;
    margin-bottom: 6px;
  }

  .week-progress-reset {
    padding: 3px 8px;
    font-size: 0.7rem;
  }

  .day-header {
    padding: 0;
  }

  .day-title {
    font-size: 1rem;
  }

  .day-header-summary {
    font-size: 0.75rem;
  }

  .day-empty {
    padding: var(--space-md);
    font-size: 0.9rem;
  }

  .day-empty-btn {
    margin-top: var(--space-sm);
    padding: 8px 14px;
    font-size: 0.8rem;
  }

  .day-task {
    padding: 8px 10px;
    gap: 8px;
  }

  .day-task-checkbox {
    width: 22px;
    height: 22px;
  }

  .day-task-checkbox-empty {
    width: 20px;
    height: 20px;
  }

  /* Модалка задачи: компактный вид на маленьких экранах */
  .modal-backdrop {
    padding: var(--space-sm);
    align-items: flex-end;
  }

  .modal-backdrop .modal {
    max-height: 85vh;
    border-radius: 20px 20px 0 0;
  }

  .modal-header {
    padding: 16px 20px;
  }

  .modal-title {
    font-size: 1.1rem;
  }

  .modal-body {
    padding: 16px 20px;
    gap: 16px;
  }

  .modal-actions {
    padding: 16px 20px;
    gap: 10px;
  }

  .modal-actions--task {
    flex-direction: column;
  }

  .day-task-title {
    font-size: 0.85rem;
  }

  .day-task-desc,
  .day-task-time,
  .day-task-meta {
    font-size: 0.75rem;
  }

  .priority-pill,
  .assignee-pill {
    font-size: 0.7rem;
    padding: 3px 6px;
  }

  .modal-backdrop {
    padding: var(--space-sm);
    align-items: flex-end;
  }

  .modal-backdrop .modal {
    max-height: 85vh;
    border-radius: 20px 20px 0 0;
  }

  .modal-header {
    padding: 16px 20px;
  }

  .modal-title {
    font-size: 1.1rem;
  }

  .modal-actions {
    padding: 16px 20px;
    gap: 10px;
  }

  .modal-actions--task {
    flex-direction: column;
  }

  .modal-actions--task .modal-btn-danger {
    order: 1;
    width: 100%;
    justify-content: center;
  }

  .modal-actions--task .modal-btn-ghost,
  .modal-actions--task .modal-btn {
    order: 2;
    width: 100%;
    justify-content: center;
  }
}

.calendar-card {
  background: var(--bg-panel);
  border-radius: 16px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  padding: var(--space-lg);
}

.calendar-month-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-md);
}

.month-label {
  font-weight: 600;
}

.month-nav-btn {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--bg-base);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.calendar-weekday {
  font-size: 0.75rem;
  text-align: center;
  color: var(--text-secondary);
  padding-bottom: 4px;
}

.calendar-day {
  position: relative;
  border-radius: 12px;
  border: none;
  padding: 6px 0;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 2px;
}

.calendar-day-number {
  font-size: 0.9rem;
}

.calendar-day-dot {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--agro);
}

.calendar-day--muted .calendar-day-number {
  color: var(--text-secondary);
  opacity: 0.5;
}

.calendar-day--today {
  background: rgba(61, 92, 64, 0.12);
}

.week-progress {
  position: relative;
  margin-top: var(--space-lg);
  padding: var(--space-md) var(--space-lg);
  background: var(--agro);
  color: #fff;
  border-radius: 16px;
  cursor: pointer;
  transition: box-shadow 0.2s ease, transform 0.2s ease;
  border: 2px solid transparent;
  min-width: 0;
  overflow: hidden;
}

.week-progress:hover {
  filter: brightness(1.05);
}

.week-progress--active {
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.4), 0 4px 20px rgba(61, 92, 64, 0.4);
  border-color: rgba(255, 255, 255, 0.3);
}

.week-progress-hint {
  position: absolute;
  top: -8px;
  right: 0;
  transform: translateY(-100%);
  padding: 8px 12px;
  background: var(--bg-panel);
  color: var(--text-primary);
  font-size: 0.8rem;
  font-weight: 500;
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  border: 1px solid var(--border-color);
  white-space: nowrap;
  animation: week-progress-hint-in 0.25s ease;
  z-index: 5;
}

.week-progress-hint::after {
  content: '';
  position: absolute;
  bottom: -6px;
  right: 16px;
  border: 6px solid transparent;
  border-top-color: var(--bg-panel);
  border-bottom: none;
}

@keyframes week-progress-hint-in {
  from {
    opacity: 0;
    transform: translateY(-90%);
  }
  to {
    opacity: 1;
    transform: translateY(-100%);
  }
}

.calendar-day--in-range {
  box-shadow: 0 0 0 2px var(--agro);
  background: rgba(61, 92, 64, 0.2) !important;
}

.calendar-day--in-range.calendar-day--muted .calendar-day-number {
  color: var(--agro);
  opacity: 1;
}

.calendar-day--in-range.calendar-day--selected {
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--agro);
}

.calendar-day--range-start {
  animation: calendar-day-pulse 1.5s ease-in-out infinite;
}

@keyframes calendar-day-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 2px var(--agro);
  }
  50% {
    box-shadow: 0 0 0 2px var(--agro), 0 0 0 6px rgba(61, 92, 64, 0.35);
  }
}

.week-progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
  min-width: 0;
}

.week-progress-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.week-progress-reset {
  padding: 4px 10px;
  font-size: 0.75rem;
  font-weight: 600;
  color: #fff;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.week-progress-reset:hover {
  background: rgba(255, 255, 255, 0.3);
  border-color: rgba(255, 255, 255, 0.6);
}

.week-progress-range {
  margin: 0 0 8px;
  font-size: 0.8rem;
  opacity: 0.9;
}

.week-progress-count {
  margin: 0 0 10px;
  font-size: 1.1rem;
}

.week-progress-number {
  font-size: 1.5rem;
  font-weight: 700;
}

.week-progress-bar-wrap {
  height: 8px;
  background: rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 8px;
}

.week-progress-bar-fill {
  height: 100%;
  background: #fff;
  border-radius: 999px;
  transition: width 0.25s ease;
}

.week-progress-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  opacity: 0.95;
}

.day-task-files {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  margin-top: 6px;
}

.day-task-files-icon {
  color: var(--text-secondary);
  display: inline-flex;
}

.day-task-files-count {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.day-task-files-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.day-task-file-pill {
  font-size: 0.7rem;
  padding: 2px 6px;
  background: rgba(61, 92, 64, 0.1);
  color: var(--agro);
  border-radius: 6px;
  text-decoration: none;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.day-task-file-pill:hover {
  background: rgba(61, 92, 64, 0.2);
}

.calendar-day--selected {
  background: var(--agro);
  color: #fff;
}

.calendar-day--selected .calendar-day-number {
  color: #fff;
}

.calendar-day--selected .calendar-day-dot {
  background: #fff;
}

.calendar-card-right {
  min-height: 260px;
}

.day-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  margin-bottom: var(--space-md);
}

.day-title {
  margin: 4px 0 0;
  font-size: 1.25rem;
}

.day-header-summary {
  margin: 4px 0 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.day-add-btn {
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--bg-base);
  padding: 8px 14px;
  font-size: 0.85rem;
  cursor: pointer;
}

.day-loading {
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.day-loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border-color);
  border-top-color: var(--agro);
  border-radius: 50%;
  animation: day-loading-spin 0.8s linear infinite;
}

@keyframes day-loading-spin {
  to {
    transform: rotate(360deg);
  }
}

.day-loading-text {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.day-loading-skeletons {
  width: 100%;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
}

.day-loading-skeleton {
  height: 72px;
  border-radius: 12px;
  background: linear-gradient(
    90deg,
    var(--bg-base) 0%,
    var(--bg-panel) 50%,
    var(--bg-base) 100%
  );
  background-size: 200% 100%;
  animation: day-loading-shimmer 1.2s ease-in-out infinite;
}

.day-loading-skeleton--short {
  height: 56px;
  width: 75%;
}

.day-loading-skeleton--medium {
  height: 64px;
  width: 90%;
}

@keyframes day-loading-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.day-header-loading {
  margin: 6px 0 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.day-header-loading-dots {
  display: inline-flex;
  gap: 4px;
}

.day-header-loading-dots span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--agro);
  animation: day-loading-dot 0.6s ease-in-out infinite both;
}

.day-header-loading-dots span:nth-child(2) {
  animation-delay: 0.1s;
}

.day-header-loading-dots span:nth-child(3) {
  animation-delay: 0.2s;
}

@keyframes day-loading-dot {
  0%,
  100% {
    opacity: 0.3;
    transform: scale(0.85);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}

.day-empty {
  padding: var(--space-lg);
  text-align: center;
  color: var(--text-secondary);
}

.day-empty-btn {
  margin-top: var(--space-md);
  padding: 8px 16px;
  border-radius: 999px;
  border: none;
  background: var(--accent-green);
  color: #fff;
  cursor: pointer;
  font-size: 0.85rem;
}

.day-task-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.day-task {
  border-radius: 12px;
  border: 1px solid var(--border-color);
  padding: 14px 16px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: var(--bg-panel);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.day-task:hover {
  border-color: rgba(61, 92, 64, 0.35);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.day-task-checkbox {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  margin-top: 2px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--agro);
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.day-task-checkbox-empty {
  width: 18px;
  height: 18px;
  border: 2px solid var(--border-color);
  border-radius: 4px;
  display: block;
}

.day-task-checkbox:hover .day-task-checkbox-empty {
  border-color: var(--agro);
}

.day-task-main {
  flex: 1;
  min-width: 0;
  cursor: pointer;
  text-align: left;
}

.day-task-main:hover {
  outline: none;
}

.day-task--completed .day-task-title {
  text-decoration: line-through;
  color: var(--text-secondary);
}

.day-task--completed .day-task-time,
.day-task--completed .day-task-desc {
  opacity: 0.8;
}

.day-task-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.day-task-time {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.day-task-title {
  font-weight: 600;
  font-size: 0.95rem;
}

.day-task-desc {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.day-task-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.priority-pill {
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  background: rgba(61, 92, 64, 0.12);
  color: var(--agro);
}

.priority-pill--high {
  background: rgba(220, 38, 38, 0.1);
  color: #b91c1c;
}

.priority-pill--low {
  background: rgba(59, 130, 246, 0.08);
  color: #1d4ed8;
}

.assignee-pill {
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  background: rgba(148, 163, 184, 0.16);
}

.modal-btn-danger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: auto;
  padding: 10px 20px;
  border-radius: 12px;
  border: none;
  background: transparent;
  color: #dc2626;
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
}

.modal-btn-danger:hover {
  background: rgba(220, 38, 38, 0.1);
}

/* Модальное окно: поверх страницы (по дизайну HTML) */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 18, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: var(--space-md);
}

.modal-backdrop .modal {
  width: 100%;
  max-width: 672px;
  max-height: 80vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  background: var(--bg-panel);
  border-radius: 24px;
  border: 1px solid var(--border-color);
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
}

.modal-calendar {
  max-width: 672px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  padding: 24px 32px;
  border-bottom: 1px solid var(--border-color);
}

.modal-header-main {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.modal-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(61, 92, 64, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--agro);
}

.modal-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
}

.modal-header-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.modal-task-id {
  margin: 0;
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.modal-subtitle {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.modal-close {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: transparent;
  font-size: 1.4rem;
  cursor: pointer;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-close:hover {
  background: var(--bg-base);
  color: var(--text-primary);
}

/* Макет: шапка */
.modal-header--design {
  padding: 24px 32px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.modal-icon--design {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(61, 92, 64, 0.08);
  color: var(--agro);
}

.modal-title--design {
  font-size: 1.25rem;
  font-weight: 700;
}

.modal-task-id--design {
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.modal-close--design {
  color: var(--text-secondary);
}

.modal-close--design:hover {
  color: var(--text-primary);
  background: rgba(0, 0, 0, 0.06);
}

/* Макет: поля */
.modal-field--design {
  gap: 8px;
}

.modal-label--design {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--text-primary);
}

.modal-input--title {
  font-weight: 600;
  font-size: 1.125rem;
}

.modal-input--design,
.modal-textarea--design {
  padding: 12px 16px;
  background: var(--bg-base);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  font-size: 0.875rem;
}

.modal-textarea--design {
  resize: vertical;
  min-height: 96px;
  line-height: 1.5;
}

.modal-grid-2 {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}

.modal-grid-2 .modal-field--design {
  min-width: 0;
}

/* Поле приоритета — такое же оформление, как у полей «Срок выполнения» */
.modal-grid-2 .modal-field--design .modal-select--design {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 16px;
  font-size: 0.875rem;
  font-weight: 500;
  min-height: 42px;
  background: var(--bg-base);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 40px;
}

@media (max-width: 560px) {
  .modal-grid-2 {
    grid-template-columns: 1fr;
  }
}

/* Срок выполнения — как в макете: flex gap-2, дата flex-1, время w-32, pl-10 py-2.5 rounded-xl */
.modal-deadline-row--design {
  display: flex;
  align-items: stretch;
  gap: 8px;
  flex-wrap: wrap;
}

.modal-deadline-date {
  position: relative;
  flex: 1 1 120px;
  min-width: 120px;
}

.modal-deadline-date .modal-input-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-secondary);
  pointer-events: none;
  z-index: 1;
}

.modal-deadline-date .modal-input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 16px 10px 40px;
  font-size: 0.875rem;
  font-weight: 500;
}

/* Блок времени: как в макете w-32 (8rem) на каждое поле, pl-10 pr-4 py-2.5 */
.modal-deadline-time-range {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 8px;
  flex-shrink: 0;
}

.modal-deadline-time-start {
  position: relative;
  width: 8rem;
  flex-shrink: 0;
}

.modal-deadline-time-start .modal-input-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-secondary);
  pointer-events: none;
  z-index: 1;
}

.modal-deadline-time-start .modal-input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 16px 10px 40px;
  font-size: 0.875rem;
  font-weight: 500;
}

.modal-deadline-time-range .time-separator {
  flex-shrink: 0;
  padding: 0 2px;
  color: var(--text-secondary);
  font-size: 0.875rem;
  font-weight: 500;
}

.modal-deadline-time-range .modal-input--time-end {
  width: 8rem;
  flex-shrink: 0;
  padding: 10px 16px;
  font-size: 0.875rem;
  font-weight: 500;
  box-sizing: border-box;
}

.modal-input-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
}

.modal-input-wrap--time {
  width: 8rem;
  min-width: 7rem;
  flex: 0 0 8rem;
}

.modal-input-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-secondary);
  pointer-events: none;
  z-index: 1;
}

.modal-input--with-icon {
  padding-left: 42px;
  min-width: 0;
}

.modal-deadline-row--design .time-separator {
  flex-shrink: 0;
  padding: 0 2px;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.modal-input--time-end {
  width: 6rem;
  min-width: 5rem;
  flex: 0 0 6rem;
}

.modal-label-row--design {
  margin-bottom: 0;
}

/* Подпись и кнопка «Добавить» не накладываются: подпись сжимается, кнопка не переносится под чипы */
.modal-field--design .modal-label-row--design {
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.modal-field--design .modal-label-row--design .modal-label {
  min-width: 0;
  flex: 1 1 auto;
}

.modal-field--design .modal-label-row--design .modal-assignee-picker {
  flex-shrink: 0;
}

.modal-chips--design {
  margin-top: 0;
}

.modal-add-assignee-btn--design {
  font-size: 0.75rem;
  font-weight: 700;
}

/* Чипы как в макете: rounded-full, тень, белый фон; отступ сверху чтобы не налезать на строку с «Добавить» */
.modal-chips.modal-chips--design {
  gap: 8px;
}

.modal-chip--design {
  padding: 6px 12px 6px 6px;
  border-radius: 9999px;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.modal-chip-avatar--design {
  width: 24px;
  height: 24px;
  font-size: 0.6rem;
}

/* Файлы: карточка с иконкой в квадрате */
.modal-files-grid--design {
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.modal-file-card--design {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-base);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  text-decoration: none;
  color: inherit;
}

.modal-file-card--design:hover {
  border-color: var(--agro);
}

.modal-file-icon-box {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.modal-file-icon-pdf {
  color: #dc2626;
}

.modal-file-icon-doc {
  color: var(--text-secondary);
}

.modal-file-card--design .modal-file-info {
  flex: 1;
  min-width: 0;
}

.modal-file-card--design .modal-file-name {
  font-size: 0.75rem;
  font-weight: 700;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.modal-file-card--design .modal-file-size {
  font-size: 0.65rem;
  color: var(--text-secondary);
}

.modal-file-card--design .modal-file-delete {
  color: var(--text-secondary);
  padding: 4px;
}

.modal-file-card--design .modal-file-delete:hover {
  color: #dc2626;
}

.modal-attach-placeholder--design {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  border: 2px dashed var(--border-color);
  border-radius: 12px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  min-height: 64px;
}

.modal-attach-placeholder--design:hover:not(:disabled) {
  background: rgba(61, 92, 64, 0.05);
  border-color: var(--agro);
  color: var(--agro);
}


/* Подвал по макету: серый фон */
.modal-actions--design {
  padding: 24px 32px;
  background: var(--bg-base);
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.modal-btn-danger--design {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: #dc2626;
  font-weight: 700;
  font-size: 0.875rem;
}

.modal-btn-danger--design:hover {
  color: #b91c1c;
}

.modal-actions-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.modal-btn-ghost--design {
  padding: 10px 24px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 0.875rem;
  color: var(--text-secondary);
  background: transparent;
  border: none;
}

.modal-btn-ghost--design:hover {
  background: rgba(0, 0, 0, 0.08);
  color: var(--text-primary);
}

.modal-btn--design {
  padding: 10px 32px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 0.875rem;
  box-shadow: 0 2px 8px rgba(61, 92, 64, 0.35);
}

.modal-btn--design:hover {
  box-shadow: 0 4px 12px rgba(61, 92, 64, 0.4);
}

.modal-form {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.modal-form--design {
  padding: 0;
  gap: 0;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.modal-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.modal-label {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--text-primary);
}

.modal-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.modal-assignee-picker {
  position: relative;
}

.modal-add-assignee-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--agro);
  background: transparent;
  border: none;
  cursor: pointer;
}

.modal-add-assignee-btn:hover {
  text-decoration: underline;
}

.modal-assignee-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  min-width: 180px;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: var(--shadow-card);
  z-index: 10;
  padding: 6px;
  max-height: 200px;
  overflow-y: auto;
}

.modal-assignee-search {
  position: relative;
  margin-bottom: 4px;
}

.modal-assignee-search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-secondary);
}

.modal-assignee-search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 10px 6px 30px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-base);
  font-size: 0.8rem;
}

.modal-assignee-search-input:focus {
  outline: none;
  border-color: var(--agro);
  box-shadow: 0 0 0 2px rgba(61, 92, 64, 0.12);
}

.modal-assignee-option {
  display: block;
  width: 100%;
  padding: 8px 10px;
  text-align: left;
  font-size: 0.85rem;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-primary);
}

.modal-assignee-option:hover {
  background: var(--bg-base);
}

.modal-assignee-empty {
  margin: 0;
  padding: 8px 10px;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.modal-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.modal-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 4px;
  background: var(--bg-base);
  border: 1px solid var(--border-color);
  border-radius: 999px;
  font-size: 0.85rem;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.modal-chip-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--agro);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.65rem;
  font-weight: 600;
}

.modal-chip-label {
  color: var(--text-primary);
}

.modal-chip-remove {
  padding: 0 2px;
  font-size: 1rem;
  line-height: 1;
  color: var(--text-secondary);
  background: none;
  border: none;
  cursor: pointer;
}

.modal-chip-remove:hover {
  color: #dc2626;
}

.modal-files-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

@media (max-width: 480px) {
  .modal-files-grid {
    grid-template-columns: 1fr;
  }
}

.modal-file-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: var(--bg-base);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  text-decoration: none;
  color: inherit;
}

.modal-file-card:hover {
  border-color: var(--agro);
}

.modal-file-icon {
  font-size: 1.25rem;
  flex-shrink: 0;
}

.modal-file-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.modal-file-name {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.modal-file-size {
  font-size: 0.7rem;
  color: var(--text-secondary);
}

.modal-file-delete {
  flex-shrink: 0;
  padding: 4px;
  color: var(--text-secondary);
  background: none;
  border: none;
  cursor: pointer;
}

.modal-file-delete:hover {
  color: #dc2626;
}

.modal-attach-placeholder--muted {
  cursor: default;
  opacity: 0.8;
}

.modal-attach-placeholder--muted:hover {
  border-color: var(--border-color);
  color: var(--text-secondary);
}

.modal-file-input-hidden {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

.modal-input,
.modal-textarea,
.modal-select {
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-base);
  color: var(--text-primary);
  font-size: 0.9rem;
  font-family: inherit;
}

.modal-input:focus,
.modal-textarea:focus,
.modal-select:focus {
  outline: none;
  border-color: var(--agro);
  box-shadow: 0 0 0 4px rgba(61, 92, 64, 0.1);
}

.modal-textarea {
  resize: vertical;
  min-height: 72px;
}

.modal-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: var(--space-md);
}

@media (max-width: 600px) {
  .modal-grid {
    grid-template-columns: 1fr;
  }
}

.modal-deadline-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.modal-input--date {
  min-width: 140px;
}

.modal-deadline-time {
  display: flex;
  align-items: center;
  gap: 6px;
}

.modal-time-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.modal-input--time {
  width: 100%;
  min-width: 80px;
}

.time-separator {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.modal-attach-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  border: 2px dashed var(--border-color);
  border-radius: 8px;
  background: var(--bg-base);
  color: var(--text-secondary);
  font-size: 0.9rem;
  cursor: pointer;
}

.modal-attach-placeholder:hover:not(:disabled) {
  border-color: var(--agro);
  color: var(--agro);
  background: rgba(61, 92, 64, 0.06);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  padding: 24px 32px;
  background: var(--bg-base);
  border-top: 1px solid var(--border-color);
}

.modal-actions--task {
  justify-content: space-between;
  flex-wrap: wrap;
}

.modal-btn,
.modal-btn-ghost {
  padding: 9px 18px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  font-size: 0.85rem;
  cursor: pointer;
}

.modal-btn {
  padding: 10px 24px;
  border-radius: 12px;
  border: none;
  background: var(--agro);
  color: #fff;
  font-weight: 700;
  font-size: 0.875rem;
  box-shadow: 0 2px 8px rgba(61, 92, 64, 0.3);
}

.modal-btn:hover {
  background: var(--agro-dark);
}

.modal-btn-ghost {
  padding: 10px 24px;
  border-radius: 12px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-weight: 700;
  font-size: 0.875rem;
}

.modal-btn-ghost:hover {
  background: var(--bg-panel);
  color: var(--text-primary);
}

.modal-form-fieldset {
  border: none;
  padding: 0;
  margin: 0;
  min-width: 0;
}

.modal-form-fieldset:disabled {
  opacity: 0.9;
}

.modal-btn-loading {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.modal-btn-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: modal-btn-spin 0.7s linear infinite;
}

@keyframes modal-btn-spin {
  to {
    transform: rotate(360deg);
  }
}

.modal-backdrop--confirm {
  z-index: 1001;
}

.modal-confirm {
  width: 100%;
  max-width: 360px;
  padding: 24px;
  background: var(--bg-panel);
  border-radius: 16px;
  border: 1px solid var(--border-color);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

.modal-confirm-title {
  margin: 0 0 8px;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-primary);
}

.modal-confirm-text {
  margin: 0 0 20px;
  font-size: 0.9rem;
  color: var(--text-secondary);
  line-height: 1.45;
}

.modal-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.modal-btn--danger {
  background: #dc2626;
  box-shadow: 0 2px 8px rgba(220, 38, 38, 0.35);
}

.modal-btn--danger:hover:not(:disabled) {
  background: #b91c1c;
}
</style>
