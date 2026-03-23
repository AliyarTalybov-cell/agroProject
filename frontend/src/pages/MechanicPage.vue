<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { ActiveDowntime, DowntimeCategory } from '@/lib/downtimeStorage'
import { appendEvent, loadActive, saveActive } from '@/lib/downtimeStorage'
import {
  appendOperation,
  loadActiveOperation,
  saveActiveOperation,
} from '@/lib/operationStorage'
import { loadDowntimeReasons, loadWorkOperations, isSupabaseConfigured } from '@/lib/reasonsAndOperations'
import type { DowntimeReasonRow, WorkOperationRow } from '@/lib/reasonsAndOperations'
import { loadFields, type FieldRow } from '@/lib/fieldsSupabase'
import { insertDowntime, insertOperation } from '@/lib/analyticsSupabase'
import { upsertOperatorStatus, deleteOperatorStatus } from '@/lib/operatorStatusSupabase'
import { useAuth } from '@/stores/auth'
import { loadCalendarTasks, updateCalendarTask, type CalendarTaskRow } from '@/lib/calendarTasksSupabase'
import WeatherWidgetCompact from '@/components/WeatherWidgetCompact.vue'
import { loadEquipment, type EquipmentRow } from '@/lib/equipmentSupabase'
import UiLoadingBar from '@/components/UiLoadingBar.vue'

const DEFAULT_REASONS: Array<{ label: string; description: string; category: DowntimeCategory }> = [
  { label: 'Поломка техники', description: 'Неисправность, требующая остановки работы', category: 'breakdown' },
  { label: 'Дождь / погода', description: 'Осадки или условия, не позволяющие работать', category: 'rain' },
  { label: 'Нет топлива', description: 'Ожидание заправки или подвоза ГСМ', category: 'fuel' },
  { label: 'Ожидание задания', description: 'Нет подтверждённого задания от агронома', category: 'waiting' },
]

const router = useRouter()
const auth = useAuth()
const employeeDisplayName = computed(() => {
  const u = auth.user.value
  if (!u) return 'Гость'
  return (u.email ?? (u.user_metadata?.full_name as string) ?? 'Пользователь').trim() || 'Пользователь'
})

const timerTick = ref(0)
let timerInterval: ReturnType<typeof setInterval> | null = null

/** Время начала работы (операции). Когда задано — крутится счётчик. Сбрасывается при начале простоя. */
const workStartedAt = ref<string | null>(null)


const timerStartISO = computed(() => {
  if (active.value) return active.value.startISO
  if (workStartedAt.value) return workStartedAt.value
  return null
})

function operationElapsedSeconds(now = Date.now()): number {
  const op = activeOperation.value
  if (!op?.startISO) return 0
  const startMs = new Date(op.startISO).getTime()
  if (Number.isNaN(startMs)) return 0
  let pauseSeconds = Math.max(0, Math.floor(op.accumulatedPauseSeconds ?? 0))
  if (op.pausedAt) {
    const pausedAtMs = new Date(op.pausedAt).getTime()
    if (!Number.isNaN(pausedAtMs) && now > pausedAtMs) {
      pauseSeconds += Math.floor((now - pausedAtMs) / 1000)
    }
  }
  return Math.max(0, Math.floor((now - startMs) / 1000) - pauseSeconds)
}

const elapsedSeconds = computed(() => {
  void timerTick.value
  if (active.value?.startISO) {
    const start = new Date(active.value.startISO).getTime()
    if (Number.isNaN(start)) return 0
    return Math.max(0, Math.floor((Date.now() - start) / 1000))
  }
  if (activeOperation.value?.startISO) return operationElapsedSeconds(Date.now())
  return 0
})

const timerLabel = computed(() => {
  const s = elapsedSeconds.value
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
})

type MechanicField = {
  id: string
  name: string
  operation: string
}

const active = ref<ActiveDowntime | null>(loadActive())
const activeOperation = ref(loadActiveOperation())
const isReasonsOpen = ref(false)
const isOperationsOpen = ref(false)
const isStartedModalOpen = ref(false)
const isFinishedModalOpen = ref(false)
const isFinishedModalType = ref<'downtime' | 'operation'>('downtime')
const isAddFieldOpen = ref(false)

// --- Модалки старта операции с привязкой техники ---
const isEquipmentChoiceOpen = ref(false) // Будет ли использована техника?
const isEquipmentModalOpen = ref(false) // Выбор техники + параметры
const pendingStartOperation = ref<{ fieldId?: string; fieldName?: string; operation?: string } | null>(null)

type EquipmentConditionBucket = 'good' | 'acceptable' | 'partial' | 'bad'

const equipmentList = ref<EquipmentRow[]>([])
const equipmentLoading = ref(false)
const equipmentError = ref<string | null>(null)
const selectedEquipmentId = ref<string>('')

const fuelPercent = ref<number>(70)
const conditionPercent = ref<number>(80)
const equipmentRepairNotes = ref<string>('')

const equipmentConditionBucket = computed<EquipmentConditionBucket>(() => {
  if (conditionPercent.value >= 75) return 'good'
  if (conditionPercent.value >= 50) return 'acceptable'
  if (conditionPercent.value >= 25) return 'partial'
  return 'bad'
})

const equipmentConditionLabel = computed(() => {
  const b = equipmentConditionBucket.value
  if (b === 'good') return 'Хорошее состояние'
  if (b === 'acceptable') return 'Приемлемо'
  if (b === 'partial') return 'Требуется частичная починка'
  return 'Плохое состояние'
})

const equipmentConditionRequiresNotes = computed(() => equipmentConditionBucket.value === 'partial' || equipmentConditionBucket.value === 'bad')

const finishNotesModalOpen = ref(false)
const finishNotesType = ref<'downtime' | 'operation' | null>(null)
const finishNotesText = ref('')

// Для операций с техникой: сколько топлива осталось у техники (после остановки)
const equipmentFuelLeftPercent = ref<number>(0)

const shouldAskEquipmentFuelLeft = computed(
  () => finishNotesType.value === 'operation' && !!activeOperation.value?.equipmentId,
)

const newFieldName = ref('')
const newFieldOperation = ref('')

const fields = ref<MechanicField[]>([])
const currentFieldId = ref<string | null>(active.value?.fieldId ?? null)

const reasons = ref<Array<{ label: string; description: string; category: DowntimeCategory }>>([...DEFAULT_REASONS])
const workOperationsList = ref<WorkOperationRow[]>([])

