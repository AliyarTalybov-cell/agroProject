<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import ModalCloseButton from '@/components/ModalCloseButton.vue'
import {
  executeStorageWriteoff,
  loadStorageWriteoffBatchOptions,
  type StorageWriteoffBatchOption,
  type StorageWriteoffType,
} from '@/lib/storageWriteoffsSupabase'

const props = defineProps<{
  open: boolean
  storageLocationId?: string | null
  storageName?: string | null
}>()

const emit = defineEmits<{
  close: []
  success: []
}>()

const loading = ref(false)
const saving = ref(false)
const formError = ref<string | null>(null)

const batchSearch = ref('')
const selectedBatchId = ref('')
const writeoffType = ref<StorageWriteoffType>('sale')
const massTons = ref('')
const operationDate = ref('')
const counterparty = ref('')
const comment = ref('')
const batchOptions = ref<StorageWriteoffBatchOption[]>([])

function nowDateLocal(): string {
  const d = new Date()
  const two = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
}

function parseDecimal(value: string): number | null {
  const n = Number(value.replace(',', '.').trim())
  if (!Number.isFinite(n)) return null
  return n
}

const massNum = computed(() => parseDecimal(massTons.value))

const filteredBatchOptions = computed(() => {
  const q = batchSearch.value.trim().toLowerCase()
  if (!q) return batchOptions.value
  return batchOptions.value.filter((x) =>
    `${x.code} ${x.cropLabel}`.toLowerCase().includes(q),
  )
})

const hasBatchOptions = computed(() => batchOptions.value.length > 0)

const selectedBatch = computed(() => batchOptions.value.find((x) => x.id === selectedBatchId.value) ?? null)

const maxMass = computed(() => Number(selectedBatch.value?.massTons || 0))

const massExceedsBatch = computed(() => {
  const m = massNum.value
  if (m == null || m <= 0) return false
  return m > maxMass.value + 0.0001
})

const canSubmit = computed(() => {
  if (!props.storageLocationId) return false
  if (!selectedBatchId.value) return false
  if (!operationDate.value) return false
  if (writeoffType.value === 'sale' && !counterparty.value.trim()) return false
  const m = massNum.value
  if (m == null || m <= 0) return false
  if (massExceedsBatch.value) return false
  return true
})

const massErrorText = computed(() => {
  if (!massExceedsBatch.value) return ''
  return `Масса не может превышать остаток партии (${formatMass(maxMass.value)} т)`
})

const selectedTypeLabel = computed(
  () => typeOptions.find((x) => x.value === writeoffType.value)?.label || 'Списание',
)

const remainingAfterWriteoff = computed(() => {
  const m = massNum.value
  if (m == null || m <= 0 || !selectedBatch.value) return selectedBatch.value?.massTons || 0
  return Math.max(0, Number((selectedBatch.value.massTons - m).toFixed(3)))
})

function resetForm() {
  batchSearch.value = ''
  selectedBatchId.value = ''
  writeoffType.value = 'sale'
  massTons.value = ''
  operationDate.value = nowDateLocal()
  counterparty.value = ''
  comment.value = ''
  formError.value = null
  batchOptions.value = []
}

async function loadBatches() {
  if (!props.storageLocationId) return
  loading.value = true
  formError.value = null
  try {
    batchOptions.value = await loadStorageWriteoffBatchOptions(props.storageLocationId)
  } catch (e) {
    formError.value = e instanceof Error && e.message ? e.message : 'Не удалось загрузить партии'
  } finally {
    loading.value = false
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      resetForm()
      document.body.style.overflow = 'hidden'
      void loadBatches()
    } else {
      document.body.style.overflow = ''
    }
  },
)

watch(writeoffType, (v) => {
  if (v !== 'sale') counterparty.value = ''
})

onUnmounted(() => {
  document.body.style.overflow = ''
})

function close() {
  if (saving.value) return
  emit('close')
}

async function submit() {
  if (!canSubmit.value || !props.storageLocationId) return
  const m = massNum.value
  if (m == null) return
  saving.value = true
  formError.value = null
  try {
    await executeStorageWriteoff({
      storageLocationId: props.storageLocationId,
      batchId: selectedBatchId.value,
      writeoffType: writeoffType.value,
      massTons: m,
      operationDate: operationDate.value,
      counterparty: counterparty.value,
      comment: comment.value,
    })
    emit('success')
    emit('close')
  } catch (e) {
    formError.value = e instanceof Error && e.message ? e.message : 'Не удалось провести списание'
  } finally {
    saving.value = false
  }
}

function formatMass(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 3 })
}

const typeOptions: Array<{ value: StorageWriteoffType; label: string }> = [
  { value: 'sale', label: 'Реализация' },
  { value: 'processing', label: 'Переработка' },
  { value: 'spoilage', label: 'Порча' },
  { value: 'feed', label: 'Корма' },
]
</script>

