<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTheme } from '@/composables/useTheme'
import { useAuth } from '@/stores/auth'
import { chatTotalUnread, refreshChatTotalUnread } from '@/lib/chatSupabase'
import { startActivityHeartbeat, stopActivityHeartbeat } from '@/lib/activityHeartbeat'

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const isAuthLayout = computed(() => route.name === 'login')
const pageTitle = computed(() => {
  if (route.name === 'dashboard' && route.query.tab === 'about') return 'О сервисе'
  return (route.meta?.title as string) || 'Обзор'
})

const dashboardHomeActive = computed(
  () => route.name === 'dashboard' && route.query.tab !== 'about',
)

function goDashboardHome() {
  closeMobileMenu()
  void router.push({ path: '/dashboard', query: {} })
}
const { theme, setTheme } = useTheme()
/** checked = светлая тема (Uiverse Creatlydev: солнце); не отмечено = луна / тёмная */
const themeIsLight = computed({
  get: () => theme.value === 'light',
  set: (v: boolean) => setTheme(v ? 'light' : 'dark'),
})
const logoutConfirmOpen = ref(false)
const logoutBusy = ref(false)

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

/** Ref из chatSupabase: в шаблоне используем computed для гарантированной размотки */
const chatUnreadDisplay = computed(() => Number(chatTotalUnread.value) || 0)
async function handleLogout() {
  logoutConfirmOpen.value = true
}

async function confirmLogout() {
  if (logoutBusy.value) return
  logoutBusy.value = true
  try {
    await auth.logout()
    logoutConfirmOpen.value = false
    router.push('/login')
  } finally {
    logoutBusy.value = false
  }
}

function closeLogoutConfirm() {
  if (logoutBusy.value) return
  logoutConfirmOpen.value = false
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

let unreadPoll: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  void refreshChatTotalUnread()
  unreadPoll = setInterval(() => void refreshChatTotalUnread(), 45_000)
})
onUnmounted(() => {
  if (unreadPoll) clearInterval(unreadPoll)
})
watch(
  () => route.path,
  () => void refreshChatTotalUnread(),
)

