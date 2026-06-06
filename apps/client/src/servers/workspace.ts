import { request } from '@/http-utils/http'
import type { KnowledgeAskResult } from 'share-type'

export type WorkspaceChatInput = {
  query: string
  knowledgeBaseId?: string
  think?: boolean
}

export const requestWorkspaceChatAPI = (dto: WorkspaceChatInput, signal?: AbortSignal) => {
  return request<KnowledgeAskResult>('workspace/chat', 'POST', dto, { signal })
}
