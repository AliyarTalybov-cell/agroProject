<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ActiveDowntime, DowntimeCategory } from '@/lib/downtimeStorage'
import { appendEvent, loadActive, saveActive } from '@/lib/downtimeStorage'

const EMPLOYEE_NAME = 'Механизатор #1'

type MechanicField = {
  id: string
  name: string
  operation: string
}

const active = ref<ActiveDowntime | null>(loadActive())
const isReasonsOpen = ref(false)

const fields: MechanicField[] = [
  { id: 'field-5', name: 'Поле #5', operation: 'Пахота' },
  { id: 'field-12', name: 'Поле #12', operation: 'Посев' },
  { id: 'field-3', name: 'Поле #3', operation: 'Опрыскивание' },
  { id: 'field-8', name: 'Поле #8', operation: 'Уборка' },
]

const currentFieldId = ref<string | null>(active.value?.fieldId ?? fields[0]?.id ?? null)

const reasons: Array<{ label: string; description: string; category: DowntimeCategory }> = [
  { label: 'Поломка техники', description: 'Неисправность, требующая остановки работы', category: 'breakdown' },
  { label: 'Дождь / погода', description: 'Осадки или условия, не позволяющие работать', category: 'rain' },
  { label: 'Нет топлива', description: 'Ожидание заправки или подвоза ГСМ', category: 'fuel' },
  { label: 'Ожидание задания', description: 'Нет подтверждённого задания от агронома', category: 'waiting' },
]

const currentField = computed<MechanicField | null>(() => {
  if (active.value?.fieldId) {
    const fromActive = fields.find((f) => f.id === active.value?.fieldId)
    if (fromActive) return fromActive
  }
  return fields.find((f) => f.id === currentFieldId.value) ?? null
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

function startDowntime(reason: { label: string; category: DowntimeCategory }) {
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
}

function setCurrentField(id: string) {
  if (active.value?.fieldId && active.value.fieldId === id) return
  currentFieldId.value = id
}
</script>

<template>
  <section class="mechanic-page">
    <div class="mechanic-shell">
      <header class="mechanic-header">
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
        <div class="mechanic-circle">
          <div class="circle-meta">Текущая операция</div>
          <div class="circle-field">
            {{ circleFieldLabel }}
          </div>
          <div class="circle-task">
            {{ circleTaskLabel }}
          </div>
        </div>

        <section class="mechanic-fields">
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
          </div>
        </section>
      </main>

      <footer class="mechanic-actions">
        <button
          v-if="!active"
          class="btn-main"
          type="button"
          @click="isReasonsOpen = true"
        >
          Начать простой
        </button>
        <button
          v-else
          class="btn-stop"
          type="button"
          @click="stopDowntime"
        >
          Завершить простой
        </button>
      </footer>
    </div>

    <div
      class="sheet-backdrop"
      :class="{ 'sheet-backdrop-open': isReasonsOpen }"
      @click="isReasonsOpen = false"
    />
    <aside class="sheet" :class="{ 'sheet-open': isReasonsOpen }">
      <header class="sheet-header">
        <div>
          <div class="sheet-label">Причина</div>
          <div class="sheet-title">Выберите причину простоя</div>
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
  </section>
</template>

<style scoped>
.mechanic-page {
  min-height: 100vh;
  display: flex;
  align-items: stretch;
  justify-content: center;
  background: radial-gradient(circle at 50% 0, #162611 0, transparent 70%), #050a04;
  color: var(--text-primary);
}

.mechanic-shell {
  flex: 1;
  max-width: 480px;
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
  justify-content: center;
  gap: var(--space-xl);
}

.mechanic-circle {
  width: min(70vw, 320px);
  height: min(70vw, 320px);
  border-radius: 50%;
  border: 1px solid var(--border-color);
  background: radial-gradient(circle at 30% 0, rgba(104, 173, 51, 0.16), transparent 60%),
    rgba(20, 35, 15, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.circle-meta {
  font-size: 0.85rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.2em;
}

.circle-field {
  font-size: 2.4rem;
  font-weight: 600;
  letter-spacing: 0.06em;
}

.circle-task {
  font-size: 1.1rem;
  color: var(--text-secondary);
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
  background: rgba(0, 0, 0, 0.2);
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
    transform 0.1s ease;
}

.field-chip-name {
  text-transform: uppercase;
  letter-spacing: 0.14em;
}

.field-chip-op {
  color: var(--text-secondary);
}

.field-chip-active {
  border-color: var(--accent-green);
  background: rgba(104, 173, 51, 0.18);
  color: var(--text-primary);
  transform: translateY(-1px);
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
}

.btn-stop {
  background: transparent;
  border-color: var(--danger-red);
  color: var(--danger-red);
}

.sheet-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
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
  background: rgba(20, 35, 15, 0.98);
  border-top: 1px solid var(--border-color);
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  transform: translateY(100%);
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  padding: var(--space-md) var(--space-lg) calc(var(--space-lg) + env(safe-area-inset-bottom, 0));
  z-index: 30;
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
  border-bottom: 1px dashed rgba(255, 255, 255, 0.14);
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

@media (min-width: 768px) {
  .mechanic-shell {
    padding-inline: var(--space-xl);
  }
}
</style>

