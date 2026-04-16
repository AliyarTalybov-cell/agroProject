/**
 * Yandex Weather GraphQL API (Spectaql)
 */

const YANDEX_PROXY = '/api/weather'
const YANDEX_TIMEOUT_MS = 4500
const OPENWEATHER_TIMEOUT_MS = 5000
const YANDEX_RATE_LIMIT_COOLDOWN_MS = 60_000
let yandexRateLimitedUntil = 0

export type WeatherData = {
  cityName: string
  condition: string
  coord: { lon?: number; lat?: number }
  temp: number | null
  feelsLike: number | null
  description: string
  icon: string
  humidity: number | null
  pressure: number | null
  seaLevel: number | null
  grndLevel: number | null
  visibility: number | null
  windSpeed: number | null
  windDeg: number | null
  windDirection: string
  clouds: number | null
  precProbability: number | null
  sunrise: string
  sunset: string
  dt: number
  timezone: number
  uvIndex?: number | null
  soilTemperature?: number | null
  soilMoisture?: number | null
  leafWetnessIndex?: boolean | null
  precType?: number | null
  precStrength?: number | null
  isThunder?: boolean | null
  dewPoint?: number | null
  kpIndex?: number | null
  meanSeaLevelPressure?: number | null
  altitude?: number | null
  pressureNorm?: number | null
}

// Преобразование Yandex conditions
function parseCondition(c: string): string {
  const cond = c?.toLowerCase() || ''
  if (cond.includes('clear')) return 'clear'
  if (cond.includes('cloud') || cond.includes('overcast')) return 'clouds'
  if (cond.includes('rain') || cond.includes('drizzle') || cond.includes('shower')) return 'rain'
  if (cond.includes('snow')) return 'snow'
  if (cond.includes('storm')) return 'thunderstorm'
  return 'clear'
}

