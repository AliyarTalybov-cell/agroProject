<script setup lang="ts">
import { computed, onMounted, onActivated, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useSupabaseCheck } from '@/composables/useSupabaseCheck'
import { useAuth } from '@/stores/auth'
import { isSupabaseConfigured } from '@/lib/supabase'
import {
  loadProfiles,
  loadTasksFromSupabase,
  taskDueDateToYmd,
  type ProfileRow,
  type TaskRow,
  type TaskStatus,
} from '@/lib/tasksSupabase'
import { loadDowntimesFromSupabase, loadOperationsFromSupabase } from '@/lib/analyticsSupabase'
import { loadOperatorStatusesFromSupabase, type OperatorStatusRow } from '@/lib/operatorStatusSupabase'
import { loadEquipment, type EquipmentRow } from '@/lib/equipmentSupabase'
import { loadFields, type FieldRow } from '@/lib/fieldsSupabase'
import { avatarColorByPosition } from '@/lib/avatarColors'
import UiLoadingBar from '@/components/UiLoadingBar.vue'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isLikelyUuid(s: string): boolean {
  return UUID_RE.test(s)
}

const { status: supabaseStatus, errorMessage: supabaseError, check: checkSupabase } = useSupabaseCheck()
const auth = useAuth()
const isManager = computed(() => auth.userRole.value === 'manager')

const loading = ref(true)
const profiles = ref<ProfileRow[]>([])
const tasks = ref<TaskRow[]>([])
const operatorStatuses = ref<OperatorStatusRow[]>([])
const equipmentList = ref<EquipmentRow[]>([])
const downtimes = ref<Awaited<ReturnType<typeof loadDowntimesFromSupabase>>>([])
const operations = ref<Awaited<ReturnType<typeof loadOperationsFromSupabase>>>([])
const fieldsCatalog = ref<FieldRow[]>([])

const periodPreset = ref<'today' | 'week' | 'month'>('today')
const dateFrom = ref('')
const dateTo = ref('')
const selectedEmployeeId = ref<string>('')

const liveTick = ref(0)
let liveTimer: ReturnType<typeof setInterval> | null = null

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function parseYmd(s: string): Date {
  const [y, m, day] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, day || 1, 12, 0, 0)
}

function applyPeriodPreset() {
  const now = new Date()
  if (periodPreset.value === 'today') {
    dateFrom.value = toYmd(now)
    dateTo.value = toYmd(now)
  } else if (periodPreset.value === 'week') {
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0)
    const start = new Date(end)
    start.setDate(start.getDate() - 6)
    dateFrom.value = toYmd(start)
    dateTo.value = toYmd(end)
  } else {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 12, 0, 0)
    dateFrom.value = toYmd(start)
    dateTo.value = toYmd(end)
  }
}


const rangeBounds = computed(() => {
  const start = parseYmd(dateFrom.value || toYmd(new Date()))
  start.setHours(0, 0, 0, 0)
  const end = parseYmd(dateTo.value || dateFrom.value || toYmd(new Date()))
  end.setHours(23, 59, 59, 999)
  return { start, end }
})

/** Предыдущий интервал той же длины (для сравнения простоев) */
const previousRangeBounds = computed(() => {
  const { start, end } = rangeBounds.value
  const ms = end.getTime() - start.getTime()
  const prevEnd = new Date(start.getTime() - 1)
  const prevStart = new Date(prevEnd.getTime() - ms)
  return { start: prevStart, end: prevEnd }
})

/** Для блока Live и KPI «из N работников» — без руководителей */
const workerProfiles = computed(() =>
  profiles.value.filter((p) => p.role !== 'manager'),
)

/** Карточки Live: работники + все, кто указан исполнителем в загруженных задачах (даже если роль «руководитель»). */
const profilesForLiveBoard = computed(() => {
  const byId = new Map<string, ProfileRow>()
  for (const p of workerProfiles.value) {
    byId.set(p.id, p)
  }
  for (const t of tasks.value) {
    const p = profileById.value.get(t.assignee_id)
    if (p) byId.set(p.id, p)
  }
  return Array.from(byId.values()).sort((a, b) => {
    const na = (a.display_name || a.email).toLowerCase()
    const nb = (b.display_name || b.email).toLowerCase()
    return na.localeCompare(nb, 'ru')
  })
})

function resolveFieldIdByTaskField(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  for (const f of fieldsCatalog.value) {
    if (f.name === t) return f.id
  }
  const norm = t.toLowerCase()
  for (const f of fieldsCatalog.value) {
    const longForm = `поле №${f.number} — ${f.name}`.toLowerCase()
    if (norm === longForm || norm.includes(f.name.toLowerCase())) return f.id
  }
  return null
}

/** Ссылка на карточку поля: uuid из оператора или сопоставление по названию из справочника полей. */
function resolveFieldRouteId(fieldIdText: string | null | undefined, fieldName: string | null | undefined): string | null {
  if (fieldIdText && isLikelyUuid(fieldIdText)) return fieldIdText
  const name = fieldName?.trim()
  if (name) {
    const byName = resolveFieldIdByTaskField(name)
    if (byName) return byName
  }
  if (fieldIdText?.trim()) {
    const byRaw = resolveFieldIdByTaskField(fieldIdText)
    if (byRaw) return byRaw
  }
  return null
}

function fieldDetailLinkForStatus(st: OperatorStatusRow | undefined): string | null {
  if (!st) return null
  return resolveFieldRouteId(st.field_id, st.field_name)
}

const profilesForEmployeeFilter = computed(() =>
  [...profiles.value].sort((a, b) => {
    const na = (a.display_name || a.email).toLowerCase()
    const nb = (b.display_name || b.email).toLowerCase()
    return na.localeCompare(nb, 'ru')
  }),
)

const profileById = computed(() => new Map(profiles.value.map((p) => [p.id, p])))

const equipmentById = computed(() => new Map(equipmentList.value.map((e) => [e.id, e])))

function equipmentTitle(id: string | null | undefined): string {
  if (!id) return 'Техника не назначена'
  const e = equipmentById.value.get(id)
  if (!e) return 'Техника'
  const m = e.model?.trim()
  return m ? `${e.brand} ${m}` : `${e.brand} ${e.license_plate}`
}

