<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuth()

const mode = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const role = ref<'worker' | 'manager'>('worker')
const error = ref<string | null>(null)
const loading = ref(false)

const title = computed(() => (mode.value === 'login' ? 'Вход в аккаунт' : 'Регистрация'))
const subtitle = computed(() =>
  mode.value === 'login'
    ? 'Войдите под своей учётной записью портала Агро-Контроль.'
    : 'Создайте учётную запись и начните работу с полями, задачами и аналитикой.',
)
const submitLabel = computed(() => (mode.value === 'login' ? 'Войти' : 'Зарегистрироваться'))
const switchBtnLabel = computed(() =>
  mode.value === 'login' ? 'Создать аккаунт' : 'Войти в существующий аккаунт',
)

function labelChars(text: string): string[] {
  return text.split('')
}

function switchMode() {
  mode.value = mode.value === 'login' ? 'register' : 'login'
  error.value = null
}

async function submit() {
  error.value = null
  const trimmedEmail = email.value.trim()
  const trimmedPassword = password.value.trim()
  if (!trimmedEmail || !trimmedPassword) {
    error.value = 'Введите логин (email) и пароль'
    return
  }
  if (trimmedPassword.length < 6) {
    error.value = 'Пароль не менее 6 символов'
    return
  }
  loading.value = true
  try {
    if (mode.value === 'login') {
      await auth.login(trimmedEmail, trimmedPassword)
    } else {
      await auth.register(trimmedEmail, trimmedPassword, role.value)
    }
    const redirect = (route.query.redirect as string) || '/dashboard'
    router.push(redirect)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.toLowerCase().includes('email not confirmed')) {
      error.value =
        'Почта не подтверждена. В Supabase: Authentication → Users → найдите себя → Confirm. Либо Authentication → Providers → Email → выключите «Confirm email», чтобы больше не требовать подтверждение.'
    } else {
      error.value = msg || 'Ошибка входа'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-layout auth-uiview">
    <!-- Визуал в духе Uiverse / zanina-yassine + корпоративные цвета -->
    <form class="form_container" @submit.prevent="submit">
      <div class="title_container">
        <p class="title">{{ title }}</p>
        <span class="subtitle">{{ subtitle }}</span>
      </div>

      <div class="form-control">
        <input
          id="auth-email"
          v-model="email"
          type="email"
          autocomplete="email"
          required
        />
        <label for="auth-email">
          <span
            v-for="(ch, i) in labelChars('Логин (email)')"
            :key="`email-ch-${i}`"
            :style="{ transitionDelay: `${i * 50}ms` }"
          >{{ ch }}</span>
        </label>
      </div>

      <div class="group">
        <input
          id="auth-password"
          v-model="password"
          class="input"
          type="password"
          autocomplete="current-password"
          required
        />
        <label for="auth-password" class="group-label">
          <span
            v-for="(ch, i) in labelChars('Пароль')"
            :key="`pwd-ch-${i}`"
            :style="{ transitionDelay: `${i * 50}ms` }"
          >{{ ch }}</span>
        </label>
      </div>

      <div v-if="mode === 'register'" class="input_container input_container--select">
        <label class="input_label" for="auth-role">Роль</label>
        <div class="input_row">
          <select id="auth-role" v-model="role" class="input_field input_field--select">
            <option value="worker">Работник</option>
            <option value="manager">Руководитель</option>
          </select>
        </div>
        <p class="role_hint">
          Работник видит только свои данные; руководитель — по всем сотрудникам.
        </p>
      </div>

      <p v-if="error" class="auth_error" role="alert">{{ error }}</p>

      <button type="submit" class="sign-in_btn" :disabled="loading">
        <span>{{ loading ? 'Проверка...' : submitLabel }}</span>
      </button>

      <div class="separator">
        <hr class="line" />
        <span>или</span>
        <hr class="line" />
      </div>

      <button type="button" class="sign-in_secondary" @click="switchMode">
        <span>{{ switchBtnLabel }}</span>
      </button>

      <p class="note">Продолжая, вы принимаете правила использования корпоративного портала.</p>
    </form>
  </div>
</template>

<style scoped>
.login-layout {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
}

/* Uiverse / zanina-yassine — каркас; цвета из темы (--accent-green и т.д.) */
.form_container {
  width: fit-content;
  min-width: min(100%, 360px);
  max-width: 400px;
  height: fit-content;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 15px;
  padding: 40px 40px 28px;
  background-color: #ffffff;
  box-shadow:
    0px 106px 42px rgba(0, 0, 0, 0.01),
    0px 59px 36px rgba(0, 0, 0, 0.05),
    0px 26px 26px rgba(0, 0, 0, 0.09),
    0px 7px 15px rgba(0, 0, 0, 0.1),
    0px 0px 0px rgba(0, 0, 0, 0.1);
  border-radius: 11px;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  box-sizing: border-box;
}

.title_container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 4px;
}

.title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #212121;
  text-align: center;
}