/** Редкий пинг last_activity_at (не чаще ~5 мин), только вне экрана входа */
watch(
  [() => auth.user.value?.id, isAuthLayout],
  ([uid, authLayout]) => {
    stopActivityHeartbeat()
    if (uid && !authLayout) startActivityHeartbeat(uid)
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="isAuthLayout">
    <RouterView />
  </div>

  <div v-else class="app-layout" :class="{ 'mobile-menu-open': mobileMenuOpen }">
    <div class="sidebar-overlay" aria-hidden="true" @click="closeMobileMenu"></div>
    <aside class="sidebar">
      <div class="sidebar-brand">
        <RouterLink
          class="sidebar-brand-link"
          :to="{ path: '/dashboard', query: {} }"
          data-text="АГРОСИСТЕМА"
          aria-label="АГРОСИСТЕМА"
        >
          <span class="sidebar-brand-title-wrap">
            <span class="actual-text"><span>АГРО</span><span class="actual-text-accent">СИСТЕМА</span></span>
            <span aria-hidden="true" class="hover-text"><span>АГРО</span><span>СИСТЕМА</span></span>
          </span>
        </RouterLink>
      </div>
      <nav class="sidebar-nav">
        <div class="nav-section">
          <ul class="nav-menu">
            <li>
              <a
                href="/dashboard"
                class="nav-item"
                :class="{ 'router-link-active': dashboardHomeActive }"
                @click.prevent="goDashboardHome"
              >
                <span class="nav-item-icon" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
                </span>
                Обзор
              </a>
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
                Поля и Культуры
              </RouterLink>
            </li>
            <li>
              <RouterLink class="nav-item" to="/equipment">
                <span class="nav-item-icon nav-item-icon--equipment" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 15a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/>
                    <path d="M7 15l0 .01"/>
                    <path d="M17 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/>
                    <path d="M10.5 17l6.5 0"/>
                    <path d="M20 15.2v-4.2a1 1 0 0 0 -1 -1h-6l-2 -5h-6v6.5"/>
                    <path d="M18 5h-1a1 1 0 0 0 -1 1v4"/>
                  </svg>
                </span>
                Техника
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
                Аналитика
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

        <div class="nav-section nav-section-secondary">
          <div class="nav-section-label">СВЯЗЬ</div>
          <ul class="nav-menu">
            <li v-if="auth.userRole.value === 'manager'">
              <RouterLink class="nav-item" to="/employees">
                <span class="nav-item-icon" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </span>
                Сотрудники
              </RouterLink>
            </li>
            <li>
              <RouterLink class="nav-item" to="/chat">
                <span class="nav-item-icon" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </span>
                Чат
                <span v-if="chatUnreadDisplay > 0" class="nav-item-badge">{{ chatUnreadDisplay > 99 ? '99+' : chatUnreadDisplay }}</span>
              </RouterLink>
            </li>
          </ul>
        </div>
      </nav>

      <footer class="sidebar-footer">
        <button type="button" class="app-logout-btn" aria-label="Выйти из аккаунта" @click="handleLogout">
          <span class="app-logout-sign">
            <svg viewBox="0 0 512 512" aria-hidden="true">
              <path
                d="M377.9 105.9L500.7 228.7c7.2 7.2 11.3 17.1 11.3 27.3s-4.1 20.1-11.3 27.3L377.9 406.1c-6.4 6.4-15 9.9-24 9.9c-18.7 0-33.9-15.2-33.9-33.9l0-62.1-128 0c-17.7 0-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32l128 0 0-62.1c0-18.7 15.2-33.9 33.9-33.9c9 0 17.6 3.6 24 9.9zM160 96L96 96c-17.7 0-32 14.3-32 32l0 256c0 17.7 14.3 32 32 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-64 0c-53 0-96-43-96-96L0 128C0 75 43 32 96 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32z"
              />
            </svg>
          </span>
          <span class="app-logout-text">Выйти</span>
        </button>
      </footer>
    </aside>

    <teleport to="body">
      <div v-if="logoutConfirmOpen" class="app-modal-backdrop" role="dialog" aria-modal="true" aria-label="Подтверждение выхода" @click.self="closeLogoutConfirm">
        <div class="app-modal" @click.stop>
          <div class="app-modal-header">
            <div class="app-modal-title">Выйти из аккаунта?</div>
            <button type="button" class="app-modal-close" aria-label="Закрыть" :disabled="logoutBusy" @click="closeLogoutConfirm">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="app-modal-body">
            <div class="app-modal-text">Вы действительно хотите выйти? Несохранённые изменения могут быть потеряны.</div>
          </div>
          <div class="app-modal-footer">
            <button type="button" class="app-modal-btn app-modal-btn--ghost" :disabled="logoutBusy" @click="closeLogoutConfirm">Отмена</button>
            <button type="button" class="app-modal-btn app-modal-btn--danger" :disabled="logoutBusy" @click="confirmLogout">
              {{ logoutBusy ? 'Выход…' : 'Выйти' }}
            </button>
          </div>
        </div>
      </div>
    </teleport>

    <main class="main-content">
      <header class="app-topbar">
        <button type="button" class="topbar-menu-btn" aria-label="Меню" @click="toggleMobileMenu">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
        </button>
        <h1 class="app-topbar-title">{{ pageTitle }}</h1>
        <div class="app-topbar-right">
          <div class="app-theme-cd-wrap">
            <label
              for="app-theme-cd-switch"
              class="app-theme-cd-toggle"
              :title="theme === 'dark' ? 'Переключить на светлую тему' : 'Переключить на тёмную тему'"
            >
              <input
                id="app-theme-cd-switch"
                v-model="themeIsLight"
                type="checkbox"
                class="app-theme-cd-input"
                role="switch"
                :aria-checked="themeIsLight"
                :aria-label="theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'"
              />
              <div class="app-theme-cd-icon app-theme-cd-icon--moon" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
                  <path
                    fill-rule="evenodd"
                    d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z"
                    clip-rule="evenodd"
                  />
                </svg>
              </div>
              <div class="app-theme-cd-icon app-theme-cd-icon--sun" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
                  <path
                    d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z"
                  />
                </svg>
              </div>
            </label>
          </div>
          <div class="topbar-user">
            <RouterLink to="/profile" class="topbar-user-link" aria-label="Настройки профиля">
              <div class="topbar-user-avatar">{{ userInitials }}</div>
              <div class="topbar-user-meta">
                <span class="topbar-user-name">{{ userDisplay }}</span>
              </div>
            </RouterLink>
          </div>
        </div>
      </header>
      <div class="main-content-inner main-content-inner--animated">
        <RouterView v-slot="{ Component }">
          <Transition name="page" mode="out-in">
            <component v-if="Component" :is="Component" :key="$route.fullPath" />
          </Transition>
        </RouterView>
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: var(--modal-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.app-modal {
  width: 100%;
  max-width: 520px;
  border-radius: 20px;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.16);
  overflow: hidden;
}

[data-theme='dark'] .app-modal {
  background: var(--bg-panel);
  border-color: var(--border-color);
}

.app-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border-color);
}