function initials(p: ProfileRow): string {
  const name = (p.display_name || '').trim()
  const email = p.email || ''
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    if (parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase()
    return parts[0][0].toUpperCase()
  }
  const local = email.split('@')[0]
  return local.length >= 2 ? local.slice(0, 2).toUpperCase() : local[0]?.toUpperCase() || '?'
}

function shortName(p: ProfileRow): string {
  const name = (p.display_name || '').trim()
  if (!name) return p.email.split('@')[0] || '—'
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0]} ${parts[1][0]}.`
  return name
}

function avatarBg(p: ProfileRow): string {
  if (p.position?.trim()) return avatarColorByPosition(p.position)
  return avatarColorByPosition(p.email || p.id)
}

const statusByUserId = computed(() => {
  const m = new Map<string, OperatorStatusRow>()
  for (const s of operatorStatuses.value) {
    m.set(s.user_id, s)
  }
  return m
})

const filteredWorkersForLive = computed(() => {
  if (selectedEmployeeId.value) {
    const one = profiles.value.find((p) => p.id === selectedEmployeeId.value)
    return one ? [one] : []
  }
  return profilesForLiveBoard.value
})

const kpiInOperationCount = computed(() => {
  let rows = operatorStatuses.value.filter((s) => s.kind === 'operation')
  if (selectedEmployeeId.value) {
    rows = rows.filter((s) => s.user_id === selectedEmployeeId.value)
  }
  return rows.length
})

const kpiTotalWorkers = computed(() => {
  if (selectedEmployeeId.value) return 1
  return Math.max(profilesForLiveBoard.value.length, 1)
})

const kpiEquipmentInUse = computed(() => {
  const set = new Set<string>()
  for (const s of operatorStatuses.value) {
    if (s.kind === 'operation' && s.equipment_id) {
      if (selectedEmployeeId.value && s.user_id !== selectedEmployeeId.value) continue
      set.add(s.equipment_id)
    }
  }
  return set.size
})

const kpiTotalEquipment = computed(() => equipmentList.value.length)

function downtimeMinutesInRange(
  start: Date,
  end: Date,
  list: typeof downtimes.value,
): number {
  let sum = 0
  for (const e of list) {
    const t = new Date(e.startISO).getTime()
    if (t >= start.getTime() && t <= end.getTime()) {
      sum += e.durationMinutes
    }
  }
  return sum
}

const kpiDowntimeHours = computed(() => {
  const { start, end } = rangeBounds.value
  let list = downtimes.value
  if (selectedEmployeeId.value) {
    const p = profileById.value.get(selectedEmployeeId.value)
    const label = p ? (p.display_name || p.email).trim() : ''
    if (label) {
      list = list.filter((d) => d.employee === label || d.employee.includes(label))
    }
  }
  return downtimeMinutesInRange(start, end, list) / 60
})

const kpiDowntimeTrend = computed(() => {
  const cur = kpiDowntimeHours.value
  const { start, end } = previousRangeBounds.value
  let list = downtimes.value
  if (selectedEmployeeId.value) {
    const p = profileById.value.get(selectedEmployeeId.value)
    const label = p ? (p.display_name || p.email).trim() : ''
    if (label) list = list.filter((d) => d.employee === label || d.employee.includes(label))
  }
  const prevH = downtimeMinutesInRange(start, end, list) / 60
  if (prevH <= 0 && cur <= 0) return null
  if (prevH <= 0) return { pct: 100, up: true }
  const pct = Math.round(((cur - prevH) / prevH) * 100)
  return { pct: Math.abs(pct), up: pct >= 0 }
})

/**
 * Выполненные задачи по сроку (due_date):
 * — если в фильтре один день (С = По): все со сроком **не позже** этой даты (накопительно «до даты»);
 * — если интервал: срок строго внутри «С»–«По» включительно.
 */
const tasksCompletedDueInFilter = computed(() => {
  const from = dateFrom.value
  const to = dateTo.value
  if (!to) return 0
  const singleDay = Boolean(from && from === to)
  return tasks.value.filter((t) => {
    const dueYmd = taskDueDateToYmd(t.due_date)
    if (!dueYmd) return false
    if (t.status !== 'done') return false
    if (singleDay) {
      if (dueYmd > to) return false
    } else {
      if (!from || dueYmd < from || dueYmd > to) return false
    }
    if (selectedEmployeeId.value && t.assignee_id !== selectedEmployeeId.value) return false
    return true
  }).length
})

const tasksKpiTitle = computed(() => 'Задачи по сроку (выполненные)')

const tasksKpiRangeHint = computed(() => {
  if (!dateTo.value) return ''
  if (dateFrom.value && dateFrom.value === dateTo.value) {
    const d = parseYmd(dateTo.value)
    return `срок не позже ${d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
  }
  if (dateFrom.value) {
    return `срок: ${dateFrom.value} — ${dateTo.value}`
  }
  return `срок до ${dateTo.value}`
})

/** Для одного дня — на странице задач открываем фильтр «до даты» без нижней границы по сроку. */
const tasksKpiLinkQuery = computed(() => {
  const from = dateFrom.value
  const to = dateTo.value
  if (from && to && from === to) {
    return { due_to: to, due_upto: '1', kpi_completed_due: '1' }
  }
  return { due_from: from, due_to: to, kpi_completed_due: '1' }
})

const tasksInRange = computed(() => {
  const { start, end } = rangeBounds.value
  return tasks.value.filter((t) => {
    if (selectedEmployeeId.value && t.assignee_id !== selectedEmployeeId.value) return false
    const u = new Date(t.updated_at).getTime()
    return u >= start.getTime() && u <= end.getTime()
  })
})

const taskStatusLabels: Record<TaskStatus, string> = {
  done: 'Выполнено',
  in_progress: 'В процессе',
  review: 'На проверке',
  todo: 'К выполнению',
}

const taskDonut = computed(() => {
  const list = tasksInRange.value
  const done = list.filter((t) => t.status === 'done').length
  const prog = list.filter((t) => t.status === 'in_progress').length
  const review = list.filter((t) => t.status === 'review').length
  const todo = list.filter((t) => t.status === 'todo').length
  const total = list.length
  if (!total) {
    return { total: 0, slices: [] as { key: string; label: string; count: number; pct: number; color: string }[] }
  }
  const slices = [
    { key: 'done', label: taskStatusLabels.done, count: done, pct: (done / total) * 100, color: '#22c55e' },
    { key: 'in_progress', label: taskStatusLabels.in_progress, count: prog, pct: (prog / total) * 100, color: '#3b82f6' },
    { key: 'review', label: taskStatusLabels.review, count: review, pct: (review / total) * 100, color: '#f59e0b' },
    { key: 'todo', label: taskStatusLabels.todo, count: todo, pct: (todo / total) * 100, color: '#94a3b8' },
  ].filter((s) => s.count > 0)
  return { total, slices }
})

