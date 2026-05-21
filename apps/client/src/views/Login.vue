<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { LoaderCircle, ShieldCheck } from 'lucide-vue-next'
import { useForm } from 'vee-validate'
import { z } from 'zod'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const formSchema = toTypedSchema(
  z.object({
    email: z.string().email('请输入有效邮箱'),
    password: z.string().min(6, '密码至少 6 位')
  })
)

const form = useForm({
  validationSchema: formSchema,
  initialValues: {
    email: 'admin@demo.ai',
    password: 'codex123'
  }
})

const [email, emailAttrs] = form.defineField('email')
const [password, passwordAttrs] = form.defineField('password')

const onSubmit = form.handleSubmit(async (values) => {
  await authStore.login(values)
  await router.push('/workspace')
})
</script>

<template>
  <main class="grid min-h-screen grid-cols-1 bg-slate-50 lg:grid-cols-[1.1fr_0.9fr]">
    <section class="hidden border-r bg-white px-10 py-12 lg:flex lg:flex-col lg:justify-between">
      <div>
        <span
          class="inline-flex rounded-[8px] bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700"
        >
          AI Console
        </span>
        <h1 class="mt-6 max-w-md text-4xl font-semibold leading-tight text-slate-900">
          企业级 AI 工作台与链路追踪后台
        </h1>
        <p class="mt-4 max-w-lg text-sm leading-7 text-slate-500">
          前台工作台参考 FastGPT 的三栏结构，后台信息架构参考 ragent，保持企业内部 AI 控制台的使用语境。
        </p>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div class="rounded-[14px] border bg-slate-50 p-5">
          <p class="text-sm font-medium text-slate-900">工作台</p>
          <p class="mt-2 text-sm text-slate-500">会话侧栏、消息流、工具结果与详情抽屉。</p>
        </div>
        <div class="rounded-[14px] border bg-slate-50 p-5">
          <p class="text-sm font-medium text-slate-900">管理后台</p>
          <p class="mt-2 text-sm text-slate-500">知识库、任务、链路、用户和系统设置。</p>
        </div>
      </div>
    </section>

    <section class="flex items-center justify-center px-6 py-10">
      <div class="w-full max-w-md rounded-[16px] border bg-white shadow-sm">
        <div class="space-y-3 px-6 pb-3 pt-6">
          <div class="flex size-12 items-center justify-center rounded-[14px] bg-blue-50 text-blue-600">
            <ShieldCheck class="size-6" />
          </div>
          <div>
            <h2 class="text-2xl font-semibold text-slate-900">登录</h2>
            <p class="mt-2 text-sm leading-6 text-slate-500">
              使用 mock 账号进入工作台。默认账号已预填。
            </p>
          </div>
          <span
            class="inline-flex w-fit rounded-[8px] bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700"
          >
            admin@demo.ai / codex123
          </span>
        </div>

        <div class="px-6 pb-6">
          <form class="space-y-5" @submit="onSubmit">
            <div class="space-y-2">
              <label class="text-sm font-medium text-slate-900" for="login-email">邮箱</label>
              <input
                id="login-email"
                v-model="email"
                v-bind="emailAttrs"
                type="email"
                placeholder="admin@demo.ai"
                class="h-11 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
              <p v-if="form.errors.value.email" class="text-sm text-red-600">
                {{ form.errors.value.email }}
              </p>
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium text-slate-900" for="login-password">密码</label>
              <input
                id="login-password"
                v-model="password"
                v-bind="passwordAttrs"
                type="password"
                placeholder="请输入密码"
                class="h-11 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
              <p v-if="form.errors.value.password" class="text-sm text-red-600">
                {{ form.errors.value.password }}
              </p>
            </div>

            <div
              v-if="authStore.error"
              class="rounded-[12px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {{ authStore.error }}
            </div>

            <button
              type="submit"
              class="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-blue-600 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="authStore.loading"
            >
              <LoaderCircle v-if="authStore.loading" class="size-4 animate-spin" />
              进入工作台
            </button>
          </form>
        </div>
      </div>
    </section>
  </main>
</template>
