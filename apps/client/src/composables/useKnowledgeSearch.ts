import { ref } from 'vue'
import { searchKnowledgeAPI } from '@/servers/knowledge'
import type { KnowledgeSearchDebugInfo, KnowledgeSearchHit } from 'share-type'

const searchResults = ref<KnowledgeSearchHit[]>([])
// 单独缓存本次检索 debug，避免前端从每条 hit 里重复拼装链路信息
const searchDebug = ref<KnowledgeSearchDebugInfo | null>(null)
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

      // 搜索接口现在返回 hits + debug，preview 面板两者都需要
      searchResults.value = response.data.hits
      searchDebug.value = response.data.debug
      return searchResults.value
    } catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : '搜索知识库失败'
      searchResults.value = []
      searchDebug.value = null
      return []
    } finally {
      isSearching.value = false
    }
  }

  const clearSearchResults = () => {
    searchResults.value = []
    searchDebug.value = null
    error.value = null
  }

  return {
    searchResults,
    searchDebug,
    isSearching,
    error,
    searchKnowledge,
    clearSearchResults
  }
}
