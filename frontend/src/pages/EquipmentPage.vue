<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import {
  isSupabaseConfigured,
  loadEquipment,
  insertEquipment,
  updateEquipment,
  deleteEquipment,
  type EquipmentRow,
  type EquipmentCondition,
} from '@/lib/equipmentSupabase'
import { loadProfiles, type ProfileRow } from '@/lib/tasksSupabase'

const EQUIPMENT_TYPES = [
  { value: '', label: 'Выберите тип' },
  { value: 'tractor', label: 'Трактор' },
  { value: 'combine', label: 'Комбайн' },
  { value: 'sprayer', label: 'Опрыскиватель' },
  { value: 'other', label: 'Другое' },
]

const CONDITION_OPTIONS: { value: EquipmentCondition; label: string }[] = [
  { value: 'operational', label: 'Исправна' },
  { value: 'repair', label: 'В ремонте' },
  { value: 'decommissioned', label: 'Выведена' },
]

const PAGE_SIZE = 6

const list = ref<EquipmentRow[]>([])
const loading = ref(true)
const saving = ref(false)
const searchQuery = ref('')
const currentPage = ref(1)
const editingId = ref<string | null>(null)
const profiles = ref<ProfileRow[]>([])

const form = ref({
  brand: '',
  license_plate: '',
  model: '',
  equipment_type: '',
  year: null as number | null,
  purpose_crop: '',
  condition: 'operational' as EquipmentCondition,
  responsible_id: '' as string | null,
  notes: '',
})

async function fetchList() {
  if (!isSupabaseConfigured()) {
    list.value = []
    profiles.value = []
    loading.value = false
    return
  }
  loading.value = true
  try {
    const [rows, profileRows] = await Promise.all([loadEquipment(), loadProfiles()])
    list.value = rows
    profiles.value = profileRows
  } catch {
    list.value = []
    profiles.value = []
  } finally {
    loading.value = false
  }
}

onMounted(fetchList)

const filteredList = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return list.value
  return list.value.filter(
    (r) =>
      r.brand.toLowerCase().includes(q) ||
      r.license_plate.toLowerCase().includes(q) ||
      (r.model?.toLowerCase().includes(q) ?? false) ||
      (r.equipment_type?.toLowerCase().includes(q) ?? false),
  )
})

const totalCount = computed(() => filteredList.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / PAGE_SIZE)))

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

const paginatedList = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return filteredList.value.slice(start, start + PAGE_SIZE)
})

const responsibleOptions = computed(() =>
  profiles.value.map((p) => ({
    id: p.id,
    label: p.display_name?.trim() || p.email,
  })),
)

function responsibleLabel(id: string | null): string {
  if (!id) return 'Не назначен'
  const p = profiles.value.find((x) => x.id === id)
  return p?.display_name?.trim() || p?.email || 'Неизвестно'
}

const paginationStart = computed(() => (currentPage.value - 1) * PAGE_SIZE + 1)
const paginationEnd = computed(() =>
  Math.min(currentPage.value * PAGE_SIZE, totalCount.value),
)

function equipmentTypeLabel(value: string | null): string {
  if (!value) return '—'
  const opt = EQUIPMENT_TYPES.find((o) => o.value === value)
  return opt?.label ?? value
}

function conditionLabel(c: EquipmentCondition): string {
  return CONDITION_OPTIONS.find((o) => o.value === c)?.label ?? c
}

function conditionClass(c: EquipmentCondition): string {
  return c === 'operational' ? 'equipment-condition-ok' : c === 'repair' ? 'equipment-condition-repair' : 'equipment-condition-out'
}

function clearForm() {
  form.value = {
    brand: '',
    license_plate: '',
    model: '',
    equipment_type: '',
    year: null,
    purpose_crop: '',
    condition: 'operational',
    responsible_id: '',
    notes: '',
  }
  editingId.value = null
}

function startEdit(row: EquipmentRow) {
  editingId.value = row.id
  form.value = {
    brand: row.brand,
    license_plate: row.license_plate,
    model: row.model ?? '',
    equipment_type: row.equipment_type ?? '',
    year: row.year,
    purpose_crop: row.purpose_crop ?? '',
    condition: row.condition,
    responsible_id: row.responsible_id ?? '',
    notes: row.notes ?? '',
  }
}

