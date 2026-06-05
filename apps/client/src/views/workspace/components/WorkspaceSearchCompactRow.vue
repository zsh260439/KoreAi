<script setup lang="ts">
import { Search } from 'lucide-vue-next'

const props = defineProps<{
  count: number
  active?: boolean
}>()

defineEmits<{
  click: []
}>()
</script>

<template>
  <button
    type="button"
    class="inline-flex items-center gap-2 rounded-full border border-[#eceff4] bg-[#f5f7fb] px-4 py-2 text-left text-[14px] text-[#4b5565] transition hover:border-[#dbe3ef] hover:bg-white"
    :class="active ? 'border-[#dbe6ff] bg-[#eef4ff] text-[#23416e]' : ''"
    @click="$emit('click')"
  >
    <Search class="size-4 shrink-0" />
    <span>{{ active ? '正在阅读网页...' : `已阅读 ${count} 个网页` }}</span>
    <span class="flex items-center gap-1">
      <span
        class="size-2 rounded-full bg-[#7aa2ff]"
        :class="active ? 'animate-pulse' : ''"
      />
      <span
        class="size-2 rounded-full bg-[#7aa2ff]/85"
        :class="active ? 'animate-pulse [animation-delay:120ms]' : ''"
      />
      <span
        class="size-2 rounded-full bg-[#7aa2ff]/70"
        :class="active ? 'animate-pulse [animation-delay:240ms]' : ''"
      />
    </span>
  </button>
</template>
