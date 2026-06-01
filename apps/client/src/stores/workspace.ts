import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { useWorkspaceChat } from '@/composables/useWorkspaceChat'
import type { ChatMessage, ConversationSummary, TraceDetail } from '@/types'

export const useWorkspaceStore = defineStore('workspace', () => {
  const sessions = ref<ConversationSummary[]>([])
  const messagesBySession = ref<Record<string, ChatMessage[]>>({})
  const activeSessionId = ref('')
  const selectedTrace = ref<TraceDetail | null>(null)
  const loading = ref(false)
  const error = ref('')
  const detailOpen = ref(false)
  const sidebarOpen = ref(false)
  const streamingStateBySession = ref<Record<string, { messageId: string; runId: number }>>({})
  const streamingRunSeq = ref(0)
  const regenerating = ref(false)

  const activeSession = computed(
    () => sessions.value.find((item) => item.id === activeSessionId.value) ?? null
  )
  const activeMessages = computed(() => messagesBySession.value[activeSessionId.value] ?? [])
  const isStreaming = computed(
    () => Boolean(streamingStateBySession.value[activeSessionId.value]?.messageId)
  )

  const toggleSidebar = () => {
    sidebarOpen.value = !sidebarOpen.value
  }

  const chat = useWorkspaceChat(
    {
      get sessions() {
        return sessions.value
      },
      get messagesBySession() {
        return messagesBySession.value
      },
      get activeSessionId() {
        return activeSessionId.value
      },
      get selectedTrace() {
        return selectedTrace.value
      },
      get detailOpen() {
        return detailOpen.value
      },
      get loading() {
        return loading.value
      },
      get error() {
        return error.value
      },
      get streamingStateBySession() {
        return streamingStateBySession.value
      },
      get streamingRunSeq() {
        return streamingRunSeq.value
      },
      get regenerating() {
        return regenerating.value
      }
    },
    {
      setSessions: (value) => {
        sessions.value = value
      },
      setMessagesBySession: (value) => {
        messagesBySession.value = value
      },
      setActiveSessionId: (value) => {
        activeSessionId.value = value
      },
      setSelectedTrace: (value) => {
        selectedTrace.value = value
      },
      setDetailOpen: (value) => {
        detailOpen.value = value
      },
      setLoading: (value) => {
        loading.value = value
      },
      setError: (value) => {
        error.value = value
      },
      setStreamingStateBySession: (value) => {
        streamingStateBySession.value = value
      },
      setStreamingRunSeq: (value) => {
        streamingRunSeq.value = value
      },
      setRegenerating: (value) => {
        regenerating.value = value
      }
    },
    {
      get activeSession() {
        return activeSession.value
      },
      get isStreaming() {
        return isStreaming.value
      }
    }
  )

  return {
    sessions,
    messagesBySession,
    activeSessionId,
    selectedTrace,
    loading,
    error,
    detailOpen,
    sidebarOpen,
    streamingStateBySession,
    streamingRunSeq,
    regenerating,
    activeSession,
    activeMessages,
    isStreaming,
    toggleSidebar,
    ...chat
  }
})