function parseWindDir(dir: string): string {
  const dirs: Record<string, string> = {
    nw: 'СЗ',
    n: 'С',
    ne: 'СВ',
    e: 'В',
    se: 'ЮВ',
    s: 'Ю',
    sw: 'ЮЗ',
    w: 'З',
    c: 'Штиль',
    NW: 'СЗ',
    N: 'С',
    NE: 'СВ',
    E: 'В',
    SE: 'ЮВ',
    S: 'Ю',
    SW: 'ЮЗ',
    W: 'З',
    C: 'Штиль',
    NORTH_WEST: 'СЗ',
    NORTH: 'С',
    NORTH_EAST: 'СВ',
    EAST: 'В',
    SOUTH_EAST: 'ЮВ',
    SOUTH: 'Ю',
    SOUTH_WEST: 'ЮЗ',
    WEST: 'З',
    CALM: 'Штиль',
  }
  const key = (dir || '').trim()
  return dirs[key] || dirs[key.toUpperCase()] || dir
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function shouldSkipYandex(): boolean {
  return Date.now() < yandexRateLimitedUntil
}

function markYandexRateLimited() {
  yandexRateLimitedUntil = Date.now() + YANDEX_RATE_LIMIT_COOLDOWN_MS
}

const GQL_NOW_QUERY = `
  query WeatherNow($lat: Float!, $lon: Float!) {
    weatherByPoint(request: { lat: $lat, lon: $lon }) {
      now {
        temperature
        condition
        windSpeed
        windDirection
        humidity
        pressure
        visibility
        icon(format: SVG)
        precProbability
        kpIndex
        meanSeaLevelPressure
      }
      forecast {
        days(limit: 1) {
          sunrise
          sunset
        }
      }
    }
  }
`

import { RUSSIAN_CITIES } from './cities'

export async function fetchWeather(cityOrLat: string | number, lonOrNull: number | string = 'ru'): Promise<WeatherData | null> {
  // По умолчанию ставим координаты Москвы, они переопределятся при наличии cityOrLat
  let lat = 55.7558;
  let lon = 37.6173;
  let label = typeof cityOrLat === 'string' ? cityOrLat : 'Локация пользователя';

  if (typeof cityOrLat === 'number' && typeof lonOrNull === 'number') {
    lat = cityOrLat;
    lon = lonOrNull;
  } else if (typeof cityOrLat === 'string') {
    // Ищем город в нашем словаре
    const cityData = RUSSIAN_CITIES.find(c => c.value.startsWith(cityOrLat));
    if (cityData) {
      lat = cityData.lat;
      lon = cityData.lon;
      label = cityData.label; // Переводим на русский (например, "Москва" вместо "Moscow")
    }
  }

  // Ключ на фронтенде больше не нужен, он подставляется в Serverless Function на Vercel
  if (shouldSkipYandex()) {
    return fetchWeatherFallback(lat, lon, label)
  }
  try {
    const response = await fetchWithTimeout(YANDEX_PROXY, {
      method: 'POST',
      headers: {
        // 'X-Yandex-Weather-Key': key, // Ключ подставляется на сервере
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: GQL_NOW_QUERY,
        variables: { lat, lon }
      })
    }, YANDEX_TIMEOUT_MS)

    if (!response.ok) {
      if (response.status === 429) {
        markYandexRateLimited()
      }
      throw new Error(`Yandex HTTP Error: ${response.status}`);
    }
    const result = await response.json()
    
    if (result?.errors?.length) {
      throw new Error(`Yandex GraphQL error: ${JSON.stringify(result.errors)}`)
    }

    const weatherData = result.data?.weatherByPoint
    if (!weatherData || !weatherData.now) {
      throw new Error('Yandex Missing Data')
    }

    const now = weatherData.now
    const loc = weatherData.location || {}
    const todayForecast = weatherData.forecast?.days?.[0] || {}

    return {
      cityName: label,
      condition: parseCondition(now.condition),
      coord: { lon, lat },
      temp: now.temperature,
      feelsLike: null,
      description: now.condition,
      icon: now.icon, // У нас вернется полная SVG-ссылка 'https://yastatic.net/...'
      humidity: now.humidity,
      pressure: now.pressure,
      seaLevel: null,
      grndLevel: null,
      visibility: now.visibility,
      windSpeed: now.windSpeed,
      windDeg: null,
      windDirection: parseWindDir(now.windDirection),
      clouds: null, // Доступна только в PRO, поэтому скрываем
      precProbability: now.precProbability ?? 0,
      sunrise: todayForecast.sunrise || '—',
      sunset: todayForecast.sunset || '—',
      dt: Math.floor(Date.now() / 1000),
      timezone: 0,
      uvIndex: now.uvIndex ?? null,
      soilTemperature: now.soilTemperature ?? null,
      soilMoisture: now.soilMoisture ?? null,
      leafWetnessIndex: now.leafWetnessIndex ?? null,
      precType: now.precType ?? null,
      precStrength: now.precStrength ?? null,
      isThunder: now.isThunder ?? null,
      dewPoint: now.dewPoint ?? null,
      kpIndex: now.kpIndex ?? null,
      meanSeaLevelPressure: now.meanSeaLevelPressure ?? null,
      altitude: loc.altitude ?? null,
      pressureNorm: loc.pressureNorm ?? null,
    }
  } catch (e) {
    console.warn('Yandex Weather error, trying OpenWeather fallback:', e)
    return fetchWeatherFallback(lat, lon, label)
  }
}

export function getWeatherIconUrl(iconOrUrl: string): string {
  // Поскольку GraphQL сразу отдает абсолютный URL SVG, возвращаем как есть 
  if (iconOrUrl && iconOrUrl.startsWith('http')) {
    return iconOrUrl
  }
  return `https://yastatic.net/weather/i/icons/funky/dark/${iconOrUrl}.svg`
}

/** Короткая подпись погоды для компактных карточек (категория после parseCondition). */
export function conditionCategoryLabelRu(category: string): string {
  const c = (category || 'clear').toLowerCase()
  const map: Record<string, string> = {
    clear: 'Ясно',
    clouds: 'Облачно',
    rain: 'Дождь',
    snow: 'Снег',
    thunderstorm: 'Гроза',
  }
  return map[c] ?? '—'
}

// ——— Прогноз на 5 дней (по дням) ———
export type ForecastDayItem = {
  date: string
  dayLabel: string
  dateLabel: string
  tempMin: number
  tempMax: number
  icon: string
  condition: string
  windSpeed: number | null
  pop: number
  alert?: string
}

