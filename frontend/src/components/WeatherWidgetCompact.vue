<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { fetchWeather, getWeatherIconUrl, type WeatherData } from '@/lib/weatherApi'
import { useWeatherCity } from '@/composables/useWeatherCity'

const router = useRouter()
const { cityValue, city, country } = useWeatherCity()
const weather = ref<WeatherData | null>(null)
const loading = ref(true)
const error = ref(false)

async function load() {
  loading.value = true
  error.value = false
  const data = await fetchWeather(city(), country())
  weather.value = data
  loading.value = false
  if (!data) error.value = true
}

onMounted(() => {
  load()
})

watch(cityValue, () => load())

function goToWeather() {
  router.push('/weather')
}

const windClass = () => {
  const w = weather.value?.windSpeed ?? 0
  if (w > 10) return 'weather-extreme'
  if (w > 5) return 'weather-wind-warning'
  return ''
}

const tempClass = () => {
  const t = weather.value?.temp
  if (t == null) return ''
  if (t < -15 || t > 35) return 'weather-extreme'
  return ''
}

const weatherSkyClass = () => {
  const c = (weather.value?.condition ?? '').toLowerCase()
  if (c === 'clear') return 'weather-sky--clear'
  if (c === 'clouds') return 'weather-sky--clouds'
  if (c === 'rain' || c === 'drizzle' || c === 'thunderstorm') return 'weather-sky--rain'
  if (c === 'snow') return 'weather-sky--snow'
  if (c === 'mist' || c === 'fog' || c === 'haze' || c === 'smoke') return 'weather-sky--fog'
  return 'weather-sky--clear'
}
</script>

<template>
  <div class="weather-widget-compact" aria-live="polite">
    <div v-if="loading" class="weather-compact-loading weather-compact-pulse">Загрузка погоды…</div>
    <div v-else-if="error" class="weather-compact-error">Не удалось загрузить погоду</div>
    <div v-else class="weather-compact-content weather-compact-in">
      <div class="weather-compact-sky weather-sky" :class="weatherSkyClass()" aria-hidden="true">
        <div class="weather-sky__sun-disk" />
        <div class="weather-sky__rays" />
        <div class="weather-sky__clouds"><span class="weather-sky__cloud" /><span class="weather-sky__cloud" /><span class="weather-sky__cloud" /></div>
        <div class="weather-sky__rain"><span v-for="i in 12" :key="i" class="weather-sky__drop" :style="{ '--i': i }" /></div>
        <div class="weather-sky__snow"><span v-for="i in 8" :key="i" class="weather-sky__flake" :style="{ '--i': i }" /></div>
        <div class="weather-sky__fog" />
      </div>
      <span class="weather-compact-city">{{ weather?.cityName }}</span>
      <span class="weather-compact-temp" :class="tempClass()">{{ weather?.temp ?? '—' }}°C</span>
      <img
        v-if="weather"
        class="weather-compact-icon"
        :src="getWeatherIconUrl(weather.icon)"
        alt=""
      />
      <div>
        <div class="weather-compact-desc">{{ weather?.description }}</div>
        <div class="weather-compact-feels">Ощущается как {{ weather?.feelsLike ?? '—' }}°C</div>
        <div class="weather-compact-meta">
          <span>Влажность: {{ weather?.humidity != null ? weather.humidity + '%' : '—' }}</span>
          <span :class="windClass()">Ветер: {{ weather?.windSpeed != null ? weather.windSpeed + ' м/с' : '—' }}</span>
        </div>
        <button type="button" class="type-action" style="margin-top: 8px" @click="goToWeather">
          Подробнее о погоде →
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.weather-widget-compact {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: var(--space-lg);
  margin-bottom: var(--space-xl);
  box-shadow: var(--shadow-card);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.weather-compact-sky.weather-sky {
  width: 100%;
  min-height: 72px;
  border-radius: 10px;
  margin-bottom: var(--space-md);
  flex-shrink: 0;
}

.weather-widget-compact:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px -4px rgba(0, 0, 0, 0.12);
}

.weather-compact-pulse {
  animation: compactPulse 1.2s ease-in-out infinite;
}

.weather-compact-in {
  animation: compactFadeIn 0.4s ease forwards;
}

@keyframes compactPulse {
  0%,
  100% {
    opacity: 0.7;
  }
  50% {
    opacity: 1;
  }
}

@keyframes compactFadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.weather-compact-loading,
.weather-compact-error {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.weather-compact-error {
  color: var(--warning-orange);
}

.weather-compact-content {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-lg);
}

.weather-compact-city {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-right: var(--space-sm);
}

.weather-compact-temp {
  font-size: 2rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}

.weather-compact-icon {
  width: 56px;
  height: 56px;
  object-fit: contain;
}

.weather-compact-desc {
  color: var(--text-secondary);
  font-size: 0.95rem;
  text-transform: capitalize;
}

.weather-compact-feels {
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.weather-compact-meta {
  display: flex;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.weather-compact-meta span {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.weather-wind-warning {
  color: var(--warning-orange) !important;
  font-weight: 700;
}

.weather-extreme {
  color: var(--danger-red) !important;
  font-weight: 700;
}
</style>
