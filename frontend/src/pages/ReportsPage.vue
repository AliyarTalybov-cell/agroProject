<script setup lang="ts">
import { computed, ref, onMounted, onActivated } from 'vue'
import type { StoredDowntime, DowntimeCategory } from '@/lib/downtimeStorage'
import { loadEvents } from '@/lib/downtimeStorage'
import { loadOperations } from '@/lib/operationStorage'

const events = ref<StoredDowntime[]>(loadEvents())
const operations = ref(loadOperations())
const showAllDowntimes = ref(false)
const showAllOperations = ref(false)

const ROW_LIMIT = 5
const hoveredCategory = ref<DowntimeCategory | null>(null)
const animateProgress = ref(0)
onMounted(() => {
  const duration = 700
  const start = performance.now()
  const tick = (now: number) => {
    const elapsed = now - start
    animateProgress.value = Math.min(1, elapsed / duration)
    if (animateProgress.value < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})

onActivated(() => {
  events.value = loadEvents()
  operations.value = loadOperations()
})

const hasEvents = computed(() => events.value.length > 0)

const sortedEvents = computed(() =>
  [...events.value].sort(
    (a, b) => new Date(b.startISO).getTime() - new Date(a.startISO).getTime(),
  ),
)

const sortedOperations = computed(() =>
  [...operations.value].sort(
    (a, b) => new Date(b.startISO).getTime() - new Date(a.startISO).getTime(),
  ),
)

const visibleDowntimes = computed(() =>
  showAllDowntimes.value ? sortedEvents.value : sortedEvents.value.slice(0, ROW_LIMIT),
)
const visibleOperations = computed(() =>
  showAllOperations.value ? sortedOperations.value : sortedOperations.value.slice(0, ROW_LIMIT),
)
const hasMoreDowntimes = computed(() => sortedEvents.value.length > ROW_LIMIT)
const hasMoreOperations = computed(() => sortedOperations.value.length > ROW_LIMIT)

const totalMinutes = computed(() =>
  events.value.reduce((sum, e) => sum + e.durationMinutes, 0),
)

const totalHoursLabel = computed(() => {
  if (!totalMinutes.value) return '0 ч'
  const hours = totalMinutes.value / 60
  return `${hours.toFixed(1)} ч`
})

const categoriesMeta: Record<
  DowntimeCategory,
  { label: string; colorClass: string }
> = {
  breakdown: { label: 'Поломка техники', colorClass: 'legend-breakdown' },
  rain: { label: 'Дождь / погода', colorClass: 'legend-rain' },
  fuel: { label: 'Нет топлива', colorClass: 'legend-fuel' },
  waiting: { label: 'Ожидание задания', colorClass: 'legend-waiting' },
}
const categoryKeys = ['breakdown', 'rain', 'fuel', 'waiting'] as const

const minutesByCategory = computed(() => {
  const base: Record<DowntimeCategory, number> = {
    breakdown: 0,
    rain: 0,
    fuel: 0,
    waiting: 0,
  }
  events.value.forEach((e) => {
    base[e.category] += e.durationMinutes
  })
  return base
})

const percentsByCategory = computed(() => {
  const total = Object.values(minutesByCategory.value).reduce(
    (sum, m) => sum + m,
    0,
  )
  if (!total) {
    return {
      breakdown: 0,
      rain: 0,
      fuel: 0,
      waiting: 0,
    }
  }
  return {
    breakdown: (minutesByCategory.value.breakdown / total) * 100,
    rain: (minutesByCategory.value.rain / total) * 100,
    fuel: (minutesByCategory.value.fuel / total) * 100,
    waiting: (minutesByCategory.value.waiting / total) * 100,
  }
})

const donutStyle = computed(() => {
  const b = percentsByCategory.value.breakdown
  const r = percentsByCategory.value.rain
  const f = percentsByCategory.value.fuel
  const w = percentsByCategory.value.waiting

  if (!(b + r + f + w)) {
    return { background: 'var(--donut-inner-bg)' }
  }

  const s1 = b
  const s2 = b + r
  const s3 = b + r + f

  return {
    background: `conic-gradient(
      var(--danger-red) 0 ${s1}%,
      #3c91d3 ${s1}% ${s2}%,
      var(--warning-orange) ${s2}% ${s3}%,
      #9ca3af ${s3}% 100%
    )`,
  }
})

const topEmployees = computed(() => {
  const map = new Map<string, number>()
  events.value.forEach((e) => {
    map.set(e.employee, (map.get(e.employee) ?? 0) + e.durationMinutes)
  })
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
})

const displayedTotalHoursLabel = computed(() => {
  if (!totalMinutes.value) return '0 ч'
  const hours = (animateProgress.value * totalMinutes.value) / 60
  return `${hours.toFixed(1)} ч`
})
const displayedPercent = (key: DowntimeCategory) =>
  Math.round(animateProgress.value * (percentsByCategory.value[key] ?? 0))
const displayedMinutes = (key: DowntimeCategory) =>
  Math.round(animateProgress.value * (minutesByCategory.value[key] ?? 0))

function formatDuration(minutes: number): string {
  if (!minutes) return '0 мин'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m} мин`
  if (!m) return `${h} ч`
  return `${h} ч ${m} мин`
}

function formatClock(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
  })
}
</script>

<template>
  <section class="reports-page">
    <header class="header-area reports-header page-enter-item">
      <div>
        <div class="type-label">Сводка по простоям</div>
        <h1 class="page-title">Отчеты</h1>
      </div>
      <div class="reports-header-meta">
        <div class="summary-item">
          <div class="type-label">Всего записей</div>
          <div class="type-value">{{ events.length }}</div>
        </div>
        <div class="summary-item">
          <div class="type-label">Общее время простоя</div>
          <div class="type-value">{{ totalHoursLabel }}</div>
        </div>
      </div>
    </header>

    <div class="reports-grid">
      <section class="panel panel-table page-enter-item" style="--enter-delay: 80ms">
        <div class="panel-header">
          <div>
            <div class="type-label">Журнал</div>
            <div class="panel-title">Простои техники</div>
          </div>
        </div>

        <div v-if="!hasEvents" class="empty-state">
          <p class="placeholder-text">
            Пока нет записей о простоях. Как только механизатор начнет и завершит простой, он появится в этом журнале.
          </p>
        </div>

        <div v-else>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Сотрудник</th>
                  <th>Поле / операция</th>
                  <th>Причина</th>
                  <th>Дата</th>
                  <th>Время</th>
                  <th class="text-right">Длительность</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="event in visibleDowntimes" :key="event.id">
                  <td class="cell-employee">
                    {{ event.employee }}
                  </td>
                  <td class="cell-field">
                    <template v-if="event.fieldName || event.operation">
                      <div v-if="event.fieldName" class="cell-field-main">
                        {{ event.fieldName }}
                      </div>
                      <div v-if="event.operation" class="cell-field-sub">
                        {{ event.operation }}
                      </div>
                    </template>
                    <span v-else class="cell-field-empty">—</span>
                  </td>
                  <td class="cell-reason">
                    <span
                      class="reason-dot"
                      :class="`reason-dot-${event.category}`"
                    />
                    <span>{{ event.reason }}</span>
                  </td>
                  <td class="cell-date">
                    {{ formatDate(event.startISO) }}
                  </td>
                  <td class="cell-time">
                    {{ formatClock(event.startISO) }}–{{ formatClock(event.endISO) }}
                  </td>
                  <td class="cell-duration text-right">
                    {{ formatDuration(event.durationMinutes) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <button
            v-if="hasMoreDowntimes"
            type="button"
            class="show-all-btn"
            @click="showAllDowntimes = !showAllDowntimes"
          >
            {{ showAllDowntimes ? 'Свернуть' : 'Показать все' }}
            ({{ sortedEvents.length }})
          </button>
        </div>
      </section>

      <section class="panel panel-chart page-enter-item" style="--enter-delay: 140ms">
        <div class="panel-header">
          <div>
            <div class="type-label">Структура простоев</div>
            <div class="panel-title">По причинам и сотрудникам</div>
          </div>
        </div>

        <div v-if="hasEvents" class="chart-layout">
          <div
            class="donut-wrapper chart-wrapper-interactive"
            :data-hover="hoveredCategory ?? ''"
          >
            <div class="donut-chart reports-donut" :style="donutStyle">
              <div class="donut-inner">
                <div class="donut-total">
                  {{ displayedTotalHoursLabel }}
                </div>
                <div class="donut-label">Всего простоя</div>
              </div>
            </div>
          </div>

          <div class="chart-side">
            <ul class="legend">
              <li
                v-for="(key, idx) in categoryKeys"
                :key="key"
                class="legend-item legend-item-reveal"
                :class="{ 'legend-item-active': hoveredCategory === key }"
                :style="{ '--legend-delay': 0.35 + idx * 0.08 + 's' }"
                @mouseenter="hoveredCategory = key"
                @mouseleave="hoveredCategory = null"
              >
                <div class="legend-label">
                  <span class="legend-color" :class="categoriesMeta[key].colorClass" />
                  <span>{{ categoriesMeta[key].label }}</span>
                </div>
                <span class="legend-value">
                  {{ displayedPercent(key) }}% ·
                  {{ formatDuration(displayedMinutes(key)) }}
                </span>
              </li>
            </ul>

            <div class="top-employees">
              <div class="type-label">Топ по времени простоя</div>
              <ul class="top-list">
                <li
                  v-for="([name, minutes], idx) in topEmployees"
                  :key="name"
                  class="top-item top-item-reveal"
                  :style="{ '--top-delay': 0.6 + idx * 0.06 + 's' }"
                >
                  <span class="top-name">{{ name }}</span>
                  <span class="top-value">{{ formatDuration(minutes) }}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div v-else class="empty-state">
          <p class="placeholder-text">
            Как только появятся данные о простоях, мы покажем распределение по причинам и сотрудникам.
          </p>
        </div>
      </section>

      <section class="panel panel-table page-enter-item operations-panel" style="--enter-delay: 180ms">
        <div class="panel-header">
          <div>
            <div class="type-label">Журнал</div>
            <div class="panel-title">Операции</div>
          </div>
        </div>

        <div v-if="!operations.length" class="empty-state">
          <p class="placeholder-text">
            Завершённые операции появятся здесь после нажатия «Остановить операцию» на экране оператора.
          </p>
        </div>

        <div v-else>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Сотрудник</th>
                  <th>Поле / операция</th>
                  <th>Дата</th>
                  <th>Время</th>
                  <th class="text-right">Длительность</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="op in visibleOperations" :key="op.id">
                  <td class="cell-employee">{{ op.employee }}</td>
                  <td class="cell-field">
                    <template v-if="op.fieldName || op.operation">
                      <div v-if="op.fieldName" class="cell-field-main">{{ op.fieldName }}</div>
                      <div v-if="op.operation" class="cell-field-sub">{{ op.operation }}</div>
                    </template>
                    <span v-else class="cell-field-empty">—</span>
                  </td>
                  <td class="cell-date">{{ formatDate(op.startISO) }}</td>
                  <td class="cell-time">
                    {{ formatClock(op.startISO) }}–{{ formatClock(op.endISO) }}
                  </td>
                  <td class="cell-duration text-right">
                    {{ formatDuration(op.durationMinutes) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <button
            v-if="hasMoreOperations"
            type="button"
            class="show-all-btn"
            @click="showAllOperations = !showAllOperations"
          >
            {{ showAllOperations ? 'Свернуть' : 'Показать все' }}
            ({{ sortedOperations.length }})
          </button>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.reports-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

.reports-header {
  padding-bottom: var(--space-md);
  border-bottom: 1px solid var(--border-color);
}

.reports-header-meta {
  display: flex;
  gap: var(--space-lg);
  align-items: flex-end;
}

.summary-item .type-value {
  font-size: 1.1rem;
}

.reports-grid {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  gap: var(--space-md);
}

.panel {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  padding: var(--space-lg);
  backdrop-filter: blur(10px);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-md);
}

.panel-title {
  margin-top: 4px;
  font-size: 1.05rem;
  font-weight: 500;
}

.panel-table .table-wrapper {
  width: 100%;
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

th,
td {
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--border-color);
  font-size: 0.85rem;
}

th {
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-secondary);
}

tbody tr:last-child td {
  border-bottom: none;
}

tbody tr:hover td {
  background: var(--row-hover-bg);
}

.cell-employee {
  font-weight: 500;
}

.cell-reason {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
}

.cell-field-main {
  font-weight: 500;
}

.cell-field-sub {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.cell-field-empty {
  color: var(--text-secondary);
}

.cell-time,
.cell-date {
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}

.cell-duration {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

.reason-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.reason-dot-breakdown {
  background: var(--danger-red);
}

.reason-dot-rain {
  background: #3c91d3;
}

.reason-dot-fuel {
  background: var(--warning-orange);
}

.reason-dot-waiting {
  background: #9ca3af;
}

.panel-chart {
  display: flex;
  flex-direction: column;
  transition: box-shadow 0.25s ease;
}
.panel-chart:hover {
  box-shadow: 0 8px 28px -6px rgba(0, 0, 0, 0.1);
}

.chart-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.6fr);
  gap: var(--space-lg);
  align-items: stretch;
}

.donut-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
}

.donut-chart {
  width: 200px;
  height: 200px;
  border-radius: 50%;
  position: relative;
  box-shadow: var(--donut-ring-shadow);
  opacity: 0;
  transform: scale(0.7);
  animation: donutReveal 0.6s ease-out 0.2s forwards;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}

.reports-donut {
  position: relative;
}

.chart-wrapper-interactive[data-hover="breakdown"] .reports-donut {
  box-shadow: 0 0 0 4px rgba(211, 60, 60, 0.35);
  transform: scale(1.03);
}
.chart-wrapper-interactive[data-hover="rain"] .reports-donut {
  box-shadow: 0 0 0 4px rgba(60, 145, 211, 0.35);
  transform: scale(1.03);
}
.chart-wrapper-interactive[data-hover="fuel"] .reports-donut {
  box-shadow: 0 0 0 4px rgba(211, 130, 60, 0.35);
  transform: scale(1.03);
}
.chart-wrapper-interactive[data-hover="waiting"] .reports-donut {
  box-shadow: 0 0 0 4px rgba(156, 163, 175, 0.4);
  transform: scale(1.03);
}

@keyframes donutReveal {
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.donut-inner {
  position: absolute;
  inset: 32px;
  border-radius: 50%;
  background: var(--donut-inner-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.donut-total {
  font-size: 1.3rem;
  font-weight: 600;
}

.donut-label {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.chart-side {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  justify-content: space-between;
}

.legend {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.legend-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.85rem;
  transition: background 0.2s ease, transform 0.2s ease;
  border-radius: 8px;
  padding: 6px 10px;
  margin: 0 -10px;
  cursor: default;
}
.legend-item-active {
  background: var(--row-hover-bg);
  transform: scale(1.02);
}
.legend-item-reveal {
  opacity: 0;
  transform: translateY(8px);
  animation: legendReveal 0.4s ease-out var(--legend-delay, 0.35s) forwards;
}
.legend-item-reveal.legend-item-active {
  transform: scale(1.02) translateY(0);
}
@keyframes legendReveal {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.legend-label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 3px;
}

.legend-breakdown {
  background: var(--danger-red);
}

.legend-rain {
  background: #3c91d3;
}

.legend-fuel {
  background: var(--warning-orange);
}

.legend-waiting {
  background: #9ca3af;
}

.legend-value {
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}

.top-employees {
  border-top: 1px solid var(--border-color);
  padding-top: var(--space-md);
}

.top-list {
  list-style: none;
  padding: 0;
  margin: var(--space-sm) 0 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.top-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.85rem;
  transition: background 0.2s ease;
  border-radius: 6px;
  padding: 4px 0;
}
.top-item:hover {
  background: var(--row-hover-bg);
}
.top-item-reveal {
  opacity: 0;
  transform: translateX(-8px);
  animation: topReveal 0.35s ease-out var(--top-delay, 0.6s) forwards;
}
@keyframes topReveal {
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.top-name {
  color: var(--text-secondary);
}

.top-value {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

.show-all-btn {
  margin-top: var(--space-md);
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--chip-bg);
  color: var(--text-primary);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}
.show-all-btn:hover {
  background: var(--row-hover-bg);
  border-color: var(--agri-primary);
}

.operations-panel {
  grid-column: 1 / -1;
}

.empty-state {
  padding: var(--space-md) 0;
}

.text-right {
  text-align: right;
}

@media (max-width: 1100px) {
  .reports-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 768px) {
  .chart-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .reports-header-meta {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>

