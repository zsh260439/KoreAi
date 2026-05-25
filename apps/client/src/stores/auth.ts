import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { loginWithMock } from '@/servers/auth'
import type { LoginPayload } from '@/types/app'
import { currentUser } from '@/utils/mock'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('demo-token') ?? '')
  const user = ref(currentUser)
  const loading = ref(false)
  const error = ref('')

  const isAuthenticated = computed(() => Boolean(token.value))

  const login = async (payload: LoginPayload) => {
    loading.value = true
    error.value = ''

    try {
      const result = await loginWithMock(payload)
      token.value = result.token
      user.value = result.user
      localStorage.setItem('demo-token', result.token)
    } catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : '登录失败'
      throw caughtError
    } finally {
      loading.value = false
    }
  }

  const logout = () => {
    token.value = ''
    localStorage.removeItem('demo-token')
  }

  return {
    token,
    user,
    loading,
    error,
    isAuthenticated,
    login,
    logout
  }
})
