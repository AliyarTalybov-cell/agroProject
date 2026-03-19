<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/stores/auth'
import { isSupabaseConfigured } from '@/lib/supabase'
import {
  getEquipmentById,
  loadEquipmentPhotos,
  addEquipmentPhoto,
  deleteEquipmentPhoto,
  type EquipmentPhotoRow,
  type EquipmentRow,
} from '@/lib/equipmentSupabase'
import { loadOperationsByEquipmentFromSupabase, type EquipmentOperationHistoryRow } from '@/lib/analyticsSupabase'
import { loadProfiles, type ProfileRow } from '@/lib/tasksSupabase'
import { avatarColorByPosition } from '@/lib/avatarColors'

const route = useRoute()
const router = useRouter()
const auth = useAuth()

const EQUIPMENT_TYPES: { value: string; label: string }[] = [
  { value: 'tractor', label: 'Трактор' },
  { value: 'combine', label: 'Комбайн' },
  { value: 'sprayer', label: 'Опрыскиватель' },
  { value: 'other', label: 'Другое' },
]

const CONDITION_OPTIONS: { value: string; label: string }[] = [
  { value: 'operational', label: 'Исправна' },
  { value: 'repair', label: 'В ремонте' },
  { value: 'decommissioned', label: 'Выведена' },
]

const equipmentId = computed(() => (route.params.id as string | undefined) || '')

const loading = ref(true)
const error = ref<string | null>(null)

const equipment = ref<EquipmentRow | null>(null)
const photos = ref<EquipmentPhotoRow[]>([])
const photoUploading = ref(false)

const fileInputRef = ref<HTMLInputElement | null>(null)

const profiles = ref<ProfileRow[]>([])

const historyLoading = ref(false)
const history = ref<EquipmentOperationHistoryRow[]>([])

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const isManager = computed(() => auth.userRole.value === 'manager')

const profilesMap = computed(() => new Map(profiles.value.map((p) => [p.id, p])))

function equipmentTypeLabel(value: string | null): string {
  if (!value) return '—'
  const opt = EQUIPMENT_TYPES.find((o) => o.value === value)
  return opt?.label ?? value
}

function conditionLabel(value: string): string {
  const opt = CONDITION_OPTIONS.find((o) => o.value === value)
  return opt?.label ?? value
}

const responsibleLabel = computed(() => {
  const id = equipment.value?.responsible_id
  if (!id) return 'Не назначен'
  const p = profilesMap.value.get(id)
  return p?.display_name?.trim() || p?.email || 'Неизвестно'
})

function employeeInitials(employee: string): string {
  const base = employee.includes('@') ? employee.split('@')[0] : employee
  const parts = base.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  if (parts[0]?.length >= 2) return parts[0].slice(0, 2).toUpperCase()
  return '?'
}

/** Как в «Задачах» / профиле: цвет от должности; иначе — стабильный хэш по строке сотрудника */
function profileByEmployeeString(employee: string): ProfileRow | undefined {
  const raw = employee.trim()
  if (!raw) return undefined
  const lower = raw.toLowerCase()
  return profiles.value.find((p) => {
    const mail = (p.email || '').trim().toLowerCase()
    const name = (p.display_name || '').trim().toLowerCase()
    return mail === lower || name === lower || (raw.includes('@') && mail === lower)
  })
}

function employeeAccentColor(employee: string): string {
  const p = profileByEmployeeString(employee)
  if (p?.position && p.position.trim()) return avatarColorByPosition(p.position)
  return avatarColorByPosition(employee)
}

function employeeAvatarStyle(employee: string): Record<string, string> {
  return { background: employeeAccentColor(employee) }
}

function conditionToneClass(h: EquipmentOperationHistoryRow): string {
  const label = (h.equipmentConditionLabel ?? '').toLowerCase()
  if (label.includes('плох') || label.includes('низк')) return 'equipment-history-tone--bad'
  if (label.includes('частич') || label.includes('требует') || label.includes('ремонт')) return 'equipment-history-tone--warn'
  if (label.includes('приемл')) return 'equipment-history-tone--good'
  return 'equipment-history-tone--good'
}

type OperationVisualKind = 'analysis' | 'field' | 'control' | 'default'

