import { createRouter, createWebHistory } from 'vue-router'

import DashboardPage from '@/pages/DashboardPage.vue'
import FieldDetailsPage from '@/pages/FieldDetailsPage.vue'
import FieldsPage from '@/pages/FieldsPage.vue'
import LoginPage from '@/pages/LoginPage.vue'
import ReportsPage from '@/pages/ReportsPage.vue'
import TasksPage from '@/pages/TasksPage.vue'
import TaskManagementPage from '@/pages/TaskManagementPage.vue'
import MechanicPage from '@/pages/MechanicPage.vue'
import WeatherPage from '@/pages/WeatherPage.vue'
import EquipmentPage from '@/pages/EquipmentPage.vue'
import ProfilePage from '@/pages/ProfilePage.vue'
import { getAuthUser } from '@/stores/auth'
import { isSupabaseConfigured } from '@/lib/supabase'

export const routes = [
  { path: '/', redirect: '/dashboard' },
  { path: '/login', name: 'login', component: LoginPage, meta: { title: 'Вход', public: true } },
  { path: '/dashboard', name: 'dashboard', component: DashboardPage, meta: { title: 'Обзор' } },
  { path: '/weather', name: 'weather', component: WeatherPage, meta: { title: 'Погода и условия' } },
  { path: '/fields', name: 'fields', component: FieldsPage, meta: { title: 'Поля' } },
  { path: '/fields/:id', name: 'field-details', component: FieldDetailsPage, props: true, meta: { title: 'Поле' } },
  { path: '/equipment', name: 'equipment', component: EquipmentPage, meta: { title: 'Управление техникой' } },
  { path: '/tasks', name: 'tasks', component: TasksPage, meta: { title: 'Календарь' } },
  { path: '/task-management', name: 'task-management', component: TaskManagementPage, meta: { title: 'Задачи' } },
  { path: '/mechanic', name: 'mechanic', component: MechanicPage, meta: { title: 'Экран оператора' } },
  { path: '/reports', name: 'reports', component: ReportsPage, meta: { title: 'Аналитика' } },
  { path: '/profile', name: 'profile', component: ProfilePage, meta: { title: 'Настройки профиля' } },
] as const

export const router = createRouter({
  history: createWebHistory(),
  routes: routes as unknown as any,
})

router.beforeEach((to) => {
  if (!isSupabaseConfigured()) return true
  const user = getAuthUser()
  if (to.meta.public && user) return { name: 'dashboard' }
  if (!to.meta.public && !user) return { name: 'login', query: { redirect: to.fullPath } }
  return true
})

