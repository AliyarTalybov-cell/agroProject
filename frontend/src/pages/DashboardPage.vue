<script setup lang="ts">
import { computed, ref } from 'vue'

type DateRangeKey = 'today' | 'week' | 'month'
type DowntimeCategory = 'breakdown' | 'rain' | 'fuel' | 'waiting'
type DowntimeStatus = 'active' | 'resolved'

type DowntimeEvent = {
  id: number
  employee: string
  reason: string
  category: DowntimeCategory
  start: string
  end: string
  durationMinutes: number
  status: DowntimeStatus
  range: DateRangeKey
}

const events = ref<DowntimeEvent[]>([
  {
    id: 1,
    employee: 'Иванов И.И.',
    reason: 'Поломка гидравлики',
    category: 'breakdown',
    start: '08:15',
    end: '11:00',
    durationMinutes: 165,
    status: 'resolved',
    range: 'today',
  },
  {
    id: 2,
    employee: 'Петров П.П.',
    reason: 'Сильный дождь',
    category: 'rain',
    start: '10:30',
    end: '12:00',
    durationMinutes: 90,
    status: 'resolved',
    range: 'today',
  },
  {
    id: 3,
    employee: 'Сидоров С.С.',
    reason: 'Ожидание топлива',
    category: 'fuel',
    start: '14:05',
    end: '15:10',
    durationMinutes: 65,
    status: 'active',
    range: 'today',
  },
  {
    id: 4,
    employee: 'Кузнецов В.В.',
    reason: 'Поломка жатки',
    category: 'breakdown',
    start: '09:10',
    end: '10:20',
    durationMinutes: 70,
    status: 'resolved',
    range: 'week',
  },
  {
    id: 5,
    employee: 'Иванов И.И.',
    reason: 'Ожидание задания',
    category: 'waiting',
    start: '16:00',
    end: '16:45',
    durationMinutes: 45,
    status: 'resolved',
    range: 'week',
  },
  {
    id: 6,
    employee: 'Петров П.П.',
    reason: 'Нет топлива на РТК',
    category: 'fuel',
    start: '06:30',
    end: '07:15',
    durationMinutes: 45,
    status: 'resolved',
    range: 'month',
  },
  {
    id: 7,
    employee: 'Смирнов А.А.',
    reason: 'Переувлажнение почвы',
    category: 'rain',
    start: '18:00',
    end: '19:30',
    durationMinutes: 90,
    status: 'resolved',
    range: 'month',
  },
])

const activeRange = ref<DateRangeKey>('today')
const selectedEmployee = ref<string>('all')
const selectedCategory = ref<DowntimeCategory | 'all'>('all')

const employees = computed(() => {
  const unique = new Set(events.value.map((e) => e.employee))
  return Array.from(unique)
})

const categoriesMeta: Record<DowntimeCategory, { label: string; color: string }> = {
  breakdown: { label: 'Поломка', color: '#d33c3c' },
  rain: { label: 'Дождь', color: '#3c91d3' },
  fuel: { label: 'Нет топлива', color: '#d3823c' },
  waiting: { label: 'Ожидание задания', color: '#9ca3af' },
}

const filteredEvents = computed(() =>
  events.value.filter((e) => {
    if (e.range !== activeRange.value) return false
    if (selectedEmployee.value !== 'all' && e.employee !== selectedEmployee.value) return false
    if (selectedCategory.value !== 'all' && e.category !== selectedCategory.value) return false
    return true
  }),
)

const totalDowntimes = computed(() => filteredEvents.value.length)

const totalMinutes = computed(() =>
  filteredEvents.value.reduce((sum, e) => sum + e.durationMinutes, 0),
)

const avgDurationMinutes = computed(() =>
  filteredEvents.value.length ? Math.round(totalMinutes.value / filteredEvents.value.length) : 0,
)

const totalHoursLabel = computed(() => `${(totalMinutes.value / 60).toFixed(1)} ч`)

const topReasonLabel = computed(() => {
  if (!filteredEvents.value.length) return '—'
  const counts = new Map<string, number>()
  filteredEvents.value.forEach((e) => {
    counts.set(e.reason, (counts.get(e.reason) ?? 0) + e.durationMinutes)
  })
  let top: { reason: string; minutes: number } | null = null
  counts.forEach((minutes, reason) => {
    if (!top || minutes > top.minutes) {
      top = { reason, minutes }
    }
  })
  return top?.reason ?? '—'
})

