<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import type { ActiveDowntime, DowntimeCategory } from '@/lib/downtimeStorage'
import { appendEvent, loadActive, saveActive } from '@/lib/downtimeStorage'
import {
  appendOperation,
  loadActiveOperation,
  saveActiveOperation,
} from '@/lib/operationStorage'
import WeatherWidgetCompact from '@/components/WeatherWidgetCompact.vue'

const EMPLOYEE_NAME = 'Механизатор #1'

const timerTick = ref(0)
let timerInterval: ReturnType<typeof setInterval> | null = null

/** Время начала работы (операции). Когда задано — крутится счётчик. Сбрасывается при начале простоя. */
const workStartedAt = ref<string | null>(null)

onMounted(() => {
  const savedOp = loadActiveOperation()
  if (savedOp && !active.value) {
    workStartedAt.value = savedOp.startISO
    if (savedOp.fieldId) currentFieldId.value = savedOp.fieldId
  }
  timerInterval = setInterval(() => {
    if (active.value || workStartedAt.value) timerTick.value += 1
  }, 1000)
})
onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval)
})

const timerStartISO = computed(() => {
  if (active.value) return active.value.startISO
  if (workStartedAt.value) return workStartedAt.value
  return null
})

const elapsedSeconds = computed(() => {
  if (!timerStartISO.value) return 0
  const start = new Date(timerStartISO.value).getTime()
  return Math.floor((Date.now() - start) / 1000) + timerTick.value
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
const isReasonsOpen = ref(false)
const isOperationsOpen = ref(false)
const isStartedModalOpen = ref(false)
const isFinishedModalOpen = ref(false)
const isAddFieldOpen = ref(false)

const newFieldName = ref('')
const newFieldOperation = ref('')

const fields = ref<MechanicField[]>([
  { id: 'field-5', name: 'Поле #5', operation: 'Пахота' },
  { id: 'field-12', name: 'Поле #12', operation: 'Посев' },
  { id: 'field-3', name: 'Поле #3', operation: 'Опрыскивание' },
  { id: 'field-8', name: 'Поле #8', operation: 'Уборка' },
])

const currentFieldId = ref<string | null>(active.value?.fieldId ?? fields.value[0]?.id ?? null)

const reasons: Array<{ label: string; description: string; category: DowntimeCategory }> = [
  { label: 'Поломка техники', description: 'Неисправность, требующая остановки работы', category: 'breakdown' },
  { label: 'Дождь / погода', description: 'Осадки или условия, не позволяющие работать', category: 'rain' },
  { label: 'Нет топлива', description: 'Ожидание заправки или подвоза ГСМ', category: 'fuel' },
  { label: 'Ожидание задания', description: 'Нет подтверждённого задания от агронома', category: 'waiting' },
]

const currentField = computed<MechanicField | null>(() => {
  if (active.value?.fieldId) {
    const fromActive = fields.value.find((f) => f.id === active.value?.fieldId)
    if (fromActive) return fromActive
  }
  return fields.value.find((f) => f.id === currentFieldId.value) ?? null
})

const statusText = computed(() => {
  if (!active.value) return 'Работаем'
  const reason = reasons.find((r) => r.category === active.value?.category)
  return `Простой • ${reason?.label ?? active.value.reason}`
})

const circleFieldLabel = computed(() => active.value?.fieldName ?? currentField.value?.name ?? 'Поле не выбрано')
const circleTaskLabel = computed(
  () => active.value?.operation ?? currentField.value?.operation ?? 'Операция не указана',
)

const taskTitle = computed(() => `${circleFieldLabel.value} — ${circleTaskLabel.value}`)
const progressPercent = 65
const progressDone = 32
const progressTotal = 50

const equipmentStatus = { fuelPercent: 45, engineTemp: 85, engineOk: true, operatingHours: 1240 }
const queueTasks = computed(() => {
  const list = fields.value.filter((f) => f.id !== currentField.value?.id).slice(0, 4)
  const areas = [120, 85, 200, 60]
  return list.map((f, i) => ({ id: f.id, name: f.name, operation: f.operation, area: areas[i] ?? 0 }))
})

function startDowntime(reason: { label: string; category: DowntimeCategory }) {
  workStartedAt.value = null
  const now = new Date()
  const field = currentField.value
  active.value = {
    id: now.getTime(),
    employee: EMPLOYEE_NAME,
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
}

function stopDowntime() {
  if (!active.value) return
  const now = new Date()
  const start = new Date(active.value.startISO)
  const durationMinutes = Math.max(1, Math.round((now.getTime() - start.getTime()) / 60000))

  appendEvent({
    id: active.value.id,
    employee: active.value.employee,
    reason: active.value.reason,
    category: active.value.category,
    startISO: active.value.startISO,
    endISO: now.toISOString(),
    durationMinutes,
  })

  active.value = null
  saveActive(null)
  isFinishedModalOpen.value = true
}

function setCurrentField(id: string) {
  if (active.value?.fieldId && active.value.fieldId === id) return
  currentFieldId.value = id
}

function startOperation(field: MechanicField) {
  setCurrentField(field.id)
  const startISO = new Date().toISOString()
  workStartedAt.value = startISO
  saveActiveOperation({
    startISO,
    fieldId: field.id,
    fieldName: field.name,
    operation: field.operation,
    employee: EMPLOYEE_NAME,
  })
  isOperationsOpen.value = false
}

function stopOperation() {
  if (!workStartedAt.value) return
  const now = new Date()
  const start = new Date(workStartedAt.value)
  const durationMinutes = Math.max(1, Math.round((now.getTime() - start.getTime()) / 60000))
  const field = currentField.value
  appendOperation({
    id: now.getTime(),
    employee: EMPLOYEE_NAME,
    fieldId: field?.id,
    fieldName: field?.name,
    operation: field?.operation,
    startISO: workStartedAt.value,
    endISO: now.toISOString(),
    durationMinutes,
  })
  saveActiveOperation(null)
  workStartedAt.value = null
}

function openAddField() {
  newFieldName.value = ''
  newFieldOperation.value = ''
  isAddFieldOpen.value = true
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
          <div class="mechanic-operator">{{ EMPLOYEE_NAME }}</div>
        </div>
        <div class="mechanic-status">
          <span class="status-dot" :class="{ 'status-dot-active': !!active }" />
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
                :disabled="!fields.length"
                @click="isOperationsOpen = true"
              >
                Начать операцию
              </button>
            </template>
            <button
              v-if="!active && workStartedAt"
              class="btn-operation btn-operation-stop"
              type="button"
              @click="stopOperation"
            >
              Остановить операцию
            </button>
            <button
              v-if="active"
              class="btn-operation btn-operation-stop"
              type="button"
              @click="stopDowntime"
            >
              Завершить простой
            </button>
          </div>
        </section>

        <section class="mechanic-cards page-enter-item" style="--enter-delay: 120ms">
          <div class="mechanic-card mechanic-card-equipment">
            <div class="mechanic-card-header">
              <div class="mechanic-card-title">Статус техники (John Deere 8R)</div>
              <span class="mechanic-card-badge">Тестовые данные</span>
            </div>
            <div class="mechanic-equipment-row">
              <span class="mechanic-equipment-label">Топливо</span>
              <span class="mechanic-equipment-value">{{ equipmentStatus.fuelPercent }}%</span>
            </div>
            <div class="mechanic-progress-bar mechanic-progress-bar-yellow">
              <div class="mechanic-progress-fill" :style="{ width: equipmentStatus.fuelPercent + '%' }" />
            </div>
            <div class="mechanic-equipment-row">
              <span class="mechanic-equipment-label">Температура ДВС</span>
              <span class="mechanic-equipment-value">{{ equipmentStatus.engineTemp }}°C</span>
            </div>
            <div class="mechanic-progress-bar mechanic-progress-bar-green">
              <div class="mechanic-progress-fill" :style="{ width: 85 + '%' }" />
            </div>
            <div class="mechanic-equipment-ok" v-if="equipmentStatus.engineOk">В норме</div>
            <div class="mechanic-equipment-row">
              <span class="mechanic-equipment-label">Наработка (моточасы)</span>
              <span class="mechanic-equipment-value">{{ equipmentStatus.operatingHours }} ч</span>
            </div>
          </div>

          <div class="mechanic-card mechanic-card-queue">
            <div class="mechanic-card-header">
              <div class="mechanic-card-title">Очередь задач</div>
              <button type="button" class="mechanic-card-link">Все поля</button>
            </div>
            <div class="mechanic-queue-list">
              <button
                v-for="t in queueTasks"
                :key="t.id"
                class="mechanic-queue-item"
                type="button"
                @click="setCurrentField(t.id)"
              >
                <span class="mechanic-queue-name">{{ t.name }}</span>
                <span class="mechanic-queue-op">{{ t.operation }} · {{ t.area }} Га</span>
              </button>
            </div>
            <button class="mechanic-queue-add" type="button" @click="openAddField">+ Добавить поле</button>
          </div>

          <div class="mechanic-card mechanic-card-weather">
            <div class="mechanic-card-title">Метеоусловия</div>
            <WeatherWidgetCompact />
            <div class="mechanic-weather-permit">
              Погодные условия оптимальны для пахоты. Влажность почвы в норме.
            </div>
          </div>
        </section>

        <section class="mechanic-fields mechanic-fields-compact page-enter-item" style="--enter-delay: 180ms">
          <div class="mechanic-fields-header">
            <div class="type-label">Мои поля сегодня</div>
            <div class="mechanic-fields-hint">Выберите, с каким полем вы сейчас работаете</div>
          </div>
          <div class="mechanic-fields-chips">
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
          v-for="field in fields"
          :key="field.id"
          class="sheet-item"
        >
          <button
            class="sheet-button"
            type="button"
            @click="startOperation(field)"
          >
            <span class="sheet-button-title">{{ field.name }} — {{ field.operation }}</span>
            <span class="sheet-button-desc">Начать работу по этому полю</span>
          </button>
        </li>
      </ul>
      <p v-if="!fields.length" class="sheet-empty">Добавьте поля в блоке «Мои поля сегодня», чтобы начать операцию.</p>
    </aside>

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
      v-if="isFinishedModalOpen"
      class="modal-backdrop"
      @click="isFinishedModalOpen = false"
    >
      <div class="modal" @click.stop>
        <div class="modal-badge">Агро-Контроль</div>
        <div class="modal-title">Простой завершён</div>
        <p class="modal-text">
          Запись сохранена. Простой отображается в разделе «Отчёты» и в журнале работ.
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

.mechanic-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
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

.modal {
  width: min(100vw - 48px, 360px);
  background: var(--bg-panel);
  border-radius: 16px;
  border: 1px solid var(--border-color);
  padding: var(--space-lg);
  box-shadow: var(--shadow-card), 0 20px 40px rgba(0, 0, 0, 0.2);
  animation: mechanicModalIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
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

.modal-title {
  font-size: 1.15rem;
  font-weight: 500;
  margin-bottom: 8px;
}

.modal-text {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin-bottom: var(--space-md);
  line-height: 1.45;
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

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
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
  color: #000;
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

@media (min-width: 768px) {
  .mechanic-shell {
    padding-inline: var(--space-xl);
  }
}
</style>

