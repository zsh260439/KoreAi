<script setup lang="ts">
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
  title: string
  description: string
  confirmText?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
}>()
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/45" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[16px] border bg-white p-0 shadow-xl outline-none"
      >
        <div class="border-b px-6 py-5 text-left">
          <DialogTitle class="text-[18px] font-semibold text-slate-900">{{ title }}</DialogTitle>
          <DialogDescription class="mt-2 text-sm text-slate-500">{{ description }}</DialogDescription>
        </div>

        <div class="flex justify-end gap-3 px-6 py-4">
          <button
            type="button"
            class="h-10 rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            @click="emit('update:open', false)"
          >
            取消
          </button>
          <button
            type="button"
            class="h-10 rounded-[10px] bg-red-600 px-4 text-sm font-medium text-white transition hover:bg-red-700"
            @click="emit('confirm')"
          >
            {{ confirmText || '确认删除' }}
          </button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