onMounted(async () => {
  const savedOp = loadActiveOperation()
  if (savedOp && !active.value) {
    activeOperation.value = savedOp
    workStartedAt.value = savedOp.startISO
    if (savedOp.fieldId) currentFieldId.value = savedOp.fieldId
  }
  timerInterval = setInterval(() => {
    if (active.value || workStartedAt.value) timerTick.value += 1
  }, 1000)
  if (isSupabaseConfigured()) {
    try {
      const fieldRows: FieldRow[] = await loadFields()
      fields.value = fieldRows.map((f) => ({
        id: f.id,
        name: `Поле №${f.number} — ${f.name}`,
        operation: 'Операция не выбрана',
      }))
      if (!currentFieldId.value && fields.value.length) {
        currentFieldId.value = fields.value[0].id
      }
      const fromDb = await loadDowntimeReasons()
      if (fromDb.length) {
        reasons.value = fromDb.map((r: DowntimeReasonRow) => ({
          label: r.label,
          description: r.description ?? '',
          category: r.category as DowntimeCategory,
        }))
      }
      workOperationsList.value = await loadWorkOperations()
      const uid = auth.user.value?.id ?? null
      if (uid) {
        todayTasksLoading.value = true
        try {
          const all = await loadCalendarTasks(uid)
          todayTasks.value = all.filter((t) => t.date === todayKey.value)
        } catch {
          todayTasks.value = []
        } finally {
          todayTasksLoading.value = false
        }
      }
    } catch {
      // оставляем дефолтные причины и пустой список операций
    }
  }

  // Восстановление «живого» статуса в Supabase после перезагрузки страницы (дашборд руководителя).
  const uid = auth.user.value?.id
  if (uid && isSupabaseConfigured()) {
    if (active.value) {
      void upsertOperatorStatus({
        userId: uid,
        kind: 'downtime',
        employee: active.value.employee,
        startedAt: active.value.startISO,
        fieldId: active.value.fieldId ?? null,
        fieldName: active.value.fieldName ?? null,
        operation: active.value.operation ?? null,
        downtimeCategory: active.value.category,
        downtimeReason: active.value.reason,
        equipmentId: null,
      })
    } else if (activeOperation.value) {
      const op = activeOperation.value
      void upsertOperatorStatus({
        userId: uid,
        kind: 'operation',
        employee: op.employee,
        startedAt: op.startISO,
        fieldId: op.fieldId ?? null,
        fieldName: op.fieldName ?? null,
        operation: op.operation ?? null,
        equipmentId: op.equipmentId ?? null,
      })
    }
  }
})
onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval)
})

const currentField = computed<MechanicField | null>(() => {
  if (active.value?.fieldId) {
    const fromActive = fields.value.find((f) => f.id === active.value?.fieldId)
    if (fromActive) return fromActive
  }
  return fields.value.find((f) => f.id === currentFieldId.value) ?? null
})

const statusText = computed(() => {
  if (!active.value && !workStartedAt.value) return 'Готов к работе'
  if (!active.value && workStartedAt.value && activeOperation.value?.pausedAt) return 'Операция на паузе'
  if (!active.value && workStartedAt.value) return 'Идёт операция'
  const down = active.value
  if (!down) return 'Готов к работе'
  const reason = reasons.value.find((r) => r.category === down.category)
  return `Простой • ${reason?.label ?? down.reason}`
})

const isOperationPaused = computed(() => !!activeOperation.value?.pausedAt)

const circleFieldLabel = computed(() => active.value?.fieldName ?? currentField.value?.name ?? 'Поле не выбрано')
const circleTaskLabel = computed(
  () => active.value?.operation ?? activeOperation.value?.operation ?? currentField.value?.operation ?? 'Операция не указана',
)

const taskTitle = computed(() => `${circleFieldLabel.value} — ${circleTaskLabel.value}`)
const progressPercent = 65
const progressDone = 32
const progressTotal = 50

const todayKey = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})

const todayTasks = ref<CalendarTaskRow[]>([])
const todayTasksLoading = ref(false)
const todayTaskTogglingId = ref<string | null>(null)

const todayTasksPending = computed(() => todayTasks.value.filter((t) => !t.completed_at))
const todayTasksDone = computed(() => todayTasks.value.filter((t) => t.completed_at))

async function toggleTodayTask(t: CalendarTaskRow) {
  if (todayTaskTogglingId.value) return
  todayTaskTogglingId.value = t.id
  try {
    await updateCalendarTask(t.id, {
      completed_at: t.completed_at ? null : new Date().toISOString(),
    })
    const idx = todayTasks.value.findIndex((x) => x.id === t.id)
    if (idx !== -1) {
      const next = [...todayTasks.value]
      next[idx] = {
        ...next[idx],
        completed_at: t.completed_at ? null : new Date().toISOString(),
      }
      todayTasks.value = next
    }
  } catch (e) {
    console.error(e)
  } finally {
    todayTaskTogglingId.value = null
  }
}

function priorityLabel(priority: string): string {
  return priority === 'high' ? 'Высокий' : priority === 'low' ? 'Низкий' : 'Обычный'
}

function startDowntime(reason: { label: string; category: DowntimeCategory }) {
  workStartedAt.value = null
  activeOperation.value = null
  saveActiveOperation(null)
  const now = new Date()
  const field = currentField.value
  active.value = {
    id: now.getTime(),
    employee: employeeDisplayName.value,
    reason: reason.label,
    category: reason.category,
    startISO: now.toISOString(),
    fieldId: field?.id,
    fieldName: field?.name,
    operation: field?.operation,
  }
  saveActive(active.value)
  isReasonsOpen.value = false
  isStartedModalOpen.value = true

  const uid = auth.user.value?.id
  if (uid && isSupabaseConfigured() && active.value) {
    void upsertOperatorStatus({
      userId: uid,
      kind: 'downtime',
      employee: active.value.employee,
      startedAt: active.value.startISO,
      fieldId: active.value.fieldId ?? null,
      fieldName: active.value.fieldName ?? null,
      operation: active.value.operation ?? null,
      downtimeCategory: active.value.category,
      downtimeReason: active.value.reason,
      equipmentId: null,
    })
  }
}

function openFinishNotesModal(type: 'downtime' | 'operation') {
  finishNotesType.value = type
  finishNotesText.value = ''
  equipmentFuelLeftPercent.value = 0
  if (type === 'operation' && activeOperation.value?.equipmentId) {
    // По умолчанию ставим то, что было при старте операции.
    equipmentFuelLeftPercent.value = typeof activeOperation.value.equipmentFuelPercent === 'number'
      ? Math.round(activeOperation.value.equipmentFuelPercent)
      : 0
  }
  finishNotesModalOpen.value = true
}

function closeFinishNotesModal() {
  finishNotesModalOpen.value = false
  finishNotesType.value = null
  finishNotesText.value = ''
  equipmentFuelLeftPercent.value = 0
}

function confirmFinishNotes(notes: string | null) {
  const type = finishNotesType.value
  const notesVal = notes?.trim() || undefined
  const fuelLeft =
    type === 'operation' && activeOperation.value?.equipmentId ? equipmentFuelLeftPercent.value : undefined
  closeFinishNotesModal()
  if (type === 'downtime') {
    stopDowntimeWithNotes(notesVal)
    isFinishedModalType.value = 'downtime'
  } else if (type === 'operation') {
    stopOperationWithNotes(notesVal, fuelLeft)
    isFinishedModalType.value = 'operation'
  }
  finishNotesText.value = ''
  isFinishedModalOpen.value = true
}

function stopDowntimeWithNotes(notes?: string) {
  if (!active.value) return
  const now = new Date()
  const start = new Date(active.value.startISO)
  const durationMinutes = Math.max(1, Math.round((now.getTime() - start.getTime()) / 60000))

  const event = {
    id: active.value.id,
    employee: active.value.employee,
    reason: active.value.reason,
    category: active.value.category,
    startISO: active.value.startISO,
    endISO: now.toISOString(),
    durationMinutes,
    fieldId: active.value.fieldId,
    fieldName: active.value.fieldName,
    operation: active.value.operation,
    notes,
  }
  appendEvent(event)
  if (isSupabaseConfigured()) {
    insertDowntime(event, auth.user.value?.id ?? null).catch(() => {})
  }

  active.value = null
  saveActive(null)

  const uid = auth.user.value?.id
  if (uid && isSupabaseConfigured()) {
    void deleteOperatorStatus(uid)
  }
}

