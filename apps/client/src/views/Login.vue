<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus'
import { LoaderCircle, ShieldCheck } from 'lucide-vue-next'
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import type { LoginPayload } from '@/types/app'

const router = useRouter()
const authStore = useAuthStore()
   
const formRef = ref<FormInstance>()
const formModel = reactive<LoginPayload>({
  email: 'admin@demo.ai',
  password: 'codex123'
})

const formRules: FormRules<LoginPayload> = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入有效邮箱', trigger: ['blur', 'change'] }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: ['blur', 'change'] }
  ]
}

const onSubmit = async () => {
  if (!formRef.value) return

  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  await authStore.login({ ...formModel })
  await router.push('/workspace')
}
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
          <div class="flex size-12 items-center justify-center rounded-[14px] bg-zinc-50 text-zinc-700">
            <ShieldCheck class="size-6" />
          </div>
          <div>
            <h2 class="text-2xl font-semibold text-slate-900">登录</h2>
            <p class="mt-2 text-sm leading-6 text-slate-500">
              使用 mock 账号进入工作台，默认账号密码已预填。
            </p>
          </div>
          <span
            class="inline-flex w-fit rounded-[8px] bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700"
          >
            admin@demo.ai / codex123
          </span>
        </div>

        <div class="px-6 pb-6">
          <el-form
            ref="formRef"
            :model="formModel"
            :rules="formRules"
            label-position="top"
            class="space-y-5"
            @submit.prevent="onSubmit"
          >
            <el-form-item label="邮箱" prop="email" class="login-form-item">
              <el-input
                v-model="formModel.email"
                type="email"
                placeholder="admin@demo.ai"
                class="login-form-input"
              />
            </el-form-item>

            <el-form-item label="密码" prop="password" class="login-form-item">
              <el-input
                v-model="formModel.password"
                type="password"
                show-password
                placeholder="请输入密码"
                class="login-form-input"
              />
            </el-form-item>

            <div
              v-if="authStore.error"
              class="rounded-[12px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {{ authStore.error }}
            </div>

            <el-button type="primary" native-type="submit" class="!h-11 !w-full !text-sm !font-medium" :loading="authStore.loading">
              <LoaderCircle v-if="authStore.loading" class="size-4 animate-spin" />
              进入工作台
            </el-button>
          </el-form>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
:deep(.login-form-item) {
  margin-bottom: 0;
}

:deep(.login-form-item .el-form-item__label) {
  padding-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: rgb(15 23 42);
  line-height: 1.5;
}

:deep(.login-form-item .el-form-item__content) {
  line-height: normal;
}

:deep(.login-form-input .el-input__wrapper) {
  min-height: 44px;
  border-radius: 10px;
  box-shadow: 0 0 0 1px rgb(226 232 240) inset;
}

:deep(.login-form-input .el-input__wrapper.is-focus) {
  box-shadow:
    0 0 0 1px rgb(161 161 170) inset,
    0 0 0 2px rgb(244 244 245);
}

:deep(.login-form-input .el-input__inner) {
  font-size: 14px;
  color: rgb(15 23 42);
}
</style>
