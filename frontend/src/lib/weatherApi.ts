/**
 * Yandex Weather GraphQL API (Spectaql)
 */

const YANDEX_PROXY = '/yandex-proxy/graphql/query'

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
    nw: 'СЗ', n: 'С', ne: 'СВ', e: 'В',
    se: 'ЮВ', s: 'Ю', sw: 'ЮЗ', w: 'З', c: 'Штиль',
    NW: 'СЗ', N: 'С', NE: 'СВ', E: 'В',
    SE: 'ЮВ', S: 'Ю', SW: 'ЮЗ', W: 'З', C: 'Штиль'
  }
  return dirs[dir] || dir
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

  const key = import.meta.env.VITE_YANDEX_WEATHER_KEY

  if (!key) {
    console.error("VITE_YANDEX_WEATHER_KEY не найден в .env.local")
    return null
  }

  try {
    const response = await fetch(YANDEX_PROXY, {
      method: 'POST',
      headers: {
        'X-Yandex-Weather-Key': key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: GQL_NOW_QUERY,
        variables: { lat, lon }
      })
    })

    if (!response.ok) return null
    const result = await response.json()
    
    const weatherData = result.data?.weatherByPoint
    if (!weatherData || !weatherData.now) return null

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
    console.error('Yandex Weather GraphQL error:', e)
    return null
  }
}

export function getWeatherIconUrl(iconOrUrl: string): string {
  // Поскольку GraphQL сразу отдает абсолютный URL SVG, возвращаем как есть 
  if (iconOrUrl && iconOrUrl.startsWith('http')) {
    return iconOrUrl
  }
  return `https://yastatic.net/weather/i/icons/funky/dark/${iconOrUrl}.svg`
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
  const key = import.meta.env.VITE_YANDEX_WEATHER_KEY

  try {
    const response = await fetch(YANDEX_PROXY, {
      method: 'POST',
      headers: {
        'X-Yandex-Weather-Key': key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: GQL_FORECAST_QUERY,
        variables: { lat, lon }
      })
    })

    if (!response.ok) return []
    const result = await response.json()
    
    const days = result.data?.weatherByPoint?.forecast?.days || []
    
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
    console.error('Forecast GraphQL API error:', e)
    return []
  }
}