function stopOperationWithNotes(notes?: string, equipmentFuelLeft?: number | null) {
  if (!workStartedAt.value) return
  const now = new Date()
  const durationMinutes = Math.max(1, Math.round(operationElapsedSeconds(now.getTime()) / 60))
  const field = currentField.value
  const savedOp = activeOperation.value
  const hasEquipment = !!savedOp?.equipmentId

  // Страховка: если в сохранённом активном состоянии почему-то пустые значения,
  // берем их из текущих слайдеров техники.
  const equipmentFuelPercentFinal = savedOp?.equipmentFuelPercent ?? (hasEquipment ? Math.round(fuelPercent.value) : null)
  const equipmentConditionValueFinal = savedOp?.equipmentConditionValue ?? (hasEquipment ? Math.round(conditionPercent.value) : null)
  const equipmentConditionLabelFinal = savedOp?.equipmentConditionLabel ?? (hasEquipment ? equipmentConditionLabel.value : null)
  const equipmentRepairNotesFinal =
    savedOp?.equipmentRepairNotes ??
    (hasEquipment && equipmentConditionRequiresNotes.value ? equipmentRepairNotes.value.trim() : null)
  const op = {
    id: now.getTime(),
    employee: employeeDisplayName.value,
    fieldId: savedOp?.fieldId ?? field?.id,
    fieldName: savedOp?.fieldName ?? field?.name,
    operation: savedOp?.operation ?? field?.operation,
    startISO: workStartedAt.value,
    endISO: now.toISOString(),
    durationMinutes,
    notes,
    equipmentId: savedOp?.equipmentId ?? null,
    equipmentFuelPercent: equipmentFuelPercentFinal ?? null,
    equipmentFuelLeftPercent: equipmentFuelLeft ?? null,
    equipmentConditionValue: equipmentConditionValueFinal ?? null,
    equipmentConditionLabel: equipmentConditionLabelFinal ?? null,
    equipmentRepairNotes: equipmentRepairNotesFinal ?? null,
  }
  appendOperation(op)
  if (isSupabaseConfigured()) {
    insertOperation(op, auth.user.value?.id ?? null).catch((e) => {
      console.error('insertOperation failed (MechanicPage)', e, { op })
    })
  }
  // Диагностика: чтобы понять, что реально уходит в insertOperation.
  // В идеале equipmentFuelPercent/equipmentCondition* должны быть числами.
  saveActiveOperation(null)
  activeOperation.value = null
  workStartedAt.value = null

  const uid = auth.user.value?.id
  if (uid && isSupabaseConfigured()) {
    void deleteOperatorStatus(uid)
  }
}

function pauseOperation() {
  const op = activeOperation.value
  if (!op || op.pausedAt) return
  const next = { ...op, pausedAt: new Date().toISOString() }
  activeOperation.value = next
  saveActiveOperation(next)
}

function resumeOperation() {
  const op = activeOperation.value
  if (!op?.pausedAt) return
  const pausedAtMs = new Date(op.pausedAt).getTime()
  const nowMs = Date.now()
  const delta = !Number.isNaN(pausedAtMs) && nowMs > pausedAtMs ? Math.floor((nowMs - pausedAtMs) / 1000) : 0
  const next = {
    ...op,
    pausedAt: null,
    accumulatedPauseSeconds: Math.max(0, Math.floor(op.accumulatedPauseSeconds ?? 0) + delta),
  }
  activeOperation.value = next
  saveActiveOperation(next)
}

function setCurrentField(id: string) {
  if (active.value?.fieldId && active.value.fieldId === id) return
  currentFieldId.value = id
}

function startOperation(field: MechanicField) {
  setCurrentField(field.id)
  pendingStartOperation.value = {
    fieldId: field.id,
    fieldName: field.name,
    operation: field.operation,
  }
  isOperationsOpen.value = false
  isEquipmentChoiceOpen.value = true
}

function startOperationByName(op: WorkOperationRow) {
  const field = currentField.value
  pendingStartOperation.value = {
    fieldId: field?.id,
    fieldName: field?.name,
    operation: op.name,
  }
  isOperationsOpen.value = false
  isEquipmentChoiceOpen.value = true
}

function resetEquipmentForm() {
  selectedEquipmentId.value = ''
  fuelPercent.value = 70
  conditionPercent.value = 80
  equipmentRepairNotes.value = ''
  equipmentError.value = null
  equipmentList.value = []
}

function conditionFromEquipmentType(c: string | null | undefined): number {
  // Пробрасываем из типа техники в начальное значение слайдера (примерно).
  if (c === 'operational') return 85
  if (c === 'repair') return 45
  if (c === 'decommissioned') return 10
  return 80
}

async function openEquipmentModal() {
  // Если бекенд не настроен или техник нет — всё равно показываем UI и позволяем заполнить параметры,
  // но без сохранения equipment_id.
  resetEquipmentForm()
  isEquipmentChoiceOpen.value = false
  isEquipmentModalOpen.value = true

  if (!isSupabaseConfigured()) return
  equipmentLoading.value = true
  try {
    equipmentList.value = await loadEquipment()
    if (equipmentList.value.length) {
      selectedEquipmentId.value = equipmentList.value[0].id
      conditionPercent.value = conditionFromEquipmentType(equipmentList.value[0].condition)
    }
  } catch (e) {
    equipmentError.value = e instanceof Error ? e.message : 'Не удалось загрузить технику'
  } finally {
    equipmentLoading.value = false
  }
}

watch(selectedEquipmentId, (id) => {
  if (!id) return
  const eq = equipmentList.value.find((e) => e.id === id)
  if (!eq) return
  conditionPercent.value = conditionFromEquipmentType(eq.condition)
  // При хорошем/приемлемом состоянии починка не нужна — очищаем текст.
  if (!(eq.condition === 'repair' || eq.condition === 'decommissioned')) {
    equipmentRepairNotes.value = ''
  }
})

watch(conditionPercent, () => {
  if (!equipmentConditionRequiresNotes.value) equipmentRepairNotes.value = ''
})

function startOperationConfirmedWithoutEquipment() {
  const pending = pendingStartOperation.value
  if (!pending) return
  const startISO = new Date().toISOString()
  workStartedAt.value = startISO
  activeOperation.value = {
    startISO,
    pausedAt: null,
    accumulatedPauseSeconds: 0,
    fieldId: pending.fieldId,
    fieldName: pending.fieldName,
    operation: pending.operation,
    employee: employeeDisplayName.value,
    equipmentId: null,
    equipmentFuelPercent: null,
    equipmentConditionValue: null,
    equipmentConditionLabel: null,
    equipmentRepairNotes: null,
  }
  saveActiveOperation(activeOperation.value)
  isEquipmentChoiceOpen.value = false
  pendingStartOperation.value = null

  const uid = auth.user.value?.id
  if (uid && isSupabaseConfigured()) {
    void upsertOperatorStatus({
      userId: uid,
      kind: 'operation',
      employee: activeOperation.value.employee,
      startedAt: startISO,
      fieldId: activeOperation.value.fieldId ?? null,
      fieldName: activeOperation.value.fieldName ?? null,
      operation: activeOperation.value.operation ?? null,
      equipmentId: activeOperation.value.equipmentId ?? null,
    })
  }
}

