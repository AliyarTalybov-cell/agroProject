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

      <div class="input_container">
        <label class="input_label" for="auth-email">Логин (email)</label>
        <svg
          class="icon"
          fill="none"
          viewBox="0 0 24 24"
          height="24"
          width="24"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            stroke-linejoin="round"
            stroke-linecap="round"
            stroke-width="1.5"
            stroke="currentColor"
            d="M7 8.5L9.94202 10.2394C11.6572 11.2535 12.3428 11.2535 14.058 10.2394L17 8.5"
          />
          <path
            stroke-linejoin="round"
            stroke-width="1.5"
            stroke="currentColor"
            d="M2.01577 13.4756C2.08114 16.5412 2.11383 18.0739 3.24496 19.2094C4.37608 20.3448 5.95033 20.3843 9.09883 20.4634C11.0393 20.5122 12.9607 20.5122 14.9012 20.4634C18.0497 20.3843 19.6239 20.3448 20.7551 19.2094C21.8862 18.0739 21.9189 16.5412 21.9842 13.4756C22.0053 12.4899 22.0053 11.5101 21.9842 10.5244C21.9189 7.45886 21.8862 5.92609 20.7551 4.79066C19.6239 3.65523 18.0497 3.61568 14.9012 3.53657C12.9607 3.48781 11.0393 3.48781 9.09882 3.53656C5.95033 3.61566 4.37608 3.65521 3.24495 4.79065C2.11382 5.92608 2.08114 7.45885 2.01576 10.5244C1.99474 11.5101 1.99475 12.4899 2.01577 13.4756Z"
          />
        </svg>
        <input
          id="auth-email"
          v-model="email"
          type="email"
          autocomplete="email"
          placeholder="name@company.ru"
          class="input_field"
        />
      </div>

      <div class="input_container">
        <label class="input_label" for="auth-password">Пароль</label>
        <svg
          class="icon"
          fill="none"
          viewBox="0 0 24 24"
          height="24"
          width="24"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-width="1.5"
            stroke="currentColor"
            d="M18 11.0041C17.4166 9.91704 16.273 9.15775 14.9519 9.0993C13.477 9.03404 11.9788 9 10.329 9C8.67911 9 7.18091 9.03404 5.70604 9.0993C3.95328 9.17685 2.51295 10.4881 2.27882 12.1618C2.12602 13.2541 2 14.3734 2 15.5134C2 16.6534 2.12602 17.7727 2.27882 18.865C2.51295 20.5387 3.95328 21.8499 5.70604 21.9275C6.42013 21.9591 7.26041 21.9834 8 22"
          />
          <path
            stroke-linejoin="round"
            stroke-linecap="round"
            stroke-width="1.5"
            stroke="currentColor"
            d="M6 9V6.5C6 4.01472 8.01472 2 10.5 2C12.9853 2 15 4.01472 15 6.5V9"
          />
          <path
            fill="currentColor"
            d="M21.2046 15.1045L20.6242 15.6956V15.6956L21.2046 15.1045ZM21.4196 16.4767C21.7461 16.7972 22.2706 16.7924 22.5911 16.466C22.9116 16.1395 22.9068 15.615 22.5804 15.2945L21.4196 16.4767ZM18.0228 15.1045L17.4424 14.5134V14.5134L18.0228 15.1045ZM18.2379 18.0387C18.5643 18.3593 19.0888 18.3545 19.4094 18.028C19.7299 17.7016 19.7251 17.1771 19.3987 16.8565L18.2379 18.0387ZM14.2603 20.7619C13.7039 21.3082 12.7957 21.3082 12.2394 20.7619L11.0786 21.9441C12.2794 23.1232 14.2202 23.1232 15.4211 21.9441L14.2603 20.7619ZM12.2394 20.7619C11.6914 20.2239 11.6914 19.358 12.2394 18.82L11.0786 17.6378C9.86927 18.8252 9.86927 20.7567 11.0786 21.9441L12.2394 20.7619ZM12.2394 18.82C12.7957 18.2737 13.7039 18.2737 14.2603 18.82L15.4211 17.6378C14.2202 16.4587 12.2794 16.4587 11.0786 17.6378L12.2394 18.82ZM14.2603 18.82C14.8082 19.358 14.8082 20.2239 14.2603 20.7619L15.4211 21.9441C16.6304 20.7567 16.6304 18.8252 15.4211 17.6378L14.2603 18.82ZM20.6242 15.6956L21.4196 16.4767L22.5804 15.2945L21.785 14.5134L20.6242 15.6956ZM15.4211 18.82L17.8078 16.4767L16.647 15.2944L14.2603 17.6377L15.4211 18.82ZM17.8078 16.4767L18.6032 15.6956L17.4424 14.5134L16.647 15.2945L17.8078 16.4767ZM16.647 16.4767L18.2379 18.0387L19.3987 16.8565L17.8078 15.2945L16.647 16.4767ZM21.785 14.5134C21.4266 14.1616 21.0998 13.8383 20.7993 13.6131C20.4791 13.3732 20.096 13.1716 19.6137 13.1716V14.8284C19.6145 14.8284 19.619 14.8273 19.6395 14.8357C19.6663 14.8466 19.7183 14.8735 19.806 14.9391C19.9969 15.0822 20.2326 15.3112 20.6242 15.6956L21.785 14.5134ZM18.6032 15.6956C18.9948 15.3112 19.2305 15.0822 19.4215 14.9391C19.5091 14.8735 19.5611 14.8466 19.5879 14.8357C19.6084 14.8273 19.6129 14.8284 19.6137 14.8284V13.1716C19.1314 13.1716 18.7483 13.3732 18.4281 13.6131C18.1276 13.8383 17.8008 14.1616 17.4424 14.5134L18.6032 15.6956Z"
          />
        </svg>
        <input
          id="auth-password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          placeholder="Не менее 6 символов"
          class="input_field"
        />
      </div>

      <div v-if="mode === 'register'" class="input_container input_container--select">
        <label class="input_label" for="auth-role">Роль</label>
        <div class="input_row">
          <svg
            class="icon icon--inrow"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
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
  padding-left: 40px;
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
