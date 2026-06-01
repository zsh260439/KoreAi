import { ref } from 'vue'
import {
  createKnowledgeDocumentAPI,
  deleteKnowledgeDocumentAPI,
  findKnowledgeDocumentsAPI,
  updateKnowledgeDocumentAPI
} from '@/servers/knowledge'
import type {
  CreateKnowledgeDocumentPayload,
  KnowledgeDocument,
  KnowledgeDocumentUpdatePayload
} from '@/types'

const documents = ref<KnowledgeDocument[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)

export function useKnowledgeDocuments() {
  const loadKnowledgeDocuments = async (kbId: string) => {
    isLoading.value = true
    error.value = null

    try {
      const response = await findKnowledgeDocumentsAPI(kbId)
      documents.value = response.data ?? []
    } catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : '加载文档失败'
    } finally {
      isLoading.value = false
    }
  }

  const createKnowledgeDocument = async (
    kbId: string,
    payload: CreateKnowledgeDocumentPayload
  ) => {
    const response = await createKnowledgeDocumentAPI(kbId, {
      name: payload.name.trim(),
      storagePath: payload.storagePath.trim(),
      chunkStrategy: payload.chunkStrategy?.trim() || undefined,
      chunkConfig: payload.chunkConfig
    })

    if (!response.data) {
      throw new Error('创建文档失败')
    }

    const created = response.data
    documents.value = [created, ...documents.value]
    return created
  }

  const updateKnowledgeDocument = async (
    docId: string,
    payload: KnowledgeDocumentUpdatePayload
  ) => {
    const response = await updateKnowledgeDocumentAPI(docId, {
      name: payload.name?.trim(),
      chunkStrategy: payload.chunkStrategy?.trim(),
      chunkConfig: payload.chunkConfig
    })

    if (!response.data) {
      throw new Error('更新文档失败')
    }

    const updated = response.data
    documents.value = documents.value.map((item) => (item.id === docId ? updated : item))
    return updated
  }

  const removeKnowledgeDocument = async (docId: string) => {
    const response = await deleteKnowledgeDocumentAPI(docId)

    if (!response.data) {
      throw new Error('删除文档失败')
    }

    documents.value = documents.value.filter((item) => item.id !== docId)
    return response.data
  }

  return {
    documents,
    isLoading,
    error,
    loadKnowledgeDocuments,
    createKnowledgeDocument,
    updateKnowledgeDocument,
    removeKnowledgeDocument
  }
}