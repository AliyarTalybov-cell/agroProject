<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { fetchWeather, fetchForecast5, getWeatherIconUrl, type WeatherData, type ForecastDayItem } from '@/lib/weatherApi'
import { RUSSIAN_CITIES } from '@/lib/cities'
import { useWeatherCity } from '@/composables/useWeatherCity'
import UiLoadingBar from '@/components/UiLoadingBar.vue'

const { cityValue, setCity, city, country } = useWeatherCity()
const weather = ref<WeatherData | null>(null)
const forecastDays = ref<ForecastDayItem[]>([])
const loading = ref(true)
const error = ref(false)

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
  load()
}

onMounted(() => {
  load()
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

const recommendations = computed(() => {
  const data = weather.value
  if (!data) return []
  const temp = data.temp ?? 15
  const wind = data.windSpeed ?? 0
  return [
    {
      key: 'wheat',
      name: 'Пшеница озимая',
      icon: '🌾',
      statusClass: temp >= 0 && temp <= 25 && wind < 10 ? 'ok' : temp < -5 ? 'risk' : 'warn',
      status: temp >= 0 && temp <= 25 && wind < 10 ? 'Комфортно' : temp < -5 ? 'Риск' : 'Ожидание',
      text:
        temp >= 0 && temp <= 25 && wind < 10
          ? 'Температурный режим оптимален. Рекомендуется плановый осмотр всходов.'
          : temp < -5
            ? 'Возможны морозы. Контроль состояния озимых.'
            : 'Температура на границе нормы. Отложите внесение удобрений при ветре >5 м/с.',
    },
    {
      key: 'sunflower',
      name: 'Подсолнечник',
      icon: '🌻',
      statusClass: temp >= 10 && temp <= 28 ? 'ok' : temp < 8 ? 'warn' : 'risk',
      status: temp >= 10 && temp <= 28 ? 'Комфортно' : temp < 8 ? 'Ожидание' : 'Риск заморозков',
      text:
        temp >= 10 && temp <= 28
          ? 'Условия благоприятны для посева и вегетации.'
          : temp < 8
            ? 'Почва недостаточно прогрета. Ожидайте повышения ночных температур.'
            : 'Риск ночных заморозков. Отложите посев.',
    },
    {
      key: 'corn',
      name: 'Кукуруза',
      icon: '🌽',
      statusClass: temp >= 10 && wind < 8 ? 'ok' : temp < 8 ? 'warn' : 'risk',
      status: temp >= 10 && wind < 8 ? 'Подготовка' : temp < 8 ? 'Ожидание' : 'Риск',
      text:
        temp >= 10 && wind < 8
          ? 'Условия благоприятны для подготовки техники к началу посевной кампании.'
          : temp < 8
            ? 'Ожидается ночное понижение температуры. Риск повреждения всходов возвратными заморозками.'
            : 'Сильный ветер. Не рекомендуется опрыскивание.',
    },
  ]
})

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
  const data = weather.value
  const temp = data?.temp ?? 0
  const wind = data?.windSpeed ?? 0
  const icon = data?.icon ?? '01d'
  const list = [
    { name: 'Поле #5', cropName: 'Пшеница' },
    { name: 'Поле #12', cropName: 'Кукуруза' },
    { name: 'Поле #3', cropName: 'Соя' },
    { name: 'Поле #8', cropName: 'Подсолнечник' },
    { name: 'Поле #21', cropName: 'Пшеница' },
  ]
  return list.map((f, i) => {
    const offset = (i % 3) - 1
    const w = Math.min(15, Math.max(0, wind + (i % 2)))
    return {
      ...f,
      temp: temp + offset,
      wind: w,
      windStrong: w > 5,
      icon,
    }
  })
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
        <button type="button" class="btn btn-ghost" aria-label="Обновить" @click="refresh">Обновить</button>
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
            <div class="weather-indicator-sub">Оптимальная</div>
          </div>
        </div>
        <div class="weather-indicator-card">
          <div class="weather-indicator-icon weather-icon-pressure"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 14 4-4" /><path d="M3.34 19a10 10 0 1 1 17.32 0" /></svg></div>
          <div>
            <div class="weather-indicator-label">Давление</div>
            <div class="weather-indicator-value">{{ weather.pressure != null ? Math.round(weather.pressure * 0.75006) : '—' }}<span class="weather-indicator-muted"> мм рт.ст.</span></div>
            <div class="weather-indicator-sub">На ур. моря: {{ weather.pressure ?? '—' }} гПа</div>
          </div>
        </div>
        <div class="weather-indicator-card">
          <div class="weather-indicator-icon weather-icon-visibility"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg></div>
          <div>
            <div class="weather-indicator-label">Видимость</div>
            <div class="weather-indicator-value">{{ weather.visibility != null ? weather.visibility / 1000 : '—' }}<span class="weather-indicator-muted"> км</span></div>
            <div class="weather-indicator-sub">Ясно, без тумана</div>
          </div>
        </div>
        <div class="weather-indicator-card">
          <div class="weather-indicator-icon weather-icon-clouds"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" /></svg></div>
          <div>
            <div class="weather-indicator-label">Облачность</div>
            <div class="weather-indicator-value">{{ weather.clouds != null ? weather.clouds : '—' }}<span class="weather-indicator-muted">%</span></div>
            <div class="weather-indicator-sub">Прогресс: <span class="weather-progress"><span class="weather-progress-fill" :style="{ width: (weather.clouds ?? 0) + '%' }"></span></span></div>
          </div>
        </div>
        <div class="weather-indicator-card">
          <div class="weather-indicator-icon weather-icon-precip"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" /><path d="M16 14v6" /><path d="M8 14v6" /><path d="M12 16v6" /></svg></div>
          <div>
            <div class="weather-indicator-label">Вер. осадков</div>
            <div class="weather-indicator-value">{{ weather.clouds != null ? 100 - weather.clouds : '—' }}<span class="weather-indicator-muted">%</span></div>
            <div class="weather-indicator-sub">Прогресс: <span class="weather-progress"><span class="weather-progress-fill weather-progress-fill-cyan" :style="{ width: (100 - (weather.clouds ?? 0)) + '%' }"></span></span></div>
          </div>
        </div>
        <div class="weather-indicator-card">
          <div class="weather-indicator-icon weather-icon-uv"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></svg></div>
          <div>
            <div class="weather-indicator-label">УФ-Индекс</div>
            <div class="weather-indicator-value">2 <span class="weather-badge weather-badge-low">Низкий</span></div>
            <div class="weather-indicator-sub">Защита не требуется</div>
          </div>
        </div>
        <div class="weather-indicator-card">
          <div class="weather-indicator-icon weather-icon-sun"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v8" /><path d="m4.93 10.93 1.41 1.41" /><path d="M2 18h2" /><path d="M20 18h2" /><path d="m19.07 10.93-1.41 1.41" /><path d="M22 22H2" /><path d="m8 6 4-4 4 4" /><path d="M16 18a4 4 0 0 0-8 0" /></svg></div>
          <div>
            <div class="weather-indicator-label">Солнце</div>
            <div class="weather-indicator-value weather-indicator-value-sm"><span>Восход: {{ weather.sunrise || '—' }}</span><br><span>Закат: {{ weather.sunset || '—' }}</span></div>
            <div class="weather-indicator-sub">День: ~12ч</div>
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

      <div class="weather-recommendations card-rounded weather-anim-card" style="--anim-delay: 450ms">
        <h2 class="weather-block-title">Рекомендации по культурам на сегодня</h2>
        <p class="weather-block-subtitle">Анализ текущих погодных условий для основных посевов.</p>
        <div class="weather-crops-list">
          <div
            v-for="(r, idx) in recommendations"
            :key="r.key"
            class="weather-crop-item weather-anim-card"
            :style="{ '--anim-delay': 500 + idx * 80 + 'ms' }"
          >
            <div class="weather-crop-icon" :class="r.key">{{ r.icon }}</div>
            <div>
              <div class="type-value">{{ r.name }}</div>
              <span class="weather-crop-status" :class="r.statusClass">{{ r.status }}</span>
              <p class="weather-crop-desc">{{ r.text }}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="weather-fields-block card-rounded weather-anim-card" style="--anim-delay: 550ms">
        <h2 class="weather-block-title">Состояние полей</h2>
        <div class="weather-fields-list">
          <div
            v-for="(f, idx) in fieldsWithWeather"
            :key="f.name"
            class="weather-field-mini weather-anim-card"
            :style="{ '--anim-delay': 600 + idx * 60 + 'ms' }"
          >
            <div>
              <div class="weather-field-mini-name">{{ f.name }}</div>
              <div class="weather-field-mini-crop">{{ f.cropName }}</div>
            </div>
            <div class="weather-field-mini-weather">
              <img :src="getWeatherIconUrl(f.icon)" alt="" width="28" height="28" />
              <span class="weather-field-mini-temp">{{ f.temp }}°C</span>
              <span class="weather-field-mini-wind" :class="{ 'wind-strong': f.windStrong }">Ветер {{ f.wind }} м/с</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.weather-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

.header-weather {
  flex-wrap: wrap;
  gap: var(--space-md);
}

.weather-header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.weather-city-select {
  min-width: 160px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--chip-bg);
  color: var(--text-primary);
  font-size: 0.9rem;
  cursor: pointer;
}

.weather-header-actions .btn {
  min-height: 44px;
  padding: 10px 18px;
  white-space: nowrap;
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
  background: rgba(104, 173, 51, 0.25);
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
  background: rgba(104, 173, 51, 0.25);
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
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
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
