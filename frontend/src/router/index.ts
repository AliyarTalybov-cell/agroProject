import { createRouter, createWebHistory } from 'vue-router'

import DashboardPage from '@/pages/DashboardPage.vue'
import FieldDetailsPage from '@/pages/FieldDetailsPage.vue'
import FieldsPage from '@/pages/FieldsPage.vue'
import LoginPage from '@/pages/LoginPage.vue'
import ReportsPage from '@/pages/ReportsPage.vue'
import TasksPage from '@/pages/TasksPage.vue'
import MechanicPage from '@/pages/MechanicPage.vue'

export const routes = [
  { path: '/', redirect: '/dashboard' },
  { path: '/login', name: 'login', component: LoginPage },
  { path: '/dashboard', name: 'dashboard', component: DashboardPage },
  { path: '/fields', name: 'fields', component: FieldsPage },
  { path: '/fields/:id', name: 'field-details', component: FieldDetailsPage, props: true },
  { path: '/tasks', name: 'tasks', component: TasksPage },
  { path: '/mechanic', name: 'mechanic', component: MechanicPage },
  { path: '/reports', name: 'reports', component: ReportsPage },
] as const

export const router = createRouter({
  history: createWebHistory(),
  routes: routes as unknown as any,
})

