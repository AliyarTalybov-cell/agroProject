import { ref, computed } from 'vue'
import type { User } from '@supabase/supabase-js'
import type { ProfileRow } from '@/lib/tasksSupabase'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

const user = ref<User | null>(null)
const loading = ref(true)
/** Кэш профиля текущего пользователя (ФИО, телефон, должность и т.д.), чтобы не сбрасывать форму при переходах */
const profileCache = ref<ProfileRow | null>(null)

function isUserActive(u: User | null): boolean {
  if (!u) return false
  // By default user is active unless explicitly disabled.
  return u.user_metadata?.active !== false
}

export function useAuth() {
  const isLoggedIn = computed(() => Boolean(user.value))

  async function init() {
    if (!supabase) {
      loading.value = false
      return
    }
    try {
      const { data: { session } } = await supabase!.auth.getSession()
      const nextUser = session?.user ?? null
      if (nextUser && !isUserActive(nextUser)) {
        await supabase!.auth.signOut()
        user.value = null
      } else {
        user.value = nextUser
      }
    } finally {
      loading.value = false
    }
  }

  function startAuthListener() {
    if (!supabase) return
    supabase!.auth.onAuthStateChange(async (_event, session) => {
      const nextUser = session?.user ?? null
      if (nextUser?.id !== user.value?.id) {
        profileCache.value = null
      }
      if (nextUser && !isUserActive(nextUser)) {
        await supabase!.auth.signOut()
        user.value = null
        return
      }
      user.value = nextUser
    })
  }

  async function login(email: string, password: string) {
    if (!supabase) throw new Error('Supabase не настроен')
    const { data, error } = await supabase!.auth.signInWithPassword({ email, password })
    if (error) throw error
    if (data.user && !isUserActive(data.user)) {
      await supabase!.auth.signOut()
      user.value = null
      throw new Error('Аккаунт отключён. Обратитесь к администратору.')
    }
    user.value = data.user
    return data
  }

  async function register(email: string, password: string) {
    if (!supabase) throw new Error('Supabase не настроен')
    const { data, error } = await supabase!.auth.signUp({
      email,
      password,
      options: { data: { role: 'worker' } },
    })
    if (error) throw error
    user.value = data.user
    return data
  }

  async function logout() {
    if (!supabase) return
    await supabase!.auth.signOut()
    user.value = null
    profileCache.value = null
    try {
      localStorage.removeItem('agro:profile')
    } catch {
      /* ignore */
    }
  }

  /** Смена пароля: проверка текущего и установка нового */
  async function updatePassword(currentPassword: string, newPassword: string) {
    if (!supabase) throw new Error('Supabase не настроен')
    const email = user.value?.email
    if (!email) throw new Error('Пользователь не найден')
    const { error: signInError } = await supabase!.auth.signInWithPassword({ email, password: currentPassword })
    if (signInError) throw new Error('Неверный текущий пароль')
    const { error: updateError } = await supabase!.auth.updateUser({ password: newPassword })
    if (updateError) throw updateError
  }

  const userRole = computed<'worker' | 'manager'>(() => {
    const role = user.value?.user_metadata?.role
    return role === 'manager' ? 'manager' : 'worker'
  })

  return {
    user,
    loading,
    isLoggedIn,
    isAuthConfigured: isSupabaseConfigured,
    userRole,
    profileCache,
    init,
    startAuthListener,
    login,
    register,
    logout,
    updatePassword,
  }
}

export function getAuthUser(): User | null {
  return user.value
}

export function isAuthLoading(): boolean {
  return loading.value
}
