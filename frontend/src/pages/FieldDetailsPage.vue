<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  getFieldById,
  loadFieldPhotos,
  addFieldPhoto,
  deleteFieldPhoto,
  updateField,
  uploadFieldScheme,
  type FieldRow,
  type FieldPhotoRow,
} from '@/lib/fieldsSupabase'
import { loadProfiles, type ProfileRow } from '@/lib/tasksSupabase'
import { loadCrops, loadLandTypes, type CropRow, type LandTypeRow } from '@/lib/landTypesAndCrops'
import { isSupabaseConfigured } from '@/lib/supabase'
import UiDeleteButton from '@/components/UiDeleteButton.vue'

const props = defineProps<{ id: string }>()

const router = useRouter()
const field = ref<FieldRow | null>(null)
const photos = ref<FieldPhotoRow[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const profiles = ref<ProfileRow[]>([])
const crops = ref<CropRow[]>([])
const landTypes = ref<LandTypeRow[]>([])
const photoUploading = ref(false)
const photoFileInput = ref<HTMLInputElement | null>(null)
const schemeFileInput = ref<HTMLInputElement | null>(null)

const isEditing = ref(false)
const saveError = ref<string | null>(null)
const saving = ref(false)
const editForm = ref({
  name: '',
  area: 0,
  cadastral_number: '',
  address: '',
  location_description: '',
  extra_info: '',
  geolocation: '',
  land_type: '',
  sowing_year: new Date().getFullYear(),
  responsible_id: '',
  crop_key: '',
  scheme_file_url: '',
})
const schemeUploading = ref(false)

const responsibleName = computed(() => {
  if (!field.value?.responsible_id) return '—'
  const p = profiles.value.find((x) => x.id === field.value!.responsible_id)
  return p?.display_name || p?.email || '—'
})

const cropLabel = computed(() => {
  if (!field.value?.crop_key) return '—'
  const c = crops.value.find((x) => x.key === field.value!.crop_key)
  return c?.label || field.value?.crop_key || '—'
})

const createdFormatted = computed(() => {
  const raw = field.value?.created_at
  if (!raw) return '—'
  return new Date(raw).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
})

const updatedFormatted = computed(() => {
  const raw = field.value?.updated_at
  if (!raw) return '—'
  return new Date(raw).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
})

/** Главное изображение: последнее фото или схема поля */
const mainMedia = computed(() => {
  const f = field.value
  if (photos.value.length > 0) {
    const p = photos.value[0]
    return {
      url: p.file_url,
      title: p.title || 'Фото поля',
      description: p.description || '',
      date: p.created_at,
      isPhoto: true,
    }
  }
  if (f?.scheme_file_url) {
    return {
      url: f.scheme_file_url,
      title: 'Схема / NDVI',
      description: 'Схема поля',
      date: f.updated_at,
      isPhoto: false,
    }
  }
  return null
})

/** Галерея: фото + карточка схемы (если есть) */
const galleryItems = computed(() => {
  const items: { url: string; title: string; id: string; isScheme?: boolean }[] = photos.value
    .slice(0, 8)
    .map((p) => ({
      url: p.file_url,
      title: p.title || 'Фото',
      id: p.id,
    }))
  if (field.value?.scheme_file_url && !items.some((i) => i.url === field.value!.scheme_file_url)) {
    items.push({
      url: field.value.scheme_file_url,
      title: 'Схема / NDVI',
      id: 'scheme',
      isScheme: true,
    })
  }
  return items
})

async function loadData() {
  if (!props.id || !isSupabaseConfigured()) {
    if (!isSupabaseConfigured()) error.value = 'База данных не настроена'
    loading.value = false
    return
  }
  loading.value = true
  error.value = null
  try {
    const [fieldData, profileList, cropList, landTypesList, photosList] = await Promise.all([
      getFieldById(props.id),
      loadProfiles(),
      loadCrops(),
      loadLandTypes(),
      loadFieldPhotos(props.id),
    ])
    field.value = fieldData
    profiles.value = profileList
    crops.value = cropList
    landTypes.value = landTypesList
    photos.value = photosList
    if (!fieldData) error.value = 'Поле не найдено'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Ошибка загрузки'
  } finally {
    loading.value = false
  }
}

function goBack() {
  router.push({ name: 'fields' })
}

function startEditing() {
  if (!field.value) return
  editForm.value = {
    name: field.value.name,
    area: Number(field.value.area),
    cadastral_number: field.value.cadastral_number ?? '',
    address: (field.value as { address?: string | null }).address ?? '',
    location_description: field.value.location_description ?? '',
    extra_info: (field.value as { extra_info?: string | null }).extra_info ?? '',
    geolocation: (field.value as { geolocation?: string | null }).geolocation ?? '',
    land_type: field.value.land_type,
    sowing_year: field.value.sowing_year ?? new Date().getFullYear(),
    responsible_id: field.value.responsible_id ?? '',
    crop_key: field.value.crop_key,
    scheme_file_url: field.value.scheme_file_url ?? '',
  }
  saveError.value = null
  isEditing.value = true
}

function cancelEditing() {
  isEditing.value = false
  saveError.value = null
}

async function saveEditing() {
  if (!field.value || !isSupabaseConfigured()) return
  const name = editForm.value.name.trim()
  if (!name) {
    saveError.value = 'Введите название поля.'
    return
  }
  const area = Number(editForm.value.area)
  if (Number.isNaN(area) || area < 0) {
    saveError.value = 'Укажите корректную площадь.'
    return
  }
  saving.value = true
  saveError.value = null
  try {
    await updateField(field.value.id, {
      name,
      area,
      cadastral_number: editForm.value.cadastral_number.trim() || null,
      address: editForm.value.address.trim() || null,
      location_description: editForm.value.location_description.trim() || null,
      extra_info: editForm.value.extra_info.trim() || null,
      geolocation: editForm.value.geolocation.trim() || null,
      land_type: editForm.value.land_type,
      sowing_year: editForm.value.sowing_year || null,
      responsible_id: editForm.value.responsible_id.trim() || null,
      crop_key: editForm.value.crop_key,
      scheme_file_url: editForm.value.scheme_file_url.trim() || null,
    })
    await loadData()
    isEditing.value = false
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : 'Не удалось сохранить'
  } finally {
    saving.value = false
  }
}

function triggerSchemeUpload() {
  schemeFileInput.value?.click()
}

async function onSchemeFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !props.id || !isSupabaseConfigured()) return
  schemeUploading.value = true
  try {
    const url = await uploadFieldScheme(file, props.id)
    editForm.value.scheme_file_url = url
  } catch (err) {
    console.error(err)
    saveError.value = 'Не удалось загрузить схему'
  } finally {
    schemeUploading.value = false
    input.value = ''
  }
}