const breakdownPercents = computed(() => {
  const minutesByCategory: Record<DowntimeCategory, number> = {
    breakdown: 0,
    rain: 0,
    fuel: 0,
    waiting: 0,
  }
  filteredEvents.value.forEach((e) => {
    minutesByCategory[e.category] += e.durationMinutes
  })
  const total = Object.values(minutesByCategory).reduce((sum, v) => sum + v, 0)
  if (!total) {
    return {
      breakdown: 0,
      rain: 0,
      fuel: 0,
      waiting: 0,
    }
  }
  return {
    breakdown: (minutesByCategory.breakdown / total) * 100,
    rain: (minutesByCategory.rain / total) * 100,
    fuel: (minutesByCategory.fuel / total) * 100,
    waiting: (minutesByCategory.waiting / total) * 100,
  }
})

const donutStyle = computed(() => {
  const b = breakdownPercents.value.breakdown
  const r = breakdownPercents.value.rain
  const f = breakdownPercents.value.fuel
  const w = breakdownPercents.value.waiting
  const s1 = b
  const s2 = b + r
  const s3 = b + r + f

  return {
    background: `conic-gradient(
      ${categoriesMeta.breakdown.color} 0 ${s1}%,
      ${categoriesMeta.rain.color} ${s1}% ${s2}%,
      ${categoriesMeta.fuel.color} ${s2}% ${s3}%,
      ${categoriesMeta.waiting.color} ${s3}% 100%
    )`,
  }
})
</script>

<template>
  <section class="dashboard-page">
    <header class="header-area">
      <div>
        <div class="type-label" style="margin-bottom: 8px">Аналитика простоев</div>
        <h1 class="page-title">Дашборд простоев техники</h1>
      </div>
    </header>

    <div class="metrics-row">
      <article class="metric-card">
        <div class="metric-label">Всего простоев</div>
        <div class="metric-value">{{ totalDowntimes }}</div>
        <div class="metric-caption">за выбранный период</div>
      </article>
      <article class="metric-card">
        <div class="metric-label">Средняя длительность</div>
        <div class="metric-value">{{ avgDurationMinutes }}&nbsp;мин</div>
        <div class="metric-caption">по всем записям</div>
      </article>
      <article class="metric-card">
        <div class="metric-label">Самая частая причина</div>
        <div class="metric-value metric-value-sm">{{ topReasonLabel }}</div>
        <div class="metric-caption">по сумме времени простоя</div>
      </article>
      <article class="metric-card">
        <div class="metric-label">Потеряно времени всего</div>
        <div class="metric-value">{{ totalHoursLabel }}</div>
        <div class="metric-caption">в пересчёте на часы</div>
      </article>
    </div>

    <div class="dashboard-grid">
      <aside class="panel panel-chart">
        <div class="panel-header">
          <div class="type-label">Распределение причин</div>
          <div class="type-value" style="font-size: 0.9rem">Время простоя по типам</div>
        </div>
        <div class="chart-wrapper">
          <div class="donut-chart" :style="donutStyle">
            <div class="donut-inner">
              <div class="donut-total">{{ totalHoursLabel }}</div>
              <div class="donut-label">Всего простоя</div>
            </div>
          </div>
          <ul class="legend-list">
            <li
              v-for="(meta, key) in categoriesMeta"
              :key="key"
              class="legend-item"
            >
              <div class="legend-label">
                <span class="legend-dot" :style="{ backgroundColor: meta.color }" />
                {{ meta.label }}
              </div>
              <div class="legend-value">
                {{ Math.round(breakdownPercents[key as DowntimeCategory]) }}%
              </div>
            </li>
          </ul>
        </div>
      </aside>

      <section class="panel panel-table">
        <header class="table-filters">
          <div class="filters-left">
            <div class="type-label" style="margin-bottom: 8px">Фильтры</div>
            <div class="date-toggle">
              <button
                class="date-chip"
                :class="{ 'date-chip-active': activeRange === 'today' }"
                type="button"
                @click="activeRange = 'today'"
              >
                Сегодня
              </button>
              <button
                class="date-chip"
                :class="{ 'date-chip-active': activeRange === 'week' }"
                type="button"
                @click="activeRange = 'week'"
              >
                Неделя
              </button>
              <button
                class="date-chip"
                :class="{ 'date-chip-active': activeRange === 'month' }"
                type="button"
                @click="activeRange = 'month'"
              >
                Месяц
              </button>
            </div>
          </div>
          <div class="filters-right">
            <label class="field-filter">
              <span class="type-label">Сотрудник</span>
              <select v-model="selectedEmployee">
                <option value="all">Все</option>
                <option v-for="name in employees" :key="name" :value="name">
                  {{ name }}
                </option>
              </select>
            </label>
            <label class="field-filter">
              <span class="type-label">Причина</span>
              <select v-model="selectedCategory">
                <option value="all">Все</option>
                <option
                  v-for="(meta, key) in categoriesMeta"
                  :key="key"
                  :value="key"
                >
                  {{ meta.label }}
                </option>
              </select>
            </label>
          </div>
        </header>

        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Сотрудник</th>
                <th>Причина</th>
                <th>Начало</th>
                <th>Конец</th>
                <th>Длительность</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!filteredEvents.length">
                <td colspan="6" class="empty-cell">
                  Нет записей для выбранных фильтров
                </td>
              </tr>
              <tr v-for="event in filteredEvents" :key="event.id">
                <td class="col-employee">
                  <div class="employee-name">{{ event.employee }}</div>
                </td>
                <td>
                  <span class="reason-pill">
                    <span
                      class="reason-dot"
                      :style="{ backgroundColor: categoriesMeta[event.category].color }"
                    />
                    {{ event.reason }}
                  </span>
                </td>
                <td class="col-time">
                  {{ event.start }}
                </td>
                <td class="col-time">
                  {{ event.end }}
                </td>
                <td class="col-duration">
                  {{ event.durationMinutes }}&nbsp;мин
                </td>
                <td>
                  <span
                    class="status-pill"
                    :class="event.status === 'active' ? 'status-active' : 'status-resolved'"
                  >
                    {{ event.status === 'active' ? 'Активен' : 'Завершён' }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.dashboard-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

.metrics-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-md);
}

