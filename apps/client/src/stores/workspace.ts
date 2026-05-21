import { defineStore } from 'pinia'

import type { ChatMessage, ConversationSummary, TraceDetail } from '@/types/models'
import {
  createConversation,
  fetchTraceDetail,
  fetchWorkspaceMessages,
  fetchWorkspaceSessions,
  generateAssistantReply
} from '@/servers/workspace'

interface WorkspaceState {
  sessions: ConversationSummary[]
  messagesBySession: Record<string, ChatMessage[]>
  activeSessionId: string
  selectedTrace: TraceDetail | null
  loading: boolean
  error: string
  detailOpen: boolean
  sidebarOpen: boolean
  collapsed: boolean
  streamingMessageId: string
}

let streamingTimer: ReturnType<typeof window.setInterval> | null = null

export const useWorkspaceStore = defineStore('workspace', {
  state: (): WorkspaceState => ({
    sessions: [],
    messagesBySession: {},
    activeSessionId: '',
    selectedTrace: null,
    loading: false,
    error: '',
    detailOpen: false,
    sidebarOpen: false,
    collapsed: false,
    streamingMessageId: ''
  }),
  getters: {
    activeSession(state) {
      return state.sessions.find((item) => item.id === state.activeSessionId) ?? null
    },
    activeMessages(state) {
      return state.messagesBySession[state.activeSessionId] ?? []
    },
    isStreaming(state) {
      return Boolean(state.streamingMessageId)
    }
  },
  actions: {
    async bootstrap(sessionId?: string) {
      this.loading = true
      this.error = ''

      try {
        const sessions = await fetchWorkspaceSessions()
        this.sessions = sessions
        this.activeSessionId = sessionId && sessions.some((item) => item.id === sessionId)
          ? sessionId
          : (sessions[0]?.id ?? '')

        await Promise.all(
          sessions.map(async (session) => {
            const messages = await fetchWorkspaceMessages(session.id)
            this.messagesBySession[session.id] = messages
            session.messageCount = messages.length
          })
        )
      } catch (error) {
        this.error = error instanceof Error ? error.message : '加载工作台失败'
      } finally {
        this.loading = false
      }
    },
    async selectSession(sessionId: string) {
      this.activeSessionId = sessionId
      this.selectedTrace = null
      this.detailOpen = false
      if (!this.messagesBySession[sessionId]) {
        const messages = await fetchWorkspaceMessages(sessionId)
        this.messagesBySession[sessionId] = messages
        const session = this.sessions.find((item) => item.id === sessionId)
        if (session) {
          session.messageCount = messages.length
        }
      }
    },
    async createNewSession() {
      const session = await createConversation('新建会话')
      this.sessions = [session, ...this.sessions]
      this.messagesBySession[session.id] = []
      this.activeSessionId = session.id
      return session
    },
    async openTrace(traceId?: string, openDrawer = true) {
      if (!traceId) {
        this.selectedTrace = null
        this.detailOpen = false
        return
      }

      this.selectedTrace = await fetchTraceDetail(traceId)
      this.detailOpen = openDrawer
    },
    closeTrace() {
      this.detailOpen = false
    },
    toggleSidebar() {
      this.sidebarOpen = !this.sidebarOpen
    },
    toggleCollapse() {
      this.collapsed = !this.collapsed
    },
    async sendMessage(content: string) {
      const session = this.activeSession

      if (!session || !content.trim() || this.isStreaming) {
        return
      }

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: content.trim(),
        createdAt: new Date().toISOString(),
        status: 'done'
      }

      const placeholder: ChatMessage = {
        id: `assistant-${Date.now() + 1}`,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
        status: 'streaming',
        model: session.model
      }

      const messages = this.messagesBySession[session.id] ?? []
      messages.push(userMessage, placeholder)
      this.messagesBySession[session.id] = messages
      session.messageCount = messages.length
      session.updatedAt = new Date().toISOString()
      this.streamingMessageId = placeholder.id

      const reply = await generateAssistantReply(session.id, content)
      const chunks = reply.content.split('')
      let pointer = 0

      streamingTimer = window.setInterval(() => {
        const targetMessages = this.messagesBySession[session.id] ?? []
        const target = targetMessages.find((message) => message.id === placeholder.id)

        if (!target) {
          this.stopStreaming()
          return
        }

        target.content += chunks[pointer] ?? ''
        pointer += 1

        if (pointer >= chunks.length) {
          Object.assign(target, reply, {
            id: placeholder.id,
            content: reply.content,
            status: 'done'
          })
          this.streamingMessageId = ''
          if (streamingTimer) {
            window.clearInterval(streamingTimer)
            streamingTimer = null
          }
        }
      }, 18)
    },
    stopStreaming() {
      if (streamingTimer) {
        window.clearInterval(streamingTimer)
        streamingTimer = null
      }

      if (!this.streamingMessageId) {
        return
      }

      const message = this.activeMessages.find((item) => item.id === this.streamingMessageId)
      if (message) {
        message.status = 'done'
      }
      this.streamingMessageId = ''
    },
    async regenerateLastAnswer() {
      const messages = this.activeMessages
      const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user')
      if (lastUserMessage) {
        await this.sendMessage(lastUserMessage.content)
      }
    }
  }
})
