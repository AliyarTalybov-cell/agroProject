<script setup lang="ts">
import { computed } from 'vue'
import { loadEvents } from '@/lib/downtimeStorage'

const events = computed(() => loadEvents().sort((a, b) => a.startISO.localeCompare(b.startISO)))
</script>

<template>
  <section class="tasks-page">
    <header class="header-area">
      <div>
        <div class="type-label" style="margin-bottom: 8px">Журнал простоев</div>
        <h1 class="page-title">Записи простоев (локальное хранилище)</h1>
      </div>
    </header>

    <div class="card">
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Сотрудник</th>
              <th>Причина</th>
              <th>Начало</th>
              <th>Конец</th>
              <th>Длительность (мин)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!events.length">
              <td colspan="5" class="empty-cell">
                Пока нет записей — отметь простой на экране механизатора.
              </td>
            </tr>
            <tr v-for="event in events" :key="event.id">
              <td>{{ event.employee }}</td>
              <td>{{ event.reason }}</td>
              <td>
                {{
                  new Date(event.startISO).toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                }}
              </td>
              <td>
                {{
                  new Date(event.endISO).toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                }}
              </td>
              <td style="font-variant-numeric: tabular-nums; font-weight: 500">
                {{ event.durationMinutes }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tasks-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
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
}

tbody tr:hover td {
  background: rgba(255, 255, 255, 0.02);
}

.empty-cell {
  text-align: center;
  color: var(--text-secondary);
}
</style>