function startOperationConfirmedWithEquipment() {
  const pending = pendingStartOperation.value
  if (!pending) return
  const equipmentId = selectedEquipmentId.value
  if (!equipmentId) return
  if (equipmentConditionRequiresNotes.value && !equipmentRepairNotes.value.trim()) return

  const startISO = new Date().toISOString()
  workStartedAt.value = startISO
  activeOperation.value = {
    startISO,
    pausedAt: null,
    accumulatedPauseSeconds: 0,
    fieldId: pending.fieldId,
    fieldName: pending.fieldName,
    operation: pending.operation,
    employee: employeeDisplayName.value,
    equipmentId,
    equipmentFuelPercent: Math.round(fuelPercent.value),
    equipmentConditionValue: Math.round(conditionPercent.value),
    equipmentConditionLabel: equipmentConditionLabel.value,
    equipmentRepairNotes: equipmentConditionRequiresNotes.value ? equipmentRepairNotes.value.trim() : null,
  }
  saveActiveOperation(activeOperation.value)
  isEquipmentModalOpen.value = false
  isEquipmentChoiceOpen.value = false
  pendingStartOperation.value = null

  const uid = auth.user.value?.id
  if (uid && isSupabaseConfigured() && activeOperation.value) {
    void upsertOperatorStatus({
      userId: uid,
      kind: 'operation',
      employee: activeOperation.value.employee,
      startedAt: startISO,
      fieldId: activeOperation.value.fieldId ?? null,
      fieldName: activeOperation.value.fieldName ?? null,
      operation: activeOperation.value.operation ?? null,
      equipmentId: activeOperation.value.equipmentId ?? null,
    })
  }
}

function closeEquipmentChoiceAndReturnToSheet() {
  isEquipmentChoiceOpen.value = false
  pendingStartOperation.value = null
  isOperationsOpen.value = true
}

function backFromEquipmentModalToChoice() {
  isEquipmentModalOpen.value = false
  isEquipmentChoiceOpen.value = true
}


function openAddField() {
  router.push({ name: 'fields', query: { highlightAddField: '1' } })
}

function addField() {
  const name = newFieldName.value.trim()
  const op = newFieldOperation.value.trim()
  if (!name || !op) {
    return
  }
  const id = `field-${Date.now()}`
  const field: MechanicField = {
    id,
    name,
    operation: op,
  }
  fields.value = [...fields.value, field]
  currentFieldId.value = id
  isAddFieldOpen.value = false
}
</script>

