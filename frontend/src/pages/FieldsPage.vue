<script setup lang="ts">
import { computed, ref, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/stores/auth'
import {
  isSupabaseConfigured,
  loadDowntimeReasons,
  addDowntimeReason,
  deleteDowntimeReason,
  loadWorkOperations,
  addWorkOperation,
  deleteWorkOperation,
  type DowntimeReasonRow,
  type WorkOperationRow,
  type DowntimeCategory,
} from '@/lib/reasonsAndOperations'
import {
  loadLandTypes,
  loadCrops,
  addLandType as addLandTypeApi,
  addCropByLabel as addCropApi,
  deleteLandType as deleteLandTypeApi,
  deleteCrop as deleteCropApi,
  type LandTypeRow,
  type CropRow,
} from '@/lib/landTypesAndCrops'
import {
  loadFields as loadFieldsApi,
  addField as addFieldApi,
  updateField as updateFieldApi,
  deleteField as deleteFieldApi,
  uploadFieldScheme,
  type FieldRow,
} from '@/lib/fieldsSupabase'
import { loadProfiles, type ProfileRow } from '@/lib/tasksSupabase'

type CropKey = 'all' | 'wheat' | 'corn' | 'soy' | 'sunflower' | 'none' | 'meadow'

const CATEGORY_LABELS: Record<DowntimeCategory, string> = {
  breakdown: 'Поломка',
  rain: 'Дождь / погода',
  fuel: 'Нет топлива',
  waiting: 'Ожидание задания',
}

const LAND_TYPES_FALLBACK = ['Пашня', 'Залежь', 'Сенокос', 'Пастбище']

const CROP_KEY_TO_NAME: Record<string, string> = {
  wheat: 'Пшеница',
  corn: 'Кукуруза',
  soy: 'Соя',
  sunflower: 'Подсолнечник',
  none: 'Нет культуры',
  meadow: 'Многолетние травы',
}

type Field = {
  id: string
  number: number
  name: string
  area: number
  cadastralNumber: string
  address: string
  locationDescription: string
  landType: string
  sowingYear: number
  responsibleId: string | null
  responsiblePerson: string
  cropKey: string
  cropName: string
  schemeFileUrl: string
  stage: string
  readinessPercent: number
  forecastYield: string
  harvestDate: string
  imageUrl: string
  soilType: string
  moisture: string
  lastOperation: string
}

const router = useRouter()

const fields = ref<Field[]>([])
const fieldsLoading = ref(false)
const fieldsError = ref<string | null>(null)
const profiles = ref<ProfileRow[]>([])

function fieldRowToField(row: FieldRow, profileMap: Map<string, ProfileRow>, cropsList: CropRow[]): Field {
  const responsiblePerson = row.responsible_id ? (profileMap.get(row.responsible_id)?.display_name || profileMap.get(row.responsible_id)?.email || '') : ''
  const cropName = cropsList.find((c) => c.key === row.crop_key)?.label ?? CROP_KEY_TO_NAME[row.crop_key] ?? row.crop_key
  return {
    id: row.id,
    number: row.number,
    name: row.name,
    area: Number(row.area),
    cadastralNumber: row.cadastral_number ?? '',
    address: (row as { address?: string | null }).address ?? '',
    locationDescription: row.location_description ?? '',
    landType: row.land_type,
    sowingYear: row.sowing_year ?? 0,
    responsibleId: row.responsible_id ?? null,
    responsiblePerson,
    cropKey: row.crop_key,
    cropName,
    schemeFileUrl: row.scheme_file_url ?? '',
    stage: '—',
    readinessPercent: 0,
    forecastYield: '—',
    harvestDate: '—',
    imageUrl: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=400&q=80',
    soilType: '—',
    moisture: '—',
    lastOperation: '—',
  }
}

async function loadFieldsData() {
  if (!isSupabaseConfigured()) return
  fieldsError.value = null
  fieldsLoading.value = true
  try {
    const [rows, profileList] = await Promise.all([loadFieldsApi(), loadProfiles()])
    profiles.value = profileList
    const profileMap = new Map(profileList.map((p) => [p.id, p]))
    fields.value = rows.map((r) => fieldRowToField(r, profileMap, crops.value))
  } catch (e) {
    fieldsError.value = e instanceof Error ? e.message : 'Не удалось загрузить поля'
    fields.value = []
  } finally {
    fieldsLoading.value = false
  }
}

const DEMO_FIELDS: Field[] = [
  { id: 'field-12', number: 12, name: 'Пшеница', area: 42.5, cadastralNumber: '50:20:0010321:14', address: '', locationDescription: 'Северный участок, от дороги до лесополосы', landType: 'Пашня', sowingYear: 2024, responsibleId: null, responsiblePerson: 'Иванов А.С.', cropKey: 'wheat', cropName: 'Пшеница', schemeFileUrl: '', stage: '—', readinessPercent: 0, forecastYield: '—', harvestDate: '—', imageUrl: '', soilType: '—', moisture: '—', lastOperation: '—' },
  { id: 'field-2', number: 2, name: 'Участок "Северный"', area: 120, cadastralNumber: '', address: '', locationDescription: 'Западная граница хозяйства', landType: 'Пашня', sowingYear: 2024, responsibleId: null, responsiblePerson: 'Петрова М.В.', cropKey: 'sunflower', cropName: 'Подсолнечник', schemeFileUrl: '', stage: '—', readinessPercent: 0, forecastYield: '—', harvestDate: '—', imageUrl: '', soilType: '—', moisture: '—', lastOperation: '—' },
  { id: 'field-3', number: 3, name: 'Заречное 1', area: 35.8, cadastralNumber: '50:20:0010321:88', address: '', locationDescription: 'За рекой, южный склон', landType: 'Пашня', sowingYear: 2024, responsibleId: null, responsiblePerson: 'Сидоров В.И.', cropKey: 'soy', cropName: 'Соя', schemeFileUrl: '', stage: '—', readinessPercent: 0, forecastYield: '—', harvestDate: '—', imageUrl: '', soilType: '—', moisture: '—', lastOperation: '—' },
  { id: 'field-4', number: 4, name: 'Поле 4 (Пары)', area: 80, cadastralNumber: '50:20:0010321:05', address: '', locationDescription: 'Центральный массив', landType: 'Залежь', sowingYear: 0, responsibleId: null, responsiblePerson: '', cropKey: 'none', cropName: 'Нет культуры', schemeFileUrl: '', stage: '—', readinessPercent: 0, forecastYield: '—', harvestDate: '—', imageUrl: '', soilType: '—', moisture: '—', lastOperation: '—' },
  { id: 'field-5', number: 5, name: 'Луг 1', area: 15, cadastralNumber: '50:20:0010321:99', address: '', locationDescription: 'Пойменный луг', landType: 'Сенокос', sowingYear: 0, responsibleId: null, responsiblePerson: '', cropKey: 'meadow', cropName: 'Многолетние травы', schemeFileUrl: '', stage: '—', readinessPercent: 0, forecastYield: '—', harvestDate: '—', imageUrl: '', soilType: '—', moisture: '—', lastOperation: '—' },
]

const cropFilter = ref<CropKey>('all')
const searchText = ref('')
const selectedFieldId = ref<string | null>(null)
const multiSelectedIds = ref<string[]>([])
const pageSize = 5
const currentPage = ref(1)

const selectedField = computed(() => fields.value.find((f) => f.id === selectedFieldId.value) ?? null)

const filteredFields = computed(() => {
  const q = searchText.value.trim().toLowerCase()
  return fields.value.filter((f) => {
    const matchesCrop = cropFilter.value === 'all' ? true : f.cropKey === cropFilter.value
    const hay = `${f.name} ${f.cropName} ${f.stage}`.toLowerCase()
    const matchesSearch = q ? hay.includes(q) : true
    return matchesCrop && matchesSearch
  })
})

const selectedFields = computed(() =>
  fields.value.filter((f) => multiSelectedIds.value.includes(f.id)),
)

const nextFieldNumber = computed(() => {
  const max = fields.value.reduce((m, f) => (f.number > m ? f.number : m), 0)
  return max + 1
})

const totalFiltered = computed(() => filteredFields.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalFiltered.value / pageSize)))
const paginatedFields = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredFields.value.slice(start, start + pageSize)
})

const totalSelectedArea = computed(() =>
  selectedFields.value.reduce((sum, f) => sum + f.area, 0),
)

const avgSelectedReadiness = computed(() => {
  if (!selectedFields.value.length) return 0
  const total = selectedFields.value.reduce((sum, f) => sum + f.readinessPercent, 0)
  return Math.round(total / selectedFields.value.length)
})

function setCropFilter(next: CropKey) {
  cropFilter.value = next
}

function selectField(id: string) {
  selectedFieldId.value = id
}

function goToFieldDetails(id: string) {
  router.push({ name: 'field-details', params: { id } })
}

function toggleMultiSelect(id: string) {
  const idx = multiSelectedIds.value.indexOf(id)
  if (idx === -1) {
    multiSelectedIds.value = [...multiSelectedIds.value, id]
  } else {
    const next = [...multiSelectedIds.value]
    next.splice(idx, 1)
    multiSelectedIds.value = next
  }
}

function openReports() {
  router.push('/reports')
}

function openJournal() {
  router.push('/tasks')
}

const isAddFieldOpen = ref(false)
const editingFieldId = ref<string | null>(null)
const deleteConfirmFieldId = ref<string | null>(null)
const newFieldName = ref('')
const newFieldCadastral = ref('')
const newFieldAddress = ref('')
const newFieldArea = ref<number | ''>('')
const newFieldLandType = ref('Пашня')
const newFieldCropKey = ref('wheat')
const newFieldSowingYear = ref(new Date().getFullYear())
const newFieldLocationDesc = ref('')
const newFieldResponsibleId = ref('')
const newFieldSchemeUrl = ref('')
const newFieldSchemeFileName = ref('')
const schemePreviewObjectUrl = ref('') // временный URL для превью до завершения загрузки
const schemeUploading = ref(false)
const schemeUploadError = ref('')
const schemeFileInputRef = ref<HTMLInputElement | null>(null)
const fieldFormError = ref('')

const isSchemeImage = computed(() => /\.(jpe?g|png|gif|webp)$/i.test(newFieldSchemeFileName.value))
const schemePreviewUrl = computed(() => newFieldSchemeUrl.value || schemePreviewObjectUrl.value)

const isFieldModalOpen = computed(() => isAddFieldOpen.value)
const fieldModalTitle = computed(() => (editingFieldId.value ? 'Редактирование поля' : 'Новое поле'))
const fieldToDelete = computed(() => (deleteConfirmFieldId.value ? fields.value.find((f) => f.id === deleteConfirmFieldId.value) : null))

const CROP_OPTIONS_FALLBACK: { key: string; label: string }[] = [
  { key: 'wheat', label: 'Пшеница' },
  { key: 'corn', label: 'Кукуруза' },
  { key: 'soy', label: 'Соя' },
  { key: 'sunflower', label: 'Подсолнечник' },
  { key: 'none', label: 'Нет (пар)' },
  { key: 'meadow', label: 'Многолетние травы' },
]

const landTypes = ref<LandTypeRow[]>([])
const crops = ref<CropRow[]>([])

const landTypeOptions = computed(() =>
  landTypes.value.length > 0 ? landTypes.value.map((t) => ({ name: t.name })) : LAND_TYPES_FALLBACK.map((name) => ({ name })),
)
const cropOptions = computed(() => (crops.value.length > 0 ? crops.value : CROP_OPTIONS_FALLBACK))