function operationVisual(operation: string | null | undefined): {
  kind: OperationVisualKind
  boxBg: string
  iconColor: string
} {
  const s = (operation ?? '').toLowerCase()
  if (s.includes('агрохим') || s.includes('анализ')) {
    return { kind: 'analysis', boxBg: 'rgba(236, 72, 153, 0.2)', iconColor: '#db2777' }
  }
  if (s.includes('обработк')) {
    return { kind: 'field', boxBg: 'rgba(34, 197, 94, 0.2)', iconColor: '#16a34a' }
  }
  if (s.includes('контроль') || (s.includes('полев') && s.includes('работ'))) {
    return { kind: 'control', boxBg: 'rgba(59, 130, 246, 0.2)', iconColor: '#2563eb' }
  }
  return { kind: 'default', boxBg: 'rgba(61, 92, 64, 0.14)', iconColor: 'var(--agro)' }
}

function fuelBarClass(pct: number | null | undefined): string {
  if (pct == null || Number.isNaN(pct)) return 'equipment-history-fuel-fill--empty'
  if (pct < 34) return 'equipment-history-fuel-fill--low'
  if (pct < 67) return 'equipment-history-fuel-fill--mid'
  return 'equipment-history-fuel-fill--high'
}

/** Раскрытие карточек истории */
const expandedHistory = ref<Record<number, boolean>>({})

function isHistoryExpanded(id: number): boolean {
  return expandedHistory.value[id] !== false
}

function toggleHistoryExpand(id: number) {
  expandedHistory.value = { ...expandedHistory.value, [id]: !isHistoryExpanded(id) }
}

function initHistoryExpanded() {
  const next: Record<number, boolean> = {}
  for (const h of history.value) {
    next[h.id] = true
  }
  expandedHistory.value = next
}

/** Пагинация (как на странице «Задачи» / TaskManagementPage) */
const historyPage = ref(1)
const historyPageSize = ref(5)

const historyTotalFiltered = computed(() => history.value.length)
const historyTotalPages = computed(() => Math.max(1, Math.ceil(historyTotalFiltered.value / historyPageSize.value)))

const historyPaginationStart = computed(() =>
  historyTotalFiltered.value ? (historyPage.value - 1) * historyPageSize.value + 1 : 0,
)
const historyPaginationEnd = computed(() =>
  Math.min(historyPage.value * historyPageSize.value, historyTotalFiltered.value),
)

const paginatedHistory = computed(() => {
  const start = (historyPage.value - 1) * historyPageSize.value
  return history.value.slice(start, start + historyPageSize.value)
})

const paginatedHistoryVm = computed(() =>
  paginatedHistory.value.map((h) => ({ h, visual: operationVisual(h.operation) })),
)

const historyPageNumbers = computed(() => {
  const total = historyTotalPages.value
  const current = historyPage.value
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | 'ellipsis')[] = [1]
  if (current > 2) pages.push('ellipsis')
  if (current > 1 && current < total) pages.push(current)
  if (current < total - 1) pages.push('ellipsis')
  if (total > 1) pages.push(total)
  return pages
})

function goHistoryPage(page: number) {
  historyPage.value = Math.max(1, Math.min(page, historyTotalPages.value))
}

watch(historyPageSize, () => {
  historyPage.value = 1
})

watch(historyTotalFiltered, () => {
  if (historyPage.value > historyTotalPages.value) {
    historyPage.value = Math.max(1, historyTotalPages.value)
  }
})

const mainMedia = computed(() => {
  const p = photos.value[0]
  if (!p) return null
  return {
    url: p.file_url,
    title: p.title || 'Фото техники',
    description: p.description || '',
    date: p.created_at,
    photo: p,
  }
})

const galleryItems = computed(() => {
  return photos.value.slice(0, 8).map((p) => ({
    id: p.id,
    url: p.file_url,
    title: p.title || 'Фото',
    photo: p,
  }))
})

async function refreshAll() {
  loading.value = true
  error.value = null
  try {
    if (!isSupabaseConfigured()) {
      equipment.value = null
      photos.value = []
      history.value = []
      error.value = 'Supabase не настроен'
      return
    }
    const id = equipmentId.value
    if (!id) {
      error.value = 'Не указан id техники'
      return
    }

    const [eq, ph, profileList] = await Promise.all([getEquipmentById(id), loadEquipmentPhotos(id), loadProfiles()])
    equipment.value = eq
    photos.value = ph
    profiles.value = profileList

    if (!eq) error.value = 'Техника не найдена'

    await refreshHistory()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Ошибка загрузки'
  } finally {
    loading.value = false
  }
}