const taskDonutGradient = computed(() => {
  const { slices } = taskDonut.value
  if (!slices.length) return { background: 'var(--donut-inner-bg)' }
  let acc = 0
  const parts = slices.map((s) => {
    const start = acc
    acc += s.pct
    return `${s.color} ${start}% ${acc}%`
  })
  return { background: `conic-gradient(${parts.join(', ')})` }
})

/** Вертикальные столбцы: высота = только «Выполнено»; шкала Y — по максимуму активных задач в периоде (не done), чтобы видеть объём активной работы. */
const taskEmployeeBarChart = computed(() => {
  const { start, end } = rangeBounds.value
  const t0 = start.getTime()
  const t1 = end.getTime()

  const activeByAssignee = new Map<string, number>()
  for (const t of tasks.value) {
    if (selectedEmployeeId.value && t.assignee_id !== selectedEmployeeId.value) continue
    if (t.status === 'done') continue
    const u = new Date(t.updated_at).getTime()
    if (u < t0 || u > t1) continue
    activeByAssignee.set(t.assignee_id, (activeByAssignee.get(t.assignee_id) ?? 0) + 1)
  }
  const maxActive = activeByAssignee.size ? Math.max(...activeByAssignee.values()) : 0

  const doneMap = new Map<string, { id: string; label: string; count: number }>()
  for (const t of tasks.value) {
    if (t.status !== 'done') continue
    if (selectedEmployeeId.value && t.assignee_id !== selectedEmployeeId.value) continue
    const u = new Date(t.updated_at).getTime()
    if (u < t0 || u > t1) continue
    const existing = doneMap.get(t.assignee_id)
    const p = profileById.value.get(t.assignee_id)
    doneMap.set(t.assignee_id, {
      id: t.assignee_id,
      label: p ? shortName(p) : '—',
      count: (existing?.count ?? 0) + 1,
    })
  }
  const rows = Array.from(doneMap.values())
    .filter((r) => r.count > 0)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.label.localeCompare(b.label, 'ru')
    })
    .slice(0, 8)

  const maxDone = rows.length ? Math.max(...rows.map((r) => r.count)) : 0
  const scaleRaw = Math.max(1, maxActive, maxDone)
  const roughStep = Math.max(1, Math.ceil(scaleRaw / 4))
  const niceSteps = [1, 2, 5, 10, 15, 20, 25, 50, 100]
  const niceStep = niceSteps.find((n) => n >= roughStep) ?? Math.ceil(roughStep / 10) * 10
  const yTop = Math.max(niceStep, Math.ceil(scaleRaw / niceStep) * niceStep)
  const yTicks: number[] = []
  for (let v = yTop; v >= 0; v -= niceStep) yTicks.push(v)
  return { rows, yTop, yTicks }
})

function taskProgressPercent(status: TaskStatus): number {
  if (status === 'done') return 100
  if (status === 'review') return 82
  if (status === 'in_progress') return 52
  return 8
}

const activeFieldsRows = computed(() => {
  return tasks.value
    .filter((t) => {
      if (selectedEmployeeId.value && t.assignee_id !== selectedEmployeeId.value) return false
      return t.status === 'in_progress' || t.status === 'review' || t.status === 'todo'
    })
    .slice(0, 12)
    .map((t) => {
      const assignee = profileById.value.get(t.assignee_id)
      return {
        task: t,
        assigneeName: assignee ? assignee.display_name || assignee.email : '—',
        progress: taskProgressPercent(t.status),
        fieldDetailId: resolveFieldIdByTaskField(t.field),
      }
    })
})

function categoryLabelRu(cat: string | null | undefined): string {
  const c = (cat || '').toLowerCase()
  if (c === 'breakdown') return 'Поломка техники'
  if (c === 'rain') return 'Погода'
  if (c === 'fuel') return 'Нет топлива'
  if (c === 'waiting') return 'Ожидание'
  return cat || 'Простой'
}

