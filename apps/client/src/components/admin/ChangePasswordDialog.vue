<script setup lang="ts">
import { ref } from 'vue'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle
} from 'reka-ui'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const currentPassword = ref('')
const nextPassword = ref('')
const confirmPassword = ref('')

function closeDialog() {
  emit('update:open', false)
}

function submit() {
  currentPassword.value = ''
  nextPassword.value = ''
  confirmPassword.value = ''
  emit('update:open', false)
}
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/45" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[16px] border bg-white p-0 shadow-xl outline-none"
      >
        <div class="border-b px-6 py-5 text-left">
          <DialogTitle class="text-[18px] font-semibold text-slate-900">修改密码</DialogTitle>
          <DialogDescription class="mt-2 text-sm text-slate-500">
            更新当前账户的登录密码。
          </DialogDescription>
        </div>

        <div class="space-y-4 px-6 py-6">
          <div class="space-y-2">
            <label class="text-sm font-medium text-slate-900">当前密码</label>
            <input
              v-model="currentPassword"
              type="password"
              class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium text-slate-900">新密码</label>
            <input
              v-model="nextPassword"
              type="password"
              class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium text-slate-900">确认新密码</label>
            <input
              v-model="confirmPassword"
              type="password"
              class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
          </div>
        </div>

        <div class="flex justify-end gap-3 border-t px-6 py-4">
          <button
            type="button"
            class="h-10 rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            @click="closeDialog"
          >
            取消
          </button>
          <button
            type="button"
            class="h-10 rounded-[10px] bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-700"
            @click="submit"
          >
            保存
          </button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