async function refreshHistory() {
  const id = equipmentId.value
  if (!id) return
  historyLoading.value = true
  try {
    const onlyMine = !isManager.value
    const userId = auth.user.value?.id ?? null
    history.value = await loadOperationsByEquipmentFromSupabase(id, onlyMine, userId)
  } catch {
    history.value = []
  } finally {
    historyLoading.value = false
    initHistoryExpanded()
  }
}

function goBack() {
  router.push({ name: 'equipment' })
}

function triggerPhotoUpload() {
  fileInputRef.value?.click()
}

async function onPhotoFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!isSupabaseConfigured()) return
  const id = equipmentId.value
  if (!id) return

  photoUploading.value = true
  try {
    await addEquipmentPhoto(id, file)
    photos.value = await loadEquipmentPhotos(id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Не удалось загрузить фото'
  } finally {
    photoUploading.value = false
    input.value = ''
  }
}

async function onDeletePhoto(photo: EquipmentPhotoRow) {
  if (!confirm('Удалить фото?')) return
  try {
    await deleteEquipmentPhoto(photo.id)
    photos.value = photos.value.filter((p) => p.id !== photo.id)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Не удалось удалить фото'
  }
}

onMounted(refreshAll)
</script>

<template>
  <div class="field-details page-enter-item">
    <div class="field-details-header">
      <button type="button" class="field-details-back" @click="goBack" aria-label="Назад к списку техники">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Назад к списку техники
      </button>
    </div>

    <div v-if="loading" class="field-details-grid">
      <div class="field-details-card field-details-card--left">
        <p class="field-details-muted">Загрузка…</p>
      </div>
    </div>

    <div v-else-if="error" class="field-details-card field-details-card--left" role="alert">
      <p class="field-details-error">{{ error }}</p>
      <button type="button" class="field-details-btn" @click="goBack">Вернуться к списку</button>
    </div>

    <template v-else-if="equipment">
      <div class="field-details-grid">
        <div class="field-details-card field-details-card--left">
          <div class="field-details-title-row">
            <span class="field-details-title-icon" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 7h13l5 5v5a2 2 0 0 1-2 2H7a4 4 0 0 1-4-4V7z" />
                <path d="M16 7v5h5" />
                <circle cx="7" cy="18" r="2" />
              </svg>
            </span>

            <div class="field-details-title-block">
              <h1 class="field-details-name">{{ equipment.brand }} — {{ equipment.license_plate }}</h1>
              <p class="field-details-meta">
                {{ equipment.model ? (equipment.year ? `${equipment.model} • ${equipment.year} г.в.` : equipment.model) : equipment.year ? `${equipment.year} г.в.` : '—' }}
              </p>
            </div>
          </div>

          <ul class="field-details-list">
            <li class="field-details-item">
              <span class="field-details-item-icon" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 20h4l12-12a4 4 0 0 0-6-6L2 14v4z" />
                  <path d="M13 5l6 6" />
                </svg>
              </span>
              <span class="field-details-item-label">Тип</span>
              <span class="field-details-item-value">{{ equipmentTypeLabel(equipment.equipment_type) }}</span>
            </li>

            <li class="field-details-item">
              <span class="field-details-item-icon" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 12l2-2 4 4 12-12 2 2L9 16l-4-4z" />
                </svg>
              </span>
              <span class="field-details-item-label">Назначение / культура</span>
              <span class="field-details-item-value">{{ equipment.purpose_crop || '—' }}</span>
            </li>

            <li class="field-details-item">
              <span class="field-details-item-icon" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z" />
                  <circle cx="12" cy="9" r="2" />
                </svg>
              </span>
              <span class="field-details-item-label">Состояние</span>
              <span class="field-details-item-value">{{ conditionLabel(equipment.condition) }}</span>
            </li>

            <li class="field-details-item">
              <span class="field-details-item-icon" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </span>
              <span class="field-details-item-label">Ответственный</span>
              <span class="field-details-item-value">{{ responsibleLabel }}</span>
            </li>
          </ul>

          <div v-if="equipment.notes" class="field-details-notes">
            <div class="field-details-notes-block">
              <div class="field-details-notes-label">Примечания</div>
              <p class="field-details-notes-text">{{ equipment.notes }}</p>
            </div>
          </div>
        </div>

        <div class="field-details-card field-details-card--right">
          <div class="field-details-media-header">
            <div>
              <h2 class="field-details-media-title">Фото</h2>
              <p class="field-details-media-subtitle">Фотографии техники</p>
            </div>

            <input
              ref="fileInputRef"
              type="file"
              accept="image/*"
              class="field-details-file-hidden"
              aria-hidden="true"
              @change="onPhotoFileChange"
            />
            <button type="button" class="field-details-upload-btn" :disabled="photoUploading" @click="triggerPhotoUpload">
              {{ photoUploading ? 'Загрузка…' : '+ Добавить фото' }}
            </button>
          </div>

          <div class="field-details-main-media">
            <template v-if="mainMedia">
              <div class="field-details-main-media-label">{{ mainMedia.title }}</div>
              <div class="field-details-main-media-frame">
                <img
                  :src="mainMedia.url"
                  :alt="mainMedia.title"
                  class="field-details-main-media-img"
                  loading="lazy"
                  @error="($event.target as HTMLImageElement).style.display = 'none'"
                />
              </div>
              <p class="field-details-main-media-desc">{{ mainMedia.description || '—' }}</p>
              <p class="field-details-main-media-date">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                  <line x1="16" x2="16" y1="2" y2="6" />
                  <line x1="8" x2="8" y1="2" y2="6" />
                  <line x1="3" x2="21" y1="10" y2="10" />
                </svg>
                {{ mainMedia.date ? new Date(mainMedia.date).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }) : '—' }}
              </p>
            </template>
            <template v-else>
              <div class="field-details-main-media-label">Пока нет фото</div>
              <div class="field-details-main-media-placeholder">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <path d="M12 17h.01" />
                </svg>
                <span>Загрузите фото техники</span>
              </div>
            </template>
          </div>

          <div v-if="galleryItems.length > 0" class="field-details-gallery">
            <div v-for="item in galleryItems" :key="item.id" class="field-details-gallery-item">
              <div class="field-details-gallery-thumb">
                <img
                  :src="item.url"
                  :alt="item.title"
                  loading="lazy"
                  @error="($event.target as HTMLImageElement).style.visibility = 'hidden'"
                />
                <span class="field-details-gallery-title">{{ item.title }}</span>
                <button type="button" class="field-details-gallery-delete" @click.prevent="onDeletePhoto(item.photo)">
                  ✕
                </button>
              </div>
            </div>
          </div>
          <div v-else class="field-details-muted" style="padding-top: 12px;">Пока нет фото.</div>
        </div>
      </div>

      <section class="field-details-card equipment-history-section" style="margin-top: 24px;">
        <div class="field-details-media-header">
          <div>
            <h2 class="field-details-media-title">История взаимодействия</h2>
            <p class="field-details-media-subtitle">{{ historyLoading ? 'Загрузка…' : `Записей: ${history.length}` }}</p>
          </div>
        </div>

        <div v-if="historyLoading" class="field-details-muted" style="padding: 8px 0;">Загрузка…</div>
        <div v-else-if="!history.length" class="field-details-muted">
          Нет записей в журнале операций с этой техникой.
        </div>
        <template v-else>
          <ul class="equipment-history-list">
            <li v-for="{ h, visual } in paginatedHistoryVm" :key="h.id" class="equipment-history-card">
              <button
                type="button"
                class="equipment-history-card-toggle"
                :aria-expanded="isHistoryExpanded(h.id)"
                @click="toggleHistoryExpand(h.id)"
              >
                <span
                  class="equipment-history-op-icon"
                  :style="{ background: visual.boxBg, color: visual.iconColor }"
                  aria-hidden="true"
                >
                  <!-- Агрохим / анализ -->
                  <template v-if="visual.kind === 'analysis'">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 6h18" />
                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                    </svg>
                  </template>
                  <!-- Обработка полей -->
                  <template v-else-if="visual.kind === 'field'">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 3.5 2 8.8-1.73 2.61-3 4.5-8 6.2Z" />
                      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
                    </svg>
                  </template>
                  <!-- Контроль полевых работ -->
                  <template v-else-if="visual.kind === 'control'">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
                      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                      <path d="M9 14l2 2 4-4" />
                    </svg>
                  </template>
                  <template v-else>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M14 2l-1 1 7 7 1-1-7-7z" />
                      <path d="M3 21l3-1 14-14-2-2L4 18l-1 3z" />
                    </svg>
                  </template>
                </span>
                <div class="equipment-history-op-text">
                  <div class="equipment-history-op-title">{{ h.operation || 'Операция' }}</div>
                  <div class="equipment-history-op-meta">
                    {{ formatDateTime(h.startISO) }} • Длительность: {{ h.durationMinutes }} мин
                  </div>
                </div>
                <span class="equipment-history-chevron" :class="{ 'equipment-history-chevron--open': isHistoryExpanded(h.id) }" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
              </button>

              <div v-show="isHistoryExpanded(h.id)" class="equipment-history-card-body">
                <div class="equipment-history-cols">
                  <div class="equipment-history-col">
                    <div class="equipment-history-col-head">
                      <span class="equipment-history-col-icon" aria-hidden="true">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </span>
                      <span class="equipment-history-col-label">Исполнитель</span>
                    </div>
                    <div class="equipment-history-employee-row">
                      <span class="equipment-history-avatar" :style="employeeAvatarStyle(h.employee)">{{ employeeInitials(h.employee) }}</span>
                      <span class="equipment-history-employee-name">{{ h.employee }}</span>
                    </div>
                  </div>

                  <div class="equipment-history-col">
                    <div class="equipment-history-col-head">
                      <span class="equipment-history-col-icon" aria-hidden="true">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M5 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
                          <path d="M7 8h4" />
                          <path d="M7 12h5" />
                          <path d="M15 7V5a1 1 0 0 1 1-1" />
                          <path d="M15 7h2a2 2 0 0 1 2 2v7a2 2 0 0 0 2 2" />
                          <path d="M19 18v2" />
                        </svg>
                      </span>
                      <span class="equipment-history-col-label">Топливо</span>
                    </div>
                    <div class="equipment-history-fuel">
                      <span class="equipment-history-fuel-pct">{{ h.equipmentFuelPercent != null ? `${h.equipmentFuelPercent}%` : '—' }}</span>
                      <div class="equipment-history-fuel-track">
                        <div
                          class="equipment-history-fuel-fill"
                          :class="fuelBarClass(h.equipmentFuelPercent ?? null)"
                          :style="{ width: h.equipmentFuelPercent != null ? `${Math.min(100, Math.max(0, h.equipmentFuelPercent))}%` : '0%' }"
                        />
                      </div>
                    </div>
                  </div>

                  <div class="equipment-history-col">
                    <div class="equipment-history-col-head">
                      <span class="equipment-history-col-icon" aria-hidden="true">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                        </svg>
                      </span>
                      <span class="equipment-history-col-label">Состояние</span>
                    </div>
                    <div class="equipment-history-pill" :class="conditionToneClass(h)">
                      {{ h.equipmentConditionLabel || (h.equipmentConditionValue != null ? `${h.equipmentConditionValue}%` : '—') }}
                    </div>
                  </div>
                </div>

                <div v-if="h.equipmentRepairNotes" class="equipment-history-repair-block">
                  <div class="equipment-history-repair-head">
                    <span class="equipment-history-col-icon" aria-hidden="true">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path
                          d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
                        />
                      </svg>
                    </span>
                    <span class="equipment-history-repair-label">Починка</span>
                  </div>
                  <p class="equipment-history-repair-text">{{ h.equipmentRepairNotes }}</p>
                </div>
              </div>
            </li>
          </ul>

          <div v-if="historyTotalFiltered > 0" class="equipment-task-pagination">
            <span class="equipment-task-pagination-info">
              Показано {{ historyPaginationStart }}–{{ historyPaginationEnd }} из {{ historyTotalFiltered }}
            </span>
            <div class="equipment-task-pagination-right">
              <div class="equipment-task-pagination-nav">
                <button
                  type="button"
                  class="equipment-task-pagination-arrow"
                  :disabled="historyPage <= 1"
                  aria-label="Предыдущая страница"
                  @click="historyPage = historyPage - 1"
                >
                  &lt;
                </button>
                <template v-for="(p, i) in historyPageNumbers" :key="p === 'ellipsis' ? `e-${i}` : p">
                  <button
                    v-if="p !== 'ellipsis'"
                    type="button"
                    class="equipment-task-pagination-num"
                    :class="{ 'equipment-task-pagination-num--active': p === historyPage }"
                    @click="goHistoryPage(p)"
                  >
                    {{ p }}
                  </button>
                  <span v-else class="equipment-task-pagination-ellipsis">…</span>
                </template>
                <button
                  type="button"
                  class="equipment-task-pagination-arrow"
                  :disabled="historyPage >= historyTotalPages"
                  aria-label="Следующая страница"
                  @click="historyPage = historyPage + 1"
                >
                  &gt;
                </button>
              </div>
              <label class="equipment-task-pagination-size">
                <span class="equipment-task-pagination-size-label">На странице</span>
                <select v-model.number="historyPageSize" class="equipment-task-pagination-select">
                  <option :value="5">5</option>
                  <option :value="10">10</option>
                  <option :value="20">20</option>
                  <option :value="50">50</option>
                </select>
              </label>
            </div>
          </div>
        </template>
      </section>
    </template>
  </div>
