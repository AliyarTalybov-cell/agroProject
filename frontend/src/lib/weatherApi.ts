/**
 * OpenWeatherMap API для панели агронома.
 * Вызов при загрузке страницы и при смене города.
 */

const OPENWEATHER_BASE = 'https://api.openweathermap.org/data/2.5/weather'
const OPENWEATHER_FORECAST = 'https://api.openweathermap.org/data/2.5/forecast'
const APPID = 'f8a7bf6a4c76418c05f1f818fd12375f'
const UNITS = 'metric'
const LANG = 'ru'

const WIND_DIRECTIONS = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ']

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
  sunrise: string
  sunset: string
  dt: number
  timezone: number
}

type OpenWeatherRaw = {
  cod?: number
  name?: string
  coord?: { lon?: number; lat?: number }
  weather?: Array<{ main?: string; description?: string; icon?: string }>
  main?: {
    temp?: number
    feels_like?: number
    pressure?: number
    humidity?: number
    sea_level?: number
    grnd_level?: number
  }
  visibility?: number
  wind?: { speed?: number; deg?: number }
  clouds?: { all?: number }
  sys?: { sunrise?: number; sunset?: number }
  timezone?: number
  dt?: number
}

function windDegToLabel(deg: number | null | undefined): string {
  if (deg == null) return '—'
  const index = Math.round(((deg % 360) + 360) / 45) % 8
  return WIND_DIRECTIONS[index]
}

function buildWeatherUrl(city: string, countryCode = 'ru'): string {
  const params = new URLSearchParams({
    q: `${city},${countryCode}`,
    APPID,
    units: UNITS,
    lang: LANG,
  })
  return `${OPENWEATHER_BASE}?${params.toString()}`
}

function parseWeatherResponse(raw: OpenWeatherRaw): WeatherData | null {
  if (!raw || raw.cod !== 200) return null

  const weather = raw.weather?.[0]
  const main = raw.main ?? {}
  const wind = raw.wind ?? {}
  const sys = raw.sys ?? {}
  const clouds = raw.clouds ?? {}
  const tz = raw.timezone ?? 0

  const sunrise = sys.sunrise ? new Date((sys.sunrise + tz) * 1000) : null
  const sunset = sys.sunset ? new Date((sys.sunset + tz) * 1000) : null
  const formatTime = (date: Date | null) =>
    date ? `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}` : '—'

  return {
    cityName: raw.name ?? '—',
    condition: (weather?.main as string | undefined) ?? '',
    coord: { lon: raw.coord?.lon, lat: raw.coord?.lat },
    temp: main.temp != null ? Math.round(main.temp) : null,
    feelsLike: main.feels_like != null ? Math.round(main.feels_like) : null,
    description: weather?.description ?? '—',
    icon: weather?.icon ?? '01d',
    humidity: main.humidity ?? null,
    pressure: main.pressure ?? null,
    seaLevel: main.sea_level ?? null,
    grndLevel: main.grnd_level ?? null,
    visibility: raw.visibility ?? null,
    windSpeed: wind.speed ?? null,
    windDeg: wind.deg ?? null,
    windDirection: windDegToLabel(wind.deg),
    clouds: clouds.all ?? null,
    sunrise: formatTime(sunrise),
    sunset: formatTime(sunset),
    dt: raw.dt ?? 0,
    timezone: raw.timezone ?? 0,
  }
}

export async function fetchWeather(city: string, countryCode = 'ru'): Promise<WeatherData | null> {
  const url = buildWeatherUrl(city, countryCode)
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const raw = await response.json()
    return parseWeatherResponse(raw)
  } catch (e) {
    console.error('Weather API error:', e)
    return null
  }
}

export function getWeatherIconUrl(icon: string): string {
  return `https://openweathermap.org/img/wn/${icon || '01d'}@2x.png`
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

type ForecastListEntry = {
  dt: number
  main?: { temp_min?: number; temp_max?: number }
  weather?: Array<{ icon?: string; main?: string }>
  wind?: { speed?: number }
  pop?: number
}

type OpenWeatherForecastRaw = {
  cod?: string
  list?: ForecastListEntry[]
  city?: { timezone?: number }
}

function aggregateForecastByDay(list: ForecastListEntry[], timezone = 0): ForecastDayItem[] {
  const byDay = new Map<string, { min: number; max: number; icons: string[]; conditions: string[]; wind: number[]; pop: number[] }>()
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
    row.icons.push(icon)
    row.conditions.push((item.weather?.[0]?.main as string) ?? '')
    if (item.wind?.speed != null) row.wind.push(item.wind.speed)
    if (item.pop != null) row.pop.push(item.pop)
  }
  const dayLabels = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
  const sorted = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(0, 5)
  return sorted.map(([dateStr, row]) => {
    const d = new Date(dateStr + 'T12:00:00Z')
    const dayLabel = dayLabels[d.getUTCDay()]
    const dayNum = d.getUTCDate()
    const month = d.getUTCMonth() + 1
    const monthNames: Record<number, string> = { 1: 'Янв', 2: 'Фев', 3: 'Мар', 4: 'Апр', 5: 'Май', 6: 'Июн', 7: 'Июл', 8: 'Авг', 9: 'Сен', 10: 'Окт', 11: 'Ноя', 12: 'Дек' }
    const dateLabel = `${dayNum} ${monthNames[month] ?? ''}`
    const mid = Math.floor(row.icons.length / 2)
    const icon = row.icons[mid] ?? row.icons[0] ?? '01d'
    const condition = row.conditions[mid] ?? row.conditions[0] ?? ''
    const windAvg = row.wind.length ? row.wind.reduce((a, b) => a + b, 0) / row.wind.length : null
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
}

export async function fetchForecast5(lat: number, lon: number): Promise<ForecastDayItem[]> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    appid: APPID,
    units: UNITS,
    lang: LANG,
    cnt: '40',
  })
  try {
    const response = await fetch(`${OPENWEATHER_FORECAST}?${params.toString()}`)
    if (!response.ok) return []
    const raw: OpenWeatherForecastRaw = await response.json()
    const list = raw?.list ?? []
    const timezone = raw?.city?.timezone ?? 0
    return aggregateForecastByDay(list, timezone)
  } catch (e) {
    console.error('Forecast API error:', e)
    return []
  }
}
