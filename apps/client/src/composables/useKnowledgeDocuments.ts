import { ref } from 'vue'
import {
  createKnowledgeDocumentAPI,
  deleteKnowledgeDocumentAPI,
  findKnowledgeDocumentAPI,
  findKnowledgeDocumentsAPI,
  updateKnowledgeDocumentAPI
} from '@/servers/knowledge'
import type { CreateKnowledgeDocumentInput, KnowledgeDocument, UpdateKnowledgeDocumentInput } from 'share-type'

const documents = ref<KnowledgeDocument[]>([])
const currentDocument = ref<KnowledgeDocument | null>(null)
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

  const loadKnowledgeDocument = async (docId: string) => {
    isLoading.value = true
    error.value = null

    try {
      const response = await findKnowledgeDocumentAPI(docId)
      currentDocument.value = response.data ?? null
      return currentDocument.value
    } catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : '加载文档详情失败'
      currentDocument.value = null
      return null
    } finally {
      isLoading.value = false
    }
  }

  const createKnowledgeDocument = async (kbId: string, payload: CreateKnowledgeDocumentInput) => {
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

  const updateKnowledgeDocument = async (docId: string, payload: UpdateKnowledgeDocumentInput) => {
    const response = await updateKnowledgeDocumentAPI(docId, {
      name: payload.name?.trim(),
      chunkStrategy: payload.chunkStrategy?.trim(),
      chunkConfig: payload.chunkConfig
    })

    if (!response.data) {
      throw new Error('更新文档失败')
    }

    const updated = response.data
    currentDocument.value = updated
    documents.value = documents.value.map((item) => (item.id === docId ? updated : item))
    return updated
  }

  const removeKnowledgeDocument = async (docId: string) => {
    const response = await deleteKnowledgeDocumentAPI(docId)

    if (!response.data) {
      throw new Error('删除文档失败')
    }

    if (currentDocument.value?.id === docId) {
      currentDocument.value = null
    }

    documents.value = documents.value.filter((item) => item.id !== docId)
    return response.data
  }

  return {
    documents,
    currentDocument,
    isLoading,
    error,
    loadKnowledgeDocuments,
    loadKnowledgeDocument,
    createKnowledgeDocument,
    updateKnowledgeDocument,
    removeKnowledgeDocument
  }
}
