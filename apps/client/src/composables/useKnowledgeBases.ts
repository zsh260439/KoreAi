import { ref } from 'vue'
import {
  createKnowledgeBaseAPI,
  deleteKnowledgeBaseAPI,
  findKnowledgeBasesAPI,
  updateKnowledgeBaseAPI
} from '@/servers/knowledge'
import type { CreateKnowledgeBaseInput, KnowledgeBase, UpdateKnowledgeBaseInput } from 'share-type'

const knowledgeBases = ref<KnowledgeBase[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)

export function useKnowledgeBases() {
  const loadKnowledgeBases = async () => {
    isLoading.value = true
    error.value = null

    try {
      const response = await findKnowledgeBasesAPI()
      knowledgeBases.value = response.data
    } catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : '加载知识库失败'
    } finally {
      isLoading.value = false
    }
  }

  const createKnowledgeBase = async (payload: CreateKnowledgeBaseInput) => {
    const response = await createKnowledgeBaseAPI({
      name: payload.name.trim(),
      description: payload.description?.trim() || undefined
    })

    const created = response.data
    knowledgeBases.value = [created, ...knowledgeBases.value]
    return created
  }

  const updateKnowledgeBase = async (
    kbId: string,
    payload: UpdateKnowledgeBaseInput
  ) => {
    const response = await updateKnowledgeBaseAPI(kbId, {
      name: payload.name?.trim(),
      description: payload.description?.trim()
    })

    const updated = response.data
    knowledgeBases.value = knowledgeBases.value.map((item) => (item.id === kbId ? updated : item))
    return updated
  }

  const removeKnowledgeBase = async (kbId: string) => {
    const response = await deleteKnowledgeBaseAPI(kbId)
    knowledgeBases.value = knowledgeBases.value.filter((item) => item.id !== kbId)
    return response.data
  }

  return {
    knowledgeBases,
    isLoading,
    error,
    loadKnowledgeBases,
    createKnowledgeBase,
    updateKnowledgeBase,
    removeKnowledgeBase
  }
}
