<script setup lang="ts">
import { computed } from 'vue'
import type { ChatMessage } from '@/types/chat/models'
import ChatMessageBubble from './ChatMessageBubble.vue'

const props = defineProps<{
  contentList: ChatMessage[]
  regenerating?: boolean
}>()

defineEmits<{
  regenerate: []
}>()

const latestRegenerableAssistantContentId = computed(() => {
  const latestContent = props.contentList[props.contentList.length - 1]
  return latestContent?.role === 'assistant' ? latestContent.id : ''
})

const retrievalQueryByMessageId = computed(() => {
  const queryMap: Record<string, string> = {}
  let lastUserContent = ''

  for (const message of props.contentList) {
    if (message.role === 'user') {
      lastUserContent = message.content
      continue
    }

    if (message.role === 'assistant') {
      queryMap[message.id] = lastUserContent
    }
  }

  return queryMap
})
</script>

<template>
  <div class="space-y-8">
    <ChatMessageBubble
      v-for="message in contentList"
      :key="message.id"
      :message="message"
      :show-meta="
        message.role === 'assistant' && message.id === latestRegenerableAssistantContentId
      "
      :retrieval-query="retrievalQueryByMessageId[message.id] || ''"
      :regenerating="regenerating"
      @regenerate="$emit('regenerate')"
    />
  </div>
</template>
