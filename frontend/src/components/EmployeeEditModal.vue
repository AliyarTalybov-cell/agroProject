<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { EmployeeRole, EmployeeRow, PositionRow } from '@/lib/employeesSupabase'
import { deleteEmployee, updateEmployee } from '@/lib/employeesSupabase'

const props = defineProps<{
  open: boolean
  employee: EmployeeRow | null
  positions: PositionRow[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'updated'): void
}>()

const form = ref({
  fullName: '',
  email: '',
  phone: '',
  position: '',
  role: 'worker' as EmployeeRole,
  additionalInfo: '',
  active: true,
})

const busy = ref(false)
const message = ref<{ type: 'success' | 'error'; text: string } | null>(null)
const confirmDelete = ref(false)

const createdAtLabel = computed(() => {
  const raw = props.employee?.created_at
  if (!raw) return '—'
  return new Date(raw).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
})

function initials(name: string | null, email: string): string {
  const base = name?.trim() ? name.trim() : email.split('@')[0]
  const parts = base.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  if (parts[0]?.length >= 2) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0]?.[0] || '?').toUpperCase()
}

const avatar = computed(() => {
  const e = props.employee
  if (!e) return '—'
  return initials(e.display_name, e.email)
})

function close() {
  if (busy.value) return
  emit('close')
}

async function save() {
  if (!props.employee) return
  message.value = null
  busy.value = true
  try {
    await updateEmployee({
      id: props.employee.id,
      fullName: form.value.fullName.trim(),
      email: form.value.email.trim().toLowerCase(),
      phone: form.value.phone.trim() || null,
      position: form.value.position || null,
      additionalInfo: form.value.additionalInfo.trim() || null,
      role: form.value.role,
      active: form.value.active,
    })
    message.value = { type: 'success', text: 'Изменения сохранены.' }
    emit('updated')
  } catch (e) {
    message.value = { type: 'error', text: e instanceof Error ? e.message : 'Не удалось сохранить изменения.' }
  } finally {
    busy.value = false
  }
}

async function doDelete() {
  if (!props.employee) return
  busy.value = true
  message.value = null
  try {
    await deleteEmployee(props.employee.id)
    emit('updated')
    emit('close')
  } catch (e) {
    message.value = { type: 'error', text: e instanceof Error ? e.message : 'Не удалось удалить сотрудника.' }
  } finally {
    busy.value = false
    confirmDelete.value = false
  }
}

watch(
  () => props.employee?.id,
  () => {
    const e = props.employee
    if (!e) return
    form.value.fullName = e.display_name || ''
    form.value.email = e.email || ''
    form.value.phone = e.phone || ''
    form.value.position = e.position || ''
    form.value.role = (e.role === 'manager' ? 'manager' : 'worker') as EmployeeRole
    form.value.additionalInfo = e.additional_info || ''
    form.value.active = e.active !== false
    message.value = null
    confirmDelete.value = false
  },
  { immediate: true },
)
</script>

