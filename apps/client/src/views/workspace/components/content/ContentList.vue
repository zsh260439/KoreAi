<script setup lang="ts">
import { computed } from 'vue'
import type { ChatMessage } from '@/types'
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
      :regenerating="regenerating"
      @regenerate="$emit('regenerate')"
    />
  </div>
</template>
