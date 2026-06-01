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
      <div v-for="item in 6" :key="item" class="h-[54px] rounded-[12px] bg-slate-100" />
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
    <div v-else class="rounded-[12px] border border-dashed p-3 text-sm text-slate-500">
      暂无匹配的会话。
    </div>
  </div>
</template>
