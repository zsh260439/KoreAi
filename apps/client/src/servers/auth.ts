import { currentUser, wait } from '@/utils/mock'

export interface LoginPayload {
  email: string
  password: string
}

export async function loginWithMock(payload: LoginPayload) {
  await wait(500)

  const email = payload.email.trim().toLowerCase()

  if (email === 'admin@demo.ai' && payload.password === 'codex123') {
    return {
      token: 'demo-token',
      user: currentUser
    }
  }

  throw new Error('账号或密码不正确，请使用 admin@demo.ai / codex123。')
}