</template>

<style scoped>
/* Дизайн как на `FieldDetailsPage.vue` (классы field-details-*) */
.field-details {
  padding-bottom: 24px;
}
.field-details-header {
  margin-bottom: 20px;
}
.field-details-back {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border: none;
  background: none;
  color: var(--text-secondary);
  font-size: 0.95rem;
  cursor: pointer;
  transition: color 0.2s;
}
.field-details-back:hover {
  color: var(--text-primary);
}
.field-details-grid {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 24px;
  align-items: start;
}
@media (max-width: 900px) {
  .field-details-grid {
    grid-template-columns: 1fr;
  }
}
.field-details-card {
  background: var(--bg-panel);
  border-radius: 12px;
  border: 1px solid var(--topbar-border);
  box-shadow: var(--shadow-card);
  padding: 24px;
}
.field-details-card--left {
  min-width: 0;
}
.field-details-card--right {
  min-width: 0;
}
.field-details-title-row {
  display: flex;
  gap: 14px;
  margin-bottom: 24px;
  align-items: flex-start;
}
.field-details-title-block {
  flex: 1;
  min-width: 0;
}
.field-details-title-icon {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
  color: #2e7d32;
  display: flex;
  align-items: center;
  justify-content: center;
}
[data-theme='dark'] .field-details-title-icon {
  background: linear-gradient(135deg, #1b3d1f 0%, #2e5c32 100%);
  color: #81c784;
}
.field-details-name {
  margin: 0 0 4px;
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}
.field-details-meta {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-secondary);
}
.field-details-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.field-details-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: start;
  font-size: 0.9rem;
}
.field-details-item-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
  margin-top: 2px;
}
.field-details-item-label {
  color: var(--text-secondary);
  font-weight: 500;
}
.field-details-item-value {
  color: var(--text-primary);
  text-align: right;
  word-break: break-word;
}
.field-details-muted {
  color: var(--text-secondary);
  margin: 0;
}
.field-details-notes {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px dashed var(--topbar-border);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.field-details-notes-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.field-details-notes-text {
  margin: 4px 0 0;
  font-size: 0.9rem;
  color: var(--text-primary);
  white-space: pre-wrap;
}
.field-details-error {
  color: var(--danger);
  margin: 0 0 16px;
}
.field-details-btn {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  background: var(--primary);
  color: white;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.field-details-media-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
.field-details-media-title {
  margin: 0 0 4px;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-primary);
}
.field-details-media-subtitle {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
}
.field-details-file-hidden {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}
.field-details-upload-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 8px;
  border: 1px solid var(--topbar-border);
  background: var(--bg-base);
  color: var(--text-primary);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}
