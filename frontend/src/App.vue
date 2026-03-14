<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTheme } from '@/composables/useTheme'
import { useAuth } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const isAuthLayout = computed(() => route.name === 'login')
const pageTitle = computed(() => (route.meta?.title as string) || 'Обзор')
const { theme, toggle } = useTheme()

const userDisplay = computed(() => {
  if (auth.user.value?.email) return auth.user.value.email
  return 'Пользователь'
})
const userInitials = computed(() => {
  const email = auth.user.value?.email ?? ''
  const part = email.split('@')[0]
  if (part.length >= 2) return part.slice(0, 2).toUpperCase()
  return part.slice(0, 1).toUpperCase() || '?'
})
async function handleLogout() {
  await auth.logout()
  router.push('/login')
}

const mobileMenuOpen = ref(false)
function toggleMobileMenu() {
  mobileMenuOpen.value = !mobileMenuOpen.value
}
function closeMobileMenu() {
  mobileMenuOpen.value = false
}
watch(route, closeMobileMenu)
watch(mobileMenuOpen, (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
})
</script>

<template>
  <div v-if="isAuthLayout">
    <RouterView />
  </div>

  <div v-else class="app-layout" :class="{ 'mobile-menu-open': mobileMenuOpen }">
    <div class="sidebar-overlay" aria-hidden="true" @click="closeMobileMenu"></div>
    <aside class="sidebar">
      <div class="sidebar-brand">
        <span class="sidebar-brand-icon" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
        </span>
        <span class="sidebar-brand-text">AgriDash</span>
      </div>
      <nav class="sidebar-nav">
        <div class="nav-section">
          <ul class="nav-menu">
            <li>
              <RouterLink class="nav-item" to="/dashboard">
                <span class="nav-item-icon" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
                </span>
                Обзор
              </RouterLink>
            </li>
            <li>
              <RouterLink class="nav-item" to="/weather">
                <span class="nav-item-icon" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>
                </span>
                Погода
              </RouterLink>
            </li>
            <li>
              <RouterLink class="nav-item" to="/fields">
                <span class="nav-item-icon" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                </span>
                Поля
              </RouterLink>
            </li>
            <li>
              <RouterLink class="nav-item" to="/task-management">
                <span class="nav-item-icon" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                </span>
                Задачи
              </RouterLink>
            </li>
            <li>
              <RouterLink class="nav-item" to="/tasks">
                <span class="nav-item-icon" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                </span>
                Календарь
              </RouterLink>
            </li>
            <li>
              <RouterLink class="nav-item" to="/reports">
                <span class="nav-item-icon" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>
                </span>
                Отчеты
              </RouterLink>
            </li>
          </ul>
        </div>

        <div class="nav-section nav-section-secondary">
          <div class="nav-section-label">ОПЕРАЦИИ</div>
          <ul class="nav-menu">
            <li>
              <RouterLink class="nav-item" to="/mechanic">
                <span class="nav-item-icon" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>
                </span>
                Экран оператора
              </RouterLink>
            </li>
          </ul>
        </div>
      </nav>

      <footer class="sidebar-footer">
        <div class="sidebar-status">
          <span class="sidebar-status-dot" aria-hidden="true"></span>
          <span>Система онлайн</span>
        </div>
      </footer>
    </aside>

    <main class="main-content">
      <header class="app-topbar">
        <button type="button" class="topbar-menu-btn" aria-label="Меню" @click="toggleMobileMenu">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
        </button>
        <h1 class="app-topbar-title">{{ pageTitle }}</h1>
        <div class="app-topbar-right">
          <button type="button" class="topbar-icon-btn" aria-label="Переключить тему" @click="toggle">
            <svg v-if="theme === 'light'" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 3v1"/><path d="M12 20v1"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M3 12h1"/><path d="M20 12h1"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
          </button>
          <div class="topbar-user">
            <div class="topbar-user-meta">
              <span class="topbar-user-name">{{ userDisplay }}</span>
              <button type="button" class="topbar-logout" @click="handleLogout">Выйти</button>
            </div>
            <div class="topbar-user-avatar">{{ userInitials }}</div>
          </div>
        </div>
      </header>
      <div class="main-content-inner main-content-inner--animated">
        <RouterView v-slot="{ Component }">
          <Transition name="page" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </div>
    </main>
  </div>
</template>