async function saveEquipment() {
  const brand = form.value.brand.trim()
  const license_plate = form.value.license_plate.trim()
  if (!brand || !license_plate) return
  if (!isSupabaseConfigured()) return
  saving.value = true
  try {
    if (editingId.value) {
      await updateEquipment(editingId.value, {
        brand,
        license_plate,
        model: form.value.model.trim() || null,
        equipment_type: form.value.equipment_type || null,
        year: form.value.year ?? null,
        purpose_crop: form.value.purpose_crop.trim() || null,
        condition: form.value.condition,
        responsible_id: form.value.responsible_id || null,
        notes: form.value.notes.trim() || null,
      })
    } else {
      await insertEquipment({
        brand,
        license_plate,
        model: form.value.model.trim() || null,
        equipment_type: form.value.equipment_type || null,
        year: form.value.year ?? null,
        purpose_crop: form.value.purpose_crop.trim() || null,
        condition: form.value.condition,
        responsible_id: form.value.responsible_id || null,
        notes: form.value.notes.trim() || null,
      })
    }
    await fetchList()
    clearForm()
  } finally {
    saving.value = false
  }
}

async function removeEquipment(row: EquipmentRow) {
  if (!confirm(`Удалить технику «${row.brand}» (${row.license_plate})?`)) return
  if (!isSupabaseConfigured()) return
  try {
    await deleteEquipment(row.id)
    await fetchList()
    if (editingId.value === row.id) clearForm()
  } catch {
    // show error in UI if needed
  }
}

function goToPage(page: number) {
  currentPage.value = Math.max(1, Math.min(page, totalPages.value))
}

const CSV_SEP = '\t'

