<script setup lang="ts">
import { Settings2, UserRound } from 'lucide-vue-next'

defineProps<{
  userName: string
}>()

defineEmits<{
  openAdmin: []
}>()
</script>

<template>
  <button
    type="button"
    class="flex w-full items-center gap-3 rounded-[16px] border border-[#e5e7eb] bg-white px-3 py-3 text-left transition hover:border-[#d1d5db] hover:bg-[#fafafa]"
    @click="$emit('openAdmin')"
  >
    <div
      class="flex size-9 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[#6b7280]"
    >
      <UserRound class="size-4" />
    </div>
    <div class="min-w-0 flex-1">
      <p class="truncate text-[14px] font-medium text-[#111827]">{{ userName }}</p>
      <p class="truncate text-[12px] text-[#9ca3af]">知识库管理</p>
    </div>
    <Settings2 class="size-4 shrink-0 text-[#9ca3af]" />
  </button>
</template>