.field-details-upload-btn:hover:not(:disabled) {
  background: var(--bg-panel);
  border-color: var(--text-secondary);
}
.field-details-upload-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.field-details-main-media {
  margin-bottom: 24px;
}
.field-details-main-media-label {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}
.field-details-main-media-frame {
  width: 100%;
  aspect-ratio: 16/10;
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-base);
  border: 1px solid var(--topbar-border);
  display: flex;
  align-items: center;
  justify-content: center;
}
.field-details-main-media-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.field-details-main-media-placeholder {
  width: 100%;
  aspect-ratio: 16/10;
  border-radius: 10px;
  border: 1px dashed var(--topbar-border);
  background: var(--bg-base);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-secondary);
  font-size: 0.9rem;
}
.field-details-main-media-placeholder svg {
  opacity: 0.5;
}
.field-details-main-media-desc {
  margin: 8px 0 4px;
  font-size: 0.85rem;
  color: var(--text-secondary);
}
.field-details-main-media-date {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.field-details-gallery {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
@media (max-width: 600px) {
  .field-details-gallery {
    grid-template-columns: repeat(2, 1fr);
  }
}
.field-details-gallery-item {
  min-width: 0;
}
.field-details-gallery-thumb {
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-base);
  border: 1px solid var(--topbar-border);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
}
.field-details-gallery-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  position: absolute;
  inset: 0;
}
.field-details-gallery-title {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 6px 8px;
  font-size: 0.75rem;
  font-weight: 500;
  color: #fff;
  background: linear-gradient(to top, rgba(0,0,0,0.6), transparent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.field-details-gallery-delete {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: none;
  background: rgba(255, 255, 255, 0.9);
  color: #111827;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.35);
  z-index: 2;
}
.field-details-gallery-delete:hover {
  background: #fee2e2;
  color: #b91c1c;
}

.equipment-details-header {
  margin-bottom: var(--space-xl);
  align-items: flex-start;
}

.equipment-details-subtitle {
  margin: 0.25rem 0 0;
  color: var(--text-secondary);
}

.equipment-details-loading,
.equipment-details-error {
  padding: var(--space-xl);
}

.equipment-details-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--space-xl);
  align-items: start;
  margin-bottom: var(--space-xl);
}