.subtitle {
  font-size: 0.725rem;
  max-width: 92%;
  text-align: center;
  line-height: 1.35;
  color: #8b8e98;
}

.input_container {
  width: 100%;
  height: fit-content;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.form-control {
  position: relative;
  margin: 12px 0 18px;
  width: 100%;
}

.form-control input {
  background-color: transparent;
  border: 0;
  border-bottom: 2px solid var(--border-color);
  display: block;
  width: 100%;
  padding: 15px 0;
  font-size: 18px;
  color: var(--text-primary);
}

.form-control input:focus,
.form-control input:valid {
  outline: 0;
  border-bottom-color: var(--accent-green);
}

.form-control label {
  position: absolute;
  top: 15px;
  left: 0;
  pointer-events: none;
}

.form-control label span {
  display: inline-block;
  font-size: 18px;
  min-width: 5px;
  color: var(--text-secondary);
  transition: 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  white-space: pre;
}

.form-control input:focus + label span,
.form-control input:valid + label span {
  color: var(--accent-green);
  transform: translateY(-28px);
}

.group {
  position: relative;
  width: 100%;
  margin: 12px 0 18px;
}

.group .icon {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  color: var(--text-secondary);
  pointer-events: none;
}

.group .input {
  width: 100%;
  background: transparent;
  border: 0;
  border-bottom: 2px solid var(--border-color);
  color: var(--text-primary);
  font-size: 18px;
  padding: 15px 0;
  font-family: inherit;
}

.group .input:focus {
  outline: 0;
  border-bottom-color: var(--accent-green);
}

.group .group-label {
  position: absolute;
  top: 15px;
  left: 0;
  pointer-events: none;
}

.group .group-label span {
  display: inline-block;
  font-size: 18px;
  min-width: 5px;
  color: var(--text-secondary);
  transition: 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  white-space: pre;
}

.group .input:focus + .group-label span,
.group .input:valid + .group-label span {
  color: var(--accent-green);
  transform: translateY(-28px);
}

.input_container--select .role_hint {
  margin: 0;
  font-size: 0.7rem;
  line-height: 1.25;
  color: #8b8e98;
  padding-left: 2px;
}

.icon {
  width: 20px;
  height: 20px;
  position: absolute;
  z-index: 2;
  left: 12px;
  bottom: 11px;
  color: #374151;
  pointer-events: none;
}

.input_row {
  position: relative;
  width: 100%;
}

.icon--inrow {
  position: absolute;
  left: 12px;
  top: 50%;
  bottom: auto;
  transform: translateY(-50%);
  z-index: 2;
}

.input_label {
  font-size: 0.75rem;
  color: #8b8e98;
  font-weight: 600;
}

.input_field {
  width: 100%;
  height: 40px;
  padding: 0 12px 0 40px;
  border-radius: 7px;
  outline: none;
  border: 1px solid #e5e5e5;
  filter: drop-shadow(0px 1px 0px #efefef) drop-shadow(0px 1px 0.5px rgba(239, 239, 239, 0.5));
  transition: all 0.3s cubic-bezier(0.15, 0.83, 0.66, 1);
  font-size: 0.9rem;
  color: #212121;
  background-color: #fff;
  box-sizing: border-box;
}

.input_field::placeholder {
  color: #9ca3af;
}

.input_field:focus {
  border: 1px solid transparent;
  box-shadow: 0 0 0 2px var(--accent-green);
  background-color: transparent;
}

.input_field--select {
  padding-left: 12px;
  padding-right: 36px;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}

.auth_error {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.35;
  color: var(--danger-red);
  padding: 8px 10px;
  border-radius: 7px;
  background: rgba(185, 28, 28, 0.08);
  border: 1px solid rgba(185, 28, 28, 0.2);
}

.sign-in_btn {
  width: 100%;
  height: 40px;
  border: 0;
  background: var(--accent-green);
  border-radius: 7px;
  outline: none;
  color: #ffffff;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  transition: background 0.2s ease, opacity 0.2s ease;
}

.sign-in_btn:hover:not(:disabled) {
  background: var(--accent-green-hover);
}

.sign-in_btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.separator {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: #8b8e98;
  font-size: 0.75rem;
  font-weight: 600;
}

.separator .line {
  display: block;
  width: 100%;
  height: 1px;
  border: 0;
  background-color: #e8e8e8;
  flex: 1;
}

.sign-in_secondary {
  width: 100%;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: #ffffff;
  border-radius: 7px;
  outline: none;
  color: #242424;
  border: 1px solid #e5e5e5;
  filter: drop-shadow(0px 1px 0px #efefef) drop-shadow(0px 1px 0.5px rgba(239, 239, 239, 0.5));
  cursor: pointer;
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  transition:
    border-color 0.2s ease,
    color 0.2s ease,
    background 0.2s ease;
}

.sign-in_secondary:hover {
  border-color: var(--accent-green);
  color: var(--accent-green);
}

.note {
  margin: 4px 0 0;
  font-size: 0.72rem;
  line-height: 1.35;
  color: #8b8e98;
  text-align: center;
  text-decoration: none;
}

@media (max-width: 480px) {
  .login-layout {
    padding: 16px;
  }
  .form_container {
    padding: 40px 24px 24px;
    min-width: 100%;
  }
}
</style>

<!-- Тёмная тема: атрибут data-theme на <html> задаётся приложением -->
<style>
html[data-theme='dark'] .auth-uiview .form_container {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  box-shadow:
    0 24px 48px rgba(0, 0, 0, 0.35),
    0 8px 20px rgba(0, 0, 0, 0.25);
}

html[data-theme='dark'] .auth-uiview .title {
  color: var(--text-primary);
}

html[data-theme='dark'] .auth-uiview .subtitle,
html[data-theme='dark'] .auth-uiview .input_label,
html[data-theme='dark'] .auth-uiview .separator,
html[data-theme='dark'] .auth-uiview .note,
html[data-theme='dark'] .auth-uiview .role_hint {
  color: var(--text-secondary);
}

html[data-theme='dark'] .auth-uiview .input_field {
  background: rgba(0, 0, 0, 0.25);
  border-color: var(--border-color);
  color: var(--text-primary);
  filter: none;
}

html[data-theme='dark'] .auth-uiview .form-control input,
html[data-theme='dark'] .auth-uiview .group .input {
  color: var(--text-primary);
  border-bottom-color: var(--border-color);
}

html[data-theme='dark'] .auth-uiview .form-control label span,
html[data-theme='dark'] .auth-uiview .group .icon {
  color: var(--text-secondary);
}

html[data-theme='dark'] .auth-uiview .form-control input:focus,
html[data-theme='dark'] .auth-uiview .form-control input:valid,
html[data-theme='dark'] .auth-uiview .group .input:focus {
  border-bottom-color: var(--accent-green);
}

html[data-theme='dark'] .auth-uiview .input_field::placeholder {
  color: var(--text-secondary);
}

html[data-theme='dark'] .auth-uiview .input_field:focus {
  box-shadow: 0 0 0 2px var(--accent-green);
  background: rgba(0, 0, 0, 0.2);
}

html[data-theme='dark'] .auth-uiview .icon {
  color: rgba(255, 255, 255, 0.65);
}

html[data-theme='dark'] .auth-uiview .separator .line {
  background-color: var(--border-color);
}

html[data-theme='dark'] .auth-uiview .sign-in_secondary {
  background: rgba(0, 0, 0, 0.2);
  border-color: var(--border-color);
  color: var(--text-primary);
  filter: none;
}

html[data-theme='dark'] .auth-uiview .sign-in_secondary:hover {
  border-color: var(--accent-green);
  color: var(--accent-green);
}

html[data-theme='dark'] .auth-uiview .auth_error {
  background: rgba(211, 60, 60, 0.12);
  border-color: rgba(211, 60, 60, 0.35);
}
</style>