function clearScheme() {
  editForm.value.scheme_file_url = ''
}

function triggerPhotoUpload() {
  photoFileInput.value?.click()
}

async function onPhotoFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !props.id || !isSupabaseConfigured()) return
  if (!file.type.startsWith('image/')) return
  photoUploading.value = true
  try {
    await addFieldPhoto(props.id, file, file.name.replace(/\.[^.]+$/, ''))
    photos.value = await loadFieldPhotos(props.id)
  } catch (err) {
    console.error(err)
  } finally {
    photoUploading.value = false
    input.value = ''
  }
}

async function removePhoto(id: string) {
  if (!props.id || !isSupabaseConfigured()) return
  if (!confirm('Удалить это фото поля?')) return
  try {
    await deleteFieldPhoto(id)
    photos.value = await loadFieldPhotos(props.id)
  } catch (err) {
    console.error(err)
  }
}

async function removeScheme() {
  if (!field.value || !isSupabaseConfigured()) return
  if (!field.value.scheme_file_url) return
  if (!confirm('Удалить схему поля?')) return
  try {
    await updateField(field.value.id, { scheme_file_url: null })
    await loadData()
  } catch (err) {
    console.error(err)
  }
}

onMounted(loadData)
watch(() => props.id, loadData)
</script>

<template>
  <div class="field-details">
    <div class="field-details-header">
      <button type="button" class="field-details-back" @click="goBack" aria-label="Назад к списку полей">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>
        К списку полей
      </button>
    </div>

    <div v-if="loading" class="field-details-grid">
      <div class="field-details-card field-details-card--left">
        <p class="field-details-muted">Загрузка…</p>
      </div>
    </div>

    <div v-else-if="error" class="field-details-card field-details-card--left">
      <p class="field-details-error">{{ error }}</p>
      <button type="button" class="field-details-btn" @click="goBack">Вернуться к списку</button>
    </div>

    <template v-else-if="field">
      <div class="field-details-grid">
        <div class="field-details-card field-details-card--left">
          <div class="field-details-title-row">
            <span class="field-details-title-icon" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
            </span>
            <div class="field-details-title-block">
              <h1 class="field-details-name">Поле №{{ field.number }} — {{ isEditing ? editForm.name : cropLabel }}</h1>
              <p class="field-details-meta">
                № {{ field.number }} · {{ isEditing ? editForm.area : field.area }} га
                <span class="field-details-status" v-if="!isEditing">
                  <span class="field-details-status-dot" aria-hidden="true"></span>
                  Активно
                </span>
              </p>
            </div>
            <div class="field-details-actions">
              <button
                type="button"
                class="field-details-edit-btn"
                @click="startEditing"
                aria-label="Редактировать"
                v-if="!isEditing"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                Редактировать
              </button>
            </div>
          </div>

          <template v-if="!isEditing">
            <ul class="field-details-list">
              <li class="field-details-item">
                <span class="field-details-item-icon" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                </span>
                <span class="field-details-item-label">Кадастровый номер</span>
                <span class="field-details-item-value">{{ field.cadastral_number || '—' }}</span>
              </li>
              <li class="field-details-item">
                <span class="field-details-item-icon" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                </span>
                <span class="field-details-item-label">Адрес</span>
                <span class="field-details-item-value">{{ field.address || '—' }}</span>
              </li>
              <li class="field-details-item">
                <span class="field-details-item-icon" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z"/><path d="M12 6v6l3 3"/></svg>
                </span>
                <span class="field-details-item-label">Геолокация</span>
                <span class="field-details-item-value">{{ (field as any).geolocation || '—' }}</span>
              </li>
              <li class="field-details-item">
                <span class="field-details-item-icon" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22v-7"/><path d="M12 15a3 3 0 0 0 3-3c0-2-3-5-3-5s-3 3-3 5a3 3 0 0 0 3 3z"/><path d="M4 15s1.5 2 4 2 4-2 4-2"/></svg>
                </span>
                <span class="field-details-item-label">Тип земли</span>
                <span class="field-details-item-value">{{ field.land_type || '—' }}</span>
              </li>
              <li class="field-details-item">
                <span class="field-details-item-icon" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                </span>
                <span class="field-details-item-label">Год посева</span>
                <span class="field-details-item-value">{{ field.sowing_year ?? '—' }}</span>
              </li>
              <li class="field-details-item">
                <span class="field-details-item-icon" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                </span>
                <span class="field-details-item-label">Культура</span>
                <span class="field-details-item-value">{{ cropLabel }}</span>
              </li>
              <li class="field-details-item">
                <span class="field-details-item-icon" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </span>
                <span class="field-details-item-label">Ответственный</span>
                <span class="field-details-item-value field-details-item-value--link">{{ responsibleName }}</span>
              </li>
              <li class="field-details-item">
                <span class="field-details-item-icon" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </span>
                <span class="field-details-item-label">Создано</span>
                <span class="field-details-item-value">{{ createdFormatted }}</span>
              </li>
              <li class="field-details-item">
                <span class="field-details-item-icon" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </span>
                <span class="field-details-item-label">Обновлено</span>
                <span class="field-details-item-value">{{ updatedFormatted }}</span>
              </li>
            </ul>
            <div
              v-if="field.location_description || (field as any).extra_info"
              class="field-details-notes"
            >
              <div v-if="field.location_description" class="field-details-notes-block">
                <div class="field-details-notes-label">Описание местоположения</div>
                <p class="field-details-notes-text">
                  {{ field.location_description }}
                </p>
              </div>
              <div v-if="(field as any).extra_info" class="field-details-notes-block">
                <div class="field-details-notes-label">Доп. информация</div>
                <p class="field-details-notes-text">
                  {{ (field as any).extra_info }}
                </p>
              </div>
            </div>
          </template>

          <form v-else class="field-details-edit-form" @submit.prevent="saveEditing">
            <p v-if="saveError" class="field-details-save-error">{{ saveError }}</p>
            <div class="field-details-edit-grid">
              <label class="field-details-edit-field field-details-edit-field--full">
                <span class="field-details-edit-label">Название <span class="field-details-edit-required">*</span></span>
                <input v-model="editForm.name" type="text" class="field-details-edit-input" required placeholder="Название поля" />
              </label>
              <label class="field-details-edit-field">
                <span class="field-details-edit-label">Площадь, га <span class="field-details-edit-required">*</span></span>
                <input v-model.number="editForm.area" type="number" class="field-details-edit-input" min="0" step="0.01" required />
              </label>
              <label class="field-details-edit-field">
                <span class="field-details-edit-label">Кадастровый номер</span>
                <input v-model="editForm.cadastral_number" type="text" class="field-details-edit-input" placeholder="XX:XX:XXXXXXX:XX" />
              </label>
              <label class="field-details-edit-field field-details-edit-field--full">
                <span class="field-details-edit-label">Адрес</span>
                <input v-model="editForm.address" type="text" class="field-details-edit-input" placeholder="Адрес" />
              </label>
              <label class="field-details-edit-field field-details-edit-field--full">
                <span class="field-details-edit-label">Описание местоположения</span>
                <textarea v-model="editForm.location_description" class="field-details-edit-textarea" rows="2" placeholder="Описание границ"></textarea>
              </label>
              <label class="field-details-edit-field">
                <span class="field-details-edit-label">Геолокация</span>
                <input v-model="editForm.geolocation" type="text" class="field-details-edit-input" placeholder="Например: 55.7558, 37.6173" />
              </label>
              <label class="field-details-edit-field">
                <span class="field-details-edit-label">Тип земли</span>
                <select v-model="editForm.land_type" class="field-details-edit-select">
                  <option v-if="editForm.land_type && !landTypes.some((t) => t.name === editForm.land_type)" :value="editForm.land_type">{{ editForm.land_type }}</option>
                  <option v-for="t in landTypes" :key="t.name" :value="t.name">{{ t.name }}</option>
                </select>
              </label>
              <label class="field-details-edit-field">
                <span class="field-details-edit-label">Культура</span>
                <select v-model="editForm.crop_key" class="field-details-edit-select">
                  <option v-for="c in crops" :key="c.key" :value="c.key">{{ c.label }}</option>
                </select>
              </label>
              <label class="field-details-edit-field">
                <span class="field-details-edit-label">Год посева</span>
                <input v-model.number="editForm.sowing_year" type="number" class="field-details-edit-input" min="2000" :max="new Date().getFullYear() + 2" />
              </label>
              <label class="field-details-edit-field">
                <span class="field-details-edit-label">Ответственный</span>
                <select v-model="editForm.responsible_id" class="field-details-edit-select">
                  <option value="">Не назначен</option>
                  <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.display_name || p.email }}</option>
                </select>
              </label>
              <label class="field-details-edit-field field-details-edit-field--full">
                <span class="field-details-edit-label">Доп. информация</span>
                <textarea
                  v-model="editForm.extra_info"
                  class="field-details-edit-textarea"
                  rows="3"
                  placeholder="Любые заметки о поле, особенностях, рекомендациях и т.п."
                ></textarea>
              </label>
            </div>
            <div class="field-details-edit-scheme">
              <span class="field-details-edit-label">Схема поля</span>
              <input
                ref="schemeFileInput"
                type="file"
                accept=".jpg,.jpeg,.png,.pdf,image/*,application/pdf"
                class="field-details-file-hidden"
                aria-hidden="true"
                @change="onSchemeFileChange"
              />
              <div class="field-details-scheme-row">
                <button type="button" class="field-details-scheme-btn" :disabled="schemeUploading" @click="triggerSchemeUpload">
                  {{ schemeUploading ? 'Загрузка…' : 'Загрузить схему' }}
                </button>
                <UiDeleteButton
                  v-if="editForm.scheme_file_url"
                  size="xs"
                  hover-label="Удалить схему"
                  title="Удалить схему"
                  aria-label="Удалить схему"
                  @click="clearScheme"
                />
                <span v-if="editForm.scheme_file_url" class="field-details-scheme-hint">Схема прикреплена</span>
              </div>
            </div>
            <div class="field-details-edit-actions">
              <button
                type="button"
                class="field-details-cancel-btn"
                @click="cancelEditing"
              >
                Отмена
              </button>
              <button
                type="submit"
                class="field-details-save-btn"
                :disabled="saving"
              >
                {{ saving ? 'Сохранение…' : 'Сохранить' }}
              </button>
            </div>
          </form>
        </div>

        <div class="field-details-card field-details-card--right">
          <div class="field-details-media-header">
            <div>
              <h2 class="field-details-media-title">Медиафайлы и схемы поля</h2>
              <p class="field-details-media-subtitle">Фотографии состояния посевов и спутниковые снимки</p>
            </div>
            <input
              ref="photoFileInput"
              type="file"
              accept="image/*"
              class="field-details-file-hidden"
              aria-hidden="true"
              @change="onPhotoFileChange"
            />
            <button
              type="button"
              class="field-details-upload-btn"
              :disabled="photoUploading"
              @click="triggerPhotoUpload"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
              {{ photoUploading ? 'Загрузка…' : 'Загрузить фото' }}
            </button>
          </div>

          <div class="field-details-main-media">
            <template v-if="mainMedia">
              <div class="field-details-main-media-label">
                {{ mainMedia.title }}
                <span class="field-details-main-media-badge" v-if="mainMedia.isPhoto">
                  <span class="field-details-status-dot"></span>
                  Последнее фото
                </span>
              </div>
              <div class="field-details-main-media-frame">
                <img
                  v-if="mainMedia.isPhoto || /\.(jpe?g|png|gif|webp)$/i.test(mainMedia.url)"
                  :src="mainMedia.url"
                  :alt="mainMedia.title"
                  class="field-details-main-media-img"
                  @error="($event.target as HTMLImageElement).style.display = 'none'"
                />
                <a
                  v-else
                  :href="mainMedia.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="field-details-main-media-link"
                >
                  Открыть схему
                </a>
              </div>
              <p class="field-details-main-media-desc">{{ mainMedia.description || '—' }}</p>
              <p class="field-details-main-media-date">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                {{ mainMedia.date ? new Date(mainMedia.date).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }) : '—' }}
              </p>
            </template>
            <template v-else>
              <div class="field-details-main-media-label">Нет фото и схем</div>
              <div class="field-details-main-media-placeholder">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
                <span>Загрузите фото или прикрепите схему в карточке поля</span>
              </div>
            </template>
          </div>

          <div v-if="galleryItems.length > 0" class="field-details-gallery">
            <div
              v-for="item in galleryItems"
              :key="item.id"
              class="field-details-gallery-item"
            >
              <a
                v-if="item.isScheme && !/\.(jpe?g|png|gif|webp)$/i.test(item.url)"
                :href="item.url"
                target="_blank"
                rel="noopener noreferrer"
                class="field-details-gallery-thumb field-details-gallery-thumb--link"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span class="field-details-gallery-title">{{ item.title }}</span>
                <div class="field-details-gallery-delete-wrap">
                  <UiDeleteButton size="xs" hover-label="Удалить" title="Удалить" @click.prevent="removeScheme" />
                </div>
              </a>
              <div v-else class="field-details-gallery-thumb">
                <img
                  :src="item.url"
                  :alt="item.title"
                  loading="lazy"
                  @error="($event.target as HTMLImageElement).style.visibility = 'hidden'"
                />
                <span class="field-details-gallery-title">{{ item.title }}</span>
                <div class="field-details-gallery-delete-wrap">
                  <UiDeleteButton
                    size="xs"
                    hover-label="Удалить"
                    title="Удалить"
                    @click="item.isScheme ? removeScheme() : removePhoto(item.id)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
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
.field-details-actions {
  flex-shrink: 0;
}
.field-details-edit-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid var(--topbar-border);
  background: var(--bg-base);
  color: var(--text-primary);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}