async function openAddField() {
  if (isSupabaseConfigured()) {
    try {
      const [landTypesList, cropsList] = await Promise.all([loadLandTypes(), loadCrops()])
      landTypes.value = landTypesList
      crops.value = cropsList
    } catch (e) {
      fieldFormError.value = refsErrorMessage(e)
    }
  }
  editingFieldId.value = null
  newFieldName.value = ''
  newFieldCadastral.value = ''
  newFieldAddress.value = ''
  newFieldArea.value = ''
  newFieldLandType.value = landTypeOptions.value[0]?.name ?? 'Пашня'
  newFieldCropKey.value = cropOptions.value[0]?.key ?? 'wheat'
  newFieldSowingYear.value = new Date().getFullYear()
  newFieldLocationDesc.value = ''
  newFieldResponsibleId.value = ''
  newFieldSchemeUrl.value = ''
  newFieldSchemeFileName.value = ''
  if (schemePreviewObjectUrl.value) {
    URL.revokeObjectURL(schemePreviewObjectUrl.value)
    schemePreviewObjectUrl.value = ''
  }
  schemeUploadError.value = ''
  fieldFormError.value = ''
  isAddFieldOpen.value = true
}

async function openEditField(f: Field) {
  if (isSupabaseConfigured()) {
    try {
      const [landTypesList, cropsList] = await Promise.all([loadLandTypes(), loadCrops()])
      landTypes.value = landTypesList
      crops.value = cropsList
    } catch (e) {
      fieldFormError.value = refsErrorMessage(e)
    }
  }
  editingFieldId.value = f.id
  newFieldName.value = f.name
  newFieldCadastral.value = f.cadastralNumber
  newFieldAddress.value = f.address
  newFieldArea.value = f.area
  newFieldLandType.value = f.landType
  newFieldCropKey.value = f.cropKey
  newFieldSowingYear.value = f.sowingYear
  newFieldLocationDesc.value = f.locationDescription
  newFieldResponsibleId.value = f.responsibleId ?? ''
  newFieldSchemeUrl.value = f.schemeFileUrl
  newFieldSchemeFileName.value = f.schemeFileUrl ? new URL(f.schemeFileUrl).pathname.split('/').pop() || 'Схема' : ''
  schemeUploadError.value = ''
  fieldFormError.value = ''
  isAddFieldOpen.value = true
}

function clearSchemeFile() {
  if (schemePreviewObjectUrl.value) {
    URL.revokeObjectURL(schemePreviewObjectUrl.value)
    schemePreviewObjectUrl.value = ''
  }
  newFieldSchemeUrl.value = ''
  newFieldSchemeFileName.value = ''
  schemeUploadError.value = ''
  if (schemeFileInputRef.value) schemeFileInputRef.value.value = ''
}

function onSchemeDragOver(e: DragEvent) {
  e.dataTransfer && (e.dataTransfer.dropEffect = 'copy')
}

function onSchemeDragLeave() {
  /* no-op */
}

function onSchemeDrop(e: DragEvent) {
  const file = e.dataTransfer?.files?.[0]
  if (file) processSchemeFile(file)
}

async function onSchemeFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = ''
  await processSchemeFile(file)
}

async function processSchemeFile(file: File) {
  if (schemePreviewObjectUrl.value) {
    URL.revokeObjectURL(schemePreviewObjectUrl.value)
    schemePreviewObjectUrl.value = ''
  }
  newFieldSchemeFileName.value = file.name
  newFieldSchemeUrl.value = ''
  schemeUploadError.value = ''
  fieldFormError.value = ''

  const maxSize = 10 * 1024 * 1024
  if (file.size > maxSize) {
    schemeUploadError.value = 'Файл не должен превышать 10 МБ.'
    newFieldSchemeFileName.value = ''
    return
  }
  const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf']
  if (!allowed.includes(file.type)) {
    schemeUploadError.value = 'Допустимы только JPG, PNG и PDF.'
    newFieldSchemeFileName.value = ''
    return
  }
  if (/^image\//.test(file.type)) {
    schemePreviewObjectUrl.value = URL.createObjectURL(file)
  }
  if (!isSupabaseConfigured()) {
    schemeUploadError.value = 'Загрузка файлов доступна при подключённом Supabase.'
    return
  }

  schemeUploading.value = true
  schemeUploadError.value = ''
  await nextTick()

  try {
    const url = await uploadFieldScheme(file, editingFieldId.value ?? undefined)
    if (schemePreviewObjectUrl.value) {
      URL.revokeObjectURL(schemePreviewObjectUrl.value)
      schemePreviewObjectUrl.value = ''
    }
    newFieldSchemeUrl.value = url
    newFieldSchemeFileName.value = file.name
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Не удалось загрузить файл.'
    schemeUploadError.value = msg
    console.error('[Fields] scheme upload failed:', err)
    if (typeof msg === 'string' && (msg.includes('policy') || msg.includes('row-level security') || msg.includes('RLS'))) {
      schemeUploadError.value = 'Доступ к хранилищу запрещён. В Supabase: Storage → field-schemes → Policies — добавьте политику на загрузку (INSERT).'
    }
  } finally {
    schemeUploading.value = false
  }
}

function closeFieldModal() {
  isAddFieldOpen.value = false
  editingFieldId.value = null
}

async function onResponsibleChange(fieldId: string, value: string) {
  if (!isSupabaseConfigured()) {
    const prof = profiles.value.find((p) => p.id === value)
    const name = prof ? (prof.display_name || prof.email) : ''
    const f = fields.value.find((x) => x.id === fieldId)
    if (f) {
      f.responsibleId = value || null
      f.responsiblePerson = name
    }
    return
  }
  try {
    await updateFieldApi(fieldId, { responsible_id: value || null })
    await loadFieldsData()
  } catch {
    // можно показать toast
  }
}

function openDeleteConfirm(f: Field) {
  deleteConfirmFieldId.value = f.id
}

function closeDeleteConfirm() {
  deleteConfirmFieldId.value = null
}

async function confirmDelete() {
  const id = deleteConfirmFieldId.value
  if (!id) return
  closeDeleteConfirm()
  await deleteField(id)
}

async function addField() {
  const name = newFieldName.value.trim()
  if (!name) {
    fieldFormError.value = 'Введите название поля.'
    return
  }
  const area = typeof newFieldArea.value === 'number' ? newFieldArea.value : parseFloat(String(newFieldArea.value))
  if (Number.isNaN(area) || area < 0) {
    fieldFormError.value = 'Площадь не может быть отрицательной.'
    return
  }
  if (area === 0 && newFieldArea.value !== '' && newFieldArea.value !== 0) {
    fieldFormError.value = 'Укажите площадь.'
    return
  }
  fieldFormError.value = ''
  const cropOpt = cropOptions.value.find((o) => o.key === newFieldCropKey.value)
  const cropName = cropOpt?.label ?? 'Пшеница'

  if (editingFieldId.value) {
    if (isSupabaseConfigured()) {
      try {
        await updateFieldApi(editingFieldId.value, {
          name,
          area: Number.isNaN(area) ? 0 : area,
          cadastral_number: newFieldCadastral.value.trim() || null,
          address: newFieldAddress.value.trim() || null,
          location_description: newFieldLocationDesc.value.trim() || null,
          land_type: newFieldLandType.value,
          sowing_year: newFieldSowingYear.value,
          responsible_id: newFieldResponsibleId.value.trim() || null,
          crop_key: newFieldCropKey.value,
          scheme_file_url: newFieldSchemeUrl.value || null,
        })
        await loadFieldsData()
      } catch (e) {
        fieldFormError.value = e instanceof Error ? e.message : 'Не удалось сохранить изменения'
        return
      }
    } else {
      const f = fields.value.find((x) => x.id === editingFieldId.value)
      if (f) {
        f.name = name
        f.area = Number.isNaN(area) ? 0 : area
        f.cadastralNumber = newFieldCadastral.value.trim()
        f.address = newFieldAddress.value.trim()
        f.locationDescription = newFieldLocationDesc.value.trim()
        f.landType = newFieldLandType.value
        f.sowingYear = newFieldSowingYear.value
        f.responsibleId = newFieldResponsibleId.value || null
        f.responsiblePerson = profiles.value.find((p) => p.id === newFieldResponsibleId.value)?.display_name || profiles.value.find((p) => p.id === newFieldResponsibleId.value)?.email || ''
        f.cropKey = newFieldCropKey.value
        f.cropName = cropName
        f.schemeFileUrl = newFieldSchemeUrl.value
      }
    }
    closeFieldModal()
    return
  }

  const num = nextFieldNumber.value
  if (isSupabaseConfigured()) {
    try {
      await addFieldApi({
        number: num,
        name,
        area: Number.isNaN(area) ? 0 : area,
        cadastral_number: newFieldCadastral.value.trim() || null,
        address: newFieldAddress.value.trim() || null,
        location_description: newFieldLocationDesc.value.trim() || null,
        land_type: newFieldLandType.value,
        sowing_year: newFieldSowingYear.value,
        responsible_id: newFieldResponsibleId.value.trim() || null,
        crop_key: newFieldCropKey.value,
        scheme_file_url: newFieldSchemeUrl.value || null,
      })
      await loadFieldsData()
      const added = fields.value.find((f) => f.number === num)
      if (added) selectedFieldId.value = added.id
    } catch (e) {
      fieldFormError.value = e instanceof Error ? e.message : 'Не удалось сохранить поле'
      return
    }
  } else {
    const id = `field-${num}`
    fields.value = [
      ...fields.value,
      {
        id,
        number: num,
        name,
        area: Number.isNaN(area) ? 0 : area,
        cadastralNumber: newFieldCadastral.value.trim(),
        address: newFieldAddress.value.trim(),
        locationDescription: newFieldLocationDesc.value.trim(),
        landType: newFieldLandType.value,
        sowingYear: newFieldSowingYear.value,
        responsibleId: newFieldResponsibleId.value || null,
        responsiblePerson: profiles.value.find((p) => p.id === newFieldResponsibleId.value)?.display_name || profiles.value.find((p) => p.id === newFieldResponsibleId.value)?.email || '',
        cropKey: newFieldCropKey.value,
        cropName,
        schemeFileUrl: newFieldSchemeUrl.value,
        stage: '—',
        readinessPercent: 0,
        forecastYield: '—',
        harvestDate: '—',
        imageUrl: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=400&q=80',
        soilType: '—',
        moisture: '—',
        lastOperation: '—',
      },
    ]
    selectedFieldId.value = id
  }
  closeFieldModal()
}

async function deleteField(id: string) {
  if (isSupabaseConfigured()) {
    try {
      await deleteFieldApi(id)
      await loadFieldsData()
    } catch {
      // можно показать toast
    }
  } else {
    fields.value = fields.value.filter((f) => f.id !== id)
  }
  if (selectedFieldId.value === id) {
    selectedFieldId.value = fields.value[0]?.id ?? null
  }
  const total = totalFiltered.value
  const maxPage = Math.ceil(total / pageSize)
  if (currentPage.value > maxPage && maxPage > 0) currentPage.value = maxPage
}

function setPage(p: number) {
  currentPage.value = Math.max(1, Math.min(p, totalPages.value))
}

