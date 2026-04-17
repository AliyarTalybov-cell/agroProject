<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { loadFields, type FieldRow } from '@/lib/fieldsSupabase'
import { loadCrops, type CropRow } from '@/lib/landTypesAndCrops'
import { isSupabaseConfigured } from '@/lib/supabase'
import {
  fetchWeather,
  fetchForecast5,
  getWeatherIconUrl,
  conditionCategoryLabelRu,
  type WeatherData,
  type ForecastDayItem,
} from '@/lib/weatherApi'
import { parseLatLonFromGeolocationString } from '@/lib/yandexGeocode'
import { RUSSIAN_CITIES } from '@/lib/cities'
import { useWeatherCity } from '@/composables/useWeatherCity'
import UiLoadingBar from '@/components/UiLoadingBar.vue'
import YandexMap from '@/components/YandexMap.vue'

const { cityValue, setCity, city, country } = useWeatherCity()
const weather = ref<WeatherData | null>(null)
const forecastDays = ref<ForecastDayItem[]>([])
const fields = ref<FieldRow[]>([])
const crops = ref<CropRow[]>([])
const loading = ref(true)
const error = ref(false)
const pickedCoords = ref<{ lat: number; lon: number } | null>(null)
const pickedCoordsCopied = ref(false)
let pickedCoordsCopiedTimer: ReturnType<typeof setTimeout> | null = null
type LatLon = [number, number]

function fromPolygonGeoJson(geojson: Record<string, unknown> | null | undefined): LatLon[] {
  if (!geojson || geojson.type !== 'Polygon' || !Array.isArray((geojson as { coordinates?: unknown }).coordinates)) return []
  const ring = ((geojson as { coordinates: unknown[] }).coordinates[0] as unknown[]) || []
  const points = ring
    .map((p) => (Array.isArray(p) && p.length >= 2 ? [Number(p[1]), Number(p[0])] as LatLon : null))
    .filter((p): p is LatLon => Boolean(p && Number.isFinite(p[0]) && Number.isFinite(p[1])))
  if (points.length >= 2) {
    const first = points[0]
    const last = points[points.length - 1]
    if (first[0] === last[0] && first[1] === last[1]) points.pop()
  }
  return points
}

