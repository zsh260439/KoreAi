<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  status: string
}>()

const statusClassName = computed(() => {
  if (props.status === 'success' || props.status === 'active' || props.status === 'indexed' || props.status === 'online') {
    return 'border-blue-200 bg-blue-50 text-blue-700'
  }

  if (props.status === 'error' || props.status === 'failed' || props.status === 'offline') {
    return 'border-blue-200 bg-blue-50 text-blue-700'
  }

  if (props.status === 'running' || props.status === 'processing' || props.status === 'checking' || props.status === 'syncing') {
    return 'border-blue-200 bg-blue-50 text-blue-700'
  }

  return 'border-blue-100 bg-blue-50/60 text-blue-700'
})
</script>

<template>
  <span
    :class="[
      'inline-flex items-center rounded-[8px] border px-2 py-0.5 text-[10px] capitalize',
      statusClassName
    ]"
  >
    {{ status }}
  </span>
</template>