<template>
  <section class="mechanic-page">
    <div class="mechanic-shell">
      <header class="mechanic-header page-enter-item">
        <div class="mechanic-title">
          <div class="mechanic-badge">AGRO_CTRL • Оператор</div>
          <div class="mechanic-operator">{{ employeeDisplayName }}</div>
        </div>
        <div class="mechanic-status">
          <span class="status-dot" :class="{ 'status-dot-active': !!active || !!workStartedAt }" />
          <span class="status-text">
            {{ statusText }}
          </span>
        </div>
      </header>

      <main class="mechanic-main">
        <section class="mechanic-task-block page-enter-item" style="--enter-delay: 60ms">
          <div class="mechanic-task-label">Текущая задача</div>
          <div class="mechanic-task-timer">{{ timerStartISO ? timerLabel : '—' }}</div>
          <h2 class="mechanic-task-title">{{ taskTitle }}</h2>
          <div class="mechanic-task-progress-wrap">
            <div class="mechanic-task-progress-label">Прогресс выполнения</div>
            <div class="mechanic-task-progress-bar">
              <div class="mechanic-task-progress-fill" :style="{ width: progressPercent + '%' }" />
            </div>
            <div class="mechanic-task-progress-text">{{ progressPercent }}% ({{ progressDone }}/{{ progressTotal }} Га)</div>
          </div>
          <div class="mechanic-fields-header mechanic-fields-header--in-task">
            <div class="type-label">Мои поля сегодня</div>
            <div class="mechanic-fields-hint">Выберите поле для операции или простоя</div>
          </div>
          <div class="mechanic-fields-chips mechanic-fields-chips--in-task">
            <button
              v-for="field in fields"
              :key="field.id"
              class="field-chip"
              :class="{ 'field-chip-active': currentField?.id === field.id }"
              type="button"
              @click="setCurrentField(field.id)"
            >
              <span class="field-chip-name">{{ field.name }}</span>
              <span class="field-chip-op">{{ field.operation }}</span>
            </button>
            <button class="field-chip field-chip-add" type="button" @click="openAddField">
              + Добавить поле
            </button>
          </div>
          <div class="mechanic-task-actions">
            <template v-if="!active && !workStartedAt">
              <button
                class="btn-operation btn-operation-downtime"
                type="button"
                :disabled="!currentField"
                @click="isReasonsOpen = true"
              >
                Начать простой
              </button>
              <button
                class="btn-operation btn-operation-start"
                type="button"
                :disabled="!workOperationsList.length && !fields.length"
                @click="isOperationsOpen = true"
              >
                Начать операцию
              </button>
            </template>
            <template v-if="!active && workStartedAt">
              <button
                v-if="!isOperationPaused"
                class="btn-operation btn-operation-pause"
                type="button"
                @click="pauseOperation"
              >
                Пауза
              </button>
              <button
                v-else
                class="btn-operation btn-operation-resume"
                type="button"
                @click="resumeOperation"
              >
                Продолжить
              </button>
              <button
                class="btn-operation btn-operation-stop"
                type="button"
                @click="openFinishNotesModal('operation')"
              >
                Остановить операцию
              </button>
            </template>
            <button
              v-if="active"
              class="btn-operation btn-operation-stop"
              type="button"
              @click="openFinishNotesModal('downtime')"
            >
              Завершить простой
            </button>
          </div>
        </section>

        <section class="mechanic-today-tasks page-enter-item" style="--enter-delay: 90ms">
          <div class="mechanic-today-tasks-head">
            <span class="mechanic-today-tasks-title">Задачи на сегодня</span>
            <router-link to="/tasks" class="mechanic-today-tasks-link">Календарь</router-link>
          </div>
          <div v-if="todayTasksLoading" class="mechanic-today-tasks-loading">
            <UiLoadingBar size="compact" />
          </div>
          <template v-else-if="todayTasks.length">
            <div v-if="todayTasksPending.length" class="mechanic-today-tasks-group">
              <div class="mechanic-today-tasks-group-title">К выполнению</div>
              <ul class="mechanic-today-tasks-list">
                <li
                  v-for="t in todayTasksPending"
                  :key="t.id"
                  class="mechanic-today-task"
                >
                  <button
                    type="button"
                    class="mechanic-today-task-check"
                    :aria-label="'Отметить выполненным'"
                    :disabled="todayTaskTogglingId === t.id"
                    @click="toggleTodayTask(t)"
                  >
                    <span class="mechanic-today-task-check-empty" />
                  </button>
                  <span class="mechanic-today-task-time">{{ t.start_time || '—' }}<template v-if="t.end_time">–{{ t.end_time }}</template></span>
                  <span class="mechanic-today-task-title">{{ t.title }}</span>
                  <span
                    class="mechanic-today-task-priority"
                    :class="{
                      'mechanic-today-task-priority--high': t.priority === 'high',
                      'mechanic-today-task-priority--low': t.priority === 'low',
                    }"
                  >
                    {{ priorityLabel(t.priority) }}
                  </span>
                </li>
              </ul>
            </div>
            <div v-if="todayTasksDone.length" class="mechanic-today-tasks-group">
              <div class="mechanic-today-tasks-group-title mechanic-today-tasks-group-title--done">Выполнено</div>
              <ul class="mechanic-today-tasks-list">
                <li
                  v-for="t in todayTasksDone"
                  :key="t.id"
                  class="mechanic-today-task mechanic-today-task--done"
                >
                  <button
                    type="button"
                    class="mechanic-today-task-check"
                    aria-label="Снять отметку"
                    :disabled="todayTaskTogglingId === t.id"
                    @click="toggleTodayTask(t)"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </button>
                  <span class="mechanic-today-task-time">{{ t.start_time || '—' }}<template v-if="t.end_time">–{{ t.end_time }}</template></span>
                  <span class="mechanic-today-task-title">{{ t.title }}</span>
                  <span
                    class="mechanic-today-task-priority mechanic-today-task-priority--muted"
                    :class="{
                      'mechanic-today-task-priority--high': t.priority === 'high',
                      'mechanic-today-task-priority--low': t.priority === 'low',
                    }"
                  >
                    {{ priorityLabel(t.priority) }}
                  </span>
                </li>
              </ul>
            </div>
          </template>
          <p v-else class="mechanic-today-tasks-empty">На сегодня задач нет</p>
        </section>

        <section class="mechanic-cards page-enter-item" style="--enter-delay: 120ms">
          <div class="mechanic-card mechanic-card-weather">
            <div class="mechanic-card-title">Метеоусловия</div>
            <WeatherWidgetCompact />
            <div class="mechanic-weather-permit">
              Погодные условия оптимальны для пахоты. Влажность почвы в норме.
            </div>
          </div>
        </section>
      </main>
    </div>

    <div
      class="sheet-backdrop"
      :class="{ 'sheet-backdrop-open': isReasonsOpen }"
      @click="isReasonsOpen = false"
    />
    <aside class="sheet" :class="{ 'sheet-open': isReasonsOpen }">
      <header class="sheet-header">
        <div>
          <div class="sheet-label">Простой</div>
          <div class="sheet-title">Выберите причину начала простоя</div>
        </div>
        <button class="sheet-close" type="button" @click="isReasonsOpen = false">
          ✕
        </button>
      </header>
      <ul class="sheet-list">
        <li
          v-for="reason in reasons"
          :key="reason.category"
          class="sheet-item"
        >
          <button
            class="sheet-button"
            type="button"
            @click="startDowntime(reason)"
          >
            <span class="sheet-button-title">{{ reason.label }}</span>
            <span class="sheet-button-desc">{{ reason.description }}</span>
          </button>
        </li>
      </ul>
    </aside>

    <div
      class="sheet-backdrop"
      :class="{ 'sheet-backdrop-open': isOperationsOpen }"
      @click="isOperationsOpen = false"
    />
    <aside class="sheet" :class="{ 'sheet-open': isOperationsOpen }">
      <header class="sheet-header">
        <div>
          <div class="sheet-label">Операция</div>
          <div class="sheet-title">Выберите операцию для работы</div>
        </div>
        <button class="sheet-close" type="button" @click="isOperationsOpen = false">
          ✕
        </button>
      </header>
      <ul class="sheet-list">
        <li
          v-for="op in workOperationsList"
          :key="op.id"
          class="sheet-item"
        >
          <button
            class="sheet-button"
            type="button"
            @click="startOperationByName(op)"
          >
            <span class="sheet-button-title">{{ op.name }}</span>
            <span class="sheet-button-desc">Начать операцию (поле: {{ currentField?.name ?? 'не выбрано' }})</span>
          </button>
        </li>
        <li v-for="field in (workOperationsList.length ? [] : fields)" :key="'f-' + field.id" class="sheet-item">
          <button class="sheet-button" type="button" @click="startOperation(field)">
            <span class="sheet-button-title">{{ field.name }} — {{ field.operation }}</span>
            <span class="sheet-button-desc">Начать работу по этому полю</span>
          </button>
        </li>
      </ul>
      <p v-if="!workOperationsList.length && !fields.length" class="sheet-empty">Добавьте операции на странице «Поля» (блок «Справочники») или поля в «Мои поля сегодня».</p>
    </aside>

    <!-- Modal: Будет ли использована техника? -->
    <div
      v-if="isEquipmentChoiceOpen"
      class="modal-backdrop"
      @click="closeEquipmentChoiceAndReturnToSheet()"
    >
      <div class="modal" @click.stop>
        <div class="modal-badge">Агро-Контроль</div>
        <div class="modal-title">Будет ли использована техника?</div>
        <p class="modal-text modal-text-muted">
          Если техника нужна — выберите её и укажите параметры (топливо и состояние).
        </p>
        <div class="modal-actions modal-actions--two">
          <button type="button" class="modal-btn-ghost" @click="startOperationConfirmedWithoutEquipment">
            Нет
          </button>
          <button type="button" class="modal-btn" @click="openEquipmentModal">
            Да
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: Выбор техники + топливо/состояние -->
    <div
      v-if="isEquipmentModalOpen"
      class="modal-backdrop"
      @click="backFromEquipmentModalToChoice()"
    >
      <div class="modal" @click.stop>
        <div class="modal-badge">Агро-Контроль</div>
        <div class="modal-title">Техника для операции</div>

        <div v-if="equipmentLoading" class="modal-text modal-text--loading">
          <UiLoadingBar size="md" />
        </div>
        <div v-else-if="equipmentError" class="modal-text modal-text-muted">{{ equipmentError }}</div>
        <div v-else>
          <div class="modal-form">
            <label class="modal-field">
              <span class="modal-label">Техника</span>
              <select v-model="selectedEquipmentId" class="modal-select">
                <option value="" disabled>Выберите технику</option>
                <option v-for="e in equipmentList" :key="e.id" :value="e.id">
                  {{ e.brand }} — {{ e.license_plate }} ({{ e.model ?? '—' }})
                </option>
              </select>
            </label>
          </div>

          <div class="equipment-sliders">
            <div class="equipment-slider-block">
              <div class="equipment-slider-row">
                <span class="equipment-slider-label">Топливо</span>
                <span class="equipment-slider-value">{{ fuelPercent }}%</span>
              </div>
              <input
                v-model.number="fuelPercent"
                type="range"
                min="0"
                max="100"
                step="1"
                class="equipment-range"
              />
            </div>

            <div class="equipment-slider-block">
              <div class="equipment-slider-row">
                <span class="equipment-slider-label">Состояние техники</span>
                <span class="equipment-slider-value">{{ conditionPercent }}%</span>
              </div>
              <input
                v-model.number="conditionPercent"
                type="range"
                min="0"
                max="100"
                step="1"
                class="equipment-range"
              />
              <div class="equipment-condition-text">{{ equipmentConditionLabel }}</div>
            </div>

            <div v-if="equipmentConditionRequiresNotes" class="equipment-repair-notes">
              <label class="modal-field">
                <span class="modal-label">Что конкретно необходимо исправить</span>
                <textarea
                  v-model="equipmentRepairNotes"
                  class="modal-textarea"
                  rows="4"
                  placeholder="Например: заменить ремень, проверить гидравлику, подтянуть крепления…"
                />
              </label>
            </div>
          </div>
        </div>

        <div class="modal-actions modal-actions--two">
          <button type="button" class="modal-btn-ghost" @click="backFromEquipmentModalToChoice">
            Назад
          </button>
          <button
            type="button"
            class="modal-btn"
            :disabled="!selectedEquipmentId || equipmentLoading || (equipmentConditionRequiresNotes && !equipmentRepairNotes.trim())"
            @click="startOperationConfirmedWithEquipment"
          >
            Начать операцию
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="isStartedModalOpen"
      class="modal-backdrop"
      @click="isStartedModalOpen = false"
    >
      <div class="modal" @click.stop>
        <div class="modal-badge">Агро-Контроль</div>
        <div class="modal-title">Простой зафиксирован</div>
        <p class="modal-text">
          Начало простоя записано по объекту «{{ circleFieldLabel }}», операция: {{ circleTaskLabel }}.
          Данные учтены в системе.
        </p>
        <button class="modal-btn" type="button" @click="isStartedModalOpen = false">
          Понятно
        </button>
      </div>
    </div>

    <div
      v-if="finishNotesModalOpen"
      class="modal-backdrop"
      @click="closeFinishNotesModal"
    >
      <div class="modal" @click.stop>
        <div class="modal-badge">Агро-Контроль</div>
        <div class="modal-title-row">
          <div class="modal-title">
            {{ finishNotesType === 'downtime' ? 'Завершить простой' : 'Остановить операцию' }}
          </div>
          <button
            type="button"
            class="modal-close-btn"
            aria-label="Закрыть без завершения"
            @click="closeFinishNotesModal"
          >
            ×
          </button>
        </div>
        <p class="modal-text modal-text-muted">
          По желанию укажите список дел, которые были выполнены. Заметки сохранятся и будут видны в журнале работ и аналитике.
        </p>
        <div class="modal-form">
          <label class="modal-field">
            <span class="modal-label">Список дел (что сделано)</span>
            <textarea
              v-model="finishNotesText"
              class="modal-textarea"
              rows="4"
              placeholder="Например: Замена масла, проверка подшипников, дозаправка..."
            />
          </label>

          <div v-if="shouldAskEquipmentFuelLeft" class="equipment-sliders" style="margin-top: var(--space-md);">
            <div class="equipment-slider-block">
              <div class="equipment-slider-row">
                <span class="equipment-slider-label">Топливо осталось у техники</span>
                <span class="equipment-slider-value">{{ equipmentFuelLeftPercent }}%</span>
              </div>
              <input
                v-model.number="equipmentFuelLeftPercent"
                type="range"
                min="0"
                max="100"
                step="1"
                class="equipment-range"
              />
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="modal-btn" type="button" @click="confirmFinishNotes(finishNotesText)">
            Сохранить и завершить
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="isFinishedModalOpen"
      class="modal-backdrop"
      @click="isFinishedModalOpen = false"
    >
      <div class="modal" @click.stop>
        <div class="modal-badge">Агро-Контроль</div>
        <div class="modal-title">
          {{ isFinishedModalType === 'downtime' ? 'Простой завершён' : 'Операция завершена' }}
        </div>
        <p class="modal-text">
          Запись сохранена. Данные отображаются в разделе «Аналитика» и в журнале работ.
        </p>
        <button class="modal-btn" type="button" @click="isFinishedModalOpen = false">
          Закрыть
        </button>
      </div>
    </div>

    <div
      v-if="isAddFieldOpen"
      class="modal-backdrop"
      @click="isAddFieldOpen = false"
    >
      <div class="modal" @click.stop>
        <div class="modal-badge">Агро-Контроль</div>
        <div class="modal-title">Новое поле</div>
        <p class="modal-text modal-text-muted">
          Добавьте поле в список «Мои поля сегодня» для учёта работ и простоев.
        </p>
        <div class="modal-form">
          <label class="modal-field">
            <span class="modal-label">Название поля</span>
            <input
              v-model="newFieldName"
              type="text"
              placeholder="Например: Поле №15"
            />
          </label>
          <label class="modal-field">
            <span class="modal-label">Операция</span>
            <input
              v-model="newFieldOperation"
              type="text"
              placeholder="Например: Посев, Уборка, Опрыскивание"
            />
          </label>
        </div>
        <div class="modal-actions">
          <button class="modal-btn-ghost" type="button" @click="isAddFieldOpen = false">
            Отмена
          </button>
          <button class="modal-btn" type="button" @click="addField">
            Добавить
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.mechanic-page {
  min-height: 100vh;
  display: flex;
  align-items: stretch;
  justify-content: center;
  background: var(--bg-base);
  background-image: var(--bg-body-image);
  color: var(--text-primary);
}