function fieldNameIconClass(f: Field): string {
  if (f.cropName === 'Нет культуры') return 'fields-name-icon fields-name-icon--fallow'
  if (f.cropName === 'Многолетние травы') return 'fields-name-icon fields-name-icon--meadow'
  const map: Record<string, string> = {
    wheat: 'fields-name-icon fields-name-icon--wheat',
    corn: 'fields-name-icon fields-name-icon--corn',
    soy: 'fields-name-icon fields-name-icon--soy',
    sunflower: 'fields-name-icon fields-name-icon--sunflower',
  }
  return map[f.cropKey] ?? 'fields-name-icon fields-name-icon--wheat'
}

function cropPillClass(f: Field): string {
  if (f.cropName === 'Нет культуры') return 'fields-crop-pill fields-crop-pill--grey'
  if (f.cropName === 'Многолетние травы') return 'fields-crop-pill fields-crop-pill--meadow'
  const map: Record<string, string> = {
    wheat: 'fields-crop-pill fields-crop-pill--wheat',
    corn: 'fields-crop-pill fields-crop-pill--wheat',
    sunflower: 'fields-crop-pill fields-crop-pill--sunflower',
    soy: 'fields-crop-pill fields-crop-pill--soy',
  }
  return map[f.cropKey] ?? 'fields-crop-pill fields-crop-pill--wheat'
}

const paginationPages = computed(() => {
  const total = totalPages.value
  const cur = currentPage.value
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1)
  if (cur <= 3) return [1, 2, 3, '...', total]
  if (cur >= total - 2) return [1, '...', total - 2, total - 1, total]
  return [1, '...', cur, '...', total]
})

function updateFieldName(id: string, name: string) {
  const trimmed = name.trim()
  fields.value = fields.value.map((f) =>
    f.id === id ? { ...f, name: trimmed || f.name } : f,
  )
}

// Справочники: причины простоя и операции (из БД)
const auth = useAuth()
const REFS_PAGE_SIZE_OPTIONS = [5, 10, 20] as const
const refsPageSize = ref(10)
const refsPageReasons = ref(1)
const refsPageOperations = ref(1)
const refsPageLandTypes = ref(1)
const refsPageCrops = ref(1)

function refsPaginationPages(total: number, cur: number): (number | string)[] {
  const totalP = Math.max(1, total)
  if (totalP <= 5) return Array.from({ length: totalP }, (_, i) => i + 1)
  if (cur <= 3) return [1, 2, 3, '...', totalP]
  if (cur >= totalP - 2) return [1, '...', totalP - 2, totalP - 1, totalP]
  return [1, '...', cur, '...', totalP]
}

const downtimeReasons = ref<DowntimeReasonRow[]>([])
const workOperations = ref<WorkOperationRow[]>([])
const refsLoading = ref(false)

const paginatedReasons = computed(() => {
  const size = refsPageSize.value
  const start = (refsPageReasons.value - 1) * size
  return downtimeReasons.value.slice(start, start + size)
})
const totalPagesReasons = computed(() => Math.max(1, Math.ceil(downtimeReasons.value.length / refsPageSize.value)))
const paginatedOperations = computed(() => {
  const size = refsPageSize.value
  const start = (refsPageOperations.value - 1) * size
  return workOperations.value.slice(start, start + size)
})
const totalPagesOperations = computed(() => Math.max(1, Math.ceil(workOperations.value.length / refsPageSize.value)))
const paginatedLandTypes = computed(() => {
  const size = refsPageSize.value
  const start = (refsPageLandTypes.value - 1) * size
  return landTypes.value.slice(start, start + size)
})
const totalPagesLandTypes = computed(() => Math.max(1, Math.ceil(landTypes.value.length / refsPageSize.value)))
const paginatedCrops = computed(() => {
  const size = refsPageSize.value
  const start = (refsPageCrops.value - 1) * size
  return crops.value.slice(start, start + size)
})
const totalPagesCrops = computed(() => Math.max(1, Math.ceil(crops.value.length / refsPageSize.value)))

function onRefsPageSizeChange() {
  refsPageReasons.value = Math.max(1, Math.min(refsPageReasons.value, totalPagesReasons.value))
  refsPageOperations.value = Math.max(1, Math.min(refsPageOperations.value, totalPagesOperations.value))
  refsPageLandTypes.value = Math.max(1, Math.min(refsPageLandTypes.value, totalPagesLandTypes.value))
  refsPageCrops.value = Math.max(1, Math.min(refsPageCrops.value, totalPagesCrops.value))
}

function setRefsPageReasons(p: number) {
  refsPageReasons.value = Math.max(1, Math.min(p, totalPagesReasons.value))
}
function setRefsPageOperations(p: number) {
  refsPageOperations.value = Math.max(1, Math.min(p, totalPagesOperations.value))
}
function setRefsPageLandTypes(p: number) {
  refsPageLandTypes.value = Math.max(1, Math.min(p, totalPagesLandTypes.value))
}
function setRefsPageCrops(p: number) {
  refsPageCrops.value = Math.max(1, Math.min(p, totalPagesCrops.value))
}
const newReasonLabel = ref('')
const newReasonDesc = ref('')
const newReasonCategory = ref<DowntimeCategory>('breakdown')
const newOperationName = ref('')
const newLandTypeName = ref('')
const newCropLabel = ref('')
const refsError = ref<string | null>(null)

const deleteConfirmReasonId = ref<string | null>(null)
const deleteConfirmOperationId = ref<string | null>(null)
const deleteConfirmLandTypeId = ref<string | null>(null)
const deleteConfirmCropId = ref<string | null>(null)

const reasonToDelete = computed(() => deleteConfirmReasonId.value ? downtimeReasons.value.find((r) => r.id === deleteConfirmReasonId.value) : null)
const operationToDelete = computed(() => deleteConfirmOperationId.value ? workOperations.value.find((op) => op.id === deleteConfirmOperationId.value) : null)
const landTypeToDelete = computed(() => deleteConfirmLandTypeId.value ? landTypes.value.find((t) => t.id === deleteConfirmLandTypeId.value) : null)
const cropToDelete = computed(() => deleteConfirmCropId.value ? crops.value.find((c) => c.id === deleteConfirmCropId.value) : null)

function refsErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') return (e as { message: string }).message
  const s = String(e)
  if (s === '[object Object]') return 'Произошла ошибка при обращении к базе данных.'
  return s
}

async function loadRefs() {
  if (!isSupabaseConfigured()) return
  refsLoading.value = true
  refsError.value = null
  try {
    const [reasons, operations, landTypesList, cropsList] = await Promise.all([
      loadDowntimeReasons(),
      loadWorkOperations(),
      loadLandTypes(),
      loadCrops(),
    ])
    downtimeReasons.value = reasons
    workOperations.value = operations
    landTypes.value = landTypesList
    crops.value = cropsList
  } catch (e) {
    refsError.value = refsErrorMessage(e)
  } finally {
    refsLoading.value = false
  }
}

async function addReason() {
  const label = newReasonLabel.value.trim()
  if (!label) return
  refsError.value = null
  try {
    const createdBy = auth.user.value?.email ?? null
    const row = await addDowntimeReason(label, newReasonDesc.value.trim(), newReasonCategory.value, createdBy)
    downtimeReasons.value = [...downtimeReasons.value, row]
    newReasonLabel.value = ''
    newReasonDesc.value = ''
  } catch (e) {
    refsError.value = refsErrorMessage(e)
  }
}

async function addOperation() {
  const name = newOperationName.value.trim()
  if (!name) return
  refsError.value = null
  try {
    const createdBy = auth.user.value?.email ?? null
    const row = await addWorkOperation(name, createdBy)
    workOperations.value = [...workOperations.value, row]
    newOperationName.value = ''
  } catch (e) {
    refsError.value = refsErrorMessage(e)
  }
}

function openDeleteReasonConfirm(r: DowntimeReasonRow) {
  deleteConfirmReasonId.value = r.id
}
function closeDeleteReasonConfirm() {
  deleteConfirmReasonId.value = null
}
async function confirmDeleteReason() {
  const id = deleteConfirmReasonId.value
  if (!id) return
  closeDeleteReasonConfirm()
  refsError.value = null
  try {
    await deleteDowntimeReason(id)
    downtimeReasons.value = downtimeReasons.value.filter((r) => r.id !== id)
    refsPageReasons.value = Math.max(1, Math.min(refsPageReasons.value, totalPagesReasons.value))
  } catch (e) {
    refsError.value = refsErrorMessage(e)
  }
}

function openDeleteOperationConfirm(op: WorkOperationRow) {
  deleteConfirmOperationId.value = op.id
}
function closeDeleteOperationConfirm() {
  deleteConfirmOperationId.value = null
}
async function confirmDeleteOperation() {
  const id = deleteConfirmOperationId.value
  if (!id) return
  closeDeleteOperationConfirm()
  refsError.value = null
  try {
    await deleteWorkOperation(id)
    workOperations.value = workOperations.value.filter((op) => op.id !== id)
    refsPageOperations.value = Math.max(1, Math.min(refsPageOperations.value, totalPagesOperations.value))
  } catch (e) {
    refsError.value = refsErrorMessage(e)
  }
}

async function addLandType() {
  const name = newLandTypeName.value.trim()
  if (!name) return
  refsError.value = null
  try {
    const row = await addLandTypeApi(name)
    landTypes.value = [...landTypes.value, row]
    newLandTypeName.value = ''
  } catch (e) {
    refsError.value = refsErrorMessage(e)
  }
}

function openDeleteLandTypeConfirm(t: LandTypeRow) {
  deleteConfirmLandTypeId.value = t.id
}
function closeDeleteLandTypeConfirm() {
  deleteConfirmLandTypeId.value = null
}
async function confirmDeleteLandType() {
  const id = deleteConfirmLandTypeId.value
  if (!id) return
  closeDeleteLandTypeConfirm()
  refsError.value = null
  try {
    await deleteLandTypeApi(id)
    landTypes.value = landTypes.value.filter((t) => t.id !== id)
    refsPageLandTypes.value = Math.max(1, Math.min(refsPageLandTypes.value, totalPagesLandTypes.value))
  } catch (e) {
    refsError.value = refsErrorMessage(e)
  }
}

async function addCrop() {
  const label = newCropLabel.value.trim()
  if (!label) return
  refsError.value = null
  try {
    const row = await addCropApi(label)
    crops.value = [...crops.value, row]
    newCropLabel.value = ''
  } catch (e) {
    refsError.value = refsErrorMessage(e)
  }
}

function openDeleteCropConfirm(c: CropRow) {
  deleteConfirmCropId.value = c.id
}
function closeDeleteCropConfirm() {
  deleteConfirmCropId.value = null
}
async function confirmDeleteCrop() {
  const id = deleteConfirmCropId.value
  if (!id) return
  closeDeleteCropConfirm()
  refsError.value = null
  try {
    await deleteCropApi(id)
    crops.value = crops.value.filter((c) => c.id !== id)
    refsPageCrops.value = Math.max(1, Math.min(refsPageCrops.value, totalPagesCrops.value))
  } catch (e) {
    refsError.value = refsErrorMessage(e)
  }
}