.equipment-details-panel {
  padding: var(--space-lg);
}

.panel-title {
  margin: 0 0 var(--space-md);
  font-size: 1rem;
  font-weight: 800;
}

.panel-head-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-md);
}

.equipment-details-kv {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.kv-row {
  display: flex;
  justify-content: space-between;
  gap: var(--space-md);
}

.kv-label {
  color: var(--text-secondary);
  font-weight: 650;
}

.kv-value {
  font-weight: 700;
  text-align: right;
}

.kv-value--muted {
  color: var(--text-secondary);
  font-weight: 600;
  max-width: 420px;
  text-align: left;
}

.equipment-details-photo-add {
  margin-left: auto;
}

.equipment-details-photos-empty {
  color: var(--text-secondary);
  font-weight: 600;
  padding: var(--space-lg);
  border: 1px dashed var(--border-color);
  border-radius: 12px;
  background: var(--bg-panel);
}

.equipment-details-photos-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-sm);
}

.equipment-photo-card {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg-panel);
}

.equipment-photo-img {
  width: 100%;
  height: 140px;
  object-fit: cover;
  display: block;
}

.equipment-photo-actions {
  padding: var(--space-xs);
  display: flex;
  justify-content: flex-end;
}

.equipment-photo-delete {
  border: none;
  background: transparent;
  color: var(--danger-red);
  cursor: pointer;
  font-weight: 700;
  font-size: 0.8rem;
  text-decoration: underline;
}