.mechanic-shell {
  flex: 1;
  max-width: 1000px;
  width: 100%;
  padding: var(--space-lg) var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

.mechanic-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mechanic-badge {
  font-size: 0.75rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.mechanic-operator {
  margin-top: 4px;
  font-size: 1rem;
  font-weight: 500;
}

.mechanic-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-green);
  opacity: 0.25;
}

.status-dot-active {
  opacity: 1;
}

.mechanic-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-xl);
}

.mechanic-task-block {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: var(--space-lg);
  box-shadow: var(--shadow-card);
}

.mechanic-task-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.mechanic-task-timer {
  font-size: 1.5rem;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.mechanic-task-title {
  font-size: 1.4rem;
  font-weight: 600;
  margin: 0 0 var(--space-md);
  color: var(--text-primary);
}

.mechanic-task-progress-wrap {
  margin-bottom: var(--space-md);
}

.mechanic-task-progress-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.mechanic-task-progress-bar {
  height: 10px;
  border-radius: 999px;
  background: var(--chip-bg);
  overflow: hidden;
  margin-bottom: 6px;
}

.mechanic-task-progress-fill {
  height: 100%;
  background: var(--accent-green);
  border-radius: 999px;
  transition: width 0.3s ease;
}

.mechanic-task-progress-text {
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}

.mechanic-task-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
}

.mechanic-fields-header--in-task {
  margin: var(--space-md) 0 var(--space-xs);
}

.mechanic-fields-chips--in-task {
  margin-bottom: var(--space-md);
}

.mechanic-today-tasks {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: var(--space-md) var(--space-lg);
  box-shadow: var(--shadow-card);
}

.mechanic-today-tasks-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.mechanic-today-tasks-title {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
}

.mechanic-today-tasks-link {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--accent-green);
  text-decoration: none;
}

.mechanic-today-tasks-link:hover {
  text-decoration: underline;
}

.mechanic-today-tasks-loading {
  margin: 0;
  display: flex;
  justify-content: center;
  padding: 16px 0;
}