function escapeCsvCell(val: string): string {
  const s = String(val ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""')
  return s.includes(CSV_SEP) || s.includes('"') || s.includes('\r') ? `"${s}"` : s
}

function exportToExcel() {
  const list = filteredList.value
  if (!list.length) return
  const headers = ['№', 'Марка', 'Модель', 'Гос. номер', 'Тип техники', 'Год', 'Назначение/Культура', 'Состояние', 'Примечания']
  const rows = list.map((r, i) => [
    String(i + 1),
    r.brand,
    r.model ?? '',
    r.license_plate,
    equipmentTypeLabel(r.equipment_type),
    r.year ?? '',
    r.purpose_crop ?? '',
    conditionLabel(r.condition),
    (r.notes ?? '').replace(/\r?\n/g, ' '),
  ])
  const line = (arr: (string | number)[]) => arr.map((v) => escapeCsvCell(String(v))).join(CSV_SEP)
  const csv = '\uFEFF' + [line(headers), ...rows.map((r) => line(r))].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `список_техники_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}

async function exportToPdf() {
  const list = filteredList.value
  if (!list.length) return
  const headers = ['№', 'Марка', 'Модель', 'Гос. номер', 'Тип', 'Состояние']
  const rows = list.map((r, i) => [
    String(i + 1),
    escapeHtml(r.brand),
    escapeHtml(r.model ?? ''),
    escapeHtml(r.license_plate),
    escapeHtml(equipmentTypeLabel(r.equipment_type)),
    escapeHtml(conditionLabel(r.condition)),
  ])
  const tableRows = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')
  const headerCells = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')
  const html = `
    <div class="pdf-export-table-wrap" style="position:fixed;left:-9999px;top:0;width:1100px;font-family:Arial,sans-serif;font-size:12px;background:#fff;">
      <h2 style="margin:0 0 12px 0;font-size:16px;">Список техники</h2>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;">
        <thead><tr style="background:#2d5a3d;color:#fff;">${headerCells}</tr></thead>
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
</script>

<template>
  <section class="equipment-page page-enter-item">
    <header class="header-area equipment-header">
      <h1 class="page-title">Управление техникой</h1>
    </header>

    <!-- Новая единица техники -->
    <div class="equipment-form-card card-rounded">
      <div class="equipment-section-head">
        <h2 class="equipment-form-title">
          <svg class="equipment-section-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
          Новая единица техники
        </h2>
        <p class="equipment-form-hint">Поля со знаком <span class="equipment-required-star">*</span> обязательны</p>
      </div>

      <div class="equipment-form-grid">
        <div class="equipment-form-field">
          <label class="equipment-label" for="eq-brand">Марка <span class="equipment-required-star">*</span></label>
          <input
            id="eq-brand"
            v-model="form.brand"
            type="text"
            class="equipment-input"
            placeholder="Например: Камаз"
          />
        </div>
        <div class="equipment-form-field">
          <label class="equipment-label" for="eq-plate">Гос. номер <span class="equipment-required-star">*</span></label>
          <input
            id="eq-plate"
            v-model="form.license_plate"
            type="text"
            class="equipment-input"
            placeholder="A 123 AA 77"
          />
        </div>
        <div class="equipment-form-field">
          <label class="equipment-label" for="eq-model">Модель</label>
          <input
            id="eq-model"
            v-model="form.model"
            type="text"
            class="equipment-input"
            placeholder="Например: 8R 340"
          />
        </div>
        <div class="equipment-form-field">
          <label class="equipment-label" for="eq-type">Тип техники</label>
          <select id="eq-type" v-model="form.equipment_type" class="equipment-input equipment-select">
            <option
              v-for="opt in EQUIPMENT_TYPES"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </option>
          </select>
        </div>
        <div class="equipment-form-field">
          <label class="equipment-label" for="eq-year">Год выпуска</label>
          <input
            id="eq-year"
            v-model.number="form.year"
            type="number"
            class="equipment-input"
            placeholder="YYYY"
            min="1900"
            max="2100"
          />
        </div>
        <div class="equipment-form-field">
          <label class="equipment-label" for="eq-purpose">Назначение / Культура</label>
          <input
            id="eq-purpose"
            v-model="form.purpose_crop"
            type="text"
            class="equipment-input"
            placeholder="Например: Уборка пшеницы"
          />
        </div>
        <div class="equipment-form-field">
          <label class="equipment-label" for="eq-responsible">Ответственный</label>
          <select
            id="eq-responsible"
            v-model="form.responsible_id"
            class="equipment-input equipment-select"
          >
            <option value="">Не назначен</option>
            <option
              v-for="opt in responsibleOptions"
              :key="opt.id"
              :value="opt.id"
            >
              {{ opt.label }}
            </option>
          </select>
        </div>
        <div class="equipment-form-field">
          <label class="equipment-label" for="eq-condition">Состояние</label>
          <select id="eq-condition" v-model="form.condition" class="equipment-input equipment-select">
            <option
              v-for="opt in CONDITION_OPTIONS"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </option>
          </select>
        </div>
        <div class="equipment-form-field">
          <label class="equipment-label" for="eq-notes">Примечания</label>
          <input
            id="eq-notes"
            v-model="form.notes"
            type="text"
            class="equipment-input"
            placeholder="Дополнительная информация"
          />
        </div>
      </div>

      <div class="equipment-form-actions">
        <button type="button" class="equipment-btn equipment-btn-clear" @click="clearForm">
          <svg class="equipment-btn-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
          Очистить
        </button>
        <button
          type="button"
          class="equipment-btn equipment-btn-save"
          :disabled="saving || !form.brand.trim() || !form.license_plate.trim()"
          @click="saveEquipment"
        >
          <svg class="equipment-btn-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Сохранить технику
        </button>
      </div>
    </div>

    <!-- Список техники -->
    <div class="equipment-list-card card-rounded">
      <div class="equipment-list-header">
        <h2 class="equipment-list-title">
          <svg class="equipment-section-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
          Список техники
        </h2>
        <span class="equipment-list-count">{{ totalCount }} {{ totalCount === 1 ? 'единица' : totalCount < 5 ? 'единицы' : 'единиц' }}</span>
        <div class="equipment-list-toolbar">
          <div class="equipment-search-wrap">
            <svg class="equipment-search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input
              v-model="searchQuery"
              type="search"
              class="equipment-search-input"
              placeholder="Поиск по марке, номер..."
              autocomplete="off"
            />
          </div>
          <button type="button" class="equipment-export-btn" :disabled="!filteredList.length" title="Экспорт в Excel" @click="exportToExcel">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
            Excel
          </button>
          <button type="button" class="equipment-export-btn" :disabled="!filteredList.length" title="Экспорт в PDF" @click="exportToPdf">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>
            PDF
          </button>
        </div>
      </div>

      <div v-if="loading" class="equipment-loading">Загрузка…</div>
      <div v-else class="table-wrapper">
        <table class="equipment-table" aria-label="Список техники">
          <thead>
            <tr>
              <th>Марка / Модель</th>
              <th>Гос. номер</th>
              <th>Тип техники</th>
              <th>Ответственный</th>
              <th>Состояние</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in paginatedList" :key="row.id">
              <td>
                <div class="equipment-cell-brand">{{ row.brand }}</div>
                <div class="equipment-cell-detail">
                  {{ row.model && row.year ? `${row.model} • ${row.year} г.в.` : row.model || (row.year ? `${row.year} г.в.` : '') }}
                </div>
              </td>
              <td>
                <span class="equipment-plate-badge">{{ row.license_plate }}</span>
              </td>
              <td>{{ equipmentTypeLabel(row.equipment_type) }}</td>
              <td>
                <span class="equipment-responsible-pill">{{ responsibleLabel(row.responsible_id) }}</span>
              </td>
              <td>
                <span :class="['equipment-condition-badge', conditionClass(row.condition)]">{{ conditionLabel(row.condition) }}</span>
              </td>
              <td>
                <div class="equipment-actions">
                  <button
                    type="button"
                    class="equipment-action-btn"
                    aria-label="Редактировать"
                    title="Редактировать"
                    @click="startEdit(row)"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                  </button>
                  <button
                    type="button"
                    class="equipment-action-btn equipment-action-btn--danger"
                    aria-label="Удалить"
                    title="Удалить"
                    @click="removeEquipment(row)"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="!paginatedList.length">
              <td colspan="6" class="equipment-empty">Нет записей</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="totalCount > 0" class="equipment-pagination">
        <span class="equipment-pagination-info">
          Показано {{ paginationStart }}-{{ paginationEnd }} из {{ totalCount }}
        </span>
        <div class="equipment-pagination-btns">
          <button
            type="button"
            class="equipment-page-btn"
            :disabled="currentPage <= 1"
            aria-label="Предыдущая страница"
            @click="goToPage(currentPage - 1)"
          >
            &lt;
          </button>
          <template v-for="(p, i) in pageNumbers" :key="p === 'ellipsis' ? `e-${i}` : p">
            <button
              v-if="p !== 'ellipsis'"
              type="button"
              class="equipment-page-btn"
              :class="{ 'equipment-page-btn--active': p === currentPage }"
              @click="goToPage(p)"
            >
              {{ p }}
            </button>
            <span v-else class="equipment-pagination-dots">…</span>
          </template>
          <button
            type="button"
            class="equipment-page-btn"
            :disabled="currentPage >= totalPages"
            aria-label="Следующая страница"
            @click="goToPage(currentPage + 1)"
          >
            &gt;
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.equipment-page {
  padding: 0 var(--space-lg);
  padding-bottom: var(--space-xl);
  max-width: 1200px;
  margin: 0 auto;
}

.equipment-header {
  margin-bottom: var(--space-xl);
}

.equipment-form-card,
.equipment-list-card {
  background: #ffffff;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: var(--space-xl);
  margin-bottom: var(--space-xl);
  box-shadow: var(--shadow-card);
}

[data-theme='dark'] .equipment-form-card,
[data-theme='dark'] .equipment-list-card {
  background: var(--bg-panel);
}

.equipment-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
  flex-wrap: wrap;
}

.equipment-form-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--text-primary);
}

