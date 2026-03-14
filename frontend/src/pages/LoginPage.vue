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
const error = ref<string | null>(null)
const loading = ref(false)

const title = computed(() => (mode.value === 'login' ? 'Вход в систему' : 'Регистрация'))
const submitLabel = computed(() => (mode.value === 'login' ? 'Войти' : 'Зарегистрироваться'))
const switchPrompt = computed(() =>
  mode.value === 'login' ? 'Нет аккаунта? Зарегистрируйтесь' : 'Уже есть аккаунт? Войдите',
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
      await auth.register(trimmedEmail, trimmedPassword)
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
  <div class="login-layout">
    <div class="login-card card">
      <h1 class="page-title">{{ title }}</h1>
      <form class="login-form" @submit.prevent="submit">
        <label class="login-field">
          <span class="login-label">Логин (email)</span>
          <input
            v-model="email"
            type="email"
            autocomplete="email"
            placeholder="example@mail.ru"
            class="login-input"
          />
        </label>
        <label class="login-field">
          <span class="login-label">Пароль</span>
          <input
            v-model="password"
            type="password"
            autocomplete="password"
            placeholder="Не менее 6 символов"
            class="login-input"
          />
        </label>
        <div v-if="error" class="login-error">{{ error }}</div>
        <button type="submit" class="login-submit" :disabled="loading">
          {{ loading ? 'Проверка...' : submitLabel }}
        </button>
      </form>
      <button type="button" class="login-switch" @click="switchMode">
        {{ switchPrompt }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.login-layout {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
}
.login-card {
  max-width: 420px;
  width: 100%;
}
.login-card .page-title {
  margin-bottom: 16px;
}
.login-form {
  display: grid;
  gap: 14px;
}
.login-field {
  display: grid;
  gap: 6px;
}
.login-label {
  font-size: 0.8rem;
  color: var(--text-secondary);
}
.login-input {
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  font-size: 1rem;
  background: var(--bg-panel);
  color: var(--text-primary);
}
.login-input::placeholder {
  color: var(--text-secondary);
  opacity: 0.8;
}
.login-error {
  color: var(--danger-red);
  font-size: 0.9rem;
}
.login-submit {
  padding: 12px 16px;
  background: var(--accent-green);
  color: #fff;
  border: 0;
  border-radius: 10px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  margin-top: 4px;
}
.login-submit:hover:not(:disabled) {
  background: var(--accent-green-hover);
}
.login-submit:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.login-switch {
  margin-top: 20px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--accent-green);
  font-size: 0.9rem;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.login-switch:hover {
  color: var(--accent-green-hover);
}
@media (max-width: 480px) {
  .login-layout {
    padding: 16px;
  }
}
</style>