.mechanic-today-tasks-empty {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.mechanic-today-tasks-group {
  margin-bottom: 12px;
}

.mechanic-today-tasks-group:last-child {
  margin-bottom: 0;
}

.mechanic-today-tasks-group-title {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.mechanic-today-tasks-group-title--done {
  color: var(--text-secondary);
  opacity: 0.9;
}

.mechanic-today-tasks-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mechanic-today-task {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  font-size: 0.85rem;
  background: var(--bg-base);
}

.mechanic-today-task--done {
  background: var(--bg-panel);
  border-color: var(--border-color);
}

.mechanic-today-task-check {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--agro, #3d5c40);
  display: flex;
  align-items: center;
  justify-content: center;
}

.mechanic-today-task-check:disabled {
  opacity: 0.6;
  cursor: wait;
}

.mechanic-today-task-check-empty {
  width: 18px;
  height: 18px;
  border: 2px solid var(--border-color);
  border-radius: 4px;
  display: block;
}

.mechanic-today-task-check:hover .mechanic-today-task-check-empty {
  border-color: var(--agro, #3d5c40);
}

.mechanic-today-task-time {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
  min-width: 68px;
  font-size: 0.8rem;
}

.mechanic-today-task-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mechanic-today-task-priority {
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  background: rgba(61, 92, 64, 0.12);
  color: var(--agro, #3d5c40);
}

.mechanic-today-task-priority--high {
  background: rgba(220, 38, 38, 0.1);
  color: #b91c1c;
}

.mechanic-today-task-priority--low {
  background: rgba(59, 130, 246, 0.08);
  color: #1d4ed8;
}

.mechanic-today-task-priority--muted {
  opacity: 0.85;
}

.mechanic-today-task--done .mechanic-today-task-title {
  text-decoration: line-through;
  color: var(--text-secondary);
}

.mechanic-today-task--done .mechanic-today-task-time {
  color: var(--text-secondary);
  opacity: 0.85;
}

.btn-operation {
  padding: 12px 20px;
  border-radius: 10px;
  border: 1px solid transparent;
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.2s ease, opacity 0.2s ease;
}

.btn-operation:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-operation-downtime {
  background: transparent;
  border: 2px solid var(--warning-orange);
  color: var(--warning-orange);
}

[data-theme="dark"] .btn-operation-downtime {
  color: var(--warning-orange);
  border-color: var(--warning-orange);
}

.btn-operation-downtime:hover:not(:disabled) {
  background: rgba(194, 65, 12, 0.1);
  transform: translateY(-1px);
}

.btn-operation-start {
  background: var(--accent-green);
  border-color: var(--accent-green);
  color: #fff;
}

[data-theme="dark"] .btn-operation-start {
  color: var(--text-primary);
}

.btn-operation-start:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px -2px rgba(104, 173, 51, 0.4);
}

.btn-operation-stop {
  background: transparent;
  border-color: var(--danger-red);
  color: var(--danger-red);
}

.btn-operation-stop:hover {
  transform: translateY(-1px);
  background: rgba(211, 60, 60, 0.08);
}

.btn-operation-pause {
  background: transparent;
  border-color: var(--warning-orange);
  color: var(--warning-orange);
}

.btn-operation-pause:hover:not(:disabled) {
  transform: translateY(-1px);
  background: rgba(194, 65, 12, 0.1);
}

.btn-operation-resume {
  background: var(--accent-green);
  border-color: var(--accent-green);
  color: #fff;
}

.btn-operation-resume:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px -2px rgba(104, 173, 51, 0.4);
}

.mechanic-cards {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-md);
}

.mechanic-card {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  box-shadow: var(--shadow-card);
}

.mechanic-card-weather {
  background: var(--mechanic-weather-card-bg);
  border-color: var(--mechanic-weather-card-border);
}

.mechanic-card-weather .mechanic-card-title {
  color: var(--mechanic-weather-card-text);
}

.mechanic-card-weather :deep(.weather-widget-compact) {
  background: transparent;
  border-color: var(--mechanic-weather-card-border);
  margin-bottom: 0;
}

.mechanic-card-weather :deep(.weather-compact-city),
.mechanic-card-weather :deep(.weather-compact-temp) {
  color: var(--mechanic-weather-card-text);
}

.mechanic-card-weather :deep(.weather-compact-desc),
.mechanic-card-weather :deep(.weather-compact-feels),
.mechanic-card-weather :deep(.weather-compact-meta span) {
  color: var(--mechanic-weather-card-text-muted);
}

.mechanic-card-weather :deep(.type-action) {
  color: var(--accent-green);
}

.mechanic-card-weather :deep(.type-action:hover) {
  color: var(--accent-green-hover);
}

.mechanic-card-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary);
}

.mechanic-card-badge {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-secondary);
  padding: 4px 8px;
  background: var(--chip-bg);
  border-radius: 6px;
}

[data-theme="light"] .mechanic-card-badge {
  color: #374151;
  background: rgba(0, 0, 0, 0.08);
}

.mechanic-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-sm);
}

.mechanic-card-link {
  background: none;
  border: none;
  color: var(--accent-green);
  font-size: 0.8rem;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
}

[data-theme="light"] .mechanic-card-link {
  color: #1f402a;
  font-weight: 600;
}

.mechanic-equipment-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
}

.mechanic-equipment-label {
  color: var(--text-secondary);
}

.mechanic-equipment-value {
  font-weight: 600;
  color: var(--text-primary);
}

.mechanic-progress-bar {
  height: 8px;
  border-radius: 999px;
  background: var(--chip-bg);
  overflow: hidden;
}

.mechanic-progress-bar-green .mechanic-progress-fill {
  background: var(--accent-green);
}

.mechanic-progress-bar-yellow .mechanic-progress-fill {
  background: var(--warning-orange);
}

.mechanic-progress-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.3s ease;
}

.mechanic-equipment-ok {
  font-size: 0.8rem;
  color: var(--accent-green);
  font-weight: 600;
}

.mechanic-queue-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.mechanic-queue-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 12px;
  background: var(--chip-bg);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  color: var(--text-primary);
  font-size: 0.85rem;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.15s ease;
}

.mechanic-queue-item:hover {
  border-color: var(--accent-green);
  transform: translateY(-1px);
}

.mechanic-queue-name {
  font-weight: 600;
}

.mechanic-queue-op {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.mechanic-queue-add {
  margin-top: 4px;
  padding: 8px 0;
  background: none;
  border: none;
  color: var(--accent-green);
  font-size: 0.85rem;
  cursor: pointer;
  text-align: left;
}

[data-theme="light"] .mechanic-queue-add {
  color: #1f402a;
  font-weight: 600;
}

.mechanic-weather-permit {
  margin-top: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  background: var(--mechanic-weather-permit-bg);
  border-radius: 8px;
  font-size: 0.8rem;
  color: var(--mechanic-weather-card-text);
  display: flex;
  align-items: center;
  gap: 8px;
}

.mechanic-fields-compact {
  margin-top: 0;
}

.mechanic-fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.mechanic-fields-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-sm);
}

.mechanic-fields-hint {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.mechanic-fields-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.field-chip {
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--chip-bg);
  color: var(--text-secondary);
  font-size: 0.8rem;
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease,
    border-color 0.2s ease,
    transform 0.15s ease,
    box-shadow 0.2s ease;
}

.field-chip:hover {
  transform: translateY(-2px);
  border-color: var(--accent-green);
}

.field-chip-name {
  text-transform: uppercase;
  letter-spacing: 0.14em;
}

.field-chip-op {
  color: var(--text-secondary);
}

.field-chip-active .field-chip-op {
  color: inherit;
  opacity: 0.9;
}

.field-chip-active {
  border-color: var(--accent-green);
  background: var(--accent-green);
  color: #fff;
  transform: translateY(-2px);
  box-shadow: 0 2px 8px -2px rgba(104, 173, 51, 0.4);
}

[data-theme="dark"] .field-chip-active {
  color: #000;
}

