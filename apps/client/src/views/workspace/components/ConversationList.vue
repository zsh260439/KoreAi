<script setup lang="ts">
import type { ConversationSummary } from '@/types'
import ConversationListItem from './ConversationListItem.vue'

defineProps<{
  sessions: ConversationSummary[]
  activeSessionId?: string
  loading?: boolean
  getSessionTimeLabel: (value: string) => string
  isSessionStreaming: (sessionId: string) => boolean
}>()

defineEmits<{
  select: [sessionId: string]
}>()
</script>

<template>
  <div class="space-y-2.5 pr-2">
    <template v-if="loading">
      <div
        v-for="item in 6"
        :key="item"
        class="h-[72px] rounded-[16px] border border-[#f3f4f6] bg-white"
      />
    </template>
    <template v-else-if="sessions.length">
      <ConversationListItem
        v-for="session in sessions"
        :key="session.id"
        :session="session"
        :active="session.id === activeSessionId"
        :streaming="isSessionStreaming(session.id)"
        :time-label="getSessionTimeLabel(session.updatedAt)"
        @select="$emit('select', $event)"
      />
    </template>
    <div
      v-else
      class="rounded-[16px] border border-dashed border-[#e5e7eb] bg-white p-4 text-sm text-[#9ca3af]"
    >
      暂无会话。
    </div>
  </div>
</template>
