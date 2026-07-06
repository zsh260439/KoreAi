<script setup lang="ts">
import { computed } from 'vue'
import type { ChatMessage } from '@/types/chat/models'
import type { WorkspacePromptCapabilities } from 'share-type'
import ChatMessageBubble from './ChatMessageBubble.vue'

type EditableUserMessage = {
  message: ChatMessage
  promptCapabilities: WorkspacePromptCapabilities
}

const props = defineProps<{
  contentList: ChatMessage[]
  regenerating?: boolean
}>()

defineEmits<{
  edit: [payload: EditableUserMessage]
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

const editPayloadByMessageId = computed<Record<string, EditableUserMessage>>(() => {
  const payloadMap: Record<string, EditableUserMessage> = {}
  let pendingUserMessage: ChatMessage | null = null

  for (const message of props.contentList) {
    if (message.role === 'user') {
      payloadMap[message.id] = {
        message,
        promptCapabilities: message.promptCapabilities ?? {
          think: false,
          search: false
        }
      }
      pendingUserMessage = message
      continue
    }

    if (message.role === 'assistant' && pendingUserMessage && message.promptCapabilities) {
      payloadMap[pendingUserMessage.id] = {
        message: pendingUserMessage,
        promptCapabilities: message.promptCapabilities
      }
      pendingUserMessage = null
    }
  }

  return payloadMap
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
      @edit="
        $emit(
          'edit',
          editPayloadByMessageId[$event.id] ?? {
            message: $event,
            promptCapabilities: $event.promptCapabilities ?? { think: false, search: false }
          }
        )
      "
      @regenerate="$emit('regenerate')"
    />
  </div>
</template>