.equipment-section-icon {
  width: 22px;
  height: 22px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.equipment-form-hint {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.equipment-form-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-lg);
  margin-bottom: var(--space-xl);
}

@media (max-width: 900px) {
  .equipment-form-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 500px) {
  .equipment-form-grid {
    grid-template-columns: 1fr;
  }
}

.equipment-form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.equipment-required-star {
  color: var(--danger-red);
}

.equipment-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.equipment-input {
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 0.9375rem;
  background: #fafafa;
  color: var(--text-primary);
  transition: border-color 0.2s, background-color 0.2s;
}

.equipment-input:hover {
  border-color: var(--text-secondary);
}

.equipment-input:focus {
  outline: none;
  border-color: var(--accent-green);
  background: #fff;
}

[data-theme='dark'] .equipment-input {
  background: rgba(255, 255, 255, 0.06);
}

[data-theme='dark'] .equipment-input:focus {
  background: rgba(255, 255, 255, 0.08);
}

.equipment-input::placeholder {
  color: var(--text-secondary);
  opacity: 0.8;
}

.equipment-select {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  padding-right: 36px;
}

.equipment-form-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.equipment-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 0.9375rem;
  font-weight: 500;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, color 0.2s;
}

.equipment-btn-clear {
  background: #e5e7eb;
  color: #4b5563;
  border-color: #d1d5db;
}

.equipment-btn-clear:hover {
  background: #d1d5db;
  color: #374151;
}

.equipment-btn-clear .equipment-btn-icon {
  width: 1.125rem;
  height: 1.125rem;
  color: #6b7280;
}

.equipment-btn-save {
  background: var(--accent-green);
  color: #fff;
  border-color: var(--accent-green);
}

.equipment-btn-save:hover:not(:disabled) {
  background: var(--accent-green-hover);
  border-color: var(--accent-green-hover);
  color: #fff;
}

.equipment-btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: #9ca3af;
  border-color: #9ca3af;
}

.equipment-btn-save .equipment-btn-icon {
  width: 1.125rem;
  height: 1.125rem;
  color: #fff;
}