.equipment-details-history {
  padding: var(--space-lg);
}

.equipment-history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.equipment-history-card {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-panel);
  overflow: hidden;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.equipment-history-card:hover {
  border-color: rgba(15, 23, 42, 0.12);
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.05);
}

.equipment-history-card-toggle {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
}

.equipment-history-card-toggle:hover {
  background: var(--bg-base);
}

.equipment-history-op-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.equipment-history-op-text {
  flex: 1;
  min-width: 0;
}

.equipment-history-op-title {
  font-weight: 800;
  font-size: 0.95rem;
  color: var(--text-primary);
  line-height: 1.25;
}

.equipment-history-op-meta {
  margin-top: 4px;
  font-size: 0.8rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.equipment-history-chevron {
  flex-shrink: 0;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: 4px;
  transition: transform 0.2s ease;
}

.equipment-history-chevron--open {
  transform: rotate(180deg);
}

.equipment-history-card-body {
  padding: 0 16px 16px;
}

.equipment-history-cols {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.95fr) minmax(0, 1fr);
  gap: 12px 18px;
  align-items: start;
}

.equipment-history-col-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.equipment-history-col-icon {
  display: inline-flex;
  color: var(--text-secondary);
  opacity: 0.9;
}

.equipment-history-col-icon svg {
  width: 13px;
  height: 13px;
}

