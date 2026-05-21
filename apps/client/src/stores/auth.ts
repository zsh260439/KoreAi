import { defineStore } from 'pinia'

import type { User } from '@/types/models'
import { loginWithMock, type LoginPayload } from '@/servers/auth'
import { currentUser } from '@/utils/mock'

interface AuthState {
  token: string
  user: User
  loading: boolean
  error: string
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    token: localStorage.getItem('demo-token') ?? '',
    user: currentUser,
    loading: false,
    error: ''
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token)
  },
  actions: {
    async login(payload: LoginPayload) {
      this.loading = true
      this.error = ''

      try {
        const result = await loginWithMock(payload)
        this.token = result.token
        this.user = result.user
        localStorage.setItem('demo-token', result.token)
      } catch (error) {
        this.error = error instanceof Error ? error.message : '登录失败'
        throw error
      } finally {
        this.loading = false
      }
    },
    logout() {
      this.token = ''
      localStorage.removeItem('demo-token')
    }
  }
})
