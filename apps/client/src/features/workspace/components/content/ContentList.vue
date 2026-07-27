<script setup lang="ts">
import { computed } from 'vue'
import type { ChatMessage, EditableUserMessage } from '@/types/chat/models'
import type { WorkspacePromptCapabilities } from 'share-type'
import ChatMessageBubble from './ChatMessageBubble.vue'

const DEFAULT_PROMPT_CAPS: WorkspacePromptCapabilities = { think: false }

const props = defineProps<{
  contentList: ChatMessage[]
  regenerating?: boolean
}>()

const emit = defineEmits<{
  edit: [payload: EditableUserMessage]
  regenerate: []
  clarifyMemory: [payload: { query: string }]
}>()

const latestAssistantId = computed(() => {
  const lastMsg = props.contentList.at(-1)
  return lastMsg?.role === 'assistant' ? lastMsg.id : ''
})

const messageDerivedMaps = computed(() => {
  const retrievalQueryMap: Record<string, string> = {}
  const editPayloadMap: Record<string, EditableUserMessage> = {}
  let lastUserContent = ''
  let pendingUserMsg: ChatMessage | null = null

  for (const msg of props.contentList) {
    if (msg.role === 'user') {
      lastUserContent = msg.content
      editPayloadMap[msg.id] = {
        message: msg,
        promptCapabilities: msg.promptCapabilities ?? DEFAULT_PROMPT_CAPS
      }
      pendingUserMsg = msg
      continue
    }

    if (msg.role === 'assistant') {
      retrievalQueryMap[msg.id] = lastUserContent

      if (pendingUserMsg && msg.promptCapabilities) {
        editPayloadMap[pendingUserMsg.id] = {
          message: pendingUserMsg,
          promptCapabilities: msg.promptCapabilities
        }
        pendingUserMsg = null
      }
    }
  }

  return { retrievalQueryMap, editPayloadMap }
})

const handleEdit = (msg: ChatMessage) => {
  const payload = messageDerivedMaps.value.editPayloadMap[msg.id] ?? {
    message: msg,
    promptCapabilities: msg.promptCapabilities ?? DEFAULT_PROMPT_CAPS
  }
  emit('edit', payload)
}
</script>

<template>
  <div class="space-y-8">
    <ChatMessageBubble
      v-for="message in contentList"
      :key="message.id"
      :message="message"
      :show-meta="message.role === 'assistant' && message.id === latestAssistantId"
      :retrieval-query="messageDerivedMaps.retrievalQueryMap[message.id] || ''"
      :regenerating="regenerating"
      @edit="handleEdit"
      @regenerate="emit('regenerate')"
      @clarify-memory="emit('clarifyMemory', $event)"
    />
  </div>
</template>