.equipment-btn-icon {
  width: 1.125rem;
  height: 1.125rem;
  flex-shrink: 0;
}

[data-theme='dark'] .equipment-btn-clear {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.9);
  border-color: rgba(255, 255, 255, 0.2);
}

[data-theme='dark'] .equipment-btn-clear:hover {
  background: rgba(255, 255, 255, 0.18);
}

.equipment-list-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}

.equipment-responsible-pill {
  display: inline-flex;
  align-items: center;
  max-width: 180px;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  background: rgba(148, 163, 184, 0.16);
  color: var(--text-secondary);
}

.equipment-list-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--text-primary);
}

.equipment-list-title .equipment-section-icon {
  flex-shrink: 0;
}

.equipment-list-count {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-left: 4px;
}

.equipment-list-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-left: auto;
}

.equipment-search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.equipment-search-icon {
  position: absolute;
  left: 10px;
  width: 18px;
  height: 18px;
  color: var(--text-secondary);
  pointer-events: none;
}

.equipment-search-input {
  padding: 10px 12px 10px 38px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 0.9375rem;
  min-width: 240px;
  background: #fafafa;
  color: var(--text-primary);
}

[data-theme='dark'] .equipment-search-input {
  background: rgba(255, 255, 255, 0.06);
}

.equipment-export-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: #fafafa;
  color: var(--text-primary);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.equipment-export-btn:hover:not(:disabled) {
  background: var(--bg-panel-hover);
  border-color: var(--accent-green);
  color: var(--accent-green);
}

.equipment-export-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

[data-theme='dark'] .equipment-export-btn {
  background: rgba(255, 255, 255, 0.06);
}

.equipment-loading {
  padding: var(--space-lg);
  text-align: center;
  color: var(--text-secondary);
}

.table-wrapper {
  overflow-x: auto;
}

.equipment-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9375rem;
}

.equipment-table th,
.equipment-table td {
  padding: 14px 16px;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
}

.equipment-table th {
  font-weight: 600;
  color: var(--text-secondary);
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: #fafafa;
}

[data-theme='dark'] .equipment-table th {
  background: rgba(255, 255, 255, 0.04);
}

.equipment-table tbody tr:hover {
  background: var(--row-hover-bg);
}

.equipment-cell-brand {
  font-weight: 500;
  color: var(--text-primary);
}

.equipment-cell-detail {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin-top: 2px;
}

.equipment-plate-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--chip-bg);
  font-family: ui-monospace, monospace;
  font-size: 0.875rem;
}

.equipment-condition-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
}

.equipment-condition-ok {
  background: rgba(45, 90, 61, 0.12);
  color: #166534;
}

[data-theme='dark'] .equipment-condition-ok {
  background: rgba(104, 173, 51, 0.25);
  color: #86efac;
}

.equipment-condition-repair {
  background: rgba(194, 65, 12, 0.12);
  color: #c2410c;
}

[data-theme='dark'] .equipment-condition-repair {
  background: rgba(251, 146, 60, 0.2);
  color: #fdba74;
}

.equipment-condition-out {
  background: var(--chip-bg);
  color: var(--text-secondary);
}

.equipment-actions {
  display: flex;
  gap: 4px;
}

.equipment-action-btn {
  padding: 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.equipment-action-btn:hover {
  background: var(--bg-panel-hover);
  color: var(--text-primary);
}

.equipment-action-btn--danger:hover {
  background: rgba(185, 28, 28, 0.1);
  color: var(--danger-red);
}

.equipment-empty {
  text-align: center;
  color: var(--text-secondary);
  padding: var(--space-lg);
}

.equipment-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  margin-top: var(--space-md);
  padding-top: var(--space-md);
  border-top: 1px solid var(--border-color);
}

.equipment-pagination-info {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.equipment-pagination-btns {
  display: flex;
  align-items: center;
  gap: 4px;
}

.equipment-page-btn {
  min-width: 36px;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-base);
  color: var(--text-primary);
  font-size: 0.875rem;
  cursor: pointer;
}

.equipment-page-btn:hover:not(:disabled) {
  background: var(--bg-panel-hover);
}

.equipment-page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.equipment-page-btn--active {
  background: var(--accent-green);
  border-color: var(--accent-green);
  color: white;
}

.equipment-page-btn--active:hover:not(:disabled) {
  background: var(--accent-green-hover);
  border-color: var(--accent-green-hover);
}

.equipment-pagination-dots {
  padding: 0 4px;
  color: var(--text-secondary);
  font-size: 0.875rem;
}
</style>