.field-details-edit-btn:hover {
  background: var(--bg-panel);
  border-color: var(--text-secondary);
}
.field-details-edit-form {
  margin-top: 4px;
}
.field-details-save-error {
  color: var(--danger);
  font-size: 0.875rem;
  margin: 0 0 12px;
}
.field-details-edit-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
  margin-bottom: 16px;
}
.field-details-edit-field--full {
  grid-column: 1 / -1;
}
.field-details-edit-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field-details-edit-label {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-secondary);
}
.field-details-edit-required {
  color: var(--danger);
}
.field-details-edit-input,
.field-details-edit-textarea,
.field-details-edit-select {
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--topbar-border);
  background: var(--bg-base);
  color: var(--text-primary);
  font-size: 0.9rem;
  font-family: inherit;
}
.field-details-edit-textarea {
  resize: vertical;
  min-height: 56px;
}
.field-details-edit-scheme {
  margin-bottom: 16px;
}
.field-details-edit-scheme .field-details-edit-label {
  display: block;
  margin-bottom: 6px;
}
.field-details-scheme-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.field-details-scheme-btn {
  padding: 8px 14px;
  border-radius: 6px;
  border: 1px solid var(--topbar-border);
  background: var(--bg-base);
  color: var(--text-primary);
  font-size: 0.875rem;
  cursor: pointer;
}
.field-details-scheme-btn:hover:not(:disabled) {
  background: var(--bg-panel);
}
.field-details-scheme-btn:disabled {
  opacity: 0.7;
}
.field-details-scheme-hint {
  font-size: 0.8rem;
  color: var(--text-secondary);
}
.field-details-edit-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.field-details-cancel-btn {
  padding: 10px 18px;
  border-radius: 8px;
  border: 1px solid var(--topbar-border);
  background: var(--bg-base);
  color: var(--text-primary);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
}
.field-details-cancel-btn:hover {
  background: var(--bg-panel);
}
.field-details-save-btn {
  padding: 10px 18px;
  border-radius: 8px;
  border: none;
  background: var(--accent-green);
  color: #ffffff;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
}
.field-details-save-btn:hover:not(:disabled) {
  background: var(--accent-green-hover);
}
.field-details-save-btn:hover:not(:disabled) {
  opacity: 0.95;
}
.field-details-save-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.field-details-cancel-btn--compact,
.field-details-save-btn--compact {
  padding: 6px 12px;
  font-size: 0.8rem;
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
.field-details-status {
  margin-left: 8px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.field-details-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #22c55e;
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
.field-details-item-value--link {
  color: #16a34a;
}
[data-theme='dark'] .field-details-item-value--link {
  color: #4ade80;
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
  display: flex;
  align-items: center;
  gap: 8px;
}
.field-details-main-media-badge {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  gap: 4px;
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
.field-details-main-media-link {
  padding: 16px;
  color: var(--primary);
  text-decoration: underline;
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
.field-details-gallery-thumb--link {
  text-decoration: none;
  color: var(--text-secondary);
  transition: background 0.2s;
}
.field-details-gallery-thumb--link:hover {
  background: var(--bg-panel);
}
.field-details-gallery-thumb--link svg {
  flex-shrink: 0;
  margin-bottom: 4px;
}
.field-details-gallery-title {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 6px 8px;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-primary);
  background: linear-gradient(to top, rgba(0,0,0,0.6), transparent);
  color: #fff;
}
.field-details-gallery-thumb--link .field-details-gallery-title {
  position: static;
  background: none;
  color: inherit;
  padding: 4px 0 0;
}

.field-details-gallery-delete-wrap {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 2;
}
</style>