<template>
  <teleport to="body">
    <div
      v-if="open"
      class="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="warehouse-writeoff-title"
      @click.self="close"
    >
      <div class="modal warehouse-writeoff-modal" @click.stop>
        <header class="modal-header">
          <h2 id="warehouse-writeoff-title" class="modal-title">
            Списание зерна
            <span v-if="storageName" class="warehouse-writeoff-subtitle">· {{ storageName }}</span>
          </h2>
          <ModalCloseButton :disabled="saving" @click="close" />
        </header>

        <div class="modal-body warehouse-writeoff-body">
          <p v-if="formError" class="warehouse-writeoff-error" role="alert">{{ formError }}</p>

          <div class="warehouse-writeoff-grid">
            <label class="warehouse-writeoff-field warehouse-writeoff-field--full">
              <span class="warehouse-writeoff-label">Партия (поиск по реестру)</span>
              <input
                v-model.trim="batchSearch"
                type="text"
                class="warehouse-writeoff-input"
                :disabled="saving || loading"
                placeholder="Введите номер партии или название культуры..."
              />
              <select
                v-model="selectedBatchId"
                class="warehouse-writeoff-input"
                :disabled="saving || loading || !hasBatchOptions"
              >
                <option value="">{{ hasBatchOptions ? 'Выберите партию' : 'Нет доступных партий' }}</option>
                <option v-for="b in filteredBatchOptions" :key="b.id" :value="b.id">
                  {{ b.code }} · {{ b.cropLabel }} · {{ formatMass(b.massTons) }} т
                </option>
                <option
                  v-if="hasBatchOptions && batchSearch.trim() && !filteredBatchOptions.length"
                  value=""
                  disabled
                >
                  Ничего не найдено по поиску
                </option>
              </select>
              <span v-if="selectedBatch" class="warehouse-writeoff-hint">
                Остаток в партии: <strong>{{ formatMass(selectedBatch.massTons) }} т</strong>
              </span>
              <span v-else-if="!loading && !hasBatchOptions" class="warehouse-writeoff-field-error">
                Для списания нужна партия с остатком больше 0 т.
              </span>
            </label>

            <div class="warehouse-writeoff-field warehouse-writeoff-field--full">
              <span class="warehouse-writeoff-label">Тип списания</span>
              <div class="warehouse-writeoff-types">
                <label
                  v-for="opt in typeOptions"
                  :key="opt.value"
                  class="warehouse-writeoff-type"
                  :class="{ 'warehouse-writeoff-type--active': writeoffType === opt.value }"
                >
                  <input v-model="writeoffType" type="radio" :value="opt.value" :disabled="saving" />
                  <span>{{ opt.label }}</span>
                </label>
              </div>
            </div>

            <label class="warehouse-writeoff-field">
              <span class="warehouse-writeoff-label">Масса для списания (т)</span>
              <input
                v-model="massTons"
                type="text"
                inputmode="decimal"
                class="warehouse-writeoff-input"
                :class="{ 'warehouse-writeoff-input--invalid': massExceedsBatch }"
                :disabled="saving || !selectedBatchId"
                placeholder="0.00"
              />
              <span v-if="massErrorText" class="warehouse-writeoff-field-error">{{ massErrorText }}</span>
            </label>

            <label class="warehouse-writeoff-field">
              <span class="warehouse-writeoff-label">Дата операции</span>
              <input v-model="operationDate" type="date" class="warehouse-writeoff-input" :disabled="saving" />
            </label>

            <label v-if="writeoffType === 'sale'" class="warehouse-writeoff-field warehouse-writeoff-field--full">
              <span class="warehouse-writeoff-label">Контрагент</span>
              <input
                v-model.trim="counterparty"
                type="text"
                class="warehouse-writeoff-input"
                :disabled="saving"
                placeholder="Название контрагента"
              />
            </label>

            <label class="warehouse-writeoff-field warehouse-writeoff-field--full">
              <span class="warehouse-writeoff-label">Комментарий</span>
              <textarea
                v-model.trim="comment"
                class="warehouse-writeoff-textarea"
                rows="3"
                :disabled="saving"
                placeholder="Необязательно"
              />
            </label>
          </div>

          <div
            v-if="selectedBatch && massNum && massNum > 0 && massExceedsBatch"
            class="warehouse-writeoff-warn"
            role="alert"
          >
            <svg class="warehouse-writeoff-warn-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
            <p class="warehouse-writeoff-warn-text">
              Сократите массу до <strong>{{ formatMass(maxMass) }} т</strong> или меньше, чтобы провести списание.
            </p>
          </div>

          <div
            v-else-if="selectedBatch && massNum && massNum > 0"
            class="warehouse-writeoff-info"
            role="status"
          >
            <svg class="warehouse-writeoff-info-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            <p class="warehouse-writeoff-info-text">
              Будет выполнено <strong>{{ selectedTypeLabel.toLowerCase() }}</strong>: из партии
              <strong>{{ selectedBatch.code }}</strong> списывается <strong>{{ formatMass(massNum) }} т</strong>,
              остаток после операции — <strong>{{ formatMass(remainingAfterWriteoff) }} т</strong>.
              <template v-if="writeoffType === 'sale' && counterparty.trim()">
                Контрагент: <strong>{{ counterparty.trim() }}</strong>.
              </template>
            </p>
          </div>
        </div>

        <footer class="modal-actions warehouse-writeoff-actions">
          <button type="button" class="task-form-cancel" :disabled="saving" @click="close">Отмена</button>
          <button type="button" class="task-form-submit" :disabled="saving || !canSubmit" @click="submit">
            {{ saving ? 'Проведение…' : 'Списать' }}
          </button>
        </footer>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--modal-backdrop);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.warehouse-writeoff-modal {
  width: min(940px, 96vw);
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  border-radius: 16px;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  box-shadow: var(--shadow-card);
}

