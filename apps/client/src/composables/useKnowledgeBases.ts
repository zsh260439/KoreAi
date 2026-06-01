import { ref } from 'vue'
import { createKnowledgeBaseAPI, deleteKnowledgeBaseAPI, findKnowledgeBasesAPI } from '@/servers/knowledge'
import type { KnowledgeBase, KnowledgeBaseCreatePayload } from '@/types'

const knowledgeBases = ref<KnowledgeBase[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)

export function useKnowledgeBases() {
  const loadKnowledgeBases = async () => {
    isLoading.value = true
    error.value = null

    try {
      const response = await findKnowledgeBasesAPI()
      knowledgeBases.value = response.data ?? []
    } catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : '加载知识库失败'
    } finally {
      isLoading.value = false
    }
  }

  const createKnowledgeBase = async (payload: KnowledgeBaseCreatePayload) => {
    const response = await createKnowledgeBaseAPI({
      name: payload.name.trim(),
      description: payload.description?.trim() || undefined
    })

    if (!response.data) {
      throw new Error('创建知识库失败')
    }

    const created = response.data
    knowledgeBases.value = [created, ...knowledgeBases.value]
    return created
  }

  const removeKnowledgeBase = async (kbId: string) => {
    const response = await deleteKnowledgeBaseAPI(kbId)

    if (!response.data) {
      throw new Error('删除知识库失败')
    }

    knowledgeBases.value = knowledgeBases.value.filter((item) => item.id !== kbId)
    return response.data
  }

  return {
    knowledgeBases,
    isLoading,
    error,
    loadKnowledgeBases,
    createKnowledgeBase,
    removeKnowledgeBase
  }
}