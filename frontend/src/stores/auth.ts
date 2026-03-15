import { ref, computed } from 'vue'
import type { User } from '@supabase/supabase-js'
import type { ProfileRow } from '@/lib/tasksSupabase'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

const user = ref<User | null>(null)
const loading = ref(true)
/** Кэш профиля текущего пользователя (ФИО, телефон, должность и т.д.), чтобы не сбрасывать форму при переходах */
const profileCache = ref<ProfileRow | null>(null)

export function useAuth() {
  const isLoggedIn = computed(() => Boolean(user.value))

  async function init() {
    if (!supabase) {
      loading.value = false
      return
    }
    try {
      const { data: { session } } = await supabase.auth.getSession()
      user.value = session?.user ?? null
    } finally {
      loading.value = false
    }
  }

  function startAuthListener() {
    if (!supabase) return
    supabase.auth.onAuthStateChange((_event, session) => {
      user.value = session?.user ?? null
    })
  }

  async function login(email: string, password: string) {
    if (!supabase) throw new Error('Supabase не настроен')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    user.value = data.user
    return data
  }

  async function register(email: string, password: string, role: 'worker' | 'manager' = 'worker') {
    if (!supabase) throw new Error('Supabase не настроен')
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { role } },
    })
    if (error) throw error
    user.value = data.user
    return data
  }

  async function logout() {
    if (!supabase) return
    await supabase.auth.signOut()
    user.value = null
    profileCache.value = null
  }

  /** Смена пароля: проверка текущего и установка нового */
  async function updatePassword(currentPassword: string, newPassword: string) {
    if (!supabase) throw new Error('Supabase не настроен')
    const email = user.value?.email
    if (!email) throw new Error('Пользователь не найден')
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPassword })
    if (signInError) throw new Error('Неверный текущий пароль')
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
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