function formatRefDate(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

type PageTab = 'fields' | 'downtime-reasons' | 'work-operations' | 'land-types' | 'crops'
const activeTab = ref<PageTab>('fields')
const TABS: { id: PageTab; label: string }[] = [
  { id: 'fields', label: 'Управление полями' },
  { id: 'downtime-reasons', label: 'Причины простоя' },
  { id: 'work-operations', label: 'Операции для работы' },
  { id: 'land-types', label: 'Типы земли' },
  { id: 'crops', label: 'Культуры' },
]

onMounted(async () => {
  if (isSupabaseConfigured()) {
    await loadRefs()
    await loadFieldsData()
  } else {
    fields.value = [...DEMO_FIELDS]
    selectedFieldId.value = DEMO_FIELDS[0]?.id ?? null
    loadRefs()
  }
})
</script>

<template>
  <section class="fields-page">
    <div class="fields-page-inner">
      <header class="fields-header page-enter-item">
        <div class="fields-header-text">
          <h1 class="fields-title">Поля и культуры</h1>
          <p v-show="activeTab === 'fields'" class="fields-subtitle">Реестр сельскохозяйственных угодий и назначение ответственных</p>
        </div>
        <button v-show="activeTab === 'fields'" class="fields-add-btn" type="button" @click="openAddField">
          <svg class="fields-add-btn-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
          Добавить поле
        </button>
      </header>

      <nav class="fields-tabs page-enter-item" aria-label="Разделы">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          type="button"
          class="fields-tab"
          :class="{ 'fields-tab--active': activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </nav>

      <div v-show="activeTab === 'fields'" class="fields-tab-panel">
      <div class="fields-card">
        <div class="fields-toolbar">
          <div class="fields-search-wrap">
            <svg class="fields-search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input
              v-model="searchText"
              type="search"
              class="fields-search-input"
              placeholder="Поиск по названию или культуре..."
              autocomplete="off"
            />
          </div>
          <button type="button" class="fields-filters-btn" aria-label="Фильтры">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            Фильтры
          </button>
        </div>

        <p v-if="fieldsError" class="fields-load-error">{{ fieldsError }}</p>
        <div v-if="fieldsLoading" class="fields-loading">Загрузка полей...</div>
        <div class="fields-table-wrap">
          <table class="fields-table" aria-label="Список полей">
            <thead>
              <tr>
                <th scope="col" class="fields-th-name">
                  <div class="fields-th-with-sort">Название <svg class="fields-th-sort" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 8l4-4 4 4M8 16l4 4 4-4"/></svg></div>
                </th>
                <th scope="col" class="fields-th-area">
                  <div class="fields-th-with-sort">Площадь (га) <svg class="fields-th-sort" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 8l4-4 4 4M8 16l4 4 4-4"/></svg></div>
                </th>
                <th scope="col" class="fields-th-crop">
                  <div class="fields-th-with-sort">Культура <svg class="fields-th-sort" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 8l4-4 4 4M8 16l4 4 4-4"/></svg></div>
                </th>
                <th scope="col" class="fields-th-land">Тип земли</th>
                <th scope="col" class="fields-th-location">Описание</th>
                <th scope="col" class="fields-th-responsible">Ответственный</th>
                <th scope="col" class="fields-th-actions">Действия</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="f in paginatedFields"
                :key="f.id"
                class="fields-tr"
                @click="goToFieldDetails(f.id)"
              >
                <td class="fields-td-name">
                  <div class="fields-name-main">{{ f.name }}</div>
                  <div :class="['fields-name-cad', { 'fields-name-cad--empty': !f.cadastralNumber }]">{{ f.cadastralNumber ? `Кад. №: ${f.cadastralNumber}` : 'Нет кад. номера' }}</div>
                </td>
                <td class="fields-td-area">{{ f.area }}</td>
                <td class="fields-td-crop">
                  <span :class="cropPillClass(f)">{{ f.cropName }}</span>
                </td>
                <td class="fields-td-land">{{ f.landType }}</td>
                <td class="fields-td-location">
                  <div class="fields-location-text" :title="f.locationDescription">{{ f.locationDescription || '—' }}</div>
                </td>
                <td class="fields-td-responsible" @click.stop>
                  <select
                    :value="f.responsibleId || ''"
                    class="fields-responsible-select"
                    @change="onResponsibleChange(f.id, ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="">Не назначен</option>
                    <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.display_name || p.email }}</option>
                  </select>
                </td>
                <td class="fields-td-actions" @click.stop>
                  <div class="fields-actions-row">
                    <a
                      v-if="f.schemeFileUrl"
                      :href="f.schemeFileUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="fields-action-btn"
                      aria-label="Открыть схему"
                      title="Открыть схему"
                      @click.stop
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                    </a>
                    <span v-else class="fields-action-btn fields-action-btn--disabled" title="Нет схемы" aria-label="Нет схемы">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                    </span>
                    <button type="button" class="fields-action-btn" aria-label="Редактировать" title="Редактировать" @click="openEditField(f)">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </button>
                    <button type="button" class="fields-action-btn fields-action-btn--danger" aria-label="Удалить" title="Удалить" @click="openDeleteConfirm(f)">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="!paginatedFields.length">
                <td colspan="7" class="fields-empty">Нет полей. Добавьте поле с помощью кнопки выше.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="fields-pagination">
          <p class="fields-pagination-info">
            Показано от <span class="fields-pagination-num">{{ totalFiltered ? (currentPage - 1) * pageSize + 1 : 0 }}</span> до <span class="fields-pagination-num">{{ totalFiltered ? Math.min(currentPage * pageSize, totalFiltered) : 0 }}</span> из <span class="fields-pagination-num">{{ totalFiltered }}</span> полей
          </p>
          <nav class="fields-pagination-nav" aria-label="Пагинация">
            <button
              type="button"
              class="fields-page-btn fields-page-btn--edge"
              :disabled="currentPage <= 1"
              aria-label="Предыдущая страница"
              @click="setPage(currentPage - 1)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <template v-for="(p, i) in paginationPages" :key="p === '...' ? `ellipsis-${i}` : p">
              <button
                v-if="p !== '...'"
                type="button"
                class="fields-page-btn"
                :class="{ 'fields-page-btn--active': p === currentPage }"
                @click="setPage(p as number)"
              >
                {{ p }}
              </button>
              <span v-else class="fields-page-ellipsis">…</span>
            </template>
            <button
              type="button"
              class="fields-page-btn fields-page-btn--edge"
              :disabled="currentPage >= totalPages"
              aria-label="Следующая страница"
              @click="setPage(currentPage + 1)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </nav>
        </div>
      </div>
      </div>

      <div v-show="activeTab === 'downtime-reasons'" class="fields-tab-panel">
        <div v-if="isSupabaseConfigured()" class="refs-card card">
          <h2 class="refs-title">Причины простоя</h2>
          <p class="refs-desc">Подставляются на экране «Экран оператора» при нажатии «Начать простой». Кто добавил — записывается в базу.</p>
          <div v-if="refsError" class="refs-error">{{ refsError }}</div>
          <div class="refs-block">
            <div class="refs-add-row">
              <input v-model="newReasonLabel" type="text" placeholder="Название (например: Поломка гидравлики)" class="refs-input" />
              <input v-model="newReasonDesc" type="text" placeholder="Описание (необязательно)" class="refs-input refs-input--wide" />
              <select v-model="newReasonCategory" class="refs-select">
                <option v-for="(label, key) in CATEGORY_LABELS" :key="key" :value="key">{{ label }}</option>
              </select>
              <button type="button" class="refs-btn" :disabled="refsLoading || !newReasonLabel.trim()" @click="addReason">Добавить</button>
            </div>
            <div class="refs-table-wrap">
              <table class="refs-table">
                <thead>
                  <tr>
                    <th>Название</th>
                    <th>Описание</th>
                    <th>Категория</th>
                    <th>Кто добавил</th>
                    <th>Когда</th>
                    <th class="refs-th-actions">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in paginatedReasons" :key="r.id">
                    <td>{{ r.label }}</td>
                    <td class="refs-cell-muted">{{ r.description || '—' }}</td>
                    <td>{{ CATEGORY_LABELS[r.category] }}</td>
                    <td class="refs-cell-muted">{{ r.created_by || '—' }}</td>
                    <td class="refs-cell-muted">{{ formatRefDate(r.created_at) }}</td>
                    <td class="refs-cell-actions">
                      <button type="button" class="refs-btn refs-btn--danger" :disabled="refsLoading" @click="openDeleteReasonConfirm(r)">Удалить</button>
                    </td>
                  </tr>
                  <tr v-if="!downtimeReasons.length && !refsLoading">
                    <td colspan="6" class="refs-empty">Пока нет записей. Добавьте причину выше.</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="downtimeReasons.length > 0" class="refs-pagination">
              <div class="refs-pagination-left">
                <p class="refs-pagination-info">
                  Показано от <span class="refs-pagination-num">{{ (refsPageReasons - 1) * refsPageSize + 1 }}</span> до <span class="refs-pagination-num">{{ Math.min(refsPageReasons * refsPageSize, downtimeReasons.length) }}</span> из <span class="refs-pagination-num">{{ downtimeReasons.length }}</span>
                </p>
                <label class="refs-pagination-size">
                  Строк на странице:
                  <select v-model.number="refsPageSize" class="refs-pagination-select" @change="onRefsPageSizeChange">
                    <option v-for="n in REFS_PAGE_SIZE_OPTIONS" :key="n" :value="n">{{ n }}</option>
                  </select>
                </label>
              </div>
              <nav class="refs-pagination-nav" aria-label="Пагинация">
                <button type="button" class="refs-page-btn refs-page-btn--edge" :disabled="refsPageReasons <= 1" aria-label="Предыдущая страница" @click="setRefsPageReasons(refsPageReasons - 1)">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>
                </button>
                <template v-for="(p, i) in refsPaginationPages(totalPagesReasons, refsPageReasons)" :key="p === '...' ? `reasons-ellipsis-${i}` : p">
                  <button v-if="p !== '...'" type="button" class="refs-page-btn" :class="{ 'refs-page-btn--active': p === refsPageReasons }" @click="setRefsPageReasons(p as number)">{{ p }}</button>
                  <span v-else class="refs-page-ellipsis">…</span>
                </template>
                <button type="button" class="refs-page-btn refs-page-btn--edge" :disabled="refsPageReasons >= totalPagesReasons" aria-label="Следующая страница" @click="setRefsPageReasons(refsPageReasons + 1)">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
                </button>
              </nav>
            </div>
          </div>
        </div>
        <p v-else class="refs-no-supabase">Подключите Supabase для управления справочниками.</p>
      </div>

      <div v-show="activeTab === 'work-operations'" class="fields-tab-panel">
        <div v-if="isSupabaseConfigured()" class="refs-card card">
          <h2 class="refs-title">Операции для работы</h2>
          <p class="refs-desc">Подставляются на экране «Экран оператора» при нажатии «Начать операцию». Кто добавил — записывается в базу.</p>
          <div v-if="refsError" class="refs-error">{{ refsError }}</div>
          <div class="refs-block">
            <div class="refs-add-row">
              <input v-model="newOperationName" type="text" placeholder="Название (например: Пахота, Посев)" class="refs-input refs-input--wide" />
              <button type="button" class="refs-btn" :disabled="refsLoading || !newOperationName.trim()" @click="addOperation">Добавить</button>
            </div>
            <div class="refs-table-wrap">
              <table class="refs-table">
                <thead>
                  <tr>
                    <th>Название</th>
                    <th>Кто добавил</th>
                    <th>Когда</th>
                    <th class="refs-th-actions">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="op in paginatedOperations" :key="op.id">
                    <td>{{ op.name }}</td>
                    <td class="refs-cell-muted">{{ op.created_by || '—' }}</td>
                    <td class="refs-cell-muted">{{ formatRefDate(op.created_at) }}</td>
                    <td class="refs-cell-actions">
                      <button type="button" class="refs-btn refs-btn--danger" :disabled="refsLoading" @click="openDeleteOperationConfirm(op)">Удалить</button>
                    </td>
                  </tr>
                  <tr v-if="!workOperations.length && !refsLoading">
                    <td colspan="4" class="refs-empty">Пока нет записей. Добавьте операцию выше.</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="workOperations.length > 0" class="refs-pagination">
              <div class="refs-pagination-left">
                <p class="refs-pagination-info">
                  Показано от <span class="refs-pagination-num">{{ (refsPageOperations - 1) * refsPageSize + 1 }}</span> до <span class="refs-pagination-num">{{ Math.min(refsPageOperations * refsPageSize, workOperations.length) }}</span> из <span class="refs-pagination-num">{{ workOperations.length }}</span>
                </p>
                <label class="refs-pagination-size">
                  Строк на странице:
                  <select v-model.number="refsPageSize" class="refs-pagination-select" @change="onRefsPageSizeChange">
                    <option v-for="n in REFS_PAGE_SIZE_OPTIONS" :key="n" :value="n">{{ n }}</option>
                  </select>
                </label>
              </div>
              <nav class="refs-pagination-nav" aria-label="Пагинация">
                <button type="button" class="refs-page-btn refs-page-btn--edge" :disabled="refsPageOperations <= 1" aria-label="Предыдущая страница" @click="setRefsPageOperations(refsPageOperations - 1)">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>
                </button>
                <template v-for="(p, i) in refsPaginationPages(totalPagesOperations, refsPageOperations)" :key="p === '...' ? `ops-ellipsis-${i}` : p">
                  <button v-if="p !== '...'" type="button" class="refs-page-btn" :class="{ 'refs-page-btn--active': p === refsPageOperations }" @click="setRefsPageOperations(p as number)">{{ p }}</button>
                  <span v-else class="refs-page-ellipsis">…</span>
                </template>
                <button type="button" class="refs-page-btn refs-page-btn--edge" :disabled="refsPageOperations >= totalPagesOperations" aria-label="Следующая страница" @click="setRefsPageOperations(refsPageOperations + 1)">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
                </button>
              </nav>
            </div>
          </div>
        </div>
        <p v-else class="refs-no-supabase">Подключите Supabase для управления справочниками.</p>
      </div>

      <div v-show="activeTab === 'land-types'" class="fields-tab-panel">
        <div v-if="isSupabaseConfigured()" class="refs-card card">
          <h2 class="refs-title">Типы земли</h2>
          <p class="refs-desc refs-desc--small">Используются в форме добавления/редактирования поля и везде на бэкенде.</p>
          <div v-if="refsError" class="refs-error">{{ refsError }}</div>
          <div class="refs-block">
            <div class="refs-add-row">
              <input v-model="newLandTypeName" type="text" placeholder="Например: Пашня, Залежь" class="refs-input refs-input--wide" />
              <button type="button" class="refs-btn" :disabled="refsLoading || !newLandTypeName.trim()" @click="addLandType">Добавить</button>
            </div>
            <div class="refs-table-wrap">
              <table class="refs-table">
                <thead>
                  <tr>
                    <th>Название</th>
                    <th class="refs-th-actions">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="t in paginatedLandTypes" :key="t.id">
                    <td>{{ t.name }}</td>
                    <td class="refs-cell-actions">
                      <button type="button" class="refs-btn refs-btn--danger" :disabled="refsLoading" @click="openDeleteLandTypeConfirm(t)">Удалить</button>
                    </td>
                  </tr>
                  <tr v-if="!landTypes.length && !refsLoading">
                    <td colspan="2" class="refs-empty">Пока нет записей. Добавьте тип земли выше или выполните миграцию в SQL Editor.</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="landTypes.length > 0" class="refs-pagination">
              <div class="refs-pagination-left">
                <p class="refs-pagination-info">
                  Показано от <span class="refs-pagination-num">{{ (refsPageLandTypes - 1) * refsPageSize + 1 }}</span> до <span class="refs-pagination-num">{{ Math.min(refsPageLandTypes * refsPageSize, landTypes.length) }}</span> из <span class="refs-pagination-num">{{ landTypes.length }}</span>
                </p>
                <label class="refs-pagination-size">
                  Строк на странице:
                  <select v-model.number="refsPageSize" class="refs-pagination-select" @change="onRefsPageSizeChange">
                    <option v-for="n in REFS_PAGE_SIZE_OPTIONS" :key="n" :value="n">{{ n }}</option>
                  </select>
                </label>
              </div>
              <nav class="refs-pagination-nav" aria-label="Пагинация">
                <button type="button" class="refs-page-btn refs-page-btn--edge" :disabled="refsPageLandTypes <= 1" aria-label="Предыдущая страница" @click="setRefsPageLandTypes(refsPageLandTypes - 1)">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>
                </button>
                <template v-for="(p, i) in refsPaginationPages(totalPagesLandTypes, refsPageLandTypes)" :key="p === '...' ? `land-ellipsis-${i}` : p">
                  <button v-if="p !== '...'" type="button" class="refs-page-btn" :class="{ 'refs-page-btn--active': p === refsPageLandTypes }" @click="setRefsPageLandTypes(p as number)">{{ p }}</button>
                  <span v-else class="refs-page-ellipsis">…</span>
                </template>
                <button type="button" class="refs-page-btn refs-page-btn--edge" :disabled="refsPageLandTypes >= totalPagesLandTypes" aria-label="Следующая страница" @click="setRefsPageLandTypes(refsPageLandTypes + 1)">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
                </button>
              </nav>
            </div>
          </div>
        </div>
        <p v-else class="refs-no-supabase">Подключите Supabase для управления справочниками.</p>
      </div>

      <div v-show="activeTab === 'crops'" class="fields-tab-panel">
        <div v-if="isSupabaseConfigured()" class="refs-card card">
          <h2 class="refs-title">Культуры</h2>
          <p class="refs-desc refs-desc--small">Названия используются в форме поля и везде в приложении.</p>
          <div v-if="refsError" class="refs-error">{{ refsError }}</div>
          <div class="refs-block">
            <div class="refs-add-row">
              <input v-model="newCropLabel" type="text" placeholder="Название (например: Пшеница)" class="refs-input refs-input--wide" />
              <button type="button" class="refs-btn" :disabled="refsLoading || !newCropLabel.trim()" @click="addCrop">Добавить</button>
            </div>
            <div class="refs-table-wrap">
              <table class="refs-table">
                <thead>
                  <tr>
                    <th>Название</th>
                    <th class="refs-th-actions">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="c in paginatedCrops" :key="c.id">
                    <td>{{ c.label }}</td>
                    <td class="refs-cell-actions">
                      <button type="button" class="refs-btn refs-btn--danger" :disabled="refsLoading" @click="openDeleteCropConfirm(c)">Удалить</button>
                    </td>
                  </tr>
                  <tr v-if="!crops.length && !refsLoading">
                    <td colspan="2" class="refs-empty">Пока нет записей. Добавьте культуру выше или выполните миграцию в SQL Editor.</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="crops.length > 0" class="refs-pagination">
              <div class="refs-pagination-left">
                <p class="refs-pagination-info">
                  Показано от <span class="refs-pagination-num">{{ (refsPageCrops - 1) * refsPageSize + 1 }}</span> до <span class="refs-pagination-num">{{ Math.min(refsPageCrops * refsPageSize, crops.length) }}</span> из <span class="refs-pagination-num">{{ crops.length }}</span>
                </p>
                <label class="refs-pagination-size">
                  Строк на странице:
                  <select v-model.number="refsPageSize" class="refs-pagination-select" @change="onRefsPageSizeChange">
                    <option v-for="n in REFS_PAGE_SIZE_OPTIONS" :key="n" :value="n">{{ n }}</option>
                  </select>
                </label>
              </div>
              <nav class="refs-pagination-nav" aria-label="Пагинация">
                <button type="button" class="refs-page-btn refs-page-btn--edge" :disabled="refsPageCrops <= 1" aria-label="Предыдущая страница" @click="setRefsPageCrops(refsPageCrops - 1)">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>
                </button>
                <template v-for="(p, i) in refsPaginationPages(totalPagesCrops, refsPageCrops)" :key="p === '...' ? `crops-ellipsis-${i}` : p">
                  <button v-if="p !== '...'" type="button" class="refs-page-btn" :class="{ 'refs-page-btn--active': p === refsPageCrops }" @click="setRefsPageCrops(p as number)">{{ p }}</button>
                  <span v-else class="refs-page-ellipsis">…</span>
                </template>
                <button type="button" class="refs-page-btn refs-page-btn--edge" :disabled="refsPageCrops >= totalPagesCrops" aria-label="Следующая страница" @click="setRefsPageCrops(refsPageCrops + 1)">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
                </button>
              </nav>
            </div>
          </div>
        </div>
        <p v-else class="refs-no-supabase">Подключите Supabase для управления справочниками.</p>
      </div>

      <div
        v-if="isFieldModalOpen"
        class="modal-backdrop"
        @click="closeFieldModal"
      >
        <div class="modal modal-fields modal-fields--add" @click.stop>
          <header class="modal-header modal-header--fields">
            <h2 class="modal-title modal-title--fields">
              <svg class="modal-title-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm0 4a1 1 0 0 0-1 1v2H9a1 1 0 0 0 0 2h2v2a1 1 0 0 0 2 0v-2h2a1 1 0 0 0 0-2h-2V9a1 1 0 0 0-1-1Z"/></svg>
              {{ fieldModalTitle }}
            </h2>
            <button type="button" class="modal-close" aria-label="Закрыть" @click="closeFieldModal">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </header>
          <div v-if="fieldFormError" class="modal-error">{{ fieldFormError }}</div>
          <div class="modal-form modal-form--add">
            <div class="modal-form-section">
              <label class="modal-field modal-field--full">
                <span class="modal-label">Название поля <span class="modal-label-required">*</span></span>
                <input
                  v-model="newFieldName"
                  type="text"
                  class="modal-input"
                  placeholder="Например: Поле №12 – Пшеница"
                />
              </label>
            </div>
            <div class="modal-form-section modal-form-section--grid">
              <label class="modal-field">
                <span class="modal-label">Кадастровый номер <span class="modal-label-opt">(опц.)</span></span>
                <input v-model="newFieldCadastral" type="text" class="modal-input" placeholder="XX:XX:XXXXXXX:XX" />
              </label>
              <label class="modal-field">
                <span class="modal-label">Площадь, га <span class="modal-label-required">*</span></span>
                <div class="modal-input-wrap modal-input-wrap--suffix">
                  <input
                    v-model.number="newFieldArea"
                    type="number"
                    min="0"
                    step="0.01"
                    class="modal-input"
                    placeholder="0.00"
                  />
                  <span class="modal-input-suffix">га</span>
                </div>
              </label>
            </div>
            <div class="modal-form-section">
              <label class="modal-field modal-field--full">
                <span class="modal-label">Адрес <span class="modal-label-opt">(опц.)</span></span>
                <input
                  v-model="newFieldAddress"
                  type="text"
                  class="modal-input"
                  placeholder="Например: Московская обл., Раменский р-н, д. Вялки"
                />
              </label>
            </div>
            <div class="modal-form-section modal-form-section--grid modal-form-section--grid-4">
              <label class="modal-field">
                <span class="modal-label">Тип земли</span>
                <select v-model="newFieldLandType" class="modal-select">
                  <option v-for="t in landTypeOptions" :key="t.name" :value="t.name">{{ t.name }}</option>
                </select>
              </label>
              <label class="modal-field">
                <span class="modal-label">Культура</span>
                <select v-model="newFieldCropKey" class="modal-select">
                  <option v-for="opt in cropOptions" :key="opt.key" :value="opt.key">{{ opt.label }}</option>
                </select>
              </label>
              <label class="modal-field">
                <span class="modal-label">Год посева</span>
                <input v-model.number="newFieldSowingYear" type="number" class="modal-input" min="2000" :max="new Date().getFullYear() + 2" />
              </label>
              <label class="modal-field">
                <span class="modal-label">Ответственный</span>
                <select v-model="newFieldResponsibleId" class="modal-select">
                  <option value="">Не назначен</option>
                  <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.display_name || p.email }}</option>
                </select>
              </label>
            </div>
            <div class="modal-form-section">
              <label class="modal-field modal-field--full">
                <span class="modal-label">Описание местоположения</span>
                <textarea
                  v-model="newFieldLocationDesc"
                  class="modal-textarea"
                  rows="3"
                  placeholder="Опишите границы текстом (например: От дороги до ручья, прямоугольник 500×200 м...)"
                />
              </label>
            </div>
            <div class="modal-form-section">
              <div class="modal-field modal-field--full">
                <span class="modal-label">Прикрепить схему/план <span class="modal-label-opt">(опц.)</span></span>
                <input
                  id="field-scheme-file-input"
                  ref="schemeFileInputRef"
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                  class="modal-file-input-hidden"
                  aria-hidden="true"
                  @change="onSchemeFileSelect"
                />
                <label
                  for="field-scheme-file-input"
                  class="modal-dropzone-label"
                  :class="{ 'modal-dropzone--loading': schemeUploading }"
                  @dragover.prevent="onSchemeDragOver"
                  @dragleave.prevent="onSchemeDragLeave"
                  @drop.prevent="onSchemeDrop"
                >
                  <template v-if="schemeUploading">Загрузка...</template>
                  <template v-else-if="newFieldSchemeFileName">
                    <div class="modal-scheme-preview-wrap">
                      <img
                        v-if="isSchemeImage && schemePreviewUrl"
                        :src="schemePreviewUrl"
                        class="modal-scheme-preview-img"
                        alt="Превью схемы"
                        @error="($event.target as HTMLImageElement).style.display = 'none'"
                      />
                      <div v-else class="modal-scheme-preview-pdf">
                        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                        <span>PDF</span>
                      </div>
                      <span class="modal-dropzone-filename">{{ newFieldSchemeFileName }}</span>
                      <button type="button" class="modal-dropzone-remove" @click.prevent.stop="clearSchemeFile">Удалить</button>
                    </div>
                  </template>
                  <template v-else>
                    <svg class="modal-dropzone-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                    <span class="modal-dropzone-text">Загрузить файл</span> или перетащите сюда
                    <span class="modal-file-hint">JPG, PNG, PDF до 10MB</span>
                  </template>
                </label>
                <div v-if="schemeUploadError" class="modal-error modal-error--dropzone" role="alert">{{ schemeUploadError }}</div>
              </div>
            </div>
          </div>
          <div class="modal-actions modal-actions--fields">
            <button class="modal-btn-ghost" type="button" @click="closeFieldModal">Отмена</button>
            <button class="modal-btn" type="button" @click="addField">{{ editingFieldId ? 'Сохранить' : 'Сохранить поле' }}</button>
          </div>
        </div>
      </div>

      <div
        v-if="deleteConfirmFieldId"
        class="fields-confirm-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fields-delete-confirm-title"
        @click.self="closeDeleteConfirm"
      >
        <div class="fields-confirm-modal">
          <h2 id="fields-delete-confirm-title" class="fields-confirm-title">Удаление поля</h2>
          <p class="fields-confirm-text">
            <template v-if="fieldToDelete">Вы уверены, что хотите удалить поле «{{ fieldToDelete.name }}»?</template>
            <template v-else>Вы уверены, что хотите удалить это поле?</template>
          </p>
          <div class="fields-confirm-actions">
            <button type="button" class="modal-btn-ghost" @click="closeDeleteConfirm">Отмена</button>
            <button type="button" class="modal-btn modal-btn--danger" @click="confirmDelete">Удалить</button>
          </div>
        </div>
      </div>

      <div
        v-if="deleteConfirmReasonId"
        class="fields-confirm-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="refs-delete-reason-title"
        @click.self="closeDeleteReasonConfirm"
      >
        <div class="fields-confirm-modal">
          <h2 id="refs-delete-reason-title" class="fields-confirm-title">Удаление причины простоя</h2>
          <p class="fields-confirm-text">
            <template v-if="reasonToDelete">Вы уверены, что хотите удалить причину «{{ reasonToDelete.label }}»?</template>
            <template v-else>Вы уверены, что хотите удалить эту причину простоя?</template>
          </p>
          <div class="fields-confirm-actions">
            <button type="button" class="modal-btn-ghost" @click="closeDeleteReasonConfirm">Отмена</button>
            <button type="button" class="modal-btn modal-btn--danger" @click="confirmDeleteReason">Удалить</button>
          </div>
        </div>
      </div>

      <div
        v-if="deleteConfirmOperationId"
        class="fields-confirm-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="refs-delete-operation-title"
        @click.self="closeDeleteOperationConfirm"
      >
        <div class="fields-confirm-modal">
          <h2 id="refs-delete-operation-title" class="fields-confirm-title">Удаление операции</h2>
          <p class="fields-confirm-text">
            <template v-if="operationToDelete">Вы уверены, что хотите удалить операцию «{{ operationToDelete.name }}»?</template>
            <template v-else>Вы уверены, что хотите удалить эту операцию?</template>
          </p>
          <div class="fields-confirm-actions">
            <button type="button" class="modal-btn-ghost" @click="closeDeleteOperationConfirm">Отмена</button>
            <button type="button" class="modal-btn modal-btn--danger" @click="confirmDeleteOperation">Удалить</button>
          </div>
        </div>
      </div>

      <div
        v-if="deleteConfirmLandTypeId"
        class="fields-confirm-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="refs-delete-land-type-title"
        @click.self="closeDeleteLandTypeConfirm"
      >
        <div class="fields-confirm-modal">
          <h2 id="refs-delete-land-type-title" class="fields-confirm-title">Удаление типа земли</h2>
          <p class="fields-confirm-text">
            <template v-if="landTypeToDelete">Вы уверены, что хотите удалить тип земли «{{ landTypeToDelete.name }}»?</template>
            <template v-else>Вы уверены, что хотите удалить этот тип земли?</template>
          </p>
          <div class="fields-confirm-actions">
            <button type="button" class="modal-btn-ghost" @click="closeDeleteLandTypeConfirm">Отмена</button>
            <button type="button" class="modal-btn modal-btn--danger" @click="confirmDeleteLandType">Удалить</button>
          </div>
        </div>
      </div>

      <div
        v-if="deleteConfirmCropId"
        class="fields-confirm-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="refs-delete-crop-title"
        @click.self="closeDeleteCropConfirm"
      >
        <div class="fields-confirm-modal">
          <h2 id="refs-delete-crop-title" class="fields-confirm-title">Удаление культуры</h2>
          <p class="fields-confirm-text">
            <template v-if="cropToDelete">Вы уверены, что хотите удалить культуру «{{ cropToDelete.label }}»?</template>
            <template v-else>Вы уверены, что хотите удалить эту культуру?</template>
          </p>
          <div class="fields-confirm-actions">
            <button type="button" class="modal-btn-ghost" @click="closeDeleteCropConfirm">Отмена</button>
            <button type="button" class="modal-btn modal-btn--danger" @click="confirmDeleteCrop">Удалить</button>
          </div>
        </div>
      </div>

    </div>
  </section>
