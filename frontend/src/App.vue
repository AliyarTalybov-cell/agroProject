<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const isAuthLayout = computed(() => route.name === 'login')
</script>

<template>
  <div v-if="isAuthLayout">
    <RouterView />
  </div>

  <div v-else class="app-layout">
    <aside class="sidebar">
      <div class="logo type-label">A G R O _ C T R L</div>
      <ul class="nav-menu">
        <li><RouterLink class="nav-item" to="/dashboard">Дашборд</RouterLink></li>
        <li><RouterLink class="nav-item" to="/fields">Поля и культуры</RouterLink></li>
        <li><RouterLink class="nav-item" to="/tasks">Журнал работ</RouterLink></li>
        <li><RouterLink class="nav-item" to="/reports">Отчеты</RouterLink></li>
        <li><RouterLink class="nav-item" to="/mechanic">Экран механизатора</RouterLink></li>
        <li>
          <RouterLink class="nav-item" to="/login" style="margin-top: var(--space-lg); color: var(--accent-green)">
            Выйти
          </RouterLink>
        </li>
      </ul>
    </aside>

    <main class="main-content">
      <RouterView />
    </main>
  </div>
</template>

