<script setup lang="ts">
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
  <el-dialog
    :model-value="open"
    @update:model-value="emit('update:open', $event)"
    :title="title"
    :width="420"
    :destroy-on-close="true"
    :close-on-click-modal="false"
    center
  >
    <p class="mb-2 text-sm text-slate-500">{{ description }}</p>

    <template #footer>
      <el-button @click="emit('update:open', false)">取消</el-button>
      <el-button type="danger" @click="emit('confirm')">
        {{ confirmText || '确认删除' }}
      </el-button>
    </template>
  </el-dialog>
</template>