</template>

<style scoped>
/* ——— Макет по design-1adafb22 (Управление полями) ——— */
.fields-page {
  padding: 0;
}
.fields-page-inner {
  max-width: 1400px;
  margin: 0 auto;
}
.fields-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}
.fields-header-text {
  flex: 1;
  min-width: 0;
}
.fields-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  line-height: 1.3;
}
.fields-subtitle {
  margin: 4px 0 0;
  font-size: 0.875rem;
  color: var(--text-secondary);
  line-height: 1.4;
}
.fields-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  margin-bottom: var(--space-lg);
  border-bottom: 1px solid var(--border-color);
}
.fields-tab {
  padding: 10px 16px;
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
}
.fields-tab:hover {
  color: var(--text-primary);
}
.fields-tab--active {
  color: var(--accent-green);
  border-bottom-color: var(--accent-green);
}
.fields-tab-panel {
  min-height: 200px;
}
.refs-no-supabase {
  padding: var(--space-xl);
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.9375rem;
}
.fields-add-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 8px;
  border: none;
  background: var(--accent-green);
  color: #fff;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease, box-shadow 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
.fields-add-btn:hover {
  background: var(--accent-green-hover);
}
.fields-add-btn-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
.fields-card {
  background: var(--bg-panel);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  margin-bottom: var(--space-xl);
}
.fields-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-md);
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-panel);
}
.fields-search-wrap {
  position: relative;
  flex: 1;
  min-width: 200px;
  max-width: 28rem;
}
.fields-search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  color: var(--text-secondary);
  pointer-events: none;
}
.fields-search-input {
  width: 100%;
  padding: 8px 12px 8px 40px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  color: var(--text-primary);
  font-size: 0.875rem;
  transition: border-color 0.2s ease, outline 0.2s ease;
}
.fields-search-input::placeholder {
  color: var(--text-secondary);
}
.fields-search-input:focus {
  outline: none;
  border-color: var(--accent-green);
  box-shadow: 0 0 0 1px var(--accent-green);
}
.fields-filters-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  color: var(--text-primary);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
}
.fields-filters-btn:hover {
  background: var(--bg-panel-hover);
}
.fields-filters-btn svg {
  flex-shrink: 0;
  color: var(--text-secondary);
}
.fields-table-wrap {
  overflow-x: auto;
}
.fields-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.fields-table thead {
  background: rgba(0, 0, 0, 0.02);
}
.fields-table th,
.fields-table td {
  padding: 14px 24px;
  border-bottom: 1px solid var(--border-color);
  vertical-align: middle;
  text-align: left;
}
.fields-table th {
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
}
.fields-th-with-sort {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.fields-th-sort {
  flex-shrink: 0;
  opacity: 0.7;
  color: var(--text-secondary);
}
.fields-th-name,
.fields-td-name { min-width: 180px; }
.fields-th-area,
.fields-td-area { width: 100px; min-width: 100px; text-align: right; }
.fields-td-area { font-variant-numeric: tabular-nums; font-weight: 500; color: var(--text-primary); }
.fields-th-crop,
.fields-td-crop { min-width: 120px; }
.fields-th-land,
.fields-td-land { min-width: 100px; color: var(--text-secondary); font-size: 0.875rem; }
.fields-th-location,
.fields-td-location { min-width: 250px; }
.fields-th-responsible,
.fields-td-responsible { min-width: 140px; }
.fields-responsible-select {
  width: 100%;
  min-width: 120px;
  padding: 6px 28px 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  color: var(--text-primary);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
}
.fields-responsible-select:hover {
  border-color: var(--accent-green);
}
.fields-responsible-select:focus {
  outline: none;
  border-color: var(--accent-green);
  box-shadow: 0 0 0 1px var(--accent-green);
}
.fields-th-actions,
.fields-td-actions { width: 120px; min-width: 120px; text-align: right; }
.fields-table tbody tr {
  transition: background 0.15s ease;
}
.fields-table tbody tr:hover {
  background: var(--row-hover-bg);
}
.fields-table tbody tr:last-child td {
  border-bottom: none;
}
.fields-tr {
  cursor: pointer;
}
.fields-name-main {
  font-weight: 500;
  color: var(--text-primary);
}
.fields-name-cad {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 2px;
}
.fields-name-cad--empty {
  font-style: italic;
  color: var(--text-secondary);
  opacity: 0.9;
}
.fields-actions-row {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  flex-wrap: nowrap;
}
.filter-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.chip-group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}
.chip {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease,
    border-color 0.2s ease;
}
.chip:hover {
  border-color: var(--accent-green);
  color: var(--text-primary);
}
.chip-active {
  background: var(--accent-green);
  border-color: var(--accent-green);
  color: #000;
}
.search-input input {
  width: 260px;
  max-width: 100%;
  padding: 8px 10px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
  font-size: 0.85rem;
}
.search-input input::placeholder {
  color: var(--text-secondary);
}
.search-input input:focus-visible {
  outline: 1px solid var(--accent-green);
  outline-offset: 2px;
}

