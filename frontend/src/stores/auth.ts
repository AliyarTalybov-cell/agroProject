import { ref, computed } from 'vue'
import type { User } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

const user = ref<User | null>(null)
const loading = ref(true)

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

  async function register(email: string, password: string) {
    if (!supabase) throw new Error('Supabase не настроен')
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    user.value = data.user
    return data
  }

  async function logout() {
    if (!supabase) return
    await supabase.auth.signOut()
    user.value = null
  }

  return {
    user,
    loading,
    isLoggedIn,
    isAuthConfigured: isSupabaseConfigured,
    init,
    startAuthListener,
    login,
    register,
    logout,
  }
}

export function getAuthUser(): User | null {
  return user.value
}

export function isAuthLoading(): boolean {
  return loading.value
}
