import { ref } from 'vue'
import { findDocumentChunksAPI, rebuildDocumentChunksAPI } from '@/servers/knowledge'
import type { KnowledgeChunk } from '@/types'

const chunks = ref<KnowledgeChunk[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)

export function useKnowledgeChunks() {
  const loadKnowledgeChunks = async (docId: string) => {
    isLoading.value = true
    error.value = null

    try {
      const response = await findDocumentChunksAPI(docId)
      chunks.value = response.data ?? []
    } catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : '加载分块失败'
    } finally {
      isLoading.value = false
    }
  }

  const rebuildKnowledgeChunks = async (docId: string) => {
    isLoading.value = true
    error.value = null

    try {
      const response = await rebuildDocumentChunksAPI(docId)
      chunks.value = response.data ?? []
      return chunks.value
    } catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : '重新分块失败'
      return []
    } finally {
      isLoading.value = false
    }
  }

  return {
    chunks,
    isLoading,
    error,
    loadKnowledgeChunks,
    rebuildKnowledgeChunks
  }
}