/* Пилюли культуры — по макету (amber, yellow, green, gray) */
.fields-crop-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 500;
  border: 1px solid;
}
.fields-crop-pill--wheat {
  background: #fffbeb;
  color: #b45309;
  border-color: #fcd34d;
}
.fields-crop-pill--sunflower {
  background: #fefce8;
  color: #a16207;
  border-color: #fde047;
}
.fields-crop-pill--soy {
  background: #f0fdf4;
  color: #166534;
  border-color: #bbf7d0;
}
.fields-crop-pill--grey {
  background: #f3f4f6;
  color: #374151;
  border-color: #e5e7eb;
}
.fields-crop-pill--meadow {
  background: #f0fdf4;
  color: var(--accent-green);
  border-color: #bbf7d0;
}
.fields-td-location {
  max-width: 280px;
}
.fields-location-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  color: var(--text-secondary);
}
.fields-responsible-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.fields-responsible-wrap--empty {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px dashed var(--border-color);
  color: var(--text-secondary);
  font-style: italic;
  min-width: 100px;
}
.fields-responsible-wrap--empty .fields-responsible-text {
  color: var(--text-secondary);
}
.fields-responsible-text {
  color: var(--accent-green);
  font-weight: 500;
}
.fields-responsible-arrow {
  flex-shrink: 0;
  color: var(--text-secondary);
  opacity: 0.8;
}
.fields-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-md) 24px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-panel);
}
.fields-pagination-info {
  font-size: 0.875rem;
  color: var(--text-primary);
  margin: 0;
}
.fields-pagination-num {
  font-weight: 500;
}
.fields-pagination-nav {
  display: inline-flex;
  align-items: center;
  gap: 0;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
.fields-page-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  color: var(--text-primary);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}
.fields-page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.fields-page-btn--edge {
  padding: 0 8px;
}
.fields-page-btn--active {
  background: var(--nav-active-bg);
  border-color: var(--accent-green);
  color: var(--accent-green);
  z-index: 1;
}
.fields-page-ellipsis {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 36px;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  color: var(--text-primary);
  font-size: 0.875rem;
}