<template>
  <teleport to="body">
    <div v-if="open && employee" class="eem-backdrop" role="dialog" aria-modal="true" aria-label="Редактирование сотрудника" @click.self="close">
      <div class="eem-modal">
        <button type="button" class="eem-close" aria-label="Закрыть" @click="close">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>
        </button>

        <div class="eem-body">
          <div v-if="message" class="eem-msg" :class="message.type === 'success' ? 'eem-msg--success' : 'eem-msg--error'">
            {{ message.text }}
          </div>

          <div class="eem-layout">
            <aside class="eem-aside">
              <div class="eem-avatar">{{ avatar }}</div>
              <div class="eem-status-card">
                <div class="eem-status-row">
                  <div>
                    <div class="eem-status-label">Статус аккаунта</div>
                    <div class="eem-status-value">
                      <span class="eem-dot" :class="{ 'eem-dot--off': !form.active }" aria-hidden="true"></span>
                      {{ form.active ? 'Активен' : 'Неактивен' }}
                    </div>
                  </div>
                  <label class="eem-switch">
                    <input v-model="form.active" type="checkbox" class="eem-switch-input" />
                    <span class="eem-switch-bg"><span class="eem-switch-dot"></span></span>
                  </label>
                </div>
              </div>
            </aside>

            <section class="eem-form">
              <div class="eem-grid">
                <div class="eem-field eem-field--full">
                  <label class="eem-label" for="eem-name">ФИО сотрудника</label>
                  <input id="eem-name" v-model="form.fullName" class="eem-input" type="text" placeholder="Фамилия Имя Отчество" />
                </div>

                <div class="eem-field">
                  <label class="eem-label" for="eem-email">Email адрес</label>
                  <input id="eem-email" v-model="form.email" class="eem-input" type="email" placeholder="example@agro.ru" />
                </div>

                <div class="eem-field">
                  <label class="eem-label" for="eem-phone">Номер телефона</label>
                  <input id="eem-phone" v-model="form.phone" class="eem-input" type="tel" placeholder="+7 (___) ___-__-__" />
                </div>

                <div class="eem-field">
                  <label class="eem-label" for="eem-pos">Должность</label>
                  <select id="eem-pos" v-model="form.position" class="eem-input eem-select">
                    <option value="" disabled>Выберите должность</option>
                    <option v-for="p in positions" :key="p.id" :value="p.name">{{ p.name }}</option>
                  </select>
                </div>

                <div class="eem-field">
                  <label class="eem-label" for="eem-role">Роль в системе</label>
                  <select id="eem-role" v-model="form.role" class="eem-input eem-select">
                    <option value="worker">Сотрудник</option>
                    <option value="manager">Руководитель</option>
                  </select>
                </div>

                <div class="eem-field eem-field--full">
                  <label class="eem-label" for="eem-notes">Заметки (внутренние)</label>
                  <textarea id="eem-notes" v-model="form.additionalInfo" class="eem-input eem-textarea" rows="3" placeholder="Дополнительная информация о квалификации или доступах…"></textarea>
                </div>
              </div>
            </section>
          </div>
        </div>

        <footer class="eem-footer">
          <button type="button" class="eem-del" :disabled="busy" @click="confirmDelete = true">
            <svg class="eem-del-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
            Удалить сотрудника
          </button>
          <div class="eem-actions">
            <button type="button" class="eem-btn eem-btn--ghost" :disabled="busy" @click="close">Закрыть</button>
            <button type="button" class="eem-btn eem-btn--primary" :disabled="busy" @click="save">
              {{ busy ? 'Сохранение…' : 'Сохранить изменения' }}
            </button>
          </div>
        </footer>

        <div v-if="confirmDelete" class="eem-confirm" @click.self="confirmDelete = false">
          <div class="eem-confirm-modal">
            <div class="eem-confirm-title">Удалить сотрудника?</div>
            <div class="eem-confirm-text">Действие необратимо: будет удалён пользователь и профиль.</div>
            <div class="eem-confirm-actions">
              <button type="button" class="eem-btn eem-btn--ghost" :disabled="busy" @click="confirmDelete = false">Отмена</button>
              <button type="button" class="eem-btn eem-btn--danger" :disabled="busy" @click="doDelete">
                {{ busy ? 'Удаление…' : 'Удалить' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.eem-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1400;
  background: var(--modal-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  overflow: auto;
}
.eem-modal {
  position: relative;
  width: 100%;
  max-width: 900px;
  max-height: calc(100vh - 40px);
  max-height: calc(100dvh - 40px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 20px;
  border: 1px solid var(--border-color);
  background: #fff;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12);
}
[data-theme='dark'] .eem-modal {
  background: rgba(18, 32, 20, 0.98);
  border-color: rgba(255, 255, 255, 0.12);
}
.eem-close {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 2;
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
.eem-close:hover {
  background: rgba(0, 0, 0, 0.08);
  color: var(--text-primary);
}
[data-theme='dark'] .eem-close {
  background: rgba(255, 255, 255, 0.08);
}
.eem-body {
  padding: 28px 24px 20px;
  overflow: auto;
}
.eem-msg {
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid transparent;
  margin-bottom: 16px;
  font-size: 0.9375rem;
}
.eem-msg--success {
  background: rgba(45, 90, 61, 0.12);
  border-color: rgba(45, 90, 61, 0.25);
  color: #166534;
}
.eem-msg--error {
  background: rgba(185, 28, 28, 0.1);
  border-color: rgba(185, 28, 28, 0.22);
  color: var(--danger-red);
}
[data-theme='dark'] .eem-msg--success {
  background: rgba(104, 173, 51, 0.2);
  border-color: rgba(104, 173, 51, 0.35);
  color: #86efac;
}
[data-theme='dark'] .eem-msg--error {
  background: rgba(211, 60, 60, 0.2);
  border-color: rgba(211, 60, 60, 0.35);
  color: #fca5a5;
}
.eem-layout {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 28px;
  align-items: start;
}
@media (max-width: 760px) {
  .eem-layout {
    grid-template-columns: 1fr;
  }
}
.eem-aside {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.eem-avatar {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: var(--accent-green);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.25rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  flex-shrink: 0;
}
[data-theme='dark'] .eem-avatar {
  background: var(--accent-green);
}
.eem-status-card {
  width: 100%;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 14px 12px;
  background: #f8faf9;
}
[data-theme='dark'] .eem-status-card {
  background: rgba(18, 32, 20, 0.98);
  border-color: rgba(255, 255, 255, 0.12);
}
.eem-status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.eem-status-label {
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--text-primary);
}
.eem-status-value {
  margin-top: 6px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--accent-green);
}
.eem-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-green);
}
.eem-dot--off {
  background: #9ca3af;
}
.eem-switch {
  position: relative;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
}
.eem-switch-input {
  position: absolute;
  opacity: 0;
}
.eem-switch-bg {
  display: block;
  width: 44px;
  height: 24px;
  border-radius: 999px;
  background: #e5e7eb;
  border: 1px solid var(--border-color);
  position: relative;
  transition: background 0.2s ease;
}
.eem-switch-dot {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s ease;
}
.eem-switch-input:checked + .eem-switch-bg {
  background: var(--accent-green);
  border-color: var(--accent-green);
}
.eem-switch-input:checked + .eem-switch-bg .eem-switch-dot {
  transform: translateX(20px);
}
.eem-form {
  min-width: 0;
}
.eem-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.eem-field--full {
  grid-column: 1 / -1;
}
@media (max-width: 520px) {
  .eem-grid {
    grid-template-columns: 1fr;
  }
}
.eem-label {
  display: block;
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 8px;
}
.eem-input {
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 0.9375rem;
  background: #fff;
  color: var(--text-primary);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.eem-input:focus {
  outline: none;
  border-color: var(--accent-green);
  box-shadow: 0 0 0 3px rgba(45, 90, 61, 0.12);
}
.eem-input::placeholder {
  color: #94a3b8;
}
[data-theme='dark'] .eem-input {
  background: rgba(255, 255, 255, 0.06);
  border-color: var(--border-color);
}
[data-theme='dark'] .eem-input:focus {
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 0 3px rgba(104, 173, 51, 0.2);
}
.eem-textarea {
  resize: vertical;
  min-height: 100px;
}
.eem-select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
  padding-right: 40px;
}
[data-theme='dark'] .eem-select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-size: 16px 16px;
  background-position: right 14px center;
}
.eem-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: #f8faf9;
}
[data-theme='dark'] .eem-footer {
  background: rgba(18, 32, 20, 0.98);
  border-top-color: rgba(255, 255, 255, 0.12);
}
.eem-del {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: none;
  color: var(--danger-red);
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}
.eem-del:hover:not(:disabled) {
  text-decoration: underline;
}
.eem-del-icon {
  flex-shrink: 0;
}
.eem-actions {
  display: flex;
  gap: 12px;
}
.eem-btn {
  border-radius: 12px;
  padding: 11px 20px;
  font-size: 0.9375rem;
  font-weight: 600;
  border: 1px solid transparent;
  cursor: pointer;
}
.eem-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.eem-btn--ghost {
  background: #fff;
  border-color: #e2e8f0;
  color: var(--text-primary);
}
.eem-btn--ghost:hover:not(:disabled) {
  background: #f8faf9;
  border-color: #cbd5e1;
}
.eem-btn--primary {
  background: var(--accent-green);
  color: #fff;
}
.eem-btn--primary:hover:not(:disabled) {
  background: var(--accent-green-hover);
}
.eem-btn--danger {
  background: var(--danger-red);
  color: #fff;
}
[data-theme='dark'] .eem-btn--ghost {
  background: var(--bg-panel);
  border-color: var(--border-color);
}
.eem-confirm {
  position: fixed;
  inset: 0;
  z-index: 1500;
  background: var(--modal-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.eem-confirm-modal {
  width: 100%;
  max-width: 420px;
  border-radius: 16px;
  border: 1px solid var(--border-color);
  background: #fff;
  box-shadow: var(--shadow-card);
  padding: 20px;
}
[data-theme='dark'] .eem-confirm-modal {
  background: var(--bg-panel);
}
.eem-confirm-title {
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 8px;
}
.eem-confirm-text {
  color: var(--text-secondary);
  margin-bottom: 16px;
  font-size: 0.9375rem;
}
.eem-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>