async function copyPickedCoords() {
  const p = pickedCoords.value
  if (!p) return
  const text = `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    } catch {
      return
    }
  }
  pickedCoordsCopied.value = true
  if (pickedCoordsCopiedTimer) clearTimeout(pickedCoordsCopiedTimer)
  pickedCoordsCopiedTimer = setTimeout(() => {
    pickedCoordsCopied.value = false
    pickedCoordsCopiedTimer = null
  }, 2000)
}

/** Погода по точке поля (ключ — id поля); null в значении = нет данных / ошибка */
const fieldWeatherById = ref<Record<string, WeatherData | null>>({})
const fieldsLocationWeatherLoading = ref(false)

/** Как в таблице «Поля»: заголовок из name; иначе запасной вариант по number */
function fieldDisplayTitle(f: FieldRow): string {
  const n = (f.name ?? '').trim()
  if (n) return n
  if (f.number != null && Number.isFinite(Number(f.number))) return `Поле №${f.number}`
  return 'Поле'
}

/** Тот же порядок, что при сортировке списка полей по колонке «Название» (как на FieldsPage). */
function compareFieldsByNameThenNumber(a: FieldRow, b: FieldRow): number {
  const c = (a.name ?? '')
    .trim()
    .localeCompare((b.name ?? '').trim(), 'ru', { sensitivity: 'base' })
  if (c !== 0) return c
  return Number(a.number) - Number(b.number)
}

const fieldsSortedForWeather = computed(() => [...fields.value].sort(compareFieldsByNameThenNumber))

async function load() {
  loading.value = true
  error.value = false
  const data = await fetchWeather(city(), country())
  weather.value = data
  forecastDays.value = []
  if (data?.coord?.lat != null && data?.coord?.lon != null) {
    forecastDays.value = await fetchForecast5(data.coord.lat, data.coord.lon)
  }
  loading.value = false
  if (!data) error.value = true
}

watch(cityValue, () => load())

function refresh() {
  void load().then(() => {
    void loadFieldsLocationWeather()
  })
}

/** Погода для карточек полей: по геолокации (+ при необходимости адрес для привязки участка к земле). */
async function loadFieldsLocationWeather() {
  if (!fields.value.length) {
    fieldWeatherById.value = {}
    return
  }
  fieldsLocationWeatherLoading.value = true
  const next: Record<string, WeatherData | null> = {}
  try {
    await Promise.all(
      fields.value.map(async (f) => {
        const coords = parseLatLonFromGeolocationString(f.geolocation)
        const hasAddress = (f.address ?? '').trim().length > 0
        if (!coords || !hasAddress) {
          next[f.id] = null
          return
        }
        next[f.id] = await fetchWeather(coords.lat, coords.lon)
      }),
    )
    fieldWeatherById.value = next
  } finally {
    fieldsLocationWeatherLoading.value = false
  }
}

onMounted(() => {
  void Promise.all([load(), loadFieldsData()])
})

onBeforeUnmount(() => {
  if (pickedCoordsCopiedTimer) clearTimeout(pickedCoordsCopiedTimer)
})

watch(fields, () => {
  void loadFieldsLocationWeather()
})

const updatedAt = computed(() => {
  const d = new Date()
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
})

const dateStr = computed(() => {
  const d = new Date()
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
})

const timeStr = computed(() => {
  const d = new Date()
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
})

const todayStr = computed(() => new Date().toISOString().slice(0, 10))
const tomorrowStr = computed(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10))

const forecastWithLabels = computed(() => {
  return forecastDays.value.map((day, i) => {
    let label = `${day.dayLabel}, ${day.dateLabel}`
    if (day.date === todayStr.value) label = 'Сегодня'
    else if (day.date === tomorrowStr.value) label = 'Завтра'
    return { ...day, displayLabel: label }
  })
})

const windStrong = computed(() => (weather.value?.windSpeed ?? 0) > 5)
const windExtreme = computed(() => (weather.value?.windSpeed ?? 0) > 10)
const tempExtreme = computed(() => {
  const t = weather.value?.temp
  return t != null && (t < -15 || t > 35)
})

const daylightDuration = computed(() => {
  if (!weather.value?.sunrise || !weather.value?.sunset) return '—'
  if (weather.value.sunrise === '—' || weather.value.sunset === '—') return '—'
  
  const parse = (time: string) => {
    const [h, m] = time.split(':').map(Number)
    return h * 60 + m
  }
  
  const diff = parse(weather.value.sunset) - parse(weather.value.sunrise)
  if (diff <= 0) return '—'
  const hrs = Math.floor(diff / 60)
  const mins = diff % 60
  return `${hrs} ч ${mins} мин`
})

/** Класс сценки неба по condition из API (Clear, Clouds, Rain, Snow, Mist и т.д.) */
const weatherSkyClass = computed(() => {
  const c = (weather.value?.condition ?? '').toLowerCase()
  if (c === 'clear') return 'weather-sky--clear'
  if (c === 'clouds') return 'weather-sky--clouds'
  if (c === 'rain' || c === 'drizzle') return 'weather-sky--rain'
  if (c === 'snow') return 'weather-sky--snow'
  if (c === 'mist' || c === 'fog' || c === 'haze' || c === 'smoke') return 'weather-sky--fog'
  if (c === 'thunderstorm') return 'weather-sky--rain'
  return 'weather-sky--clear'
})

async function loadFieldsData() {
  if (!isSupabaseConfigured()) {
    fields.value = []
    crops.value = []
    return
  }
  try {
    const [fieldRows, cropRows] = await Promise.all([loadFields(), loadCrops()])
    fields.value = fieldRows
    crops.value = cropRows
  } catch {
    fields.value = []
    crops.value = []
  }
}

/** Краткая рекомендация для блока в герой-карточке (как на макете) */
const heroRecommendation = computed(() => {
  const data = weather.value
  if (!data) return { title: '', items: [] }
  const wind = data.windSpeed ?? 0
  const precip = data.clouds != null ? 100 - data.clouds : 90
  const okForSpray = wind <= 5 && (data.temp ?? 15) >= 5 && (data.temp ?? 15) <= 28
  const title = okForSpray ? 'Идеально для опрыскивания' : wind > 5 ? 'Отложите опрыскивание' : 'Умеренные условия'
  const items = [
    { label: wind <= 5 ? 'Ветер в норме' : 'Ветер повышен', value: `${wind} м/с` },
    { label: 'Вер. осадков', value: `${Math.round(precip)}%` },
  ]
  return { title, items }
})

const fieldsWithWeather = computed(() => {
  const city = weather.value
  const cropMap = new Map(crops.value.map((c) => [c.key, c.label]))
  const cityTemp = city?.temp ?? 0
  const cityWind = Math.max(0, city?.windSpeed ?? 0)
  const cityIcon = city?.icon ?? '01d'
  const loading = fieldsLocationWeatherLoading.value

  return fieldsSortedForWeather.value.map((f) => {
    const cropName = cropMap.get(f.crop_key) ?? f.crop_key ?? '—'
    const fieldName = fieldDisplayTitle(f)
    const coords = parseLatLonFromGeolocationString(f.geolocation)
    const hasAddress = (f.address ?? '').trim().length > 0
    const eligible = coords != null && hasAddress
    const local = eligible ? fieldWeatherById.value[f.id] : undefined

    let temp: number | null
    let wind: number
    let icon: string
    let windStrong: boolean
    let wx: WeatherData | null = null

    if (eligible && local) {
      temp = local.temp
      wind = Math.max(0, local.windSpeed ?? 0)
      icon = local.icon || cityIcon
      windStrong = wind > 5
      wx = local
    } else if (eligible && loading) {
      temp = null
      wind = 0
      icon = cityIcon
      windStrong = false
      wx = null
    } else {
      temp = cityTemp
      wind = cityWind
      icon = cityIcon
      windStrong = wind > 5
      wx = city ?? null
    }

    const humidity = wx?.humidity ?? null
    const precProbability = wx?.precProbability ?? null
    const pressure = wx?.pressure ?? null
    const visibilityKm =
      wx?.visibility != null ? Number((wx.visibility / 1000).toFixed(1)) : null
    const kpIndex = wx?.kpIndex ?? null
    const conditionLabel = wx ? conditionCategoryLabelRu(wx.condition) : ''
    const windDir = wx?.windDirection?.trim() ? wx.windDirection : ''
    const loadingCard = Boolean(eligible && loading && !local)

    const hasExtras =
      !loadingCard &&
      (Boolean(conditionLabel && conditionLabel !== '—') ||
        humidity != null ||
        precProbability != null ||
        pressure != null ||
        visibilityKm != null ||
        kpIndex != null)

    return {
      id: f.id,
      name: fieldName,
      cropName,
      temp,
      wind,
      windStrong,
      icon,
      windDir,
      humidity,
      precProbability,
      pressure,
      visibilityKm,
      kpIndex,
      conditionLabel,
      hasExtras,
      loading: loadingCard,
    }
  })
})

/** Геометрия полей на карте наблюдения: point -> метка, polygon -> контур */
const weatherMapFieldMarkers = computed(() => {
  const cropMap = new Map(crops.value.map((c) => [c.key, c.label]))
  const result: Array<{
    id: string
    lat: number
    lon: number
    title: string
    subtitle?: string
    geometryMode?: 'point' | 'polygon'
    polygonPoints?: LatLon[]
  }> = []
  for (const f of fieldsSortedForWeather.value) {
    const coords = parseLatLonFromGeolocationString(f.geolocation)
    const geometryMode = ((f as { geometry_mode?: 'point' | 'polygon' | null }).geometry_mode ?? 'point')
    const polygonPoints = fromPolygonGeoJson((f as { contour_geojson?: Record<string, unknown> | null }).contour_geojson ?? null)
    if (!coords && polygonPoints.length < 3) continue
    const title = fieldDisplayTitle(f)
    const cropName = cropMap.get(f.crop_key) ?? f.crop_key ?? ''
    const addr = (f.address ?? '').trim()
    const subtitle = [cropName, addr].filter(Boolean).join(' · ') || undefined
    if (geometryMode === 'polygon' && polygonPoints.length >= 3) {
      const center = {
        lat: polygonPoints.reduce((sum, p) => sum + p[0], 0) / polygonPoints.length,
        lon: polygonPoints.reduce((sum, p) => sum + p[1], 0) / polygonPoints.length,
      }
      result.push({
        id: f.id,
        lat: center.lat,
        lon: center.lon,
        title,
        subtitle,
        geometryMode: 'polygon',
        polygonPoints,
      })
    } else if (coords) {
      result.push({ id: f.id, lat: coords.lat, lon: coords.lon, title, subtitle, geometryMode: 'point' })
    }
  }
  return result
})
</script>

<template>
  <section class="weather-page">
    <header class="header-area header-weather page-enter-item">
      <div class="weather-header-actions">
        <select
          :value="cityValue"
          class="weather-city-select"
          aria-label="Выбор города"
          @change="(e) => setCity((e.target as HTMLSelectElement).value)"
        >
          <option v-for="c in RUSSIAN_CITIES" :key="c.value" :value="c.value">{{ c.label }}</option>
        </select>
        <button type="button" class="weather-refresh-btn" aria-label="Обновить" @click="refresh">Обновить</button>
      </div>
    </header>

    <div v-if="loading" class="weather-detail-loading">
      <UiLoadingBar size="md" />
    </div>
    <div v-else-if="error" class="weather-detail-error">Не удалось загрузить погоду</div>
    <template v-else-if="weather">
      <!-- Герой-карточка как в design: волна + локация | температура | рекомендация -->
      <div class="weather-hero page-enter-item" style="--enter-delay: 60ms">
        <svg class="weather-hero-wave" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 320" preserveAspectRatio="none" aria-hidden="true">
          <path fill="#ffffff" fill-opacity="1" d="M0,128L48,144C96,160,192,192,288,197.3C384,203,480,181,576,170.7C672,160,768,160,864,170.7C960,181,1056,203,1152,192C1248,181,1344,139,1392,117.3L1440,96L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
        </svg>
        <div class="weather-hero-inner">
          <div class="weather-hero-main">
            <div class="weather-hero-location">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
              <span>Локация</span>
            </div>
            <h2 class="weather-hero-city">{{ weather.cityName }}</h2>
            <p v-if="weather.coord" class="weather-hero-coords">Координаты: {{ weather.coord.lat?.toFixed(4) }}° N, {{ weather.coord.lon?.toFixed(4) }}° E</p>
            <p class="weather-hero-datetime">Сегодня, {{ dateStr }} • {{ timeStr }}</p>
          </div>
          <div class="weather-hero-temp-block">
            <img class="weather-current-icon" :src="getWeatherIconUrl(weather.icon)" alt="" width="96" height="96" />
            <div class="weather-hero-temp-wrap">
              <span class="weather-hero-temp">{{ weather.temp != null ? weather.temp : '—' }}°C</span>
              <div class="weather-hero-desc">{{ weather.description }}</div>
            </div>
          </div>
          <aside class="weather-recommendation-inline">
            <h3>
              <span style="background:#4ade80;color:#14532d;padding:6px;border-radius:8px;display:inline-flex;">✓</span>
              Рекомендация
            </h3>
            <p>{{ heroRecommendation.title }}</p>
            <ul>
              <li v-for="(item, i) in heroRecommendation.items" :key="i">
                <span>✓ {{ item.label }}</span>
                <span>{{ item.value }}</span>
              </li>
            </ul>
          </aside>
        </div>
      </div>

      <h2 class="weather-section-title page-enter-item" style="--enter-delay: 120ms">Подробные показатели</h2>
      <div class="weather-indicators-grid page-enter-item" style="--enter-delay: 180ms">
        <div class="weather-indicator-card">
          <div class="weather-indicator-icon weather-icon-wind">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" /><path d="M9.6 4.6A2 2 0 1 1 11 8H2" /><path d="M12.6 19.4A2 2 0 1 0 14 16H2" /></svg>
          </div>
          <div>
            <div class="weather-indicator-label">Ветер</div>
            <div class="weather-indicator-value">{{ weather.windSpeed != null ? weather.windSpeed : '—' }} <span class="weather-indicator-muted">м/с, {{ weather.windDirection || '—' }}</span></div>
            <div class="weather-indicator-sub">{{ windStrong ? 'Осторожно' : 'Безопасно для работ' }}</div>
          </div>
        </div>
        <div class="weather-indicator-card">
          <div class="weather-indicator-icon weather-icon-humidity"><!-- humidity --><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22a5 5 0 0 0 5-5c0-2-5-10-5-10S7 15 7 17a5 5 0 0 0 5 5z" /></svg></div>
          <div>
            <div class="weather-indicator-label">Влажность</div>
            <div class="weather-indicator-value">{{ weather.humidity != null ? weather.humidity : '—' }}<span class="weather-indicator-muted">%</span></div>
            <div class="weather-indicator-sub">{{ weather.humidity == null ? '—' : (weather.humidity < 40 ? 'Воздух очень сухой' : (weather.humidity > 80 ? 'Повышенная влажность' : 'Оптимальная')) }}</div>
          </div>
        </div>
        <div class="weather-indicator-card">
          <div class="weather-indicator-icon weather-icon-pressure"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 14 4-4" /><path d="M3.34 19a10 10 0 1 1 17.32 0" /></svg></div>
          <div>
            <div class="weather-indicator-label">Давление</div>
            <div class="weather-indicator-value">{{ weather.pressure != null ? weather.pressure : '—' }}<span class="weather-indicator-muted"> мм</span></div>
            <div class="weather-indicator-sub">Привед. к морю: {{ weather.meanSeaLevelPressure != null ? weather.meanSeaLevelPressure + ' мм' : '—' }}</div>
          </div>
        </div>
        <div class="weather-indicator-card">
          <div class="weather-indicator-icon weather-icon-visibility"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg></div>
          <div>
            <div class="weather-indicator-label">Видимость</div>
            <div class="weather-indicator-value">{{ weather.visibility != null ? Number((weather.visibility / 1000).toFixed(1)) : '—' }}<span class="weather-indicator-muted"> км</span></div>
            <div class="weather-indicator-sub">{{ weather.visibility == null ? '—' : (weather.visibility < 2000 ? 'Ограничена (возможен туман/осадки)' : 'Отличная видимость') }}</div>
          </div>
        </div>
        <div class="weather-indicator-card">
          <div class="weather-indicator-icon weather-icon-clouds"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" /></svg></div>
          <div>
            <div class="weather-indicator-label">Облачность</div>
            <div class="weather-indicator-value">{{ weather.clouds != null ? weather.clouds : 'PRO API' }}<span class="weather-indicator-muted" v-if="weather.clouds != null">%</span></div>
            <div class="weather-indicator-sub" v-if="weather.clouds != null">Прогресс: <span class="weather-progress"><span class="weather-progress-fill" :style="{ width: (weather.clouds ?? 0) + '%' }"></span></span></div>
            <div class="weather-indicator-sub" v-else>Недоступно по тарифу</div>
          </div>
        </div>
        <div class="weather-indicator-card">
          <div class="weather-indicator-icon weather-icon-precip"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" /><path d="M16 14v6" /><path d="M8 14v6" /><path d="M12 16v6" /></svg></div>
          <div>
            <div class="weather-indicator-label">Вер. осадков</div>
            <div class="weather-indicator-value">{{ weather.precProbability != null ? weather.precProbability : '—' }}<span class="weather-indicator-muted">%</span></div>
            <div class="weather-indicator-sub">Прогресс: <span class="weather-progress"><span class="weather-progress-fill weather-progress-fill-cyan" :style="{ width: (weather.precProbability ?? 0) + '%' }"></span></span></div>
          </div>
        </div>
        <div class="weather-indicator-card">
          <div class="weather-indicator-icon weather-icon-uv"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></svg></div>
          <div>
            <div class="weather-indicator-label">УФ-Индекс</div>
            <div class="weather-indicator-value">{{ weather.uvIndex != null ? weather.uvIndex : 'PRO API' }} <span v-if="weather.uvIndex != null" class="weather-badge" :class="(weather.uvIndex || 0) > 5 ? 'weather-badge-high' : 'weather-badge-low'">{{ (weather.uvIndex || 0) > 5 ? 'Высокий' : 'Низкий' }}</span></div>
            <div class="weather-indicator-sub">{{ weather.uvIndex != null ? ((weather.uvIndex || 0) > 5 ? 'Требуется защита' : 'Защита не требуется') : 'Недоступно по тарифу' }}</div>
          </div>
        </div>
        <div class="weather-indicator-card">
          <div class="weather-indicator-icon weather-icon-sun"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v8" /><path d="m4.93 10.93 1.41 1.41" /><path d="M2 18h2" /><path d="M20 18h2" /><path d="m19.07 10.93-1.41 1.41" /><path d="M22 22H2" /><path d="m8 6 4-4 4 4" /><path d="M16 18a4 4 0 0 0-8 0" /></svg></div>
          <div>
            <div class="weather-indicator-label">Солнце</div>
            <div class="weather-indicator-value weather-indicator-value-sm"><span>Восход: {{ weather.sunrise || '—' }}</span><br><span>Закат: {{ weather.sunset || '—' }}</span></div>
            <div class="weather-indicator-sub">Световой день: {{ daylightDuration }}</div>
          </div>
        </div>
        
        <div class="weather-indicator-card">
          <div class="weather-indicator-icon weather-icon-soil" style="color: #8B4513; background: rgba(139,69,19,0.15)">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" /></svg>
          </div>
          <div>
            <div class="weather-indicator-label">Темп. почвы</div>
            <div class="weather-indicator-value">{{ weather.soilTemperature != null ? weather.soilTemperature : 'PRO API' }}<span class="weather-indicator-muted" v-if="weather.soilTemperature != null">°C</span></div>
            <div class="weather-indicator-sub">{{ weather.soilTemperature != null ? 'Слой: 10 см' : 'Недоступно по тарифу' }}</div>
          </div>
        </div>
        
        <div class="weather-indicator-card">
          <div class="weather-indicator-icon weather-icon-moisture" style="color: #20B2AA; background: rgba(32,178,170,0.15)">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22a5 5 0 0 0 5-5c0-2-5-10-5-10S7 15 7 17a5 5 0 0 0 5 5z" /></svg>
          </div>
          <div>
            <div class="weather-indicator-label">Влажн. почвы</div>
            <div class="weather-indicator-value">{{ weather.soilMoisture != null ? weather.soilMoisture : 'PRO API' }}</div>
            <div class="weather-indicator-sub">{{ weather.soilMoisture != null ? 'Доля влаги' : 'Недоступно по тарифу' }}</div>
          </div>
        </div>

        <div class="weather-indicator-card">
          <div class="weather-indicator-icon weather-icon-leaf" style="color: #4ade80; background: rgba(74,222,128,0.15)">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>
          </div>
          <div>
            <div class="weather-indicator-label">Листья</div>
            <div class="weather-indicator-value">{{ weather.leafWetnessIndex != null ? (weather.leafWetnessIndex ? 'Мокрые' : 'Сухие') : 'PRO API' }}</div>
            <div class="weather-indicator-sub">{{ weather.leafWetnessIndex != null ? 'Риск болезней' : 'Недоступно по тарифу' }}</div>
          </div>
        </div>

        <div class="weather-indicator-card">
          <div class="weather-indicator-icon weather-icon-kp" style="color: #9333ea; background: rgba(147,51,234,0.15)">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          </div>
          <div>
            <div class="weather-indicator-label">Магнитные бури</div>
            <div class="weather-indicator-value">{{ weather.kpIndex != null ? weather.kpIndex : 'PRO API' }}<span class="weather-indicator-muted" v-if="weather.kpIndex != null"> Kp</span></div>
            <div class="weather-indicator-sub">{{ weather.kpIndex != null ? (weather.kpIndex >= 4 ? 'Сбои навигации RTK' : 'Фон спокойный') : 'Недоступно по тарифу' }}</div>
          </div>
        </div>

        <div class="weather-indicator-card">
          <div class="weather-indicator-icon weather-icon-dew" style="color: #2563eb; background: rgba(37,99,235,0.15)">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.7l-3.3 3.3a4.67 4.67 0 0 0 0 6.6 4.67 4.67 0 0 0 6.6 0 4.67 4.67 0 0 0 0-6.6Z"/></svg>
          </div>
          <div>
            <div class="weather-indicator-label">Точка росы</div>
            <div class="weather-indicator-value">{{ weather.dewPoint != null ? weather.dewPoint : 'PRO API' }}<span class="weather-indicator-muted" v-if="weather.dewPoint != null">°C</span></div>
            <div class="weather-indicator-sub">{{ weather.dewPoint != null ? 'Риск конденсата' : 'Недоступно по тарифу' }}</div>
          </div>
        </div>
      </div>

      <h2 class="weather-section-title page-enter-item" style="--enter-delay: 280ms">Прогноз на 5 дней</h2>
      <div class="weather-forecast-strip page-enter-item" style="--enter-delay: 320ms">
        <div
          v-for="day in forecastWithLabels"
          :key="day.date"
          class="weather-forecast-card"
          :class="{ 'weather-forecast-card-alert': day.alert }"
        >
          <div class="weather-forecast-day">{{ day.displayLabel }}</div>
          <div class="weather-forecast-date">{{ day.dateLabel }}</div>
          <img :src="getWeatherIconUrl(day.icon)" alt="" width="40" height="40" style="margin-bottom:12px;" />
          <div class="weather-forecast-temps">
            <span class="weather-forecast-temp-high">{{ day.tempMax }}°</span>
            <span class="weather-forecast-temp-low">{{ day.tempMin }}°</span>
          </div>
          <div v-if="day.alert" class="weather-forecast-alert">{{ day.alert }}</div>
        </div>
      </div>

      <!-- Карта -->
      <h2 class="weather-section-title page-enter-item" style="--enter-delay: 360ms">Карта наблюдения полей</h2>
      <div class="page-enter-item weather-map-wrap" style="--enter-delay: 400ms">
        <YandexMap
          :lat="weather.coord?.lat ?? 55.7558"
          :lon="weather.coord?.lon ?? 37.6176"
          :zoom="10"
          :field-markers="weatherMapFieldMarkers"
          :fit-field-markers="weatherMapFieldMarkers.length > 0"
          @pick="(c) => pickedCoords = c"
        />
        <div v-if="pickedCoords" class="ymap-picked-coords">
          <div class="ymap-picked-coords-main">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            <span
              >Выбрана точка:
              <strong>{{ pickedCoords.lat.toFixed(5) }}° N, {{ pickedCoords.lon.toFixed(5) }}° E</strong></span
            >
          </div>
          <button
            type="button"
            class="ymap-copy-coords-btn"
            :title="pickedCoordsCopied ? 'Скопировано' : 'Копировать координаты'"
            :aria-label="pickedCoordsCopied ? 'Скопировано в буфер' : 'Копировать координаты в буфер обмена'"
            @click="copyPickedCoords"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
            </svg>
          </button>
        </div>
        <p class="weather-map-hint">
          Поля на карте показаны по их геометрии: точечные — зелёными метками, контурные — зелёными полигонами. Красная метка —
          точка, которую вы выбрали на карте или в поиске.
        </p>
      </div>

      <div class="weather-recommendations card-rounded weather-anim-card" style="--anim-delay: 450ms">
        <h2 class="weather-block-title">Рекомендации по культурам на сегодня</h2>
        <p class="weather-block-subtitle">Блок в стадии разработки.</p>
        <div class="weather-dev-widget">
          <!-- Виджет в разработке: как на странице "Обзор", но компактнее -->
          <svg
            class="weather-wip-loader"
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path pathLength="360" d="M 56.3752 2 H 7.6248 C 7.2797 2 6.9999 2.268 6.9999 2.5985 V 61.4015 C 6.9999 61.7321 7.2797 62 7.6248 62 H 56.3752 C 56.7203 62 57.0001 61.7321 57.0001 61.4015 V 2.5985 C 57.0001 2.268 56.7203 2 56.3752 2 Z" />
            <path pathLength="360" d="M 55.7503 60.803 H 8.2497 V 3.1971 H 55.7503 V 60.803 Z" />
            <path pathLength="360" d="M 29.7638 47.6092 C 29.4971 47.3997 29.1031 47.4368 28.8844 47.6925 C 28.6656 47.9481 28.7046 48.3253 28.9715 48.5348 L 32.8768 51.6023 C 32.9931 51.6936 33.1333 51.738 33.2727 51.738 C 33.4533 51.738 33.6328 51.6634 33.7562 51.519 C 33.975 51.2634 33.936 50.8862 33.6692 50.6767 L 29.7638 47.6092 Z" />
            <path pathLength="360" d="M 42.3557 34.9046 C 38.4615 34.7664 36.9617 37.6749 36.7179 39.2213 L 35.8587 44.2341 C 35.8029 44.5604 36.0335 44.8681 36.374 44.9218 C 36.4084 44.9272 36.4424 44.9299 36.476 44.9299 C 36.7766 44.9299 37.0415 44.7214 37.0918 44.4281 L 37.9523 39.4076 C 37.9744 39.2673 38.544 35.9737 42.311 36.1007 C 42.6526 36.1124 42.9454 35.8544 42.9577 35.524 C 42.9702 35.1937 42.7006 34.9164 42.3557 34.9046 Z" />
            <path pathLength="360" d="M 13.1528 55.5663 C 13.1528 55.8968 13.4326 56.1648 13.7777 56.1648 H 50.2223 C 50.5674 56.1648 50.8472 55.8968 50.8472 55.5663 V 8.4339 C 50.8472 8.1034 50.5674 7.8354 50.2223 7.8354 H 13.7777 C 13.4326 7.8354 13.1528 8.1034 13.1528 8.4339 V 55.5663 Z" />
            <path pathLength="360" d="M 25.3121 26.5567 C 24.9717 27.4941 25.0042 28.8167 25.0634 29.5927 C 23.6244 29.8484 20.3838 31.0913 18.9478 37.0352 C 18.5089 37.5603 17.8746 38.1205 17.2053 38.7114 C 16.2598 39.546 15.2351 40.4515 14.4027 41.5332 V 20.5393 H 23.7222 C 23.7178 22.6817 24.1666 25.4398 25.3121 26.5567 Z" />
            <path pathLength="360" d="M 49.5975 43.4819 C 48.3838 39.1715 46.3138 33.6788 43.4709 29.7736 C 42.6161 28.5995 40.7095 27.0268 39.6852 26.1818 L 39.6352 26.1405 C 39.4176 24.783 39.1158 22.5803 38.8461 20.5394 H 49.5976 V 43.4819 Z" />
            <path pathLength="360" d="M 29.8161 45.151 C 29.0569 44.7516 28.3216 44.4344 27.6455 44.185 C 27.6488 44.0431 27.6397 43.8917 27.6478 43.7715 C 27.9248 39.7036 30.4491 36.2472 35.1502 33.4979 C 38.7221 31.4091 42.2682 30.5427 42.3036 30.5341 C 42.3563 30.5213 42.416 30.5119 42.4781 30.5037 C 42.6695 30.7681 42.8577 31.0407 43.0425 31.3217 C 42.1523 31.4917 39.6591 32.0721 37.0495 33.6188 C 34.2273 35.2912 30.7775 38.4334 29.9445 44.0105 C 29.9025 44.2924 29.8211 45.0524 29.8161 45.151 Z" />
            <path pathLength="360" d="M 32.2021 33.6346 C 29.1519 33.8959 26.6218 32.5634 25.6481 31.4461 C 25.9518 30.3095 28.4436 28.4847 30.2282 27.4911 C 30.436 27.3755 30.5563 27.1556 30.5372 26.9261 L 30.4311 25.6487 C 30.5264 25.6565 30.622 25.6621 30.7181 25.6642 L 30.8857 25.6672 C 32.0645 25.6912 33.2094 25.302 34.1059 24.5658 L 34.112 24.5607 L 34.4024 32.5344 C 33.8302 32.8724 33.2863 33.2227 32.7728 33.5852 C 32.5227 33.6032 32.3068 33.6258 32.2021 33.6346 Z" />
            <path pathLength="360" d="M 27.8056 17.9207 C 27.8041 17.9207 27.8025 17.9207 27.8012 17.9207 L 27.0155 17.9259 L 26.8123 15.4718 C 26.8174 15.4609 26.8238 15.4501 26.8282 15.4389 C 27.2218 15.0856 28.158 14.3463 29.1923 14.252 C 31.0985 14.0778 33.442 14.3386 33.8213 16.5565 L 34.0564 23.0299 L 33.2927 23.6566 C 32.6306 24.2004 31.7888 24.4889 30.9118 24.4703 L 30.7437 24.4673 C 29.7977 24.4473 28.8841 24.0555 28.2376 23.3933 C 27.9671 23.1152 27.748 22.7967 27.5871 22.4474 C 27.426 22.0961 27.3292 21.7272 27.2989 21.3494 L 27.1145 19.1223 L 27.8097 19.1178 C 28.1548 19.1154 28.4327 18.8457 28.4303 18.5152 C 28.4278 18.186 28.1487 17.9207 27.8056 17.9207 Z" />
            <path pathLength="360" d="M 38.4358 26.5433 C 38.4589 26.6829 38.5326 26.8101 38.6443 26.9026 L 38.8697 27.0889 C 39.5266 27.6307 40.6931 28.5938 41.5811 29.4829 C 40.6409 29.7428 38.2545 30.4762 35.6283 31.8516 L 35.3161 23.281 C 35.316 23.2777 35.3158 23.2743 35.3157 23.271 L 35.0692 16.4785 C 35.0682 16.455 35.0659 16.4316 35.0621 16.4082 C 34.6703 13.9692 32.4875 12.7498 29.0741 13.0603 C 28.5659 13.1067 28.0885 13.255 27.6614 13.4468 C 28.321 12.6324 29.4568 11.8605 31.3984 11.8605 C 32.892 11.8605 34.2086 12.4323 35.3118 13.5599 C 36.3478 14.6187 36.9981 15.9821 37.1923 17.5023 C 37.5097 19.987 38.0932 24.4655 38.4358 26.5433 Z" />
            <path pathLength="360" d="M 25.6994 17.1716 L 26.053 21.4425 C 26.094 21.9536 26.225 22.4539 26.4434 22.93 C 26.6613 23.403 26.9574 23.8335 27.3242 24.2106 C 27.833 24.7317 28.4641 25.128 29.1549 25.3746 L 29.2609 26.6526 C 28.8063 26.9219 27.959 27.4459 27.0978 28.0926 C 26.7982 28.3177 26.5261 28.5365 26.2766 28.7503 C 26.2677 27.9385 26.3477 27.0941 26.6128 26.699 C 26.7087 26.5561 26.7368 26.3807 26.6898 26.2168 C 26.6428 26.0528 26.5253 25.9159 26.3667 25.8398 C 25.2812 25.3198 24.639 20.7943 25.134 18.7283 C 25.2757 18.1366 25.4822 17.6126 25.6994 17.1716 Z" />
            <path pathLength="360" d="M 14.4025 54.9677 V 43.9616 C 15.1297 42.1745 16.6798 40.8031 18.052 39.5917 C 18.5756 39.1296 19.0771 38.6852 19.5054 38.243 C 20.1455 38.2763 21.8243 38.4721 22.2856 39.611 C 22.526 40.696 22.9861 41.6387 23.6573 42.3985 C 23.7809 42.5383 23.9573 42.6104 24.1347 42.6104 C 24.2773 42.6104 24.4206 42.5639 24.5381 42.4688 C 24.8014 42.2553 24.8343 41.8776 24.6115 41.6252 C 22.2978 39.0062 23.8504 34.5445 23.8663 34.4997 C 23.9782 34.1872 23.8046 33.8471 23.4785 33.7397 C 23.1507 33.6321 22.7964 33.7986 22.6843 34.1111 C 22.6657 34.1631 22.2262 35.4024 22.1149 37.0253 C 22.0992 37.2529 22.0927 37.476 22.0916 37.6958 C 21.4663 37.3478 20.7678 37.1827 20.215 37.1057 C 21.266 32.9598 23.2109 31.5061 24.4867 30.9973 C 24.4164 31.2001 24.3769 31.3974 24.3692 31.5894 C 24.3639 31.7208 24.404 31.8501 24.4831 31.9575 C 25.0708 32.7551 26.1363 33.5207 27.4065 34.0584 C 28.2686 34.4232 29.5576 34.8194 31.1457 34.861 C 28.2499 37.3877 26.6257 40.39 26.4009 43.6936 C 26.3992 43.7195 26.3962 43.7461 26.3928 43.7729 C 25.1023 43.399 24.2167 43.2969 24.1252 43.2873 C 23.9888 43.2728 23.8487 43.3023 23.7304 43.3716 C 23.0495 43.7702 22.591 44.3922 22.4046 45.1703 C 22.2331 45.8868 22.3106 46.6885 22.6019 47.3807 C 22.0046 47.6438 21.3269 47.7784 20.7914 47.848 C 19.4939 45.6912 20.8219 44.6351 20.989 44.5146 C 21.2655 44.3207 21.3274 43.9492 21.1268 43.6822 C 20.9253 43.4139 20.5346 43.3533 20.2546 43.5462 C 19.4539 44.0983 18.406 45.6195 19.3656 47.7888 C 18.685 47.5329 17.6255 46.8145 17.8055 44.832 C 17.8836 43.9718 18.1884 43.3352 18.7117 42.9403 C 19.5815 42.2834 20.8198 42.451 20.8366 42.4537 C 21.1748 42.503 21.4952 42.2819 21.5494 41.9563 C 21.6037 41.6297 21.3713 41.3231 21.0306 41.2712 C 20.9582 41.2599 19.2558 41.0142 17.9494 41.9917 C 17.1375 42.5992 16.6703 43.5199 16.5605 44.7282 C 16.1991 48.7092 19.7376 49.1126 19.7732 49.116 C 19.7951 49.1182 22.2326 49.1079 23.7782 48.1211 C 23.8053 48.1039 24.4158 47.7528 24.4158 47.7528 C 24.5214 47.8841 24.6624 48.0532 24.8294 48.2438 L 22.3598 49.4874 C 22.1544 49.5908 22.0257 49.7949 22.0257 50.0171 V 51.8127 C 22.0257 52.1432 22.3054 52.4112 22.6505 52.4112 S 23.2754 52.1432 23.2754 51.8127 V 50.3786 L 25.6987 49.1582 C 26.021 49.4709 26.3894 49.7985 26.7963 50.1188 L 24.6627 50.7144 C 24.4768 50.7663 24.3269 50.8977 24.2559 51.0702 L 23.3968 53.1651 C 23.2704 53.4729 23.4286 53.8202 23.7498 53.9409 C 23.8248 53.9694 23.9023 53.9825 23.9782 53.9825 C 24.2277 53.9825 24.4632 53.8384 24.5599 53.6028 L 25.307 51.7814 L 28.0879 51.0053 C 28.5412 51.2713 29.0239 51.51 29.5341 51.6979 C 29.6079 51.7252 29.6836 51.738 29.7582 51.738 C 30.0092 51.738 30.246 51.592 30.3415 51.3542 C 30.4653 51.0457 30.3048 50.6994 29.9825 50.5808 C 27.1642 49.5423 25.2952 46.9394 25.2771 46.9138 C 25.1245 46.6979 24.8439 46.6013 24.5831 46.6746 L 23.7537 46.9082 C 23.5672 46.4465 23.5125 45.8992 23.623 45.4377 C 23.7168 45.046 23.9138 44.7341 24.21 44.508 C 25.267 44.6734 29.863 45.5842 33.2732 49.2905 C 33.3967 49.4247 33.569 49.4932 33.7423 49.4932 C 33.889 49.4932 34.0364 49.444 34.1551 49.3437 C 34.414 49.1251 34.439 48.747 34.2108 48.4989 C 33.9947 48.2641 33.7738 48.0421 33.5507 47.8278 L 38.211 47.0175 C 38.3595 47.0014 40.1672 46.8356 41.295 48.2161 C 41.4182 48.3671 41.6019 48.4458 41.7875 48.4458 C 41.9222 48.4458 42.0578 48.4043 42.1721 48.3186 C 42.4439 48.1148 42.4919 47.7386 42.2791 47.4784 C 40.6703 45.5094 38.1379 45.8184 38.0305 45.8327 C 38.0218 45.8339 38.0132 45.8353 38.0043 45.8368 L 32.3855 46.8136 C 31.945 46.4667 31.4998 46.1528 31.0557 45.8697 C 31.0618 45.5534 31.0651 45.1775 31.0836 44.9842 C 31.1138 44.6713 31.1524 44.3635 31.1997 44.0606 C 31.8329 40.0032 34.0061 36.8432 37.6695 34.6587 C 40.6334 32.8915 43.5195 32.4536 43.5682 32.4464 C 43.604 32.4413 43.663 32.4341 43.7302 32.4251 C 47.2229 38.3378 49.3982 46.7588 49.5976 49.5158 V 54.9673 H 14.4025 Z" />
            <path pathLength="360" d="M 49.5975 9.0325 V 19.3422 H 38.689 C 38.5937 18.6105 38.5061 17.9301 38.4329 17.3569 C 38.2063 15.5828 37.4422 13.9868 36.2237 12.7413 C 34.8748 11.3624 33.2514 10.6633 31.3984 10.6633 C 27.3688 10.6633 25.8233 13.5309 25.556 15.0901 C 25.1526 15.5932 24.3175 16.7856 23.916 18.46 C 23.8568 18.7069 23.8106 19.0066 23.7778 19.3421 H 14.4025 V 9.0323 H 49.5975 Z" />
            <path pathLength="360" d="M 30.2223 21.2875 C 30.5674 21.2875 30.8471 21.0195 30.8471 20.6889 V 18.92 L 31.9916 18.9675 C 32.3376 18.9833 32.628 18.7259 32.643 18.3956 C 32.658 18.0654 32.3907 17.786 32.0459 17.7717 L 30.2495 17.6969 C 30.077 17.6889 29.9133 17.7497 29.7902 17.8624 C 29.6671 17.9753 29.5976 18.1315 29.5976 18.2948 V 20.6889 C 29.5974 21.0195 29.8772 21.2875 30.2223 21.2875 Z" />
          </svg>
          <div>
            <div class="weather-dev-widget-title">Рекомендации скоро появятся</div>
            <p class="weather-dev-widget-text">
              Здесь будет персонализированная агрономическая аналитика по культурам на основе погоды, состояния полей и истории операций.
            </p>
          </div>
        </div>
      </div>

      <div class="weather-fields-block card-rounded weather-anim-card" style="--anim-delay: 550ms">
        <h2 class="weather-block-title">Состояние полей</h2>
        <p v-if="!fieldsWithWeather.length" class="weather-block-subtitle">Поля не найдены.</p>
        <div v-else class="weather-fields-list">
          <RouterLink
            v-for="(f, idx) in fieldsWithWeather"
            :key="f.id"
            class="weather-field-mini weather-anim-card weather-field-link"
            :to="{ name: 'field-details', params: { id: f.id } }"
            :style="{ '--anim-delay': 600 + idx * 60 + 'ms' }"
          >
            <div class="weather-field-mini-main">
              <div>
                <div class="weather-field-mini-name">{{ f.name }}</div>
                <div class="weather-field-mini-crop">{{ f.cropName }}</div>
              </div>
              <div class="weather-field-mini-weather" :class="{ 'weather-field-mini-weather--loading': f.loading }">
                <img :src="getWeatherIconUrl(f.icon)" alt="" width="28" height="28" />
                <span class="weather-field-mini-temp">{{ f.loading ? '…' : f.temp != null ? `${f.temp}°C` : '—' }}</span>
                <span class="weather-field-mini-wind" :class="{ 'wind-strong': f.windStrong && !f.loading }">{{
                  f.loading ? '…' : `Ветер ${f.wind} м/с${f.windDir ? ', ' + f.windDir : ''}`
                }}</span>
              </div>
            </div>
            <div v-if="f.hasExtras" class="weather-field-mini-extras" aria-label="Дополнительно по погоде">
              <span v-if="f.conditionLabel && f.conditionLabel !== '—'" class="weather-field-mini-extra-em">{{ f.conditionLabel }}</span>
              <span v-if="f.humidity != null" class="weather-field-mini-extra">Влажность {{ f.humidity }}%</span>
              <span v-if="f.precProbability != null" class="weather-field-mini-extra">Осадки {{ f.precProbability }}%</span>
              <span v-if="f.pressure != null" class="weather-field-mini-extra">Давл. {{ f.pressure }} мм</span>
              <span v-if="f.visibilityKm != null" class="weather-field-mini-extra">Видимость {{ f.visibilityKm }} км</span>
              <span v-if="f.kpIndex != null" class="weather-field-mini-extra">Kp {{ f.kpIndex }}</span>
            </div>
          </RouterLink>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.weather-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

/* Компактная верхняя полоса (город / обновить): без лишних отступов от .header-area */
.weather-page > .header-weather.header-area {
  align-items: center;
  padding-top: 0;
  padding-bottom: 6px;
  margin-bottom: 10px;
  gap: 8px;
}

/* Чуть плотнее блоки погоды (контент тот же) */
.weather-page :deep(.weather-hero) {
  margin-bottom: 14px;
  border-radius: 18px;
}

.weather-page :deep(.weather-hero-inner) {
  padding: 22px;
  gap: 20px;
}

.weather-page :deep(.weather-hero-temp-block) {
  padding: 14px 0;
  gap: 16px;
}

@media (min-width: 1024px) {
  .weather-page :deep(.weather-hero-temp-block) {
    padding: 0 22px;
  }
}

.weather-page :deep(.weather-hero-temp-wrap) {
  gap: 16px;
}

.weather-page :deep(.weather-hero-temp) {
  font-size: 3.35rem;
}

.weather-page :deep(.weather-hero-city) {
  font-size: 1.65rem;
}

.weather-page :deep(.weather-hero-desc) {
  font-size: 1.08rem;
}

.weather-page :deep(.weather-recommendation-inline) {
  padding: 16px;
  border-radius: 14px;
}

.weather-page :deep(.weather-recommendation-inline h3) {
  margin-bottom: 8px;
  font-size: 1.05rem;
  gap: 10px;
}

.weather-page :deep(.weather-recommendation-inline p) {
  margin-bottom: 8px;
  font-size: 0.94rem;
}

.weather-page :deep(.weather-recommendation-inline ul) {
  gap: 6px;
}

.weather-page :deep(.weather-section-title) {
  margin: 18px 0 10px;
  font-size: 1.05rem;
}

.weather-page :deep(.weather-indicators-grid) {
  gap: 12px;
}

@media (min-width: 768px) {
  .weather-page :deep(.weather-indicators-grid) {
    gap: 16px;
  }
}

.weather-page :deep(.weather-indicator-card) {
  padding: 14px 15px;
  gap: 12px;
  border-radius: 12px;
}

.weather-page :deep(.weather-indicator-icon) {
  width: 42px;
  height: 42px;
  border-radius: 10px;
}

.weather-page :deep(.weather-indicator-value) {
  font-size: 1.28rem;
}

.weather-page :deep(.weather-indicator-label) {
  font-size: 0.8125rem;
  margin-bottom: 2px;
}

.weather-page :deep(.weather-forecast-strip) {
  gap: 12px;
  padding-bottom: 10px;
  margin-top: 10px;
}

.weather-page :deep(.weather-forecast-card) {
  padding: 14px 14px;
  border-radius: 12px;
  min-width: 128px;
}

.weather-page :deep(.weather-current-icon) {
  width: 80px;
  height: 80px;
}

.weather-page :deep(.card-rounded) {
  padding: var(--space-md);
}

.weather-page :deep(.weather-block-title) {
  margin-bottom: 6px;
  font-size: 1.05rem;
}

.weather-page :deep(.weather-block-subtitle) {
  margin-bottom: 10px;
  font-size: 0.8125rem;
}

.weather-page :deep(.weather-fields-list) {
  gap: 10px;
}

.weather-page :deep(.weather-field-mini) {
  padding: 12px 14px;
  gap: 8px;
}

.weather-page :deep(.weather-field-mini-extras) {
  padding-top: 8px;
}

.weather-map-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.weather-map-hint {
  margin: 0;
  padding: 0 2px;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--text-secondary);
  max-width: 48rem;
}

.weather-map-wrap :deep(.ymap-container) {
  height: 360px;
}

.ymap-picked-coords {
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  padding: 8px 12px;
  background: var(--chip-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.ymap-picked-coords-main {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.ymap-copy-coords-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;
}

.ymap-copy-coords-btn:hover {
  background: var(--bg-panel-hover);
  color: var(--text-primary);
  border-color: color-mix(in srgb, var(--accent-green) 35%, var(--border-color));
}

.ymap-copy-coords-btn:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent-green) 50%, transparent);
  outline-offset: 2px;
}

.header-weather {
  flex-wrap: wrap;
  gap: 8px;
}

.weather-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* Селект и кнопка: свои стили (классы .btn в проекте заданы только в других страницах со scoped) */
.weather-city-select {
  min-width: 168px;
  max-width: 100%;
  padding: 9px 36px 9px 14px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background-color: var(--bg-panel);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.25;
  cursor: pointer;
  min-height: 40px;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  box-shadow: var(--shadow-card);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background-color 0.2s ease;
}

.weather-city-select:hover {
  border-color: color-mix(in srgb, var(--accent-green) 35%, var(--border-color));
  background-color: var(--bg-panel-hover);
}

.weather-city-select:focus {
  outline: none;
  border-color: var(--accent-green);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-green) 22%, transparent);
}

.weather-city-select:focus-visible {
  outline: none;
  border-color: var(--accent-green);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-green) 22%, transparent);
}

[data-theme='dark'] .weather-city-select {
  background-color: color-mix(in srgb, var(--bg-panel) 86%, black);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2' stroke-opacity='0.65'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
}

[data-theme='dark'] .weather-city-select:hover {
  background-color: color-mix(in srgb, var(--bg-panel) 92%, white);
}

.weather-refresh-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 9px 18px;
  min-height: 40px;
  border-radius: 10px;
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  border: 1px solid var(--accent-green);
  background: var(--accent-green);
  color: #fff;
  box-shadow: var(--shadow-card);
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    filter 0.2s ease,
    box-shadow 0.2s ease;
}

.weather-refresh-btn:hover {
  background: var(--accent-green-hover);
  border-color: var(--accent-green-hover);
  filter: brightness(1.03);
}

.weather-refresh-btn:focus {
  outline: none;
}

.weather-refresh-btn:focus-visible {
  outline: none;
  box-shadow:
    var(--shadow-card),
    0 0 0 3px color-mix(in srgb, var(--accent-green) 28%, transparent);
}

.weather-refresh-btn:active {
  filter: brightness(0.96);
}

.weather-forecast5 {
  padding: var(--space-lg);
}

.weather-forecast5-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--space-md);
  margin-top: var(--space-md);
}

.weather-forecast5-card {
  background: var(--chip-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: var(--space-md);
  text-align: center;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.weather-forecast5-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-card);
}

.weather-forecast5-card-alert {
  border-color: var(--danger-red);
  background: rgba(211, 60, 60, 0.08);
}

.weather-forecast5-day {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.weather-forecast5-icon {
  display: block;
  margin: 0 auto 8px;
}

.weather-forecast5-temps {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.weather-forecast5-alert {
  margin-top: 8px;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--danger-red);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  line-height: 1.3;
}

.weather-detail-loading,
.weather-detail-error {
  color: var(--text-secondary);
  padding: var(--space-xl);
}

.weather-detail-loading {
  display: flex;
  align-items: center;
  justify-content: center;
}

.weather-detail-error {
  color: var(--warning-orange);
}

@keyframes weatherFadeIn {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes weatherIconBreathe {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
}

.weather-anim-card {
  opacity: 0;
  animation: weatherFadeIn 0.5s ease forwards;
  animation-delay: var(--anim-delay, 0ms);
}

.weather-icon-breathe {
  animation: weatherIconBreathe 3s ease-in-out infinite;
}

.weather-param-card {
  transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.2s ease;
}

.weather-param-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-card);
}

.card-rounded {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: var(--space-lg);
  box-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.15);
}

.weather-current-block {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--space-xl);
  align-items: center;
}

.weather-current-main {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.weather-current-city {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
}

.weather-current-datetime {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.weather-current-temp-wrap {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.weather-current-temp {
  font-size: 3rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}

.weather-current-icon {
  width: 80px;
  height: 80px;
  object-fit: contain;
}

.weather-current-desc {
  font-size: 1rem;
  color: var(--text-secondary);
  text-transform: capitalize;
}

.weather-current-feels {
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.weather-current-extra {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.weather-current-coords {
  padding: var(--space-md);
  background: var(--chip-bg);
  border-radius: 10px;
  align-self: start;
  border: 1px solid var(--border-color);
}

.weather-params-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--space-md);
}

.weather-param-card {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: var(--space-md);
}

.weather-param-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.weather-param-value {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.weather-wind-warning {
  color: var(--warning-orange) !important;
}

.weather-extreme {
  color: var(--danger-red) !important;
}

.weather-block-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 var(--space-sm);
}

.weather-block-subtitle {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin: 0 0 var(--space-md);
}

.weather-crops-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.weather-crop-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-md);
  padding: var(--space-md) 0;
  border-bottom: 1px solid var(--border-color);
}

.weather-crop-item:last-child {
  border-bottom: none;
}

.weather-crop-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  flex-shrink: 0;
}

.weather-crop-icon.wheat {
  background: rgba(232, 197, 71, 0.25);
  color: var(--wheat-gold);
}

.weather-crop-icon.sunflower {
  background: rgba(244, 211, 94, 0.25);
  color: var(--corn-yellow);
}

.weather-crop-icon.corn {
  background: color-mix(in srgb, var(--accent-green) 22%, transparent);
  color: var(--accent-green);
}

.weather-crop-status {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.weather-crop-status.ok {
  background: color-mix(in srgb, var(--accent-green) 22%, transparent);
  color: var(--accent-green);
}

.weather-crop-status.warn {
  background: rgba(211, 130, 60, 0.25);
  color: var(--warning-orange);
}

.weather-crop-status.risk {
  background: rgba(211, 60, 60, 0.2);
  color: var(--danger-red);
}

.weather-crop-desc {
  margin: 8px 0 0 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.weather-dev-widget {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px dashed var(--border-color);
  border-radius: 10px;
  padding: 14px;
  background: color-mix(in srgb, var(--chip-bg) 75%, transparent);
}

.weather-wip-loader {
  width: 56px;
  height: 56px;
  flex-shrink: 0;
}

.weather-wip-loader path {
  stroke: #000;
  stroke-width: 0.6px;
  fill: none;
  animation:
    weather-wip-dash-array 4s ease-in-out infinite,
    weather-wip-dash-offset 4s linear infinite;
}

[data-theme='dark'] .weather-wip-loader path {
  stroke: rgba(255, 255, 255, 0.88);
}

@keyframes weather-wip-dash-array {
  0% { stroke-dasharray: 0 1 359 0; }
  50% { stroke-dasharray: 0 359 1 0; }
  100% { stroke-dasharray: 359 1 0 0; }
}

@keyframes weather-wip-dash-offset {
  0% { stroke-dashoffset: 365; }
  100% { stroke-dashoffset: 5; }
}

.weather-dev-widget-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-primary);
}

.weather-dev-widget-text {
  margin: 6px 0 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.weather-fields-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-md);
}

.weather-field-mini {
  background: var(--chip-bg);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
}

.weather-field-mini-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.weather-field-link {
  text-decoration: none;
  color: inherit;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.weather-field-link:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-card);
  border-color: color-mix(in srgb, var(--accent-green) 35%, var(--border-color));
}

.weather-field-mini-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
}

.weather-field-mini-crop {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.weather-field-mini-weather {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.weather-field-mini-weather--loading {
  opacity: 0.88;
}

.weather-field-mini-temp {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.weather-field-mini-wind {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.weather-field-mini-wind.wind-strong {
  color: var(--warning-orange);
  font-weight: 700;
}

.weather-field-mini-extras {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  margin: 0;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
  font-size: 0.72rem;
  line-height: 1.35;
  color: var(--text-secondary);
}

.weather-field-mini-extra-em {
  font-weight: 600;
  color: var(--text-primary);
}

.weather-page .weather-sky {
  margin-bottom: var(--space-md);
}

@media (max-width: 1024px) {
  .weather-current-block {
    grid-template-columns: 1fr;
  }

  .weather-params-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 900px) {
  .weather-forecast5-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .weather-params-grid {
    grid-template-columns: 1fr;
  }

  .weather-fields-list {
    grid-template-columns: 1fr;
  }

  .weather-forecast5-grid {
    grid-template-columns: 1fr;
  }

  .header-weather {
    gap: var(--space-sm);
  }

  .weather-header-actions {
    width: 100%;
  }

  .weather-city-select {
    flex: 1;
    min-width: 0;
  }
}
</style>