const GQL_FORECAST_QUERY = `
  query WeatherForecast($lat: Float!, $lon: Float!) {
    weatherByPoint(request: { lat: $lat, lon: $lon }) {
      forecast {
        days(limit: 5) {
          time
          parts {
            day {
              minTemperature
              maxTemperature
              icon(format: SVG)
              condition
              windSpeed
              precProbability
            }
          }
        }
      }
    }
  }
`

export async function fetchForecast5(lat: number, lon: number): Promise<ForecastDayItem[]> {
  if (shouldSkipYandex()) {
    return fetchForecast5Fallback(lat, lon)
  }
  try {
    const response = await fetchWithTimeout(YANDEX_PROXY, {
      method: 'POST',
      headers: {
        // 'X-Yandex-Weather-Key': key, // Ключ подставляется на сервере
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: GQL_FORECAST_QUERY,
        variables: { lat, lon }
      })
    }, YANDEX_TIMEOUT_MS)

    if (!response.ok) {
      if (response.status === 429) {
        markYandexRateLimited()
      }
      throw new Error(`Yandex HTTP Error: ${response.status}`)
    }
    const result = await response.json()
    if (result?.errors?.length) {
      throw new Error(`Forecast GraphQL response errors: ${JSON.stringify(result.errors)}`)
    }
    
    const days = result.data?.weatherByPoint?.forecast?.days
    if (!days) throw new Error('Yandex missing forecast days')
    
    const dayLabels = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
    const monthNames: Record<number, string> = { 1: 'Янв', 2: 'Фев', 3: 'Мар', 4: 'Апр', 5: 'Май', 6: 'Июн', 7: 'Июл', 8: 'Авг', 9: 'Сен', 10: 'Окт', 11: 'Ноя', 12: 'Дек' }

    return days.map((day: any) => {
      const d = new Date(day.time)
      const dayLabel = dayLabels[d.getUTCDay()]
      const dateLabel = `${d.getUTCDate()} ${monthNames[d.getUTCMonth() + 1]}`
      
      const p = day.parts?.day || {}
      
      let alert: string | undefined
      if (p.windSpeed > 12) alert = 'СИЛЬНЫЙ ВЕТЕР ОТЛОЖИТЕ УБОРКУ'

      return {
        date: day.time.split('T')[0],
        dayLabel,
        dateLabel,
        tempMin: p.minTemperature ?? p.maxTemperature ?? 0,
        tempMax: p.maxTemperature ?? 0,
        icon: p.icon || '', // Полный SVG URL
        condition: parseCondition(p.condition || ''),
        windSpeed: p.windSpeed ?? null,
        pop: p.precProbability ?? 0,
        alert,
      }
    })
  } catch (e) {
    console.warn('Forecast GraphQL API error, trying OpenWeather fallback:', e)
    return fetchForecast5Fallback(lat, lon)
  }
}

// ——— OpenWeather Возвратный фукнционал на случай отказа Yandex ———

const OPENWEATHER_BASE = 'https://api.openweathermap.org/data/2.5/weather'
const OPENWEATHER_FORECAST = 'https://api.openweathermap.org/data/2.5/forecast'
const APPID = 'f8a7bf6a4c76418c05f1f818fd12375f' // Предыдущий ключ для OpenWeatherMap
const UNITS = 'metric'
const LANG = 'ru'
const WIND_DIRECTIONS = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ']

function windDegToLabel(deg: number | null | undefined): string {
  if (deg == null) return '—'
  const index = Math.round(((deg % 360) + 360) / 45) % 8
  return WIND_DIRECTIONS[index]
}