.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.modal-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-primary);
}

.warehouse-writeoff-subtitle {
  font-size: 0.95rem;
  color: var(--text-secondary);
  font-weight: 600;
}

.warehouse-writeoff-body {
  padding: 16px 20px;
  overflow: auto;
}

.warehouse-writeoff-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px 16px;
}

.warehouse-writeoff-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.warehouse-writeoff-field--full {
  grid-column: 1 / -1;
}

.warehouse-writeoff-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.warehouse-writeoff-input,
.warehouse-writeoff-textarea {
  width: 100%;
  border: 1px solid var(--toolbar-form-surface-border);
  border-radius: 10px;
  background: var(--toolbar-form-surface);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.9375rem;
  padding: 10px 12px;
}

.warehouse-writeoff-input {
  height: 44px;
}

.warehouse-writeoff-input:focus,
.warehouse-writeoff-textarea:focus {
  outline: none;
  border-color: var(--accent-green);
  box-shadow: 0 0 0 2px var(--focus-ring);
}

.warehouse-writeoff-textarea {
  min-height: 88px;
  resize: vertical;
}

.warehouse-writeoff-types {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.warehouse-writeoff-type {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  border: 1px solid var(--toolbar-form-surface-border);
  border-radius: 10px;
  background: var(--toolbar-form-surface);
  color: var(--text-primary);
  font-weight: 600;
}

.warehouse-writeoff-type--active {
  border-color: color-mix(in srgb, var(--accent-green) 58%, var(--border-color));
  background: color-mix(in srgb, var(--accent-green) 10%, var(--toolbar-form-surface));
}

.warehouse-writeoff-hint {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.warehouse-writeoff-hint strong {
  color: var(--accent-green);
}

.warehouse-writeoff-input--invalid {
  border-color: var(--danger-red) !important;
  background: color-mix(in srgb, var(--danger-red) 6%, var(--toolbar-form-surface)) !important;
}

.warehouse-writeoff-field-error {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.35;
  color: var(--danger-red);
}

.warehouse-writeoff-error {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--danger-red) 35%, transparent);
  background: color-mix(in srgb, var(--danger-red) 10%, transparent);
  color: var(--danger-red);
  font-size: 0.875rem;
}

.warehouse-writeoff-warn {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--danger-red) 35%, transparent);
  background: color-mix(in srgb, var(--danger-red) 10%, transparent);
}

.warehouse-writeoff-warn-icon {
  flex-shrink: 0;
  color: var(--danger-red);
  margin-top: 1px;
}

.warehouse-writeoff-warn-text {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.45;
  color: var(--text-primary);
}

.warehouse-writeoff-info {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, #3b82f6 28%, transparent);
  background: color-mix(in srgb, #3b82f6 10%, transparent);
}

.warehouse-writeoff-info-icon {
  flex-shrink: 0;
  color: #2563eb;
  margin-top: 1px;
}

.warehouse-writeoff-info-text {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.45;
  color: var(--text-primary);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.warehouse-writeoff-actions {
  padding: 14px 20px;
  border-top: 1px solid var(--border-color);
}

.task-form-cancel,
.task-form-submit {
  height: 40px;
  padding: 0 16px;
  border-radius: 10px;
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid var(--border-color);
}

.task-form-cancel {
  background: var(--bg-panel);
  color: var(--text-primary);
}

.task-form-cancel:hover:not(:disabled) {
  background: var(--bg-panel-hover);
}

.task-form-submit {
  border-color: var(--accent-green);
  background: var(--accent-green);
  color: #fff;
}

.task-form-submit:hover:not(:disabled) {
  background: var(--accent-green-hover);
}

.task-form-cancel:disabled,
.task-form-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 860px) {
  .warehouse-writeoff-types {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 640px) {
  .warehouse-writeoff-grid {
    grid-template-columns: 1fr;
  }
}
</style>