.equipment-history-col-label {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.equipment-history-fuel {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.equipment-history-fuel-pct {
  font-weight: 800;
  font-size: 0.9rem;
  color: var(--text-primary);
}

.equipment-history-fuel-track {
  height: 8px;
  border-radius: 999px;
  background: var(--bg-base);
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.equipment-history-fuel-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.25s ease;
  min-width: 0;
}

.equipment-history-fuel-fill--low {
  background: #dc2626;
}
.equipment-history-fuel-fill--mid {
  background: #ca8a04;
}
.equipment-history-fuel-fill--high {
  background: #16a34a;
}
.equipment-history-fuel-fill--empty {
  width: 0 !important;
  background: transparent;
}

.equipment-history-avatar {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-weight: 900;
  font-size: 0.62rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.equipment-history-employee-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.equipment-history-employee-name {
  font-weight: 800;
  color: var(--text-primary);
  word-break: break-word;
  line-height: 1.2;
}

.equipment-history-pill {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.16);
  font-weight: 850;
  font-size: 0.78rem;
  color: var(--text-primary);
  border: 1px solid rgba(148, 163, 184, 0.22);
  min-width: 0;
}

.equipment-history-tone--good {
  background: rgba(34, 197, 94, 0.11);
  border-color: rgba(34, 197, 94, 0.18);
  color: #16a34a;
}

.equipment-history-tone--warn {
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(245, 158, 11, 0.22);
  color: #b45309;
}

.equipment-history-tone--bad {
  background: rgba(220, 38, 38, 0.10);
  border-color: rgba(220, 38, 38, 0.20);
  color: #b91c1c;
}

.equipment-history-repair-block {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed var(--topbar-border);
}

.equipment-history-repair-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.equipment-history-repair-label {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.equipment-history-repair-text {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.45;
  white-space: pre-wrap;
}

/* Пагинация — стиль как у «Задач» (TaskManagementPage) */
.equipment-task-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  margin-top: var(--space-md);
  padding: var(--space-md) 0 0;
  border-top: 1px solid var(--border-color);
  min-height: 40px;
}

.equipment-task-pagination-info {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.equipment-task-pagination-right {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  flex-wrap: wrap;
}

.equipment-task-pagination-nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.equipment-task-pagination-arrow {
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

.equipment-task-pagination-arrow:hover:not(:disabled) {
  background: var(--bg-panel-hover, var(--bg-panel));
  border-color: var(--text-secondary);
}

.equipment-task-pagination-arrow:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.equipment-task-pagination-num {
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

.equipment-task-pagination-num:hover {
  background: var(--bg-panel-hover, var(--bg-panel));
}

.equipment-task-pagination-num--active {
  background: rgba(76, 175, 80, 0.15);
  border-color: rgba(76, 175, 80, 0.5);
  color: var(--text-primary);
}

[data-theme='dark'] .equipment-task-pagination-num--active {
  background: rgba(76, 175, 80, 0.2);
  border-color: rgba(76, 175, 80, 0.5);
}

.equipment-task-pagination-num--active:hover {
  background: rgba(76, 175, 80, 0.22);
}

.equipment-task-pagination-ellipsis {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 36px;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.equipment-task-pagination-size {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.equipment-task-pagination-size-label {
  line-height: 1.5;
}

.equipment-task-pagination-select {
  min-width: 72px;
  height: 36px;
  padding: 0 28px 0 10px;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  border: 1px solid var(--border-color);
  background: var(--bg-base);
  color: var(--text-primary);
  cursor: pointer;
}

@media (max-width: 1020px) {
  .equipment-details-grid {
    grid-template-columns: 1fr;
  }
  .equipment-details-photos-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .equipment-history-cols {
    grid-template-columns: 1fr;
  }
}
</style>

