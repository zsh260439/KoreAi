<script setup lang="ts">
import { computed } from 'vue'
import type { ChatMessage } from '@/types/chat/models'
import type { WorkspacePromptCapabilities } from 'share-type'
import ChatMessageBubble from './ChatMessageBubble.vue'

type EditableUserMessage = {
  message: ChatMessage
  promptCapabilities: WorkspacePromptCapabilities
}

// 抽离默认常量，避免重复硬编码
const DEFAULT_PROMPT_CAPS: WorkspacePromptCapabilities = { think: false }

const props = defineProps<{
  contentList: ChatMessage[]
  regenerating?: boolean
}>()

const emit = defineEmits<{
  edit: [payload: EditableUserMessage]
  regenerate: []
}>()

// 1. 最后一条可重生成的助手消息ID（逻辑极简，保留独立 computed）
const latestAssistantId = computed(() => {
  const lastMsg = props.contentList.at(-1)
  return lastMsg?.role === 'assistant' ? lastMsg.id : ''
})

// 2. 一次遍历，同时生成两个映射表，避免重复循环
const messageDerivedMaps = computed(() => {
  const retrievalQueryMap: Record<string, string> = {}
  const editPayloadMap: Record<string, EditableUserMessage> = {}
  let lastUserContent = ''
  let pendingUserMsg: ChatMessage | null = null

  for (const msg of props.contentList) {
    if (msg.role === 'user') {
      // 检索查询：记录当前用户文本
      lastUserContent = msg.content
      // 编辑载荷：先按用户自身信息初始化
      editPayloadMap[msg.id] = {
        message: msg,
        promptCapabilities: msg.promptCapabilities ?? DEFAULT_PROMPT_CAPS
      }
      pendingUserMsg = msg
      continue
    }

    if (msg.role === 'assistant') {
      // 检索查询：绑定对应上一条用户提问
      retrievalQueryMap[msg.id] = lastUserContent
      
      // 编辑载荷：如果助手有能力配置，覆盖对应用户的配置
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

// 3. 抽离事件处理，模板不再写长串内联逻辑
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
    />
  </div>
</template>