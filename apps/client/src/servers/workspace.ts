import type { ChatMessage, ConversationSummary } from '@/types/models'
import {
  cloneMock,
  conversationMessages,
  conversationSummaries,
  traceDetails,
  wait
} from '@/utils/mock'

export async function fetchWorkspaceSessions() {
  await wait()
  return cloneMock(conversationSummaries)
}

export async function fetchWorkspaceMessages(sessionId: string) {
  await wait()
  return cloneMock(conversationMessages[sessionId] ?? [])
}

export async function fetchTraceDetail(traceId: string) {
  await wait(220)
  return cloneMock(traceDetails[traceId] ?? null)
}

function buildAssistantReply(input: string) {
  const lowerInput = input.toLowerCase()

  if (lowerInput.includes('天气') || lowerInput.includes('下雨')) {
    return {
      content:
        '根据模拟天气服务，明天下午有中等概率降雨。建议保留线上会议链接，并在会议通知里说明 13:30 前根据天气切换为线上模式。',
      traceId: 'trace-weather-002'
    }
  }

  if (input.includes('报销') || input.includes('制度')) {
    return {
      content:
        '从财务制度库看，住宿报销需要发票、入住清单和支付凭证；交通报销以高铁二等座和经济舱为标准，超标准需要主管审批。',
      traceId: 'trace-finance-001'
    }
  }

  return {
    content:
      '我已经根据当前上下文整理了一个简短结论。若需要，我可以继续补充成行动清单、对外通知或知识库摘要。',
    traceId: undefined
  }
}

export async function generateAssistantReply(sessionId: string, input: string) {
  await wait(200)

  const reply = buildAssistantReply(input)
  const detail = reply.traceId ? traceDetails[reply.traceId] : null
  const messages = conversationMessages[sessionId] ?? []
  const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant')

  const template: ChatMessage = {
    id: `assistant-${Date.now()}`,
    role: 'assistant',
    content: reply.content,
    createdAt: new Date().toISOString(),
    status: 'done',
    traceId: reply.traceId,
    model: detail?.summary.model ?? 'doubao-seed-2-0-lite-260215',
    latencyMs: detail?.summary.latencyMs ?? 1180,
    inputTokens: detail?.summary.inputTokens ?? 420,
    outputTokens: detail?.summary.outputTokens ?? 160,
    toolCalls: detail?.toolExecutions ?? lastAssistant?.toolCalls,
    citations: detail?.citations ?? lastAssistant?.citations
  }

  return cloneMock(template)
}

export async function createConversation(title: string, model = 'doubao-seed-2-0-lite-260215') {
  await wait(180)
  const session: ConversationSummary = {
    id: `session-${Date.now()}`,
    title,
    updatedAt: new Date().toISOString(),
    messageCount: 0,
    model
  }

  return cloneMock(session)
}