.metric-card {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.metric-label {
  font-size: 0.75rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.metric-value {
  font-size: 1.6rem;
  font-weight: 600;
}

.metric-value-sm {
  font-size: 1.1rem;
}

.metric-caption {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.dashboard-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1.7fr);
  gap: var(--space-xl);
  align-items: flex-start;
}

.panel {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  padding: var(--space-md);
  backdrop-filter: blur(10px);
}

.panel-chart {
  max-width: 360px;
}

.panel-header {
  margin-bottom: var(--space-md);
}

.chart-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-lg);
}

.donut-chart {
  width: 200px;
  height: 200px;
  border-radius: 50%;
  position: relative;
  box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.2);
}

.donut-inner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: var(--bg-panel);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.donut-total {
  font-size: 1.4rem;
  font-weight: 600;
}

.donut-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.15em;
  margin-top: 4px;
}

.legend-list {
  list-style: none;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
  margin: 0;
}

.legend-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
}

.legend-label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.legend-value {
  font-weight: 600;
}

.panel-table {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.table-filters {
  display: flex;
  justify-content: space-between;
  gap: var(--space-lg);
  align-items: flex-end;
}

.filters-left {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.date-toggle {
  display: flex;
  gap: 8px;
}

.date-chip {
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  cursor: pointer;
}

.date-chip-active {
  background: var(--accent-green);
  border-color: var(--accent-green);
  color: #000;
}

.filters-right {
  display: flex;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.field-filter {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.8rem;
}

.field-filter select {
  min-width: 180px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 999px;
  border: 1px solid var(--border-color);
  padding: 6px 10px;
  color: var(--text-primary);
}

.table-wrapper {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

th,
td {
  padding: 10px 12px;
  font-size: 0.85rem;
}

th {
  border-bottom: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-weight: 500;
}

tbody tr:hover td {
  background: rgba(255, 255, 255, 0.02);
}

.col-employee {
  font-weight: 500;
}

.col-time {
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}

.col-duration {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

.reason-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-color);
  font-size: 0.8rem;
}

.reason-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-pill {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.status-active {
  border: 1px solid var(--warning-orange);
  color: var(--warning-orange);
}

.status-resolved {
  border: 1px solid var(--accent-green);
  color: var(--accent-green);
}

.empty-cell {
  text-align: center;
  color: var(--text-secondary);
}

.employee-name {
  white-space: nowrap;
}

@media (max-width: 1080px) {
  .metrics-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dashboard-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .panel-chart {
    order: 2;
    max-width: none;
  }
}

@media (max-width: 768px) {
  .metrics-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .table-filters {
    flex-direction: column;
    align-items: flex-start;
  }

  .filters-right {
    width: 100%;
  }

  .field-filter select {
    width: 100%;
  }
}
</style>

