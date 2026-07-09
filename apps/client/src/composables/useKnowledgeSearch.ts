import { ref } from 'vue'
import { searchKnowledgeAPI } from '@/servers/knowledge'
import type { KnowledgeSearchHit } from 'share-type'

const searchResults = ref<KnowledgeSearchHit[]>([])
const isSearching = ref(false)
const error = ref<string | null>(null)

export function useKnowledgeSearch() {
  const searchKnowledge = async (
    knowledgeBaseId: string,
    query: string,
    rewrite = true
  ) => {
    isSearching.value = true
    error.value = null

    try {
      const response = await searchKnowledgeAPI({
        knowledgeBaseId,
        query: query.trim(),
        rewrite
      })

      searchResults.value = response.data
      return searchResults.value
    } catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : '搜索知识库失败'
      searchResults.value = []
      return []
    } finally {
      isSearching.value = false
    }
  }

  const clearSearchResults = () => {
    searchResults.value = []
    error.value = null
  }

  return {
    searchResults,
    isSearching,
    error,
    searchKnowledge,
    clearSearchResults
  }
}
