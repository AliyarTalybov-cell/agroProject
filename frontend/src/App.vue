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
const { theme, setTheme } = useTheme()
/** checked = светлая тема (как в переключателе Uiverse: день / солнце) */
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
        <span class="sidebar-brand-text">Агро-контроль</span>
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

        <div v-if="auth.userRole.value === 'manager'" class="nav-section nav-section-secondary">
          <div class="nav-section-label">СВЯЗЬ</div>
          <ul class="nav-menu">
            <li>
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
          </ul>
        </div>
      </nav>

      <footer class="sidebar-footer">
        <button type="button" class="sidebar-logout-btn" @click="handleLogout">
          <span class="sidebar-status-dot" aria-hidden="true"></span>
          <span>Выйти</span>
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
          <label
            for="app-theme-switch"
            class="app-theme-switch"
            :title="theme === 'light' ? 'Переключить на тёмную тему' : 'Переключить на светлую тему'"
          >
            <input
              id="app-theme-switch"
              v-model="themeIsLight"
              type="checkbox"
              class="app-theme-switch-input"
              role="switch"
              :aria-checked="themeIsLight"
              :aria-label="theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему'"
            />
            <span class="app-theme-slider" aria-hidden="true" />
            <span class="app-theme-decoration" aria-hidden="true" />
          </label>
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
  background: rgba(18, 32, 20, 0.98);
  border-color: rgba(255, 255, 255, 0.12);
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
  background: rgba(18, 32, 20, 0.98);
  border-top-color: rgba(255, 255, 255, 0.12);
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
  border-color: rgba(255, 255, 255, 0.12);
}
.app-modal-btn--danger {
  background: var(--danger-red);
  color: #fff;
}
.app-modal-btn--danger:hover:not(:disabled) {
  filter: brightness(1.05);
}

/* Переключатель темы (адаптация Uiverse / juanpabl0svn) */
.app-theme-switch {
  font-size: 15px;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3.5em;
  height: 2em;
  cursor: pointer;
  flex-shrink: 0;
  margin: 0;
}

.app-theme-switch-input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
  margin: 0;
}

.app-theme-slider {
  --theme-switch-track: #20262c;
  position: absolute;
  cursor: pointer;
  inset: 0;
  background-color: var(--theme-switch-track);
  transition: background-color 0.5s ease;
  border-radius: 30px;
}

.app-theme-slider::before {
  position: absolute;
  content: '';
  height: 1.4em;
  width: 1.4em;
  border-radius: 50%;
  left: 10%;
  bottom: 15%;
  box-shadow:
    inset 8px -4px 0 0 #ececd9,
    -4px 1px 4px 0 #dadada;
  background: var(--theme-switch-track);
  transition:
    transform 0.5s ease,
    box-shadow 0.5s ease;
}

.app-theme-decoration {
  position: absolute;
  height: 2px;
  width: 2px;
  border-radius: 50%;
  right: 20%;
  top: 15%;
  background: #e5f041e6;
  backdrop-filter: blur(10px);
  transition: all 0.5s ease;
  pointer-events: none;
  box-shadow:
    -7px 10px 0 #e5f041e6,
    8px 15px 0 #e5f041e6,
    -17px 1px 0 #e5f041e6,
    -20px 10px 0 #e5f041e6,
    -7px 23px 0 #e5f041e6,
    -15px 25px 0 #e5f041e6;
}

.app-theme-switch-input:checked ~ .app-theme-decoration {
  transform: translateX(-20px);
  width: 10px;
  height: 10px;
  background: white;
  box-shadow:
    -12px 0 0 white,
    -6px 0 0 1.6px white,
    5px 15px 0 1px white,
    1px 17px 0 white,
    10px 17px 0 white;
}

.app-theme-switch-input:checked + .app-theme-slider {
  background-color: #5494de;
}

.app-theme-switch-input:checked + .app-theme-slider::before {
  transform: translateX(100%);
  box-shadow:
    inset 15px -4px 0 15px #efdf2b,
    0 0 10px 0 #efdf2b;
}

.app-theme-switch-input:focus-visible + .app-theme-slider {
  outline: 2px solid color-mix(in srgb, #5494de 85%, white);
  outline-offset: 3px;
}

.app-theme-switch:hover .app-theme-slider {
  filter: brightness(1.06);
}
</style>