/* Кнопки действий — в один ряд, один размер */
.fields-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 6px;
  color: var(--text-secondary);
  transition: background 0.2s ease, color 0.2s ease;
  flex-shrink: 0;
  text-decoration: none;
}
.fields-action-btn--disabled {
  cursor: default;
  opacity: 0.45;
  pointer-events: none;
}
.fields-action-btn:hover {
  background: var(--bg-panel-hover);
  color: var(--text-primary);
}
.fields-action-btn:first-child:hover {
  color: #2563eb;
  background: #eff6ff;
}
.fields-action-btn:nth-child(2):hover {
  color: var(--accent-green);
  background: var(--nav-active-bg);
}
.fields-action-btn--danger:hover {
  background: color-mix(in srgb, var(--danger-red) 15%, transparent);
  color: var(--danger-red);
}
.fields-load-error {
  padding: var(--space-md) 24px;
  color: var(--danger-red);
  font-size: 0.875rem;
  margin: 0;
}
.fields-loading {
  padding: var(--space-md) 24px;
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.fields-empty {
  color: var(--text-secondary);
  font-style: italic;
  padding: var(--space-xl);
  text-align: center;
}
.fields-page-btn:hover:not(:disabled):not(.fields-page-btn--active) {
  background: var(--bg-panel-hover);
}

.fields-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1.7fr);
  gap: var(--space-xl);
  align-items: flex-start;
}

.map-container {
  position: relative;
  height: 400px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.map-svg {
  width: 100%;
  height: 100%;
  opacity: 0.85;
}

.field-polygon {
  stroke: #ffffff;
  stroke-width: 1.2;
  stroke-opacity: 0.6;
  cursor: pointer;
  transition:
    fill-opacity 0.2s ease,
    stroke-width 0.2s ease,
    stroke-opacity 0.2s ease,
    opacity 0.2s ease;
}

.field-polygon[data-field-id='field-5'] {
  fill: var(--wheat-gold);
  fill-opacity: 0.45;
}

.field-polygon[data-field-id='field-12'] {
  fill: var(--corn-yellow);
  fill-opacity: 0.45;
}

.field-polygon[data-field-id='field-3'] {
  fill: var(--soy-green);
  fill-opacity: 0.45;
}

.field-polygon[data-field-id='field-8'] {
  fill: var(--accent-green);
  fill-opacity: 0.45;
}

.field-polygon[data-field-id='field-21'] {
  fill: var(--accent-green);
  fill-opacity: 0.3;
}

.field-polygon:hover {
  fill-opacity: 0.7;
  stroke-width: 1.6;
}

.field-polygon.is-active {
  stroke-width: 2;
  stroke-opacity: 1;
}

.field-polygon.is-dimmed {
  opacity: 0.25;
}

.field-polygon:focus-visible {
  outline: 2px solid var(--accent-green);
  outline-offset: 3px;
}

.map-overlay {
  position: absolute;
  top: 20px;
  right: 20px;
  background: var(--bg-panel);
  padding: var(--space-md);
  border: 1px solid var(--border-color);
  backdrop-filter: blur(10px);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
  margin-bottom: 4px;
  color: var(--text-primary);
}

.color-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.color-wheat {
  background: var(--wheat-gold);
}

.color-corn {
  background: var(--corn-yellow);
}

.color-soy {
  background: var(--soy-green);
}

.color-sunflower {
  background: var(--accent-green);
}

.fields-panel {
  display: grid;
  grid-template-rows: minmax(0, 2.2fr) minmax(0, 1.4fr);
  gap: var(--space-md);
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-md);
  overflow-y: auto;
  padding-right: 4px;
}

.field-card {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    transform 0.1s ease;
  cursor: pointer;
}

.field-card:hover {
  border-color: var(--accent-green);
  background: var(--bg-panel-hover);
  transform: translateY(-1px);
}

.field-card.is-active {
  border-color: var(--accent-green);
  box-shadow: 0 0 0 1px rgba(104, 173, 51, 0.4);
}

.field-image {
  height: 120px;
  background-size: cover;
  background-position: center;
  position: relative;
}

.crop-badge {
  position: absolute;
  top: 10px;
  left: 10px;
  padding: 4px 8px;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #000;
  border-radius: 2px;
  background: var(--accent-green);
}

.field-info {
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.field-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-md);
}

.progress-bar-container {
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  width: 100%;
  margin-top: 4px;
}

.progress-bar {
  height: 100%;
  background: var(--accent-green);
}

.stats-row {
  display: flex;
  justify-content: space-between;
  gap: var(--space-md);
}

.stats-row-secondary {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding-top: 8px;
  margin-top: 4px;
  font-size: 0.8rem;
}

.field-details {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.field-details-empty {
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.field-details-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-md);
}

.field-details-main {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-md);
}

.field-details-actions {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.btn {
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-primary);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease,
    border-color 0.2s ease;
}

.btn-primary {
  border-color: var(--accent-green);
  background: var(--accent-green);
  color: #000;
}

.btn-primary:hover {
  background: var(--accent-green-hover);
  border-color: var(--accent-green-hover);
}

.btn-ghost:hover {
  border-color: var(--accent-green);
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-secondary);
}

.pill-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent-green);
}

.select-checkbox {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: rgba(0, 0, 0, 0.2);
  cursor: pointer;
}

.select-checkbox input {
  display: none;
}

.select-checkbox span {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  background: transparent;
  transition:
    background 0.2s ease,
    box-shadow 0.2s ease;
}

.select-checkbox input:checked + span {
  background: var(--accent-green);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6);
}

.field-details-aggregate {
  grid-column: 1 / -1;
  padding-top: var(--space-sm);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.field-polygon.is-selected-group {
  opacity: 1;
  stroke-width: 2;
}

.refs-section {
  margin-top: var(--space-xl);
}
.refs-card {
  padding: var(--space-lg);
}
.refs-title {
  margin: 0 0 8px;
  font-size: 1.15rem;
  font-weight: 600;
}
.refs-desc {
  margin: 0 0 var(--space-lg);
  font-size: 0.9rem;
  color: var(--text-secondary);
}
.refs-desc--small {
  margin-bottom: var(--space-md);
  font-size: 0.8125rem;
}
.refs-code {
  font-size: 0.875em;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--chip-bg);
  color: var(--text-primary);
}
.refs-error {
  margin-bottom: var(--space-md);
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(185, 84, 80, 0.15);
  color: var(--danger-red);
  font-size: 0.9rem;
}
.refs-block {
  margin-bottom: var(--space-xl);
}
.refs-block:last-child {
  margin-bottom: 0;
}
.refs-block-title {
  margin: 0 0 var(--space-md);
  font-size: 1rem;
  font-weight: 600;
}
.refs-add-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: center;
  margin-bottom: var(--space-md);
}
.refs-input {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 0.9rem;
  min-width: 160px;
}
.refs-input--wide {
  flex: 1;
  min-width: 200px;
}
.refs-select {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 0.9rem;
  background: var(--bg-panel);
  color: var(--text-primary);
}
.refs-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  background: var(--accent-green);
  color: #fff;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
}
.refs-btn:hover:not(:disabled) {
  background: var(--accent-green-hover);
}
.refs-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.refs-btn--danger {
  background: #c0392b;
  color: #fff;
}
.refs-btn--danger:hover:not(:disabled) {
  background: #a93226;
}
.refs-th-actions {
  width: 100px;
  text-align: right;
}
.refs-cell-actions {
  text-align: right;
}
.refs-table-wrap {
  overflow-x: auto;
}
.refs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.refs-table th,
.refs-table td {
  padding: 8px 12px;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
}
.refs-table th {
  color: var(--text-secondary);
  font-weight: 500;
}
.refs-cell-muted {
  color: var(--text-secondary);
}
.refs-empty {
  color: var(--text-secondary);
  font-style: italic;
}
.refs-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-md) 0 0;
  margin-top: var(--space-md);
  border-top: 1px solid var(--border-color);
}
.refs-pagination-left {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-md);
}
.refs-pagination-info {
  font-size: 0.875rem;
  color: var(--text-primary);
  margin: 0;
}
.refs-pagination-size {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin: 0;
}
.refs-pagination-select {
  padding: 4px 8px;
  font-size: 0.875rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-panel);
  color: var(--text-primary);
  cursor: pointer;
}
.refs-pagination-select:focus {
  outline: none;
  border-color: var(--accent-green);
}
.refs-pagination-num {
  font-weight: 500;
}
.refs-pagination-nav {
  display: inline-flex;
  align-items: center;
  gap: 0;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
.refs-page-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  color: var(--text-primary);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}
.refs-page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.refs-page-btn--edge {
  padding: 0 8px;
}
.refs-page-btn--active {
  background: var(--nav-active-bg);
  border-color: var(--accent-green);
  color: var(--accent-green);
}
.refs-page-ellipsis {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 36px;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-lg);
  padding-bottom: var(--space-md);
  border-bottom: 1px solid var(--border-color);
}
.modal-header .modal-title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}
.modal-close {
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s ease, background 0.2s ease;
}
.modal-close:hover {
  color: var(--text-primary);
  background: var(--sidebar-hover-bg);
}
.modal-close svg {
  width: 20px;
  height: 20px;
}
.modal-error {
  margin-bottom: var(--space-md);
  padding: 10px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--danger-red) 12%, transparent);
  color: var(--danger-red);
  font-size: 0.875rem;
}
.modal-error--dropzone {
  margin-top: var(--space-sm);
  margin-bottom: 0;
}
.modal.modal-fields--add {
  width: min(calc(100vw - 48px), 672px);
  max-width: 672px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 0;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}
