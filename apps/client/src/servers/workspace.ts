import { buildApiUrl, request } from '@/http-utils/http'
import type {
  CreateWorkspaceConversationInput,
  WorkspaceChatInput,
  WorkspaceChatResult,
  WorkspaceChatStreamEvent,
  WorkspaceConversationSummary,
  WorkspaceMessage
} from 'share-type'

export const findWorkspaceConversationsAPI = () => {
  return request<WorkspaceConversationSummary[]>('workspace/conversations')
}

export const createWorkspaceConversationAPI = (dto: CreateWorkspaceConversationInput = {}) => {
  return request<WorkspaceConversationSummary>('workspace/conversations', 'POST', dto)
}

export const deleteWorkspaceConversationAPI = (conversationId: string) => {
  return request<WorkspaceConversationSummary>(`workspace/conversations/${conversationId}`, 'DELETE')
}

export const findWorkspaceConversationMessagesAPI = (conversationId: string) => {
  return request<WorkspaceMessage[]>(`workspace/conversations/${conversationId}/messages`)
}

export const requestWorkspaceChatStreamAPI = async (
  dto: WorkspaceChatInput,
  options: {
    signal?: AbortSignal
    onEvent: (event: WorkspaceChatStreamEvent) => void
  }
): Promise<WorkspaceChatResult> => {
  const response = await fetch(buildApiUrl('workspace/chat/stream'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/x-ndjson'
    },
    body: JSON.stringify(dto),
    signal: options.signal
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response))
  }

  if (!response.body) {
    throw new Error('聊天流为空')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let completedResult: WorkspaceChatResult | null = null

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const event = parseWorkspaceChatStreamEvent(line)
      if (!event) {
        continue
      }

      options.onEvent(event)

      if (event.type === 'error') {
        throw new Error(event.message)
      }

      if (event.type === 'completed') {
        completedResult = event.data
      }
    }

    if (done) {
      break
    }
  }

  const finalEvent = parseWorkspaceChatStreamEvent(buffer)
  if (finalEvent) {
    options.onEvent(finalEvent)

    if (finalEvent.type === 'error') {
      throw new Error(finalEvent.message)
    }

    if (finalEvent.type === 'completed') {
      completedResult = finalEvent.data
    }
  }

  if (!completedResult) {
    throw new Error('聊天流未返回最终结果')
  }

  return completedResult
}

async function readErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    try {
      const payload = (await response.json()) as {
        message?: string
        error?: string
      }

      return payload.message || payload.error || `请求失败 (${response.status})`
    } catch {
      return `请求失败 (${response.status})`
    }
  }

  const text = await response.text()
  return text || `请求失败 (${response.status})`
}

function parseWorkspaceChatStreamEvent(line: string): WorkspaceChatStreamEvent | null {
  const normalizedLine = line.trim()
  if (!normalizedLine) {
    return null
  }

  return JSON.parse(normalizedLine) as WorkspaceChatStreamEvent
}
