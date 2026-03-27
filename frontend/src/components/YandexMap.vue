<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

export type MapFieldMarker = {
  id: string
  lat: number
  lon: number
  title: string
  subtitle?: string
}

const props = withDefaults(
  defineProps<{
    lat?: number
    lon?: number
    zoom?: number
    /** false — только просмотр: без поиска и клика, сразу метка в центре */
    interactive?: boolean
    /** Текст подсказки/балуна у метки (например адрес поля) */
    markerHint?: string
    /** Дополнительные метки (поля) — зелёные точки на карте */
    fieldMarkers?: MapFieldMarker[]
    /** Вместе с точкой погоды (lat/lon) подогнать вид так, чтобы были видны все поля */
    fitFieldMarkers?: boolean
  }>(),
  {
    lat: 55.7558,
    lon: 37.6176,
    zoom: 10,
    interactive: true,
    markerHint: '',
    fieldMarkers: () => [],
    fitFieldMarkers: false,
  },
)

const emit = defineEmits<{
  (e: 'pick', coords: { lat: number; lon: number }): void
}>()

const mapEl = ref<HTMLDivElement | null>(null)
let mapInstance: any = null
let placemark: any = null
let ymaps: any = null
const fieldPlacemarks: any[] = []

function clearFieldPlacemarks() {
  if (!mapInstance) return
  for (const m of fieldPlacemarks) {
    try {
      mapInstance.geoObjects.remove(m)
    } catch {
      /* noop */
    }
  }
  fieldPlacemarks.length = 0
}

function syncFieldPlacemarks() {
  if (!mapInstance || !ymaps) return
  clearFieldPlacemarks()
  for (const p of props.fieldMarkers) {
    const pm = new ymaps.Placemark(
      [p.lat, p.lon],
      {
        balloonContentHeader: p.title,
        balloonContentBody: p.subtitle || '',
        hintContent: p.title,
      },
      {
        preset: 'islands#darkGreenDotIcon',
        draggable: false,
      },
    )
    mapInstance.geoObjects.add(pm)
    fieldPlacemarks.push(pm)
  }
}

/** Центр и масштаб: либо охват полей + точки погоды, либо только центр погоды */
function applyBoundsOrCenter() {
  if (!mapInstance) return
  const markers = props.fieldMarkers ?? []
  if (props.fitFieldMarkers && markers.length > 0) {
    const lats = markers.map((m) => m.lat)
    const lons = markers.map((m) => m.lon)
    lats.push(props.lat)
    lons.push(props.lon)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLon = Math.min(...lons)
    const maxLon = Math.max(...lons)
    const latSpan = maxLat - minLat
    const lonSpan = maxLon - minLon
    const pad = Math.max(latSpan, lonSpan) * 0.12 + 0.008
    if (latSpan < 0.0008 && lonSpan < 0.0008) {
      mapInstance.setCenter([props.lat, props.lon], Math.max(props.zoom, 13))
      return
    }
    mapInstance.setBounds(
      [
        [minLat - pad, minLon - pad],
        [maxLat + pad, maxLon + pad],
      ],
      { checkZoomRange: true, zoomMargin: 56 },
    )
  } else {
    mapInstance.setCenter([props.lat, props.lon], props.zoom)
  }
}

async function initMap() {
  if (!mapEl.value) return

  try {
    ymaps = (window as any).ymaps
    if (!ymaps) {
      console.error('ymaps не найден')
      return
    }

    await new Promise<void>((resolve) => ymaps.ready(resolve))

    mapInstance = new ymaps.Map(mapEl.value, {
      center: [props.lat, props.lon],
      zoom: props.zoom,
      controls: ['zoomControl', 'fullscreenControl'],
    })

    if (props.interactive) {
      const searchControl = new ymaps.control.SearchControl({
        options: {
          provider: 'yandex#search',
          noPlacemark: true,
        },
      })
      mapInstance.controls.add(searchControl)

      searchControl.events.add('resultselect', (e: any) => {
        const index = e.get('index')
        searchControl.getResult(index).then((res: any) => {
          const coords = res.geometry.getCoordinates()
          const [lat, lon] = coords as [number, number]
          emit('pick', { lat, lon })
          placeMark(lat, lon)
        })
      })

      mapInstance.events.add('click', (e: any) => {
        const coords: [number, number] = e.get('coords')
        const [lat, lon] = coords
        emit('pick', { lat, lon })
        placeMark(lat, lon)
      })
    } else {
      placeMark(props.lat, props.lon)
    }

    syncFieldPlacemarks()
    applyBoundsOrCenter()
  } catch (err) {
    console.error('YandexMap init error:', err)
  }
}

function placeMark(lat: number, lon: number) {
  if (!mapInstance || !ymaps) return

  if (placemark) {
    mapInstance.geoObjects.remove(placemark)
    placemark = null
  }

  const hint = props.markerHint?.trim()
  placemark = new ymaps.Placemark(
    [lat, lon],
    hint ? { hintContent: hint, balloonContent: hint } : {},
    {
      preset: 'islands#redDotIcon',
      draggable: false,
    },
  )

  mapInstance.geoObjects.add(placemark)
}

watch(
  [
    () => props.lat,
    () => props.lon,
    () => props.zoom,
    () => props.markerHint,
    () => props.interactive,
    () => props.fitFieldMarkers,
    () => props.fieldMarkers,
  ],
  () => {
    if (!mapInstance) return
    syncFieldPlacemarks()
    applyBoundsOrCenter()
    if (!props.interactive) {
      placeMark(props.lat, props.lon)
    }
  },
  { deep: true },
)

onMounted(() => {
  void initMap()
})

onBeforeUnmount(() => {
  clearFieldPlacemarks()
  if (mapInstance) {
    try {
      mapInstance.destroy()
    } catch {
      /* noop */
    }
    mapInstance = null
    placemark = null
  }
})
</script>

<template>
  <div class="ymap-wrapper">
    <div ref="mapEl" class="ymap-container" />
    <div v-if="interactive" class="ymap-hint">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
      <span class="ymap-hint-text">
        <template v-if="fieldMarkers.length">Зелёные метки — ваши поля. </template>
        Нажмите на карту, чтобы выбрать точку наблюдения (красная метка).
      </span>
    </div>
  </div>
</template>

<style scoped>
.ymap-wrapper {
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  box-shadow: 0 2px 12px -4px rgba(0, 0, 0, 0.18);
  position: relative;
  background: #e8edf2;
}

.ymap-container {
  width: 100%;
  height: 400px;
}

.ymap-hint {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  max-width: calc(100% - 24px);
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 0.78rem;
  padding: 6px 14px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  gap: 6px;
  pointer-events: none;
  backdrop-filter: blur(4px);
  z-index: 10;
}

.ymap-hint-text {
  white-space: normal;
  text-align: center;
  line-height: 1.35;
}
</style>