.modal-header--fields {
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.modal-title--fields {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--text-primary);
}
.modal-title-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  color: var(--accent-green);
}
.modal-form--add {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-lg);
}
.modal-actions--fields {
  flex-shrink: 0;
  flex-direction: row-reverse;
  gap: 12px;
  padding: var(--space-md) var(--space-lg);
  border-top: 1px solid var(--border-color);
  background: var(--bg-panel-hover);
  border-radius: 0 0 12px 12px;
}
.modal-label-required {
  color: var(--danger-red);
}
.modal-label-opt {
  color: var(--text-secondary);
  font-weight: 400;
}
.modal-input-wrap {
  position: relative;
  width: 100%;
}
.modal-input-wrap--suffix .modal-input {
  padding-right: 48px;
}
.modal-input-suffix {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.875rem;
  color: var(--text-secondary);
  pointer-events: none;
}
.modal-form--add {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}
.modal-form-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}
.modal-form-section--grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-md);
  align-items: start;
}
.modal-form-section--grid-4 {
  grid-template-columns: repeat(2, 1fr);
}
@media (min-width: 520px) {
  .modal-form-section--grid-4 {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
.modal-form .modal-field--full {
  grid-column: 1 / -1;
}
.modal-form .modal-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  align-items: stretch;
}
.modal-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  line-height: 1.3;
}
.modal-select,
.modal-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  font-size: 0.9375rem;
  line-height: 1.4;
  color: var(--text-primary);
  font-family: inherit;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.modal-select:focus,
.modal-input:focus {
  outline: none;
  border-color: var(--accent-green);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-green) 20%, transparent);
}
.modal-select {
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 16px 16px;
  padding-right: 40px;
}
.modal-input::placeholder {
  color: var(--text-secondary);
  opacity: 0.8;
}
.modal-textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 100px;
  padding: 10px 12px;
  font-size: 0.9375rem;
  line-height: 1.4;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  color: var(--text-primary);
  font-family: inherit;
  resize: vertical;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.modal-textarea::placeholder {
  color: var(--text-secondary);
  opacity: 0.8;
}
.modal-textarea:focus {
  outline: none;
  border-color: var(--accent-green);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-green) 20%, transparent);
}
.modal-dropzone,
.modal-dropzone-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  min-height: 100px;
  padding: var(--space-lg) var(--space-md);
  border: 2px dashed var(--border-color);
  border-radius: 8px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.9375rem;
  line-height: 1.4;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s, background 0.2s;
}
.modal-dropzone-label {
  margin: 0;
  font-weight: inherit;
}
.modal-dropzone:hover,
.modal-dropzone-label:hover {
  border-color: var(--accent-green);
  color: var(--accent-green);
  background: var(--nav-active-bg);
}
.modal-dropzone-icon {
  width: 20px;
  height: 20px;
  color: var(--accent-green);
  opacity: 0.9;
  flex-shrink: 0;
}
.modal-dropzone-text {
  font-weight: 500;
  font-size: 0.9375rem;
}
.modal-file-hint {
  font-size: 0.75rem;
  line-height: 1.3;
  color: var(--text-secondary);
  opacity: 0.9;
}
.modal-file-input-hidden {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}
.modal-dropzone--loading {
  pointer-events: none;
  opacity: 0.8;
}
.modal-scheme-preview-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  width: 100%;
}
.modal-scheme-preview-img {
  max-width: 100%;
  max-height: 180px;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-page);
}
.modal-scheme-preview-pdf {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.modal-scheme-preview-pdf svg {
  color: var(--accent-green);
  opacity: 0.9;
}
.modal-dropzone-filename {
  font-weight: 500;
  color: var(--text-primary);
  word-break: break-all;
  font-size: 0.875rem;
}
.modal-dropzone-remove {
  padding: var(--space-xs) var(--space-sm);
  font-size: 0.875rem;
  color: var(--accent-green);
  background: transparent;
  border: 1px solid var(--accent-green);
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}
.modal-dropzone-remove:hover {
  background: var(--accent-green);
  color: var(--bg-panel);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: var(--modal-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 40;
}
.modal.modal-fields:not(.modal-fields--add) {
  width: min(100vw - 48px, 360px);
  background: var(--bg-panel);
  border-radius: 16px;
  border: 1px solid var(--border-color);
  padding: var(--space-lg);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}
.modal-title {
  font-size: 1.15rem;
  font-weight: 500;
  margin: 0 0 8px;
}
.modal-desc {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin: 0 0 var(--space-md);
  line-height: 1.45;
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
.modal-input {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  width: 100%;
}
.modal-input--readonly {
  opacity: 0.8;
  cursor: default;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-md);
  margin-top: var(--space-md);
  padding-top: var(--space-lg);
  border-top: 1px solid var(--border-color);
}
.modal-btn,
.modal-btn-ghost {
  padding: 10px 20px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  font-size: 0.9375rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}
.modal-btn {
  background: var(--accent-green);
  border-color: var(--accent-green);
  color: #fff;
}
.modal-btn:hover:not(:disabled) {
  background: var(--accent-green-hover);
  border-color: var(--accent-green-hover);
  color: #fff;
}
.modal-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.modal-btn-ghost {
  background: transparent;
  color: var(--text-secondary);
}
.modal-btn-ghost:hover {
  background: var(--sidebar-hover-bg);
  color: var(--text-primary);
}
.modal-btn--danger {
  background: var(--danger-red);
  border-color: var(--danger-red);
  color: #fff;
}
.modal-btn--danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--danger-red) 85%, black);
  border-color: color-mix(in srgb, var(--danger-red) 85%, black);
  color: #fff;
}
/* Модальное окно подтверждения удаления (как в ProfilePage) */
.fields-confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-lg);
  background: var(--modal-backdrop);
}
.fields-confirm-modal {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: var(--space-xl);
  max-width: 400px;
  width: 100%;
  box-shadow: var(--shadow-card);
}
.fields-confirm-title {
  margin: 0 0 var(--space-sm) 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
}
.fields-confirm-text {
  margin: 0 0 var(--space-lg) 0;
  font-size: 0.9375rem;
  color: var(--text-secondary);
  line-height: 1.5;
}
.fields-confirm-actions {
  display: flex;
  gap: var(--space-md);
  justify-content: flex-end;
}

/* ——— Тёмная тема: модальное окно добавления/редактирования поля ——— */
[data-theme='dark'] .fields-page .modal-backdrop {
  background: rgba(0, 0, 0, 0.6);
}
[data-theme='dark'] .modal.modal-fields--add {
  background: rgba(18, 32, 20, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.04);
}
[data-theme='dark'] .modal-header--fields {
  border-bottom-color: rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.15);
}
[data-theme='dark'] .modal.modal-fields--add .modal-form--add {
  background: transparent;
}
[data-theme='dark'] .modal.modal-fields--add .modal-label {
  color: rgba(255, 255, 255, 0.65);
}
[data-theme='dark'] .modal.modal-fields--add .modal-input,
[data-theme='dark'] .modal.modal-fields--add .modal-select,
[data-theme='dark'] .modal.modal-fields--add .modal-textarea {
  background: rgba(0, 0, 0, 0.35);
  border-color: rgba(255, 255, 255, 0.12);
  color: #fff;
}
[data-theme='dark'] .modal.modal-fields--add .modal-input::placeholder,
[data-theme='dark'] .modal.modal-fields--add .modal-textarea::placeholder {
  color: rgba(255, 255, 255, 0.4);
}
[data-theme='dark'] .modal.modal-fields--add .modal-input:focus,
[data-theme='dark'] .modal.modal-fields--add .modal-select:focus,
[data-theme='dark'] .modal.modal-fields--add .modal-textarea:focus {
  border-color: var(--accent-green);
  background: rgba(0, 0, 0, 0.4);
  box-shadow: 0 0 0 2px rgba(104, 173, 51, 0.25);
}
[data-theme='dark'] .modal.modal-fields--add .modal-select {
  background-color: rgba(0, 0, 0, 0.35);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 16px 16px;
  padding-right: 40px;
}
[data-theme='dark'] .modal.modal-fields--add .modal-select option {
  background: #1a2f1a;
  color: #fff;
}
[data-theme='dark'] .modal.modal-fields--add .modal-input-suffix {
  color: rgba(255, 255, 255, 0.5);
}
[data-theme='dark'] .modal.modal-fields--add .modal-dropzone-label {
  background: rgba(0, 0, 0, 0.25);
  border-color: rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.7);
}
[data-theme='dark'] .modal.modal-fields--add .modal-dropzone-label:hover {
  background: rgba(104, 173, 51, 0.15);
  border-color: var(--accent-green);
  color: var(--accent-green);
}
[data-theme='dark'] .modal.modal-fields--add .modal-file-hint {
  color: rgba(255, 255, 255, 0.45);
}
[data-theme='dark'] .modal.modal-fields--add .modal-actions--fields {
  background: rgba(0, 0, 0, 0.25);
  border-top-color: rgba(255, 255, 255, 0.1);
}
[data-theme='dark'] .modal.modal-fields--add .modal-btn-ghost {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.9);
}
[data-theme='dark'] .modal.modal-fields--add .modal-btn-ghost:hover {
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(255, 255, 255, 0.3);
  color: #fff;
}
[data-theme='dark'] .modal.modal-fields--add .modal-btn {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
[data-theme='dark'] .modal.modal-fields--add .modal-scheme-preview-img {
  background: rgba(0, 0, 0, 0.3);
  border-color: rgba(255, 255, 255, 0.1);
}
[data-theme='dark'] .modal.modal-fields--add .modal-scheme-preview-pdf {
  color: rgba(255, 255, 255, 0.6);
}
[data-theme='dark'] .modal.modal-fields--add .modal-dropzone-filename {
  color: rgba(255, 255, 255, 0.95);
}
[data-theme='dark'] .modal.modal-fields--add .modal-close:hover {
  background: rgba(255, 255, 255, 0.1);
}

@media (max-width: 1024px) {
  .fields-layout {
    grid-template-columns: 1fr;
  }

  .fields-panel {
    grid-template-rows: auto auto;
  }
}
</style>

