<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/stores/auth'
import {
  isSupabaseConfigured,
  loadDowntimeReasons,
  addDowntimeReason,
  loadWorkOperations,
  addWorkOperation,
  type DowntimeReasonRow,
  type WorkOperationRow,
  type DowntimeCategory,
} from '@/lib/reasonsAndOperations'

type CropKey = 'all' | 'wheat' | 'corn' | 'soy' | 'sunflower'

const CATEGORY_LABELS: Record<DowntimeCategory, string> = {
  breakdown: 'Поломка',
  rain: 'Дождь / погода',
  fuel: 'Нет топлива',
  waiting: 'Ожидание задания',
}

type Field = {
  id: string
  name: string
  area: number
  cropKey: Exclude<CropKey, 'all'>
  cropName: string
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

const fields = ref<Field[]>([
  {
    id: 'field-5',
    name: 'Поле #5',
    area: 120,
    cropKey: 'wheat',
    cropName: 'Пшеница',
    stage: 'Восковая спелость',
    readinessPercent: 85,
    forecastYield: '45 ц/га',
    harvestDate: '12.08',
    soilType: 'Чернозём тяжёлый',
    moisture: '18%',
    lastOperation: 'Внесение КАС',
    imageUrl:
      'https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'field-12',
    name: 'Поле #12',
    area: 85,
    cropKey: 'corn',
    cropName: 'Кукуруза',
    stage: 'Цветение',
    readinessPercent: 40,
    forecastYield: '72 ц/га',
    harvestDate: '25.09',
    soilType: 'Супесь',
    moisture: '22%',
    lastOperation: 'Междурядная культивация',
    imageUrl:
      'https://images.unsplash.com/photo-1594488344604-037042831a29?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'field-3',
    name: 'Поле #3',
    area: 210,
    cropKey: 'soy',
    cropName: 'Соя',
    stage: 'Налив бобов',
    readinessPercent: 60,
    forecastYield: '28 ц/га',
    harvestDate: '05.09',
    soilType: 'Суглинок',
    moisture: '20%',
    lastOperation: 'Опрыскивание гербицидом',
    imageUrl:
      'https://images.unsplash.com/photo-1530507629858-e4977d30e9e0?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'field-8',
    name: 'Поле #8',
    area: 155,
    cropKey: 'sunflower',
    cropName: 'Подсолнечник',
    stage: 'Созревание',
    readinessPercent: 92,
    forecastYield: '34 ц/га',
    harvestDate: '15.08',
    soilType: 'Чернозём средний',
    moisture: '16%',
    lastOperation: 'Фунгицидная обработка',
    imageUrl:
      'https://images.unsplash.com/photo-1464303350174-88981f335b71?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'field-21',
    name: 'Поле #21',
    area: 64,
    cropKey: 'wheat',
    cropName: 'Пшеница',
    stage: 'Кущение',
    readinessPercent: 22,
    forecastYield: '39 ц/га',
    harvestDate: '30.09',
    soilType: 'Супесь',
    moisture: '24%',
    lastOperation: 'Вспашка',
    imageUrl:
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=400&q=80',
  },
])

const cropFilter = ref<CropKey>('all')
const searchText = ref('')
const selectedFieldId = ref(fields.value[0]?.id ?? null)
const multiSelectedIds = ref<string[]>([])

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

const polygonDefs: Array<{ id: string; d: string }> = [
  { id: 'field-5', d: 'M100,50 L300,40 L350,150 L120,160 Z' },
  { id: 'field-12', d: 'M320,45 L500,60 L520,180 L370,190 Z' },
  { id: 'field-3', d: 'M530,70 L750,80 L730,250 L550,230 Z' },
  { id: 'field-8', d: 'M130,180 L380,210 L340,350 L100,320 Z' },
  { id: 'field-21', d: 'M410,210 L720,270 L680,380 L450,350 Z' },
]

const visibleFieldIds = computed(() => new Set(filteredFields.value.map((f) => f.id)))

// Справочники: причины простоя и операции (из БД)
const auth = useAuth()
const downtimeReasons = ref<DowntimeReasonRow[]>([])
const workOperations = ref<WorkOperationRow[]>([])
const refsLoading = ref(false)
const newReasonLabel = ref('')
const newReasonDesc = ref('')
const newReasonCategory = ref<DowntimeCategory>('breakdown')
const newOperationName = ref('')
const refsError = ref<string | null>(null)

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
    downtimeReasons.value = await loadDowntimeReasons()
    workOperations.value = await loadWorkOperations()
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

function formatRefDate(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

onMounted(loadRefs)
</script>

<template>
  <section>
    <header class="header-area page-enter-item">
      <div>
        <div class="type-label" style="margin-bottom: 8px">Текущий раздел</div>
        <h1 class="page-title">Мониторинг полей</h1>
      </div>
      <button class="type-action" type="button">Добавить поле +</button>
    </header>

    <div class="fields-toolbar">
      <div class="filter-group">
        <span class="type-label" style="margin-bottom: 4px">Фильтр по культурам</span>
        <div class="chip-group">
          <button
            class="chip"
            :class="{ 'chip-active': cropFilter === 'all' }"
            type="button"
            @click="setCropFilter('all')"
          >
            Все
          </button>
          <button
            class="chip"
            :class="{ 'chip-active': cropFilter === 'wheat' }"
            type="button"
            @click="setCropFilter('wheat')"
          >
            Пшеница
          </button>
          <button
            class="chip"
            :class="{ 'chip-active': cropFilter === 'corn' }"
            type="button"
            @click="setCropFilter('corn')"
          >
            Кукуруза
          </button>
          <button
            class="chip"
            :class="{ 'chip-active': cropFilter === 'soy' }"
            type="button"
            @click="setCropFilter('soy')"
          >
            Соя
          </button>
          <button
            class="chip"
            :class="{ 'chip-active': cropFilter === 'sunflower' }"
            type="button"
            @click="setCropFilter('sunflower')"
          >
            Подсолнечник
          </button>
        </div>
      </div>

      <div class="filter-group">
        <span class="type-label" style="margin-bottom: 4px">Поиск по полям</span>
        <div class="search-input">
          <input v-model="searchText" type="search" placeholder="Например: Поле #5 или культура" autocomplete="off" />
        </div>
      </div>
    </div>

    <div class="fields-layout">
      <div class="map-container">
        <svg class="map-svg" viewBox="0 0 1000 400" preserveAspectRatio="none" aria-label="Схема полей хозяйства">
          <path
            v-for="p in polygonDefs"
            :key="p.id"
            class="field-polygon"
            :class="{
              'is-active': p.id === selectedFieldId,
              'is-dimmed': !visibleFieldIds.has(p.id),
              'is-selected-group': multiSelectedIds.includes(p.id),
            }"
            :data-field-id="p.id"
            :d="p.d"
            tabindex="0"
            @click="selectField(p.id)"
            @keydown.enter.prevent="selectField(p.id)"
            @keydown.space.prevent="selectField(p.id)"
          />
        </svg>

        <div class="map-overlay">
          <div class="type-label" style="margin-bottom: 8px">Легенда культур</div>
          <div class="legend-item"><div class="color-dot color-wheat" /> Пшеница озимая</div>
          <div class="legend-item"><div class="color-dot color-corn" /> Кукуруза</div>
          <div class="legend-item"><div class="color-dot color-soy" /> Соя</div>
          <div class="legend-item"><div class="color-dot color-sunflower" /> Подсолнечник</div>
        </div>
      </div>

      <div class="fields-panel">
        <div class="field-grid" aria-label="Список полей">
          <article
            v-for="f in filteredFields"
            :key="f.id"
            class="field-card"
            :class="{ 'is-active': f.id === selectedFieldId }"
            @click="selectField(f.id)"
          >
            <div class="field-image" :style="{ backgroundImage: `url('${f.imageUrl}')` }">
              <span class="crop-badge">{{ f.cropName }}</span>
            </div>
            <div class="field-info">
              <div class="field-card-header">
                <div>
                  <div class="type-label">{{ f.name }} • {{ f.area }} Га</div>
                  <div class="type-value">{{ f.stage }}</div>
                </div>
                <label class="select-checkbox">
                  <input
                    type="checkbox"
                    :checked="multiSelectedIds.includes(f.id)"
                    @click.stop="toggleMultiSelect(f.id)"
                  />
                  <span />
                </label>
              </div>
              <div>
                <div class="type-label" style="margin-bottom: 8px">Готовность к уборке: {{ f.readinessPercent }}%</div>
                <div class="progress-bar-container">
                  <div class="progress-bar" :style="{ width: `${f.readinessPercent}%` }" />
                </div>
              </div>
              <div class="stats-row">
                <div>
                  <div class="type-label">Прогноз урожайности</div>
                  <div class="type-value">{{ f.forecastYield }}</div>
                </div>
                <div style="text-align: right">
                  <div class="type-label">Окно уборки</div>
                  <div class="type-value">{{ f.harvestDate }}</div>
                </div>
              </div>
              <div class="stats-row stats-row-secondary">
                <div>
                  <div class="type-label">Тип почвы</div>
                  <div class="type-value">{{ f.soilType }}</div>
                </div>
                <div>
                  <div class="type-label">Влажность</div>
                  <div class="type-value">{{ f.moisture }}</div>
                </div>
                <div style="text-align: right">
                  <div class="type-label">Последняя операция</div>
                  <div class="type-value">{{ f.lastOperation }}</div>
                </div>
              </div>
            </div>
          </article>
        </div>

        <aside class="field-details" aria-live="polite">
          <div class="type-label" style="margin-bottom: 8px">Выбранное поле</div>
          <div v-if="!selectedField" class="field-details-empty">
            Выберите поле на схеме или из списка справа, чтобы увидеть детальную информацию и возможные операции.
          </div>

          <template v-else>
            <div class="field-details-header">
              <div>
                <div class="type-label" style="margin-bottom: 8px">{{ selectedField.name }} • {{ selectedField.area }} Га</div>
                <div class="type-value">{{ selectedField.cropName }} — {{ selectedField.stage }}</div>
              </div>
              <span class="pill">
                <span class="pill-dot" />
                {{ selectedField.readinessPercent }}% готовности
              </span>
            </div>

            <div class="field-details-main">
              <div>
                <div class="type-label" style="margin-bottom: 8px">Прогноз урожайности</div>
                <div class="type-value">{{ selectedField.forecastYield }}</div>
              </div>
              <div>
                <div class="type-label" style="margin-bottom: 8px">Плановая дата уборки</div>
                <div class="type-value">{{ selectedField.harvestDate }}</div>
              </div>
              <div>
                <div class="type-label" style="margin-bottom: 8px">Статус поля</div>
                <div class="type-value">
                  {{
                    selectedField.readinessPercent >= 80
                      ? 'Готово к уборке'
                      : selectedField.readinessPercent >= 50
                        ? 'В активной вегетации'
                        : 'Ранняя стадия'
                  }}
                </div>
              </div>
              <div
                v-if="selectedFields.length > 1"
                class="field-details-aggregate"
              >
                <div class="type-label" style="margin-bottom: 6px">
                  Группа полей ({{ selectedFields.length }})
                </div>
                <div class="type-value">
                  Суммарная площадь: {{ totalSelectedArea }} Га • Средняя готовность:
                  {{ avgSelectedReadiness }}%
                </div>
              </div>
            </div>

            <div class="field-details-actions">
              <button class="btn btn-primary" type="button">Запланировать уборку</button>
              <button class="btn btn-ghost" type="button" @click="openJournal">Открыть журнал работ</button>
              <button class="btn btn-ghost" type="button" @click="openReports">Перейти к отчётам</button>
            </div>
          </template>
        </aside>
      </div>
    </div>

    <div v-if="isSupabaseConfigured()" class="refs-section page-enter-item">
      <div class="refs-card card">
        <h2 class="refs-title">Справочники для экрана оператора</h2>
        <p class="refs-desc">Причины простоя и операции подставляются на экране «Экран оператора» при нажатии «Начать простой» и «Начать операцию». Кто добавил — записывается в базу.</p>
        <div v-if="refsError" class="refs-error">{{ refsError }}</div>

        <div class="refs-block">
          <h3 class="refs-block-title">Причины простоя</h3>
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
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in downtimeReasons" :key="r.id">
                  <td>{{ r.label }}</td>
                  <td class="refs-cell-muted">{{ r.description || '—' }}</td>
                  <td>{{ CATEGORY_LABELS[r.category] }}</td>
                  <td class="refs-cell-muted">{{ r.created_by || '—' }}</td>
                  <td class="refs-cell-muted">{{ formatRefDate(r.created_at) }}</td>
                </tr>
                <tr v-if="!downtimeReasons.length && !refsLoading">
                  <td colspan="5" class="refs-empty">Пока нет записей. Добавьте причину выше.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="refs-block">
          <h3 class="refs-block-title">Операции для работы</h3>
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
                </tr>
              </thead>
              <tbody>
                <tr v-for="op in workOperations" :key="op.id">
                  <td>{{ op.name }}</td>
                  <td class="refs-cell-muted">{{ op.created_by || '—' }}</td>
                  <td class="refs-cell-muted">{{ formatRefDate(op.created_at) }}</td>
                </tr>
                <tr v-if="!workOperations.length && !refsLoading">
                  <td colspan="3" class="refs-empty">Пока нет записей. Добавьте операцию выше.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.fields-toolbar {
  display: flex;
  gap: var(--space-xl);
  align-items: flex-end;
  flex-wrap: wrap;
  margin-bottom: var(--space-xl);
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

@media (max-width: 1024px) {
  .fields-layout {
    grid-template-columns: 1fr;
  }

  .fields-panel {
    grid-template-rows: auto auto;
  }
}
</style>

