<script setup lang="ts">
import { computed, ref } from 'vue'
import type { StoredDowntime, DowntimeCategory } from '@/lib/downtimeStorage'
import { loadEvents } from '@/lib/downtimeStorage'

const events = ref<StoredDowntime[]>(loadEvents())

const hasEvents = computed(() => events.value.length > 0)

const sortedEvents = computed(() =>
  [...events.value].sort(
    (a, b) => new Date(a.startISO).getTime() - new Date(b.startISO).getTime(),
  ),
)

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
    <header class="header-area reports-header">
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
      <section class="panel panel-table">
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

        <div v-else class="table-wrapper">
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
              <tr v-for="event in sortedEvents" :key="event.id">
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
      </section>

      <section class="panel panel-chart">
        <div class="panel-header">
          <div>
            <div class="type-label">Структура простоев</div>
            <div class="panel-title">По причинам и сотрудникам</div>
          </div>
        </div>

        <div v-if="hasEvents" class="chart-layout">
          <div class="donut-wrapper">
            <div class="donut-chart" :style="donutStyle">
              <div class="donut-inner">
                <div class="donut-total">
                  {{ totalHoursLabel }}
                </div>
                <div class="donut-label">Всего простоя</div>
              </div>
            </div>
          </div>

          <div class="chart-side">
            <ul class="legend">
              <li
                v-for="(meta, key) in categoriesMeta"
                :key="key"
                class="legend-item"
              >
                <div class="legend-label">
                  <span class="legend-color" :class="meta.colorClass" />
                  <span>{{ meta.label }}</span>
                </div>
                <span class="legend-value">
                  {{
                    Math.round(
                      percentsByCategory[key as DowntimeCategory] ?? 0,
                    )
                  }}% ·
                  {{
                    formatDuration(
                      minutesByCategory[key as DowntimeCategory] ?? 0,
                    )
                  }}
                </span>
              </li>
            </ul>

            <div class="top-employees">
              <div class="type-label">Топ по времени простоя</div>
              <ul class="top-list">
                <li
                  v-for="[name, minutes] in topEmployees"
                  :key="name"
                  class="top-item"
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
}

.top-name {
  color: var(--text-secondary);
}

.top-value {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
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

