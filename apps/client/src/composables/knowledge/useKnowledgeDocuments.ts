import { ref } from 'vue'
import {
  createKnowledgeDocumentAPI,
  deleteKnowledgeDocumentAPI,
  findKnowledgeDocumentTrashAPI,
  findKnowledgeDocumentAPI,
  findKnowledgeDocumentsAPI,
  uploadKnowledgeDocumentAPI,
  purgeKnowledgeDocumentAPI,
  restoreKnowledgeDocumentAPI,
  updateKnowledgeDocumentAPI
} from '@/servers/knowledge'
import type {
  CreateKnowledgeDocumentInput,
  KnowledgeDocument,
  KnowledgeDocumentTrash,
  StructureAwareChunkConfig,
  UpdateKnowledgeDocumentInput
} from 'share-type'

type UploadKnowledgeDocumentInput = {
  file: File
  name: string
  chunkConfig?: StructureAwareChunkConfig
}

const documents = ref<KnowledgeDocument[]>([])
const currentDocument = ref<KnowledgeDocument | null>(null)
const trash = ref<KnowledgeDocumentTrash | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)

export function useKnowledgeDocuments() {
  const loadKnowledgeDocuments = async (kbId: string) => {
    isLoading.value = true
    error.value = null

    try {
      const response = await findKnowledgeDocumentsAPI(kbId)
      documents.value = response.data
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
      currentDocument.value = response.data
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
      chunkConfig: payload.chunkConfig
    })

    const created = response.data
    documents.value = [created, ...documents.value]
    return created
  }

  const uploadKnowledgeDocument = async (kbId: string, payload: UploadKnowledgeDocumentInput) => {
    const response = await uploadKnowledgeDocumentAPI(kbId, {
      file: payload.file,
      name: payload.name.trim(),
      chunkConfig: payload.chunkConfig
    })

    const created = response.data
    documents.value = [created, ...documents.value]
    return created
  }

  const updateKnowledgeDocument = async (docId: string, payload: UpdateKnowledgeDocumentInput) => {
    const response = await updateKnowledgeDocumentAPI(docId, {
      name: payload.name?.trim(),
      chunkConfig: payload.chunkConfig
    })

    const updated = response.data
    currentDocument.value = updated
    documents.value = documents.value.map((item) => (item.id === docId ? updated : item))
    return updated
  }

  const removeKnowledgeDocument = async (docId: string) => {
    const response = await deleteKnowledgeDocumentAPI(docId)

    if (currentDocument.value?.id === docId) {
      currentDocument.value = null
    }

    documents.value = documents.value.filter((item) => item.id !== docId)
    return response.data
  }

  const loadKnowledgeDocumentTrash = async () => {
    const response = await findKnowledgeDocumentTrashAPI()
    trash.value = response.data
    return response.data
  }

  const restoreKnowledgeDocument = async (docId: string) => {
    const response = await restoreKnowledgeDocumentAPI(docId)
    trash.value = trash.value
      ? { ...trash.value, items: trash.value.items.filter((item) => item.id !== docId) }
      : null
    return response.data
  }

  const purgeKnowledgeDocument = async (docId: string) => {
    await purgeKnowledgeDocumentAPI(docId)
    await loadKnowledgeDocumentTrash()
  }

  return {
    documents,
    currentDocument,
    trash,
    isLoading,
    error,
    loadKnowledgeDocuments,
    loadKnowledgeDocument,
    createKnowledgeDocument,
    uploadKnowledgeDocument,
    updateKnowledgeDocument,
    removeKnowledgeDocument,
    loadKnowledgeDocumentTrash,
    restoreKnowledgeDocument,
    purgeKnowledgeDocument
  }
}