.field-chip-add {
  border-style: dashed;
  opacity: 0.9;
  color: var(--accent-green);
}

[data-theme="light"] .field-chip-add {
  color: #1f402a;
  font-weight: 600;
}

.mechanic-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.btn-main,
.btn-stop {
  padding: 14px 18px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 0.95rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-weight: 600;
  cursor: pointer;
}

.btn-main {
  background: var(--accent-green);
  border-color: var(--accent-green);
  color: #000;
  transition: transform 0.15s ease, box-shadow 0.2s ease;
}

.btn-main:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px -2px rgba(104, 173, 51, 0.4);
}

.btn-stop {
  background: transparent;
  border-color: var(--danger-red);
  color: var(--danger-red);
  transition: transform 0.15s ease, background 0.2s ease;
}

.btn-stop:hover {
  transform: translateY(-1px);
  background: rgba(211, 60, 60, 0.08);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: var(--modal-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 40;
  animation: mechanicFadeIn 0.2s ease;
}

[data-theme='dark'] .modal-backdrop {
  background: rgba(0, 0, 0, 0.6);
}

.modal {
  width: min(100vw - 48px, 360px);
  background: var(--bg-panel);
  border-radius: 16px;
  border: 1px solid var(--border-color);
  padding: var(--space-lg);
  box-shadow: var(--shadow-card), 0 20px 40px rgba(0, 0, 0, 0.2);
  animation: mechanicModalIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

[data-theme='dark'] .modal {
  background: rgba(18, 32, 20, 0.98);
  border-color: rgba(255, 255, 255, 0.12);
}

@keyframes mechanicFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes mechanicModalIn {
  from { opacity: 0; transform: scale(0.96) translateY(-10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.modal-badge {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: var(--accent-green);
  margin-bottom: 6px;
}

.modal-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.modal-title {
  font-size: 1.15rem;
  font-weight: 500;
  margin-bottom: 8px;
}

.modal-close-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 1.1rem;
  line-height: 1;
  padding: 4px 6px;
  border-radius: 999px;
  cursor: pointer;
}

.modal-close-btn:hover {
  background: var(--chip-bg);
}

.modal-text {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin-bottom: var(--space-md);
  line-height: 1.45;
}

.modal-text--loading {
  display: flex;
  justify-content: center;
  padding: 12px 0 20px;
}

.modal-text-muted {
  margin-bottom: var(--space-sm);
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
}

.modal-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.modal-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--text-secondary);
}

.modal-field input {
  padding: 8px 10px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--chip-bg);
  color: var(--text-primary);
  font-size: 0.85rem;
}

.modal-field input::placeholder {
  color: var(--text-secondary);
}

.modal-textarea {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--chip-bg);
  color: var(--text-primary);
  font-size: 0.9rem;
  font-family: inherit;
  resize: vertical;
  min-height: 80px;
}

.modal-textarea::placeholder {
  color: var(--text-secondary);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
}

.modal-actions--two {
  justify-content: space-between;
}

.modal-actions--two .modal-btn,
.modal-actions--two .modal-btn-ghost {
  flex: 1;
  text-align: center;
}

.modal-select {
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--chip-bg);
  color: var(--text-primary);
  font-size: 0.9rem;
}

.modal-select:focus {
  outline: none;
  border-color: var(--accent-green);
}

.equipment-sliders {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  margin-bottom: var(--space-md);
}

.equipment-slider-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.equipment-slider-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.equipment-slider-label {
  font-size: 0.85rem;
  color: var(--text-secondary);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.equipment-slider-value {
  font-size: 0.9rem;
  font-weight: 800;
  color: var(--text-primary);
}

.equipment-condition-text {
  font-size: 0.9rem;
  font-weight: 650;
  color: var(--text-primary);
  margin-top: -6px;
}

.equipment-range {
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: var(--chip-bg);
  outline: none;
  -webkit-appearance: none;
}

.equipment-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent-green);
  border: 2px solid var(--bg-panel);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
  cursor: pointer;
}

.equipment-range::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent-green);
  border: 2px solid var(--bg-panel);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
  cursor: pointer;
}

.equipment-repair-notes {
  margin-top: var(--space-sm);
}

.modal-btn,
.modal-btn-ghost {
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  cursor: pointer;
}

.modal-btn {
  background: var(--accent-green);
  border-color: var(--accent-green);
  color: #fff;
}

.modal-btn-ghost {
  background: transparent;
  color: var(--text-secondary);
}

.sheet-backdrop {
  position: fixed;
  inset: 0;
  background: var(--modal-backdrop);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s ease;
  z-index: 20;
}

.sheet-backdrop-open {
  opacity: 1;
  pointer-events: auto;
}

.sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--bg-panel);
  border-top: 1px solid var(--border-color);
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  transform: translateY(100%);
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  padding: var(--space-md) var(--space-lg) calc(var(--space-lg) + env(safe-area-inset-bottom, 0));
  z-index: 30;
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.15);
}

.sheet-open {
  transform: translateY(0);
}

.sheet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-md);
}

.sheet-label {
  font-size: 0.75rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.sheet-title {
  margin-top: 4px;
  font-size: 1.1rem;
}

.sheet-close {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.sheet-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.sheet-item {
  border-bottom: 1px dashed var(--border-color);
}

.sheet-item:last-child {
  border-bottom: none;
}

.sheet-button {
  width: 100%;
  padding: 14px 0;
  text-align: left;
  background: transparent;
  border: none;
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: pointer;
}

.sheet-button-title {
  font-size: 1rem;
}

.sheet-button-desc {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.sheet-empty {
  padding: var(--space-md) var(--space-lg);
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

@media (max-width: 900px) {
  .mechanic-cards {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .mechanic-shell {
    padding: var(--space-md);
    gap: var(--space-lg);
  }

  .mechanic-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .mechanic-task-block {
    padding: var(--space-md);
  }

  .mechanic-task-title {
    font-size: 1.1rem;
  }

  .mechanic-task-actions {
    flex-direction: column;
  }

  .btn-operation {
    width: 100%;
    text-align: center;
  }

  .mechanic-today-tasks {
    padding: var(--space-md);
  }

  .mechanic-cards {
    grid-template-columns: 1fr;
  }

  .mechanic-fields-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .mechanic-fields-chips {
    gap: 8px;
  }

  .field-chip {
    width: 100%;
    justify-content: space-between;
  }
}

@media (max-width: 480px) {
  .mechanic-shell {
    padding: var(--space-md) var(--space-sm);
  }

  .mechanic-task-block {
    padding: var(--space-md);
  }

  .mechanic-task-timer {
    font-size: 1.3rem;
  }

  .mechanic-task-title {
    font-size: 1rem;
  }

  .mechanic-today-task {
    flex-wrap: wrap;
  }

  .mechanic-today-task-time {
    min-width: 56px;
  }

  .mechanic-card {
    padding: var(--space-sm) var(--space-md);
  }

  .mechanic-fields-chips {
    flex-direction: column;
  }

  .field-chip {
    border-radius: 10px;
  }

  .modal {
    width: min(100vw - 32px, 360px);
    padding: var(--space-md);
  }

  .modal-actions {
    flex-direction: column;
  }

  .modal-btn,
  .modal-btn-ghost {
    width: 100%;
    justify-content: center;
  }
}

@media (min-width: 768px) {
  .mechanic-shell {
    padding-inline: var(--space-xl);
  }
}
</style>