.app-modal-title {
  font-weight: 800;
  color: var(--text-primary);
  font-size: 1.05rem;
}

.app-modal-close {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.app-modal-close:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
[data-theme='dark'] .app-modal-close {
  background: rgba(255, 255, 255, 0.08);
}

.app-modal-body {
  padding: 18px 20px;
}

.app-modal-text {
  color: var(--text-secondary);
  font-size: 0.9375rem;
  line-height: 1.4;
}

.app-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-color);
  background: rgba(0, 0, 0, 0.02);
}
[data-theme='dark'] .app-modal-footer {
  background: var(--bg-panel);
  border-top-color: var(--border-color);
}

.app-modal-btn {
  border-radius: 12px;
  padding: 11px 18px;
  font-size: 0.9375rem;
  font-weight: 650;
  border: 1px solid transparent;
  cursor: pointer;
}
.app-modal-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.app-modal-btn--ghost {
  background: #fff;
  border-color: #e2e8f0;
  color: var(--text-primary);
}
[data-theme='dark'] .app-modal-btn--ghost {
  background: var(--bg-panel);
  border-color: var(--border-color);
}
.app-modal-btn--danger {
  background: var(--danger-red);
  color: #fff;
}
.app-modal-btn--danger:hover:not(:disabled) {
  filter: brightness(1.05);
}

/* Переключатель темы (Uiverse / Creatlydev) */
.app-theme-cd-wrap {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.app-theme-cd-toggle {
  /* ~−24% от 56px (−30% затем +8%); фон как у шапки */
  background-color: transparent;
  width: calc(56px * 0.7 * 1.08);
  height: calc(56px * 0.7 * 1.08);
  border-radius: 50%;
  display: grid;
  place-items: center;
  cursor: pointer;
  box-shadow: none;
  line-height: 1;
  margin: 0;
  color: var(--text-secondary);
  border: 1px solid transparent;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    border-color 0.2s ease;
}

.app-theme-cd-toggle:hover {
  background: var(--sidebar-hover-bg);
  color: var(--text-primary);
  border-color: color-mix(in srgb, var(--border-color) 50%, transparent);
}

[data-theme='dark'] .app-theme-cd-toggle {
  background-color: transparent;
  color: rgba(255, 255, 255, 0.75);
  box-shadow: none;
}

[data-theme='dark'] .app-theme-cd-toggle:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.1);
}

.app-theme-cd-input {
  display: none;
}

.app-theme-cd-toggle:has(.app-theme-cd-input:focus-visible) {
  outline: 2px solid color-mix(in srgb, #2196f3 55%, white);
  outline-offset: calc(3px * 0.7 * 1.08);
}

.app-theme-cd-icon {
  grid-column: 1 / 1;
  grid-row: 1 / 1;
  transition: transform 500ms;
  line-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.app-theme-cd-icon svg {
  width: calc(32px * 0.7 * 1.08);
  height: calc(32px * 0.7 * 1.08);
}

.app-theme-cd-icon--moon {
  transition-delay: 200ms;
}

.app-theme-cd-icon--sun {
  transform: scale(0);
  color: #ca8a04;
}

.app-theme-cd-input:checked + .app-theme-cd-icon--moon {
  transform: rotate(360deg) scale(0);
}

.app-theme-cd-input:checked ~ .app-theme-cd-icon--sun {
  transition-delay: 200ms;
  transform: scale(1) rotate(360deg);
}

</style>