function elapsedLabel(startedAt: string): string {
  void liveTick.value
  const start = new Date(startedAt).getTime()
  const sec = Math.max(0, Math.floor((Date.now() - start) / 1000))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}ч ${m}м`
  return `${m} мин`
}

function shiftProgressForUser(userId: string): number {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  let minutes = 0
  for (const o of operations.value) {
    if (new Date(o.startISO) < startOfDay) continue
    const p = profileById.value.get(userId)
    const name = p ? (p.display_name || p.email).trim() : ''
    if (name && o.employee === name) minutes += o.durationMinutes
  }
  const st = statusByUserId.value.get(userId)
  void liveTick.value
  if (st?.kind === 'operation') {
    const extra = Math.max(0, (Date.now() - new Date(st.started_at).getTime()) / 60000)
    minutes += extra
  }
  const target = 8 * 60
  return Math.min(100, Math.round((minutes / target) * 100))
}

function equipmentUsageLabel(eqId: string): 'work' | 'idle' {
  for (const s of operatorStatuses.value) {
    if (s.kind === 'operation' && s.equipment_id === eqId) return 'work'
  }
  return 'idle'
}

function equipmentConditionBadge(eq: EquipmentRow): { text: string; tone: 'ok' | 'warn' | 'muted' } {
  if (eq.condition === 'repair') {
    return { text: 'В ремонте', tone: 'warn' }
  }
  if (eq.condition === 'decommissioned') {
    return { text: 'Выведена', tone: 'muted' }
  }
  if (equipmentUsageLabel(eq.id) === 'work') {
    return { text: 'В работе', tone: 'ok' }
  }
  return { text: 'Исправна', tone: 'ok' }
}

const equipmentRows = computed(() => {
  return equipmentList.value.slice(0, 20).map((eq) => {
    let operatorName = '—'
    for (const s of operatorStatuses.value) {
      if (s.equipment_id === eq.id && s.kind === 'operation') {
        operatorName = s.employee
        break
      }
    }
    const badge = equipmentConditionBadge(eq)
    return { eq, operatorName, badge }
  })
})

async function loadDashboard() {
  loading.value = true
  try {
    if (!isSupabaseConfigured() || !auth.user.value) {
      profiles.value = []
      tasks.value = []
      operatorStatuses.value = []
      equipmentList.value = []
      downtimes.value = []
      operations.value = []
      fieldsCatalog.value = []
      return
    }
    const uid = auth.user.value.id
    const onlyMine = !isManager.value
    const [prof, tsk, st, eq, down, ops, flds] = await Promise.all([
      loadProfiles(),
      loadTasksFromSupabase(onlyMine, uid),
      loadOperatorStatusesFromSupabase(onlyMine, uid),
      loadEquipment(),
      loadDowntimesFromSupabase(onlyMine, uid),
      loadOperationsFromSupabase(onlyMine, uid),
      loadFields(),
    ])
    profiles.value = prof
    tasks.value = tsk
    operatorStatuses.value = st
    equipmentList.value = eq
    downtimes.value = down
    operations.value = ops
    fieldsCatalog.value = flds
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  applyPeriodPreset()
  loadDashboard()
  liveTimer = setInterval(() => {
    liveTick.value += 1
  }, 30000)
})
onActivated(() => loadDashboard())
onUnmounted(() => {
  if (liveTimer) clearInterval(liveTimer)
})

</script>

<template>
  <section class="dash-page">
    <header class="dash-header page-enter-item">
      <div>
        <h1 class="dash-title">Аналитика: Дашборд руководителя</h1>
        <p v-if="auth.user && isManager" class="dash-sub">Данные из задач, операций и техники (Supabase)</p>
        <p v-else-if="auth.user" class="dash-sub">Ваши задачи и статус (ограниченный вид)</p>
      </div>
    </header>

    <div v-if="supabaseStatus !== 'idle'" class="supabase-strip page-enter-item">
      <template v-if="supabaseStatus === 'checking'">Проверка базы…</template>
      <template v-else-if="supabaseStatus === 'ok'">База данных подключена</template>
      <template v-else-if="supabaseStatus === 'error'">
        Ошибка: {{ supabaseError }}
        <button type="button" class="dash-link-btn" @click="checkSupabase">Повторить</button>
      </template>
    </div>

    <div class="dash-toolbar page-enter-item" style="--enter-delay: 40ms">
      <div class="dash-toolbar-left">
        <div v-if="isManager" class="dash-select-wrap">
          <select v-model="selectedEmployeeId" class="dash-select" aria-label="Сотрудник">
            <option value="">Все сотрудники</option>
            <option v-for="p in profilesForEmployeeFilter" :key="p.id" :value="p.id">
              {{ p.display_name || p.email }}{{ p.role === 'manager' ? ' (руководитель)' : '' }}
            </option>
          </select>
        </div>
        <div class="dash-segment" role="group" aria-label="Период">
          <button
            type="button"
            :class="['dash-seg-btn', { 'dash-seg-btn--active': periodPreset === 'today' }]"
            @click=";(periodPreset = 'today'), applyPeriodPreset()"
          >
            Сегодня
          </button>
          <button
            type="button"
            :class="['dash-seg-btn', { 'dash-seg-btn--active': periodPreset === 'week' }]"
            @click=";(periodPreset = 'week'), applyPeriodPreset()"
          >
            Неделя
          </button>
          <button
            type="button"
            :class="['dash-seg-btn', { 'dash-seg-btn--active': periodPreset === 'month' }]"
            @click=";(periodPreset = 'month'), applyPeriodPreset()"
          >
            Месяц
          </button>
        </div>
        <div class="dash-dates">
          <label class="dash-date-label"
            >С:
            <input v-model="dateFrom" type="date" class="dash-date-input"
          /></label>
          <label class="dash-date-label"
            >По:
            <input v-model="dateTo" type="date" class="dash-date-input"
          /></label>
        </div>
      </div>
      <button type="button" class="dash-refresh" :disabled="loading" @click="loadDashboard">
        <span class="dash-refresh-icon" aria-hidden="true">↻</span>
        {{ loading ? 'Загрузка…' : 'Обновить данные' }}
      </button>
    </div>

    <div class="dash-kpis page-enter-item" style="--enter-delay: 80ms">
      <div class="dash-kpi">
        <div class="dash-kpi-icon dash-kpi-icon--people">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>
        <div>
          <p class="dash-kpi-label">Люди в полях</p>
          <div class="dash-kpi-value-row">
            <span class="dash-kpi-num">{{ kpiInOperationCount }}</span>
            <span class="dash-kpi-of">из {{ kpiTotalWorkers }}</span>
          </div>
        </div>
      </div>
      <div class="dash-kpi">
        <div class="dash-kpi-icon dash-kpi-icon--tractor">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 7h13l5 5v5a2 2 0 0 1-2 2H7a4 4 0 0 1-4-4V7z" />
            <path d="M16 7v5h5" />
            <circle cx="7" cy="18" r="2" />
          </svg>
        </div>
        <div>
          <p class="dash-kpi-label">Техника в работе</p>
          <div class="dash-kpi-value-row">
            <span class="dash-kpi-num">{{ kpiEquipmentInUse }}</span>
            <span class="dash-kpi-of">из {{ kpiTotalEquipment }} ед.</span>
          </div>
        </div>
      </div>
      <div class="dash-kpi">
        <div class="dash-kpi-icon dash-kpi-icon--alert">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
        </div>
        <div>
          <p class="dash-kpi-label">Простои (период)</p>
          <div class="dash-kpi-value-row">
            <span class="dash-kpi-num">{{ kpiDowntimeHours.toFixed(1) }}</span>
            <span class="dash-kpi-of">ч</span>
            <span v-if="kpiDowntimeTrend" class="dash-kpi-trend" :class="{ 'dash-kpi-trend--down': !kpiDowntimeTrend.up }">
              {{ kpiDowntimeTrend.up ? '↑' : '↓' }} {{ kpiDowntimeTrend.pct }}%
            </span>
          </div>
        </div>
      </div>
      <RouterLink
        class="dash-kpi dash-kpi--click"
        :to="{ name: 'task-management', query: tasksKpiLinkQuery }"
      >
        <div class="dash-kpi-icon dash-kpi-icon--tasks">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        </div>
        <div>
          <p class="dash-kpi-label">{{ tasksKpiTitle }}</p>
          <p class="dash-kpi-sublabel">{{ tasksKpiRangeHint }}</p>
          <div class="dash-kpi-value-row">
            <span class="dash-kpi-num">{{ tasksCompletedDueInFilter }}</span>
            <span class="dash-kpi-of">выполнено</span>
          </div>
        </div>
      </RouterLink>
    </div>

    <section class="dash-live page-enter-item" style="--enter-delay: 120ms">
      <h2 class="dash-section-title">
        <span class="dash-section-icon" aria-hidden="true">👥</span>
        Статус работы сотрудников (Live)
      </h2>
      <p v-if="!isSupabaseConfigured()" class="dash-muted">Подключите Supabase, чтобы видеть статусы с экрана оператора.</p>
      <div v-else-if="loading" class="dash-live-loading">
        <UiLoadingBar size="md" />
      </div>
      <div v-else class="dash-live-grid">
        <div
          v-for="p in filteredWorkersForLive"
          :key="p.id"
          class="dash-live-card"
          :class="{
            'dash-live-card--work': statusByUserId.get(p.id)?.kind === 'operation',
            'dash-live-card--down': statusByUserId.get(p.id)?.kind === 'downtime',
            'dash-live-card--idle': !statusByUserId.get(p.id),
          }"
        >
          <div class="dash-live-topbar" />
          <div class="dash-live-head">
            <div class="dash-live-avatar" :style="{ background: avatarBg(p) }">{{ initials(p) }}</div>
            <div>
              <h3 class="dash-live-name">{{ p.display_name || p.email }}</h3>
              <span
                v-if="statusByUserId.get(p.id)?.kind === 'operation'"
                class="dash-live-badge dash-live-badge--ok"
              >
                В работе
              </span>
              <span
                v-else-if="statusByUserId.get(p.id)?.kind === 'downtime'"
                class="dash-live-badge dash-live-badge--bad"
              >
                Простой
              </span>
              <span v-else class="dash-live-badge dash-live-badge--muted">Ожидание задачи</span>
            </div>
          </div>

          <template v-if="statusByUserId.get(p.id)?.kind === 'operation'">
            <RouterLink
              v-if="fieldDetailLinkForStatus(statusByUserId.get(p.id))"
              :to="{ name: 'field-details', params: { id: fieldDetailLinkForStatus(statusByUserId.get(p.id))! } }"
              class="dash-live-box dash-live-box--link"
            >
              <div class="dash-live-box-meta">📍 {{ statusByUserId.get(p.id)?.field_name || 'Поле' }}</div>
              <div class="dash-live-box-title">{{ statusByUserId.get(p.id)?.operation || 'Операция' }}</div>
            </RouterLink>
            <div v-else class="dash-live-box">
              <div class="dash-live-box-meta">📍 {{ statusByUserId.get(p.id)?.field_name || 'Поле' }}</div>
              <div class="dash-live-box-title">{{ statusByUserId.get(p.id)?.operation || 'Операция' }}</div>
            </div>
            <div class="dash-live-progress">
              <div class="dash-live-progress-label">
                <span>Прогресс смены (оценка)</span>
                <span>{{ shiftProgressForUser(p.id) }}%</span>
              </div>
              <div class="dash-live-track">
                <div
                  class="dash-live-fill dash-live-fill--green"
                  :style="{ width: `${shiftProgressForUser(p.id)}%` }"
                />
              </div>
            </div>
            <div class="dash-live-foot">
              <RouterLink
                v-if="statusByUserId.get(p.id)?.equipment_id"
                :to="{ name: 'equipment-details', params: { id: statusByUserId.get(p.id)!.equipment_id! } }"
                class="dash-inline-link"
              >
                🚜 {{ equipmentTitle(statusByUserId.get(p.id)?.equipment_id) }}
              </RouterLink>
              <span v-else>🚜 {{ equipmentTitle(statusByUserId.get(p.id)?.equipment_id) }}</span>
              <span>🕐 {{ elapsedLabel(statusByUserId.get(p.id)!.started_at) }}</span>
            </div>
          </template>

          <template v-else-if="statusByUserId.get(p.id)?.kind === 'downtime'">
            <RouterLink
              v-if="fieldDetailLinkForStatus(statusByUserId.get(p.id))"
              :to="{ name: 'field-details', params: { id: fieldDetailLinkForStatus(statusByUserId.get(p.id))! } }"
              class="dash-live-box dash-live-box--alert dash-live-box--link"
            >
              <div class="dash-live-box-meta">{{ categoryLabelRu(statusByUserId.get(p.id)?.downtime_category) }}</div>
              <div class="dash-live-box-title">{{ statusByUserId.get(p.id)?.downtime_reason || '—' }}</div>
            </RouterLink>
            <div v-else class="dash-live-box dash-live-box--alert">
              <div class="dash-live-box-meta">{{ categoryLabelRu(statusByUserId.get(p.id)?.downtime_category) }}</div>
              <div class="dash-live-box-title">{{ statusByUserId.get(p.id)?.downtime_reason || '—' }}</div>
            </div>
            <div class="dash-live-progress">
              <div class="dash-live-progress-label">
                <span>Длительность простоя</span>
                <span class="dash-live-bad">{{ elapsedLabel(statusByUserId.get(p.id)!.started_at) }}</span>
              </div>
              <div class="dash-live-track">
                <div class="dash-live-fill dash-live-fill--red" style="width: 100%" />
              </div>
            </div>
            <div class="dash-live-foot">
              <RouterLink
                v-if="fieldDetailLinkForStatus(statusByUserId.get(p.id))"
                :to="{ name: 'field-details', params: { id: fieldDetailLinkForStatus(statusByUserId.get(p.id))! } }"
                class="dash-inline-link"
              >
                📍 {{ statusByUserId.get(p.id)?.field_name || 'База' }}
              </RouterLink>
              <span v-else>📍 {{ statusByUserId.get(p.id)?.field_name || 'База' }}</span>
            </div>
          </template>

          <template v-else>
            <div class="dash-live-box dash-live-box--empty">
              <span>Нет активной операции</span>
            </div>
            <div class="dash-live-progress">
              <div class="dash-live-progress-label">
                <span>Прогресс смены</span>
                <span>{{ shiftProgressForUser(p.id) }}%</span>
              </div>
              <div class="dash-live-track">
                <div
                  class="dash-live-fill dash-live-fill--muted"
                  :style="{ width: `${shiftProgressForUser(p.id)}%` }"
                />
              </div>
            </div>
            <div class="dash-live-foot muted">Техника не назначена</div>
          </template>
        </div>
      </div>
      <p v-if="isManager && !loading && isSupabaseConfigured() && !filteredWorkersForLive.length" class="dash-muted">
        Нет работников в справочнике и нет исполнителей в задачах — добавьте профили или назначьте задачи.
      </p>
    </section>

    <div class="dash-split page-enter-item" style="--enter-delay: 160ms">
      <div class="dash-panel">
        <div class="dash-panel-head">
          <h2 class="dash-panel-title">🌾 Активные поля (по задачам)</h2>
          <RouterLink to="/fields" class="dash-panel-link">Все поля</RouterLink>
        </div>
        <div class="dash-table-wrap">
          <table class="dash-table">
            <thead>
              <tr>
                <th>Поле / объект</th>
                <th>Операция</th>
                <th>Выполнение</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in activeFieldsRows" :key="row.task.id">
                <td>
                  <RouterLink
                    v-if="row.fieldDetailId"
                    :to="{ name: 'field-details', params: { id: row.fieldDetailId } }"
                    class="dash-field-link"
                  >
                    <div class="dash-td-main">{{ row.task.field }}</div>
                  </RouterLink>
                  <template v-else>
                    <div class="dash-td-main">{{ row.task.field }}</div>
                  </template>
                  <span class="dash-chip dash-chip--amber">{{ taskStatusLabels[row.task.status] }}</span>
                </td>
                <td>
                  <div>{{ row.task.title }}</div>
                  <div class="dash-td-sub">{{ row.assigneeName }}</div>
                </td>
                <td>
                  <div class="dash-pbar-wrap">
                    <div class="dash-pbar">
                      <div
                        class="dash-pbar-fill"
                        :class="{ 'dash-pbar-fill--warn': row.task.status === 'todo' }"
                        :style="{ width: `${row.progress}%` }"
                      />
                    </div>
                    <span>{{ row.progress }}%</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="!activeFieldsRows.length" class="dash-empty">Нет активных задач в работе.</p>
        </div>
      </div>

      <div class="dash-panel">
        <div class="dash-panel-head">
          <h2 class="dash-panel-title">🚜 Статус техники</h2>
          <div class="dash-legend-inline">
            <span><i class="dot dot--g" /> В работе</span>
            <span><i class="dot dot--n" /> Свободна</span>
          </div>
        </div>
        <ul class="dash-eq-list">
          <li v-for="{ eq, operatorName, badge } in equipmentRows" :key="eq.id" class="dash-eq-item">
            <RouterLink :to="{ name: 'equipment-details', params: { id: eq.id } }" class="dash-eq-link">
              <div class="dash-eq-icon" :class="{ 'dash-eq-icon--bad': eq.condition === 'repair' }">
                <span>🚜</span>
              </div>
              <div class="dash-eq-body">
                <div class="dash-eq-title">{{ eq.brand }} {{ eq.model || eq.license_plate }}</div>
                <div class="dash-eq-meta">
                  <code class="dash-mono">{{ eq.license_plate }}</code>
                  <span>{{ operatorName }}</span>
                </div>
                <p v-if="eq.condition === 'repair' && eq.notes" class="dash-eq-note">{{ eq.notes }}</p>
              </div>
            </RouterLink>
            <span class="dash-eq-badge" :class="`dash-eq-badge--${badge.tone}`">{{ badge.text }}</span>
          </li>
        </ul>
        <p v-if="!equipmentRows.length" class="dash-empty">Техника не заведена в справочнике.</p>
      </div>
    </div>

    <section class="dash-task-stats page-enter-item" style="--enter-delay: 200ms">
      <h2 class="dash-section-title">📊 Статистика задач</h2>
      <div class="dash-charts">
        <div class="dash-chart-card">
          <h3 class="dash-chart-title">Распределение по статусам</h3>
          <div class="dash-donut-row">
            <div class="dash-donut" :style="taskDonutGradient">
              <div class="dash-donut-inner">
                <div class="dash-donut-num">{{ taskDonut.total }}</div>
                <div class="dash-donut-label">Всего задач</div>
              </div>
            </div>
            <ul class="dash-donut-legend">
              <li v-for="s in taskDonut.slices" :key="s.key">
                <i class="dash-leg-dot" :style="{ background: s.color }" />
                <span>{{ s.label }}</span>
                <strong>{{ s.count }}</strong>
              </li>
            </ul>
          </div>
          <p v-if="!taskDonut.total" class="dash-empty">Нет задач в выбранном периоде.</p>
        </div>
        <div class="dash-chart-card">
          <h3 class="dash-chart-title">Выполнение задач по сотрудникам (за период)</h3>
          <p class="dash-chart-sub muted">
            Столбцы — число выполненных за период (по дате обновления); сотрудники отсортированы по убыванию этого числа. Верх шкалы Y — по максимуму <strong>активных</strong> задач в периоде (к выполнению / в процессе / на проверке) среди исполнителей, чтобы масштаб отражал объём текущей работы. Разбивка статусов — слева.
          </p>
          <div v-if="taskEmployeeBarChart.rows.length" class="dash-vchart">
            <div class="dash-vchart-inner">
              <div class="dash-vchart-y" aria-hidden="true">
                <span v-for="tick in taskEmployeeBarChart.yTicks" :key="tick">{{ tick }}</span>
              </div>
              <div class="dash-vchart-plot">
                <div
                  v-for="tick in taskEmployeeBarChart.yTicks"
                  :key="'grid-' + tick"
                  class="dash-vchart-hline"
                  :style="{ bottom: `${(tick / taskEmployeeBarChart.yTop) * 100}%` }"
                />
                <div class="dash-vchart-cols">
                  <div v-for="r in taskEmployeeBarChart.rows" :key="r.id" class="dash-vchart-col">
                    <div class="dash-vchart-col-body">
                      <span class="dash-vchart-total">{{ r.count }}</span>
                      <div
                        class="dash-vchart-stack dash-vchart-stack--done-only"
                        :style="{ height: `${(r.count / taskEmployeeBarChart.yTop) * 100}%` }"
                        :title="`Выполнено: ${r.count}`"
                      >
                        <div class="dash-vchart-seg dash-vchart-seg--done" />
                      </div>
                    </div>
                    <span class="dash-vchart-xlabel">{{ r.label }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="dash-vchart-legend">
              <span><i class="dash-leg-dot" style="background: #22c55e" /> Выполнено</span>
            </div>
          </div>
          <p v-else class="dash-empty">Нет завершённых задач в периоде.</p>
        </div>
      </div>
    </section>
  </section>
</template>

<style scoped>
.dash-page {
  max-width: 1400px;
  margin: 0 auto;
  padding-bottom: var(--space-xl);
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.dash-header {
  padding-bottom: var(--space-sm);
}

.dash-title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.dash-sub {
  margin: 6px 0 0;
  font-size: 0.88rem;
  color: var(--text-secondary);
}

.supabase-strip {
  font-size: 0.85rem;
  color: var(--text-secondary);
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--chip-bg);
  border: 1px solid var(--border-color);
}

.dash-link-btn {
  margin-left: 10px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  cursor: pointer;
  font-size: 0.8rem;
}

.dash-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--shadow-card);
}

.dash-toolbar-left {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
}

.dash-select {
  min-width: 200px;
  padding: 8px 32px 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-base);
  color: var(--text-primary);
  font-size: 0.875rem;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
}

.dash-segment {
  display: flex;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-base);
}

.dash-seg-btn {
  padding: 8px 14px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  border-right: 1px solid var(--border-color);
}
.dash-seg-btn:last-child {
  border-right: none;
}
.dash-seg-btn--active {
  background: var(--bg-panel);
  color: var(--text-primary);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.dash-dates {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.dash-date-input {
  margin-left: 6px;
  border: none;
  border-bottom: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-primary);
  font-size: 0.85rem;
}

.dash-refresh {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: 8px;
  border: none;
  background: var(--accent-green, #2d5a3d);
  color: #fff;
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
}
.dash-refresh:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.dash-refresh-icon {
  font-size: 1.1rem;
  line-height: 1;
}

.dash-kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}

@media (max-width: 1024px) {
  .dash-kpis {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 520px) {
  .dash-kpis {
    grid-template-columns: 1fr;
  }
}

.dash-kpi {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--shadow-card);
}

.dash-kpi--click {
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}
.dash-kpi--click:hover {
  border-color: var(--accent-green, #2d5a3d);
  box-shadow: 0 4px 14px rgba(45, 90, 61, 0.12);
}

.dash-kpi-sublabel {
  margin: 0 0 4px;
  font-size: 0.72rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.dash-kpi-icon {
  width: 48px;
  height: 48px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.dash-kpi-icon--people {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
}
.dash-kpi-icon--tractor {
  background: rgba(59, 130, 246, 0.15);
  color: #2563eb;
}
.dash-kpi-icon--alert {
  background: rgba(239, 68, 68, 0.15);
  color: #dc2626;
}
.dash-kpi-icon--tasks {
  background: rgba(245, 158, 11, 0.18);
  color: #d97706;
}

.dash-kpi-label {
  margin: 0 0 4px;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.dash-kpi-value-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.dash-kpi-num {
  font-size: 1.65rem;
  font-weight: 800;
  color: var(--text-primary);
}

.dash-kpi-of {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.dash-kpi-trend {
  font-size: 0.75rem;
  font-weight: 700;
  color: #dc2626;
}
.dash-kpi-trend--down {
  color: #16a34a;
}

.dash-section-title {
  margin: 0 0 16px;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.dash-muted {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.dash-live-loading {
  display: flex;
  justify-content: center;
  padding: 24px 0 8px;
}

.dash-live-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}

@media (max-width: 1200px) {
  .dash-live-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 600px) {
  .dash-live-grid {
    grid-template-columns: 1fr;
  }
}

.dash-live-card {
  position: relative;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 18px;
  overflow: hidden;
  box-shadow: var(--shadow-card);
}

.dash-live-topbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: #9ca3af;
}
.dash-live-card--work .dash-live-topbar {
  background: #22c55e;
}
.dash-live-card--down .dash-live-topbar {
  background: #ef4444;
}
.dash-live-card--idle .dash-live-topbar {
  background: #9ca3af;
}

.dash-live-head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 14px;
}

.dash-live-avatar {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 800;
  font-size: 0.8rem;
  flex-shrink: 0;
}

.dash-live-name {
  margin: 0 0 4px;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-primary);
}

.dash-live-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 6px;
}
.dash-live-badge--ok {
  background: rgba(34, 197, 94, 0.12);
  color: #15803d;
}
.dash-live-badge--bad {
  background: rgba(239, 68, 68, 0.12);
  color: #b91c1c;
}
.dash-live-badge--muted {
  background: var(--chip-bg);
  color: var(--text-secondary);
}

.dash-live-box {
  background: var(--bg-base);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
}
.dash-live-box--alert {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.2);
}
.dash-live-box--empty {
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.dash-live-box-meta {
  font-size: 0.7rem;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.dash-live-box-title {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-primary);
}

.dash-live-box--link {
  text-decoration: none;
  color: inherit;
  display: block;
  transition: background 0.15s ease;
}
.dash-live-box--link:hover {
  background: var(--row-hover-bg);
}

.dash-inline-link {
  color: var(--accent-green, #2d5a3d);
  font-weight: 600;
  text-decoration: none;
}
.dash-inline-link:hover {
  text-decoration: underline;
}

.dash-field-link {
  text-decoration: none;
  color: inherit;
}
.dash-field-link:hover .dash-td-main {
  color: var(--accent-green, #2d5a3d);
  text-decoration: underline;
}

.dash-live-progress-label {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.dash-live-bad {
  color: #b91c1c;
  font-weight: 700;
}

.dash-live-track {
  height: 6px;
  background: var(--chip-bg);
  border-radius: 999px;
  overflow: hidden;
}

.dash-live-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.3s ease;
}
.dash-live-fill--green {
  background: #22c55e;
}
.dash-live-fill--red {
  background: #ef4444;
}
.dash-live-fill--muted {
  background: #cbd5e1;
}

.dash-live-foot {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 0.72rem;
  color: var(--text-secondary);
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
}
.dash-live-foot.muted {
  color: var(--text-secondary);
  opacity: 0.85;
}

.dash-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  align-items: start;
}

@media (max-width: 960px) {
  .dash-split {
    grid-template-columns: 1fr;
  }
}

.dash-panel {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--shadow-card);
  overflow: hidden;
}

.dash-panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border-color);
}

.dash-panel-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}

.dash-panel-link {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--accent-green, #2d5a3d);
  text-decoration: none;
}
.dash-panel-link:hover {
  text-decoration: underline;
}

.dash-legend-inline {
  display: flex;
  gap: 12px;
  font-size: 0.72rem;
  color: var(--text-secondary);
}
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 4px;
  vertical-align: middle;
}
.dot--g {
  background: #22c55e;
}
.dot--n {
  background: #94a3b8;
}

.dash-table-wrap {
  overflow-x: auto;
}

.dash-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.dash-table th {
  text-align: left;
  padding: 12px 16px;
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
  background: var(--bg-base);
  border-bottom: 1px solid var(--border-color);
}
.dash-table td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color);
  vertical-align: middle;
}

.dash-td-main {
  font-weight: 600;
  color: var(--text-primary);
}

.dash-td-sub {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 4px;
}

.dash-chip {
  display: inline-block;
  margin-top: 6px;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
}
.dash-chip--amber {
  background: rgba(245, 158, 11, 0.15);
  color: #b45309;
}

.dash-pbar-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}
.dash-pbar {
  flex: 1;
  max-width: 120px;
  height: 8px;
  background: var(--chip-bg);
  border-radius: 999px;
  overflow: hidden;
}
.dash-pbar-fill {
  height: 100%;
  background: #22c55e;
  border-radius: 999px;
}
.dash-pbar-fill--warn {
  background: #94a3b8;
}

.dash-empty {
  padding: 20px 16px;
  color: var(--text-secondary);
  font-size: 0.88rem;
  margin: 0;
}

.dash-eq-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.dash-eq-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-color);
}

.dash-eq-link {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  flex: 1;
  min-width: 0;
  text-decoration: none;
  color: inherit;
}
.dash-eq-link:hover .dash-eq-title {
  color: var(--accent-green, #2d5a3d);
  text-decoration: underline;
}

.dash-eq-icon {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(34, 197, 94, 0.12);
  border: 1px solid rgba(34, 197, 94, 0.25);
  flex-shrink: 0;
}
.dash-eq-icon--bad {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.25);
}

.dash-eq-body {
  flex: 1;
  min-width: 0;
}

.dash-eq-title {
  font-weight: 700;
  font-size: 0.88rem;
  color: var(--text-primary);
}

.dash-eq-meta {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.dash-mono {
  font-family: ui-monospace, monospace;
  background: var(--chip-bg);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.7rem;
}

.dash-eq-note {
  margin: 6px 0 0;
  font-size: 0.72rem;
  color: #b91c1c;
}

.dash-eq-badge {
  flex-shrink: 0;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 5px 10px;
  border-radius: 999px;
}
.dash-eq-badge--ok {
  background: rgba(34, 197, 94, 0.15);
  color: #15803d;
}
.dash-eq-badge--warn {
  background: rgba(239, 68, 68, 0.15);
  color: #b91c1c;
}
.dash-eq-badge--muted {
  background: var(--chip-bg);
  color: var(--text-secondary);
}

.dash-task-stats {
  margin-top: 8px;
}

.dash-charts {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 18px;
}

@media (max-width: 900px) {
  .dash-charts {
    grid-template-columns: 1fr;
  }
}

.dash-chart-card {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 18px;
  box-shadow: var(--shadow-card);
}

.dash-chart-title {
  margin: 0 0 16px;
  font-size: 0.95rem;
  font-weight: 700;
}

.dash-donut-row {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: center;
}

.dash-donut {
  width: 160px;
  height: 160px;
  border-radius: 50%;
  flex-shrink: 0;
  position: relative;
}

.dash-donut-inner {
  position: absolute;
  inset: 18px;
  border-radius: 50%;
  background: var(--donut-inner-bg, var(--bg-panel));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: var(--donut-ring-shadow, none);
}

.dash-donut-num {
  font-size: 1.35rem;
  font-weight: 800;
  color: var(--text-primary);
}

.dash-donut-label {
  font-size: 0.7rem;
  color: var(--text-secondary);
  font-weight: 600;
}

.dash-donut-legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 0.85rem;
}

.dash-donut-legend li {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dash-leg-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dash-donut-legend strong {
  margin-left: auto;
  font-weight: 800;
}

.dash-chart-sub {
  margin: 0 0 14px;
  font-size: 0.78rem;
  line-height: 1.35;
  max-width: 52ch;
}

.dash-vchart {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dash-vchart-inner {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 6px 10px;
  align-items: stretch;
}

.dash-vchart-y {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
  text-align: right;
  padding-bottom: 28px;
  line-height: 1;
}

.dash-vchart-plot {
  position: relative;
  min-height: 200px;
  border-left: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
  padding: 4px 6px 0 10px;
}

.dash-vchart-hline {
  position: absolute;
  left: 0;
  right: 0;
  height: 0;
  border-top: 1px dashed color-mix(in srgb, var(--border-color) 70%, transparent);
  pointer-events: none;
}

.dash-vchart-cols {
  position: absolute;
  left: 10px;
  right: 6px;
  top: 4px;
  bottom: 26px;
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  flex-wrap: nowrap;
  gap: 16px;
}

.dash-vchart-col {
  flex: 0 0 auto;
  width: 56px;
  min-width: 48px;
  max-width: 72px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
}

.dash-vchart-col-body {
  flex: 1;
  width: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}

.dash-vchart-total {
  font-size: 0.72rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
  line-height: 1;
}

.dash-vchart-stack {
  width: 100%;
  max-width: 44px;
  min-width: 16px;
  border-radius: 8px 8px 2px 2px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  box-shadow: 0 1px 0 color-mix(in srgb, var(--border-color) 80%, transparent);
  transition: height 0.3s ease;
}

.dash-vchart-stack--done-only .dash-vchart-seg {
  flex: 1;
  min-height: 100%;
}

.dash-vchart-seg {
  width: 100%;
  min-height: 0;
  flex: 0 0 auto;
}

.dash-vchart-seg--done {
  background: #22c55e;
}

.dash-vchart-xlabel {
  margin-top: 8px;
  font-size: 0.7rem;
  color: var(--text-secondary);
  text-align: center;
  line-height: 1.15;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.dash-vchart-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  font-size: 0.76rem;
  color: var(--text-secondary);
  padding-left: 44px;
}

.dash-vchart-legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

</style>