async function fetchWeatherFallback(lat: number, lon: number, cityName: string): Promise<WeatherData | null> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    appid: APPID,
    units: UNITS,
    lang: LANG,
  })
  try {
    const response = await fetchWithTimeout(
      `${OPENWEATHER_BASE}?${params.toString()}`,
      { method: 'GET' },
      OPENWEATHER_TIMEOUT_MS,
    )
    if (!response.ok) return null
    const raw = await response.json()
    const weather = raw.weather?.[0]
    const main = raw.main ?? {}
    const wind = raw.wind ?? {}
    const sys = raw.sys ?? {}
    const clouds = raw.clouds ?? {}
    const tz = raw.timezone ?? 0

    const formatTime = (ts: number | null | undefined) => 
      ts ? new Date((ts + tz) * 1000).toISOString().substring(11, 16) : '—'

    return {
      cityName: cityName || (raw.name ?? '—'),
      condition: parseCondition(weather?.main || 'clear'),
      coord: { lon, lat },
      temp: main.temp != null ? Math.round(main.temp) : null,
      feelsLike: main.feels_like != null ? Math.round(main.feels_like) : null,
      description: weather?.description ?? '—',
      icon: `https://openweathermap.org/img/wn/${weather?.icon ?? '01d'}@2x.png`,
      humidity: main.humidity ?? null,
      pressure: main.pressure ?? null,
      seaLevel: main.sea_level ?? null,
      grndLevel: main.grnd_level ?? null,
      visibility: raw.visibility ?? null,
      windSpeed: wind.speed ?? null,
      windDeg: wind.deg ?? null,
      windDirection: windDegToLabel(wind.deg),
      clouds: clouds.all ?? null,
      precProbability: 0,
      sunrise: formatTime(sys.sunrise),
      sunset: formatTime(sys.sunset),
      dt: raw.dt ?? Math.floor(Date.now() / 1000),
      timezone: tz,
    }
  } catch (e) {
    console.error('OpenWeather Fallback error:', e)
    return null
  }
}

async function fetchForecast5Fallback(lat: number, lon: number): Promise<ForecastDayItem[]> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    appid: APPID,
    units: UNITS,
    lang: LANG,
    cnt: '40',
  })
  try {
    const response = await fetchWithTimeout(
      `${OPENWEATHER_FORECAST}?${params.toString()}`,
      { method: 'GET' },
      OPENWEATHER_TIMEOUT_MS,
    )
    if (!response.ok) return []
    const raw = await response.json()
    const list = raw?.list ?? []
    const timezone = raw?.city?.timezone ?? 0

    const byDay = new Map<string, any>()
    for (const item of list) {
      const d = new Date((item.dt + timezone) * 1000)
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
      const tempMin = item.main?.temp_min ?? item.main?.temp_max ?? 0
      const tempMax = item.main?.temp_max ?? item.main?.temp_min ?? 0
      if (!byDay.has(key)) {
        byDay.set(key, { min: tempMin, max: tempMax, icons: [], conditions: [], wind: [], pop: [] })
      }
      const row = byDay.get(key)!
      row.min = Math.min(row.min, tempMin)
      row.max = Math.max(row.max, tempMax)
      const icon = item.weather?.[0]?.icon ?? '01d'
      row.icons.push(`https://openweathermap.org/img/wn/${icon}@2x.png`)
      row.conditions.push(item.weather?.[0]?.main ?? '')
      if (item.wind?.speed != null) row.wind.push(item.wind.speed)
      if (item.pop != null) row.pop.push(item.pop)
    }
    
    const dayLabels = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
    const monthNames: Record<number, string> = { 1: 'Янв', 2: 'Фев', 3: 'Мар', 4: 'Апр', 5: 'Май', 6: 'Июн', 7: 'Июл', 8: 'Авг', 9: 'Сен', 10: 'Окт', 11: 'Ноя', 12: 'Дек' }
    const sorted = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(0, 5)

    return sorted.map(([dateStr, row]) => {
      const d = new Date(dateStr + 'T12:00:00Z')
      const dayLabel = dayLabels[d.getUTCDay()]
      const dateLabel = `${d.getUTCDate()} ${monthNames[d.getUTCMonth() + 1]}`
      const mid = Math.floor(row.icons.length / 2)
      const icon = row.icons[mid] ?? row.icons[0]
      const condition = parseCondition(row.conditions[mid] ?? row.conditions[0])
      const windAvg = row.wind.length ? row.wind.reduce((a: number, b: number) => a + b, 0) / row.wind.length : null
      const popMax = row.pop.length ? Math.max(...row.pop) : 0
      let alert: string | undefined
      if (windAvg != null && windAvg > 12) alert = 'СИЛЬНЫЙ ВЕТЕР ОТЛОЖИТЕ УБОРКУ'
      return {
        date: dateStr,
        dayLabel,
        dateLabel,
        tempMin: Math.round(row.min),
        tempMax: Math.round(row.max),
        icon,
        condition,
        windSpeed: windAvg,
        pop: popMax,
        alert,
      }
    })
  } catch (e) {
    console.error('Forecast Fallback API error:', e)
    return []
  }
}

