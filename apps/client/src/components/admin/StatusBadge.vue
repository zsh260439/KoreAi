<script setup lang="ts">
import { computed } from 'vue'

import { cn } from '@/utils/cn'

const props = defineProps<{
  status: string
}>()

const statusClassName = computed(() => {
  if (props.status === 'success' || props.status === 'active' || props.status === 'indexed' || props.status === 'online') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  }

  if (props.status === 'error' || props.status === 'failed' || props.status === 'offline') {
    return 'border-red-200 bg-red-50 text-red-700'
  }

  if (props.status === 'running' || props.status === 'processing' || props.status === 'checking' || props.status === 'syncing') {
    return 'border-amber-200 bg-amber-50 text-amber-700'
  }

  return 'border-slate-200 bg-slate-50 text-slate-700'
})
</script>

<template>
  <span
    :class="cn('inline-flex items-center rounded-[8px] border px-2 py-0.5 text-[10px] capitalize', statusClassName)"
  >
    {{ status }}
  </span>
</template>
