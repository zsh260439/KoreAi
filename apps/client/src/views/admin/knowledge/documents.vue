<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { ChevronLeft, FileUp, FolderOpen, Pencil, PlayCircle, RefreshCw, Settings2, Trash2 } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useKnowledgeBases } from '@/composables/knowledge/useKnowledgeBases'
import { useKnowledgeChunks } from '@/composables/knowledge/useKnowledgeChunks'
import { useKnowledgeDocuments } from '@/composables/knowledge/useKnowledgeDocuments'
import { useKnowledgeSearch } from '@/composables/knowledge/useKnowledgeSearch'
import { useRetrievalRewritePreference } from '@/composables/knowledge/useRetrievalRewritePreference'
import RetrievalRewriteToggle from '@/components/ui/RetrievalRewriteToggle.vue'
import {
  DEFAULT_STRUCTURE_AWARE_CHUNK_CONFIG,
  type KnowledgeDocument,
  type StructureAwareChunkConfig
} from 'share-type'

type KnowledgeDocumentUploadForm = {
  name: string
  file: File
  chunkConfig?: string
}

type KnowledgeDocumentEditForm = {
  name: string
  chunkConfig?: string
}

const route = useRoute()
const router = useRouter()

const { knowledgeBases, loadKnowledgeBases } = useKnowledgeBases()
const {
  documents,
  loadKnowledgeDocument,
  loadKnowledgeDocuments,
  uploadKnowledgeDocument,
  updateKnowledgeDocument,
  removeKnowledgeDocument
} =
  useKnowledgeDocuments()
const { rebuildKnowledgeChunks } = useKnowledgeChunks()
const {
  searchResults,
  searchDebug,
  isSearching,
  error: searchError,
  searchKnowledge,
  clearSearchResults
} = useKnowledgeSearch()
const { rewriteEnabled, setRewriteEnabled } = useRetrievalRewritePreference()

const kbId = computed(() => String(route.params.kbId || ''))
const knowledgeBase = computed(() => knowledgeBases.value.find((item) => item.id === kbId.value))

const activeTab = ref<'documents' | 'preview'>(
  (route.query.tab as 'documents' | 'preview') || 'documents'
)
const current = ref(1)
const pageSize = 10
const searchInput = ref('')
const keyword = ref('')
const statusFilter = ref<'all' | 'pending' | 'processing' | 'indexed' | 'failed'>('all')
const contentSearchInput = ref('')
const hasSearchedContent = ref(false)

const uploadDialogOpen = ref(false)
const uploadDropRef = ref<{ clearFiles: () => void } | null>(null)
const selectedUploadFile = ref<File | null>(null)
const isSubmittingUpload = ref(false)
const uploadName = ref('')
const uploadTargetChars = ref(String(DEFAULT_STRUCTURE_AWARE_CHUNK_CONFIG.targetChars))
const uploadMaxChars = ref(String(DEFAULT_STRUCTURE_AWARE_CHUNK_CONFIG.maxChars))
const uploadMinChars = ref(String(DEFAULT_STRUCTURE_AWARE_CHUNK_CONFIG.minChars))
const uploadOverlapChars = ref(String(DEFAULT_STRUCTURE_AWARE_CHUNK_CONFIG.overlapChars))

const uploadAccept = '.txt,.md,.docx,.pdf'
const maxUploadFileSizeMb = 20

const editDialogOpen = ref(false)
const isUpdatingDocument = ref(false)
const activeDocumentId = ref('')
const editName = ref('')
const editTargetChars = ref(String(DEFAULT_STRUCTURE_AWARE_CHUNK_CONFIG.targetChars))
const editMaxChars = ref(String(DEFAULT_STRUCTURE_AWARE_CHUNK_CONFIG.maxChars))
const editMinChars = ref(String(DEFAULT_STRUCTURE_AWARE_CHUNK_CONFIG.minChars))
const editOverlapChars = ref(String(DEFAULT_STRUCTURE_AWARE_CHUNK_CONFIG.overlapChars))

const chunkDialogOpen = ref(false)
const isRebuildingChunks = ref(false)
const deleteDialogOpen = ref(false)
const isDeletingDocument = ref(false)

const statusOptions = [
  { value: 'all', label: '全部状态' },
  { value: 'pending', label: '待处理' },
  { value: 'processing', label: '处理中' },
  { value: 'indexed', label: '已索引' },
  { value: 'failed', label: '处理失败' }
] as const

const currentKnowledgeBaseName = computed(() => knowledgeBase.value?.name || '当前知识库')
const currentKnowledgeBaseCode = computed(() => {
  const name = currentKnowledgeBaseName.value.trim()
  return name ? name.toLowerCase().replace(/\s+/g, '_') : kbId.value
})

const activeDocument = computed(() => documents.value.find((item) => item.id === activeDocumentId.value) ?? null)
const activeDocumentName = computed(() => activeDocument.value?.name || '-')

const filteredDocuments = computed(() => {
  const normalized = keyword.value.trim().toLowerCase()
  const list = documents.value.filter((item) => {
    const matchesKeyword = !normalized || item.name.toLowerCase().includes(normalized)
    const matchesStatus = statusFilter.value === 'all' || item.status === statusFilter.value
    return matchesKeyword && matchesStatus
  })

  const total = list.length
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(current.value, pages)
  const start = (currentPage - 1) * pageSize

  return {
    total,
    pages,
    current: currentPage,
    records: list.slice(start, start + pageSize)
  }
})

const previewResults = computed(() => {
  return searchResults.value.map((item) => ({
    ...item,
    scoreLabel: item.score.toFixed(2),
    matchLabel: formatMatchedBy(item.scoreDetail?.matchedBy),
    bm25ScoreLabel: formatNullableScore(item.scoreDetail?.bm25Score),
    vectorScoreLabel: formatNullableScore(item.scoreDetail?.vectorScore),
    fusedScoreLabel: formatNullableScore(item.scoreDetail?.fusedScore)
  }))
})

const previewDebugSummary = computed(() => {
  if (!searchDebug.value) {
    return null
  }

  return {
    ...searchDebug.value,
    rewriteAppliedLabel: searchDebug.value.rewriteApplied ? '已生效' : '未生效',
    branchWeightLabel: `${searchDebug.value.bm25Weight.toFixed(1)} : ${searchDebug.value.vectorWeight.toFixed(1)}`
  }
})

const parseChunkConfig = (
  value?: string | StructureAwareChunkConfig | Record<string, unknown> | null
) => {
  if (!value) return {}

  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, number>
    } catch {
      return {}
    }
  }

  return value as Record<string, number>
}

const buildChunkConfigText = () => {
  return JSON.stringify({
    targetChars: Number(uploadTargetChars.value),
    maxChars: Number(uploadMaxChars.value),
    minChars: Number(uploadMinChars.value),
    overlapChars: Number(uploadOverlapChars.value)
  })
}

const buildEditChunkConfigText = () => {
  return JSON.stringify({
    targetChars: Number(editTargetChars.value),
    maxChars: Number(editMaxChars.value),
    minChars: Number(editMinChars.value),
    overlapChars: Number(editOverlapChars.value)
  })
}

const formatSourceLabel = (value?: string | null) => {
  if (!value) return '-'
  return value.toLowerCase() === 'url' ? '远程 URL' : '本地文件'
}

const formatSize = (value?: number | null) => {
  if (value === undefined || value === null) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '-'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  const hours = String(parsed.getHours()).padStart(2, '0')
  const minutes = String(parsed.getMinutes()).padStart(2, '0')
  const seconds = String(parsed.getSeconds()).padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

const resolveUploadFileName = (value: string) => {
  const dotIndex = value.lastIndexOf('.')
  return dotIndex > 0 ? value.slice(0, dotIndex) : value
}

const formatChunkResultMessage = (prefix: string, chunks: Awaited<ReturnType<typeof rebuildKnowledgeChunks>>) => {
  const ocrPages = new Set(
    chunks.flatMap((chunk) =>
      (chunk.metadata?.blocks ?? [])
        .filter((block) => block.blockType === 'ocr_page' && typeof block.pageNumber === 'number')
        .map((block) => block.pageNumber as number)
    )
  )

  return ocrPages.size > 0
    ? `${prefix}，OCR 识别 ${ocrPages.size} 页，共 ${chunks.length} 个分块`
    : `${prefix}，共 ${chunks.length} 个分块`
}

const validateUploadFile = (file: File) => {
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  const isSupportedType = ['txt', 'md', 'docx', 'pdf'].includes(extension)
  if (!isSupportedType) {
    ElMessage.warning('仅支持 txt、md、docx、pdf 文件')
    return false
  }

  if (file.size > maxUploadFileSizeMb * 1024 * 1024) {
    ElMessage.warning(`单个文件大小不能超过 ${maxUploadFileSizeMb} MB`)
    return false
  }

  return true
}

const clearSelectedUploadFile = () => {
  selectedUploadFile.value = null
  uploadDropRef.value?.clearFiles()
}

const handleUploadFileChange = (file: { name: string; raw?: File }) => {
  if (!file.raw) {
    return
  }

  if (!validateUploadFile(file.raw)) {
    clearSelectedUploadFile()
    return
  }

  selectedUploadFile.value = file.raw
  if (!uploadName.value.trim()) {
    uploadName.value = resolveUploadFileName(file.name)
  }
}

const handleUploadExceed = () => {
  ElMessage.warning('一次只能选择一个文件，请先移除当前文件')
}

const handleSearch = () => {
  current.value = 1
  keyword.value = searchInput.value.trim()
}

const handleContentSearch = async () => {
  const query = contentSearchInput.value.trim()
  if (!query) {
    hasSearchedContent.value = false
    clearSearchResults()
    return
  }

  if (!kbId.value) {
    ElMessage.warning('当前知识库未加载完成')
    return
  }

  hasSearchedContent.value = true

  await searchKnowledge(kbId.value, query, rewriteEnabled.value)
  // 检索完成后只同步 URL 文本，方便从文档详情返回时恢复输入框内容
  router.replace({
    path: route.path,
    query: {
      ...route.query,
      tab: activeTab.value === 'preview' ? 'preview' : undefined,
      text: contentSearchInput.value.trim()
    }
  })
}

const handleClearContentSearch = () => {
  contentSearchInput.value = ''
  hasSearchedContent.value = false
  clearSearchResults()
  router.replace({
    path: route.path,
    query: {
      ...route.query,
      tab: activeTab.value === 'preview' ? 'preview' : undefined,
      text: undefined
    }
  })
}

const handleRefresh = async () => {
  current.value = 1
  await loadKnowledgeDocuments(kbId.value)
}

const resetUploadDialog = () => {
  uploadDialogOpen.value = false
  selectedUploadFile.value = null
  uploadName.value = ''
  uploadTargetChars.value = String(DEFAULT_STRUCTURE_AWARE_CHUNK_CONFIG.targetChars)
  uploadMaxChars.value = String(DEFAULT_STRUCTURE_AWARE_CHUNK_CONFIG.maxChars)
  uploadMinChars.value = String(DEFAULT_STRUCTURE_AWARE_CHUNK_CONFIG.minChars)
  uploadOverlapChars.value = String(DEFAULT_STRUCTURE_AWARE_CHUNK_CONFIG.overlapChars)
  uploadDropRef.value?.clearFiles()
}

const submitUpload = async () => {
  if (isSubmittingUpload.value) return

  if (!selectedUploadFile.value) {
    ElMessage.warning('请先拖拽或选择一个文档文件')
    return
  }

  if (!kbId.value) {
    ElMessage.warning('当前知识库未加载完成')
    return
  }

  const payload: KnowledgeDocumentUploadForm = {
    name: uploadName.value.trim() || resolveUploadFileName(selectedUploadFile.value.name) || '新文档',
    file: selectedUploadFile.value,
    chunkConfig: buildChunkConfigText()
  }

  isSubmittingUpload.value = true

  try {
    const created = await uploadKnowledgeDocument(kbId.value, {
      name: payload.name,
      file: payload.file,
      chunkConfig: payload.chunkConfig ? JSON.parse(payload.chunkConfig) : undefined
    })

    const chunks = await rebuildKnowledgeChunks(created.id)
    const refreshedDocument = await loadKnowledgeDocument(created.id)
    await loadKnowledgeDocuments(kbId.value)
    await loadKnowledgeBases()

    if (refreshedDocument?.status !== 'indexed') {
      throw new Error('文档已上传，但未完成分块')
    }

    ElMessage.success(formatChunkResultMessage('文档已上传', chunks))

    resetUploadDialog()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '文档上传失败，请稍后重试')
  } finally {
    isSubmittingUpload.value = false
  }
}

const openEdit = (document: KnowledgeDocument) => {
  activeDocumentId.value = document.id
  editName.value = document.name

  const config = parseChunkConfig(document.chunkConfig)
  editTargetChars.value = String(
    config.targetChars ?? DEFAULT_STRUCTURE_AWARE_CHUNK_CONFIG.targetChars
  )
  editMaxChars.value = String(config.maxChars ?? DEFAULT_STRUCTURE_AWARE_CHUNK_CONFIG.maxChars)
  editMinChars.value = String(config.minChars ?? DEFAULT_STRUCTURE_AWARE_CHUNK_CONFIG.minChars)
  editOverlapChars.value = String(
    config.overlapChars ?? DEFAULT_STRUCTURE_AWARE_CHUNK_CONFIG.overlapChars
  )
  editDialogOpen.value = true
}

const submitEdit = async () => {
  if (!activeDocument.value || isUpdatingDocument.value) return

  const payload: KnowledgeDocumentEditForm = {
    name: editName.value.trim(),
    chunkConfig: buildEditChunkConfigText()
  }

  isUpdatingDocument.value = true
  try {
    await updateKnowledgeDocument(activeDocument.value.id, {
      name: payload.name,
      chunkConfig: payload.chunkConfig ? JSON.parse(payload.chunkConfig) : undefined
    })
    editDialogOpen.value = false
    ElMessage.success('文档配置已更新')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '文档更新失败')
  } finally {
    isUpdatingDocument.value = false
  }
}

const openChunkConfirm = (document: KnowledgeDocument) => {
  activeDocumentId.value = document.id
  chunkDialogOpen.value = true
}

const submitChunkConfirm = async () => {
  if (!activeDocument.value || isRebuildingChunks.value) return

  isRebuildingChunks.value = true
  try {
    const chunks = await rebuildKnowledgeChunks(activeDocument.value.id)
    chunkDialogOpen.value = false
    await loadKnowledgeDocuments(kbId.value)
    ElMessage.success(formatChunkResultMessage('已完成分块', chunks))
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '文档分块失败')
  } finally {
    isRebuildingChunks.value = false
  }
}

const openDeleteConfirm = (document: KnowledgeDocument) => {
  activeDocumentId.value = document.id
  deleteDialogOpen.value = true
}

const submitDeleteConfirm = async () => {
  if (!activeDocument.value || isDeletingDocument.value) return

  isDeletingDocument.value = true
  try {
    await removeKnowledgeDocument(activeDocument.value.id)
    await loadKnowledgeBases()
    deleteDialogOpen.value = false
    ElMessage.success('文档已删除')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '文档删除失败')
  } finally {
    isDeletingDocument.value = false
  }
}

const openChunkLog = (document: KnowledgeDocument) => {
  router.push(`/admin/knowledge/${kbId.value}/docs/${document.id}`)
}

const openSearchHitDocument = (documentId: string, chunkId: string) => {
  router.push({
    path: `/admin/knowledge/${kbId.value}/docs/${documentId}`,
    query: {
      chunkId,
      text: contentSearchInput.value.trim()
    }
  })
}

// 从文档页跳到参数页时带上 kbId，避免用户还要重新选择知识库。
const openKnowledgeSettings = () => {
  router.push({
    path: '/admin/knowledge-settings',
    query: {
      kbId: kbId.value || undefined
    }
  })
}

const getPreviewScoreTone = (score: number) => {
  if (score >= 80) return 'success'
  if (score >= 60) return 'warning'
  return 'info'
}

const formatMatchedBy = (matchedBy?: string[]) => {
  if (!matchedBy?.length) return '未标记'
  return matchedBy
    .map((item) => {
      if (item === 'bm25') return 'BM25'
      if (item === 'vector') return '向量'
      return item
    })
    .join(' + ')
}

const formatNullableScore = (value?: number | null) => {
  return typeof value === 'number' ? value.toFixed(4) : '-'
}
watch(activeTab,(val)=>{
    if(val === 'documents'){
       router.replace({
         path:route.path
       })
    }
})
onMounted(async () => {
  if (!knowledgeBases.value.length) {
    await loadKnowledgeBases()
  }
  await loadKnowledgeDocuments(kbId.value)
  // 刷新进入页面时只恢复输入框文本，不自动发起检索，避免无意识触发一次搜索
  if (route.query.text) {
    contentSearchInput.value = route.query.text as string
  }
})
</script>

<template>
  <section class="doc-stage">
    <div class="doc-stage__canvas">
      <div class="doc-stage__toolbar">
        <div class="doc-stage__path">
          <button class="doc-stage__back" type="button" @click="router.push('/admin/knowledge')">
            <ChevronLeft class="h-4 w-4" />
            返回列表
          </button>
          <span class="doc-stage__divider">/</span>
          <span>{{ currentKnowledgeBaseName }}</span>
          <span class="doc-stage__divider">/</span>
          <span>文档管理</span>
        </div>

        <div class="doc-stage__actions">
          <el-button @click="openKnowledgeSettings">
            <Settings2 class="h-4 w-4" />
            检索参数
          </el-button>
          <el-button @click="handleRefresh">
            <RefreshCw class="h-4 w-4" />
            刷新
          </el-button>
          <el-button type="primary" @click="uploadDialogOpen = true">
            <FileUp class="h-4 w-4" />
            上传文档
          </el-button>
        </div>
      </div>

      <div class="doc-stage__headline">
        <h1 class="doc-stage__title">{{ currentKnowledgeBaseName }}</h1>
        <p class="doc-stage__subtitle">{{ currentKnowledgeBaseCode }}</p>
      </div>

      <div class="doc-tabs" role="tablist" aria-label="文档管理切换">
        <button
          type="button"
          class="doc-tab"
          :class="{ 'doc-tab--active': activeTab === 'documents' }"
          @click="activeTab = 'documents'"
        >
          文档列表
        </button>
        <button
          type="button"
          class="doc-tab"
          :class="{ 'doc-tab--active': activeTab === 'preview' }"
          @click="activeTab = 'preview'"
        >
          命中测试 (RAG Preview)
        </button>
      </div>

      <div v-if="activeTab === 'preview'" class="preview-panel">
        <div class="preview-panel__header">
          <div>
            <div class="preview-panel__eyebrow">RAG PREVIEW</div>
            <h2 class="preview-panel__title">Chunk recall cockpit</h2>
          </div>
          <div class="preview-panel__stat">
            <span>{{ hasSearchedContent ? previewResults.length : documents.length }}</span>
            <small>{{ hasSearchedContent ? 'hits' : 'docs' }}</small>
          </div>
        </div>

        <div class="preview-workbench">
          <div class="preview-query">
            <div class="preview-query__label">QUERY</div>
            <RetrievalRewriteToggle
              :model-value="rewriteEnabled"
              label="LLM Rewrite"
              hint="对检索问句先做语义改写，再进入 BM25 / 向量召回"
              @update:model-value="setRewriteEnabled"
            />
            <textarea
              v-model="contentSearchInput"
              class="preview-query__input"
              placeholder="输入一个真实问题，直接测试当前知识库的 chunk 召回效果..."
              rows="4"
              @keydown.ctrl.enter.prevent="handleContentSearch"
            />
            <div class="preview-query__actions">
              <el-button
                class="preview-query__button"
                type="primary"
                :loading="isSearching"
                @click="handleContentSearch"
              >
                {{ isSearching ? '检索中' : '检索' }}
              </el-button>
              <button
                v-if="contentSearchInput || hasSearchedContent"
                class="preview-query__clear"
                type="button"
                @click="handleClearContentSearch"
              >
                清空
              </button>
            </div>

            <div v-if="previewDebugSummary" class="preview-debug">
              <div class="preview-debug__header">
                <span>检索调试信息</span>
                <span>{{ previewDebugSummary.rewriteAppliedLabel }}</span>
              </div>

              <div class="preview-debug__stats">
                <div class="preview-debug__stat">
                  <small>融合权重</small>
                  <strong>{{ previewDebugSummary.branchWeightLabel }}</strong>
                </div>
                <div class="preview-debug__stat">
                  <small>BM25 命中数</small>
                  <strong>{{ previewDebugSummary.bm25HitCount }}</strong>
                </div>
                <div class="preview-debug__stat">
                  <small>向量命中数</small>
                  <strong>{{ previewDebugSummary.vectorHitCount }}</strong>
                </div>
                <div class="preview-debug__stat">
                  <small>检索模式</small>
                  <strong>{{ previewDebugSummary.retrievalMode }}</strong>
                </div>
              </div>

              <div class="preview-debug__block">
                <label>原始问题</label>
                <div class="preview-debug__value">{{ previewDebugSummary.originalQuery }}</div>
              </div>

              <div class="preview-debug__block">
                <label>归一化问题</label>
                <div class="preview-debug__value">{{ previewDebugSummary.normalizedQuery }}</div>
              </div>

              <div class="preview-debug__block">
                <label>BM25 检索词</label>
                <div class="preview-debug__value">{{ previewDebugSummary.bm25Query }}</div>
              </div>

              <div class="preview-debug__block">
                <label>向量检索词</label>
                <div class="preview-debug__value">{{ previewDebugSummary.vectorQuery }}</div>
              </div>
            </div>
          </div>

          <div class="preview-results">
            <div class="preview-results__topline">
              <span>命中文档片段</span>
              <span>{{ hasSearchedContent ? `${previewResults.length} 条` : '等待检索' }}</span>
            </div>

            <div v-if="searchError" class="preview-panel__error">{{ searchError }}</div>

            <div v-if="hasSearchedContent">
              <div v-if="!previewResults.length && !isSearching" class="preview-results__empty">
                当前知识库下没有命中内容
              </div>

              <div v-else class="preview-results__list">
                <article v-for="item in previewResults" :key="item.chunkId" class="preview-result">
                  <div class="preview-result__score" :class="`preview-score--${getPreviewScoreTone(item.score)}`">
                    {{ item.scoreLabel }}
                  </div>

                  <div class="preview-result__main">
                    <div class="preview-result__top">
                      <span class="preview-result__source">{{ item.documentName }}</span>
                      <el-button
                        link
                        type="primary"
                        class="preview-result__link"
                        @click="openSearchHitDocument(item.documentId, item.chunkId)"
                      >
                        查看文档
                      </el-button>
                    </div>

                    <div class="preview-result__content">{{ item.content }}</div>

                    <div class="preview-result__meta">
                      <span>{{ item.chunkId }}</span>
                      <span>{{ item.matchLabel }}</span>
                    </div>

                    <div class="preview-result__scores">
                      <span>BM25 原始分 {{ item.bm25ScoreLabel }}</span>
                      <span>向量原始分 {{ item.vectorScoreLabel }}</span>
                      <span>RRF 原始分 {{ item.fusedScoreLabel }}</span>
                    </div>
                  </div>
                </article>
              </div>
            </div>

            <div v-else class="preview-results__placeholder">
              <span>EMPTY RECALL</span>
              <strong>还没有发起命中测试</strong>
              <p>左侧输入问题后，这里会直接展示召回片段和融合排序分。</p>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="doc-panel">
        <div class="doc-panel__header">
          <div>
            <h2 class="doc-panel__title">文档列表</h2>
            <p class="doc-panel__desc">
              当前支持拖拽上传 txt / md / docx / pdf 文档，文件会先上传到服务端，再按结构化规则切块并进入知识库。这里的搜索只按文档名称筛选，不会搜索正文内容。
            </p>
          </div>

          <div class="doc-toolbar">
            <el-input v-model="searchInput" placeholder="搜索文档名称" clearable class="!w-[320px]" />
            <el-button @click="handleSearch">搜索</el-button>
            <el-select v-model="statusFilter" placeholder="全部状态" class="!w-[160px]" @change="current = 1">
              <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </div>
        </div>

        <div class="doc-panel__body">
          <el-table :data="filteredDocuments.records" row-key="id">
            <el-table-column label="文档" min-width="280">
              <template #default="{ row }">
                <div class="flex items-center gap-2">
                  <FolderOpen class="h-4 w-4 shrink-0 text-slate-400" />
                  <el-button link type="primary" class="!px-0" @click="router.push(`/admin/knowledge/${kbId}/docs/${row.id}`)">
                    {{ row.name }}
                  </el-button>
                </div>
              </template>
            </el-table-column>

            <el-table-column label="来源" width="140">
              <template #default="{ row }">{{ formatSourceLabel(row.sourceType) }}</template>
            </el-table-column>

            <el-table-column label="状态" width="140">
              <template #default="{ row }">
                <div class="inline-flex items-center gap-2 text-sm text-slate-600">
                  <span class="status-dot" :class="`status-dot--${row.status}`" />
                  <span>{{ row.status }}</span>
                </div>
              </template>
            </el-table-column>

            <el-table-column label="分块数" width="96">
              <template #default="{ row }">{{ row.chunkCount ?? 0 }}</template>
            </el-table-column>

            <el-table-column label="类型" width="110">
              <template #default="{ row }">{{ row.fileType || '-' }}</template>
            </el-table-column>

            <el-table-column label="大小" width="110">
              <template #default="{ row }">{{ formatSize(row.fileSizeBytes) }}</template>
            </el-table-column>

            <el-table-column label="更新时间" width="180">
              <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
            </el-table-column>

            <el-table-column label="操作" width="160" align="right">
              <template #default="{ row }">
                <div class="flex items-center justify-end gap-1">
                  <el-button link @click="openEdit(row)" title="编辑">
                    <Pencil class="h-4 w-4" />
                  </el-button>
                  <el-button link @click="openChunkConfirm(row)" title="重新分块">
                    <PlayCircle class="h-4 w-4" />
                  </el-button>
                  <el-button link @click="openChunkLog(row)" title="查看分块">
                    <FolderOpen class="h-4 w-4" />
                  </el-button>
                  <el-button link @click="openDeleteConfirm(row)" title="删除">
                    <Trash2 class="h-4 w-4" />
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>

          <div class="doc-footer">
            <span>共 {{ filteredDocuments.total }} 条</span>
            <div class="flex items-center gap-3">
              <el-button :disabled="filteredDocuments.current <= 1" @click="current = Math.max(1, current - 1)">
                上一页
              </el-button>
              <span>{{ filteredDocuments.current }} / {{ filteredDocuments.pages }}</span>
              <el-button
                :disabled="filteredDocuments.current >= filteredDocuments.pages"
                @click="current = Math.min(filteredDocuments.pages, current + 1)"
              >
                下一页
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <el-dialog v-model="uploadDialogOpen" title="上传文档" width="640px" destroy-on-close>
      <div class="space-y-4">
        <div>
          <div class="mb-2 text-sm font-medium text-slate-900">文档名称</div>
          <el-input v-model="uploadName" placeholder="默认取上传文件名，可手动调整" />
        </div>

        <div>
          <div class="mb-2 text-sm font-medium text-slate-900">上传文件</div>
          <el-upload
            ref="uploadDropRef"
            class="upload-dropzone"
            drag
            action="#"
            :auto-upload="false"
            :show-file-list="false"
            :limit="1"
            :accept="uploadAccept"
            :on-change="handleUploadFileChange"
            :on-exceed="handleUploadExceed"
          >
            <div class="upload-dropzone__inner">
              <FileUp class="upload-dropzone__icon" />
              <p class="upload-dropzone__title">拖拽文件到这里，或点击选择文件</p>
              <p class="upload-dropzone__hint">支持 txt / md / docx / pdf，单文件不超过 {{ maxUploadFileSizeMb }} MB</p>
            </div>
          </el-upload>

          <div v-if="selectedUploadFile" class="upload-selected-file">
            <div>
              <div class="upload-selected-file__name">{{ selectedUploadFile.name }}</div>
              <div class="upload-selected-file__meta">{{ formatSize(selectedUploadFile.size) }}</div>
            </div>
            <el-button text @click="clearSelectedUploadFile">移除</el-button>
          </div>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <div class="mb-2 text-sm font-medium text-slate-900">targetChars</div>
            <el-input v-model="uploadTargetChars" />
          </div>
          <div>
            <div class="mb-2 text-sm font-medium text-slate-900">maxChars</div>
            <el-input v-model="uploadMaxChars" />
          </div>
          <div>
            <div class="mb-2 text-sm font-medium text-slate-900">minChars</div>
            <el-input v-model="uploadMinChars" />
          </div>
          <div>
            <div class="mb-2 text-sm font-medium text-slate-900">overlapChars</div>
            <el-input v-model="uploadOverlapChars" />
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <el-button @click="resetUploadDialog">取消</el-button>
          <el-button type="primary" :loading="isSubmittingUpload" :disabled="!selectedUploadFile" @click="submitUpload">
            开始上传
          </el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="editDialogOpen" title="编辑文档" width="700px" destroy-on-close>
      <div v-if="activeDocument" class="space-y-4">
        <p class="text-sm text-slate-500">当前只更新稳定字段：文档名称和分块配置。</p>

        <div>
          <div class="mb-2 text-sm font-medium text-slate-900">文档名称</div>
          <el-input v-model="editName" />
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <div class="mb-2 text-sm font-medium text-slate-900">targetChars</div>
            <el-input v-model="editTargetChars" />
          </div>
          <div>
            <div class="mb-2 text-sm font-medium text-slate-900">maxChars</div>
            <el-input v-model="editMaxChars" />
          </div>
          <div>
            <div class="mb-2 text-sm font-medium text-slate-900">minChars</div>
            <el-input v-model="editMinChars" />
          </div>
          <div>
            <div class="mb-2 text-sm font-medium text-slate-900">overlapChars</div>
            <el-input v-model="editOverlapChars" />
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <el-button @click="editDialogOpen = false">关闭</el-button>
          <el-button type="primary" :loading="isUpdatingDocument" :disabled="!editName.trim()" @click="submitEdit">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="chunkDialogOpen" title="重新分块" width="460px" destroy-on-close>
      <div class="space-y-2 text-sm">
        <p>文档 [{{ activeDocumentName }}] 当前已有 {{ activeDocument?.chunkCount ?? 0 }} 条分块记录。</p>
        <p class="text-[#f59e0b]">重新分块会清空旧 chunk，再按当前分块配置重新生成。</p>
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <el-button @click="chunkDialogOpen = false">取消</el-button>
          <el-button type="primary" :loading="isRebuildingChunks" @click="submitChunkConfirm">确认</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="deleteDialogOpen" title="删除文档" width="420px" destroy-on-close>
      <p class="text-sm leading-6 text-slate-500">删除后不可恢复，确认删除当前文档吗？</p>
      <template #footer>
        <div class="flex justify-end gap-3">
          <el-button @click="deleteDialogOpen = false">取消</el-button>
          <el-button type="danger" :loading="isDeletingDocument" @click="submitDeleteConfirm">删除</el-button>
        </div>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.doc-stage {
  position: relative;
  width: 100%;
  overflow-x: clip;
  padding: 4px 0 32px;
  isolation: isolate;
  color: #252522;
}

.doc-stage::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  background:
    radial-gradient(circle at 16% 10%, rgba(91, 91, 247, 0.055), transparent 28%),
    radial-gradient(circle at 62% 4%, rgba(91, 91, 247, 0.025), transparent 22%);
}

.doc-stage__canvas {
  margin: 0 auto;
  width: 100%;
  max-width: 1320px;
  min-height: calc(100vh - 190px);
  padding: 24px 28px 36px;
}

.doc-stage__toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  border-bottom: 1px solid #e3e3dd;
  padding-bottom: 16px;
}

.doc-stage__path {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #777770;
}

.doc-stage__back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  padding: 0;
  color: #4f4fd8;
  cursor: pointer;
}

.doc-stage__divider {
  color: #98a2b3;
}

.doc-stage__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.doc-stage__headline {
  margin-top: 32px;
}

.doc-stage__title {
  margin: 0;
  font: 600 32px / 1.2 ui-serif, Georgia, "Songti SC", serif;
  letter-spacing: -0.03em;
  color: #20201d;
}

.doc-stage__subtitle {
  margin-top: 8px;
  font-size: 14px;
  color: #777770;
}

.doc-tabs {
  margin-top: 30px;
  display: flex;
  flex-wrap: wrap;
  gap: 26px;
  border-bottom: 1px solid #e3e3dd;
}

.doc-tab {
  position: relative;
  border: 0;
  background: transparent;
  padding: 0 0 11px;
  font: 500 15px ui-serif, Georgia, "Songti SC", serif;
  color: #686861;
  cursor: pointer;
}

.doc-tab--active {
  color: #4f4fd8;
  font-weight: 600;
}

.doc-tab--active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: #5b5bf7;
}

.preview-panel,
.doc-panel {
  margin-top: 24px;
}

.preview-panel {
  position: relative;
  overflow: hidden;
  border: 1px solid #d6dee8;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.06);
  min-height: 640px;
}

.preview-panel__header {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  border-bottom: 1px solid #dbe4ee;
  background: #f8fafc;
  padding: 20px 24px 18px;
}

.preview-panel__eyebrow {
  font-size: 12px;
  font-weight: 800;
  color: #0f766e;
}

.preview-panel__title {
  margin-top: 4px;
  font-size: 28px;
  font-weight: 800;
  color: #0f172a;
}

.preview-panel__stat {
  display: grid;
  min-width: 92px;
  border-left: 2px solid #0f766e;
  padding-left: 16px;
  text-align: left;
}

.preview-panel__stat span {
  font-size: 30px;
  font-weight: 800;
  line-height: 1;
  color: #0f172a;
}

.preview-panel__stat small {
  margin-top: 6px;
  color: #64748b;
}

.preview-workbench {
  position: relative;
  display: grid;
  grid-template-columns: minmax(340px, 420px) minmax(0, 1fr);
  min-height: 360px;
}

.preview-query {
  display: grid;
  align-content: start;
  gap: 16px;
  border-right: 1px solid #dbe4ee;
  background: #fbfdff;
  padding: 24px;
}

.preview-query__label,
.preview-results__placeholder span {
  font-size: 12px;
  font-weight: 800;
  color: #0f766e;
}

.preview-query__input {
  width: 100%;
  min-height: 210px;
  resize: none;
  border: 0;
  border-left: 3px solid #0f766e;
  background: #f8fafc;
  padding: 16px 18px 16px 20px;
  font-size: 16px;
  line-height: 1.75;
  color: #0f172a;
  outline: none;
}

.preview-query__input::placeholder {
  color: #94a3b8;
}

.preview-query__input:focus {
  background: #ffffff;
  box-shadow: inset 0 0 0 1px #0f766e;
}

.preview-query__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
}

.preview-query__button {
  min-width: 112px;
  border: 0;
  background: #0f172a;
  padding: 12px 22px;
  font-size: 15px;
  font-weight: 700;
  color: #ffffff;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    background 0.18s ease;
}

.preview-query__button:hover {
  background: #0f766e;
}

.preview-query__button:active {
  transform: translateY(1px);
}

.preview-query__button:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.preview-query__clear {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  padding: 12px 18px;
  font-size: 14px;
  font-weight: 700;
  color: #475569;
  cursor: pointer;
}

.preview-debug {
  display: grid;
  gap: 12px;
  border: 1px solid #dbe4ee;
  background: #ffffff;
  padding: 14px;
}

.preview-debug__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  font-weight: 800;
  color: #0f766e;
}

.preview-debug__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.preview-debug__stat {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  padding: 10px 12px;
}

.preview-debug__stat small,
.preview-debug__block label {
  display: block;
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
}

.preview-debug__stat strong {
  display: block;
  margin-top: 6px;
  font-size: 14px;
  color: #0f172a;
}

.preview-debug__block {
  display: grid;
  gap: 6px;
}

.preview-debug__value {
  border-left: 2px solid #99f6e4;
  background: #f8fafc;
  padding: 9px 10px 9px 12px;
  font-size: 13px;
  line-height: 1.6;
  color: #1f2937;
  white-space: pre-wrap;
  word-break: break-word;
}

.preview-panel__error {
  margin: 16px 0 0;
  border-left: 3px solid #dc2626;
  background: #fef2f2;
  padding: 12px 14px;
  font-size: 13px;
  color: #dc2626;
}

.preview-results {
  min-width: 0;
  background: #f8fafc;
  padding: 24px;
}

.preview-results__topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  color: #475569;
  font-size: 13px;
  font-weight: 700;
}

.preview-results__list {
  display: grid;
  gap: 12px;
  max-height: 540px;
  overflow: auto;
  padding-right: 8px;
}

.preview-results__empty,
.preview-results__placeholder {
  background: #ffffff;
  padding: 28px;
  font-size: 14px;
  color: #64748b;
}

.preview-results__placeholder {
  display: grid;
  align-content: center;
  min-height: 238px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(255, 255, 255, 0.68)),
    #f8fafc;
  border: 1px solid rgba(226, 232, 240, 0.72);
}

.preview-results__placeholder strong {
  margin-top: 12px;
  font-size: 24px;
  color: #0f172a;
}

.preview-results__placeholder p {
  margin-top: 10px;
  max-width: 360px;
}

.preview-result {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 16px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  padding: 16px;
}

.preview-result__score {
  display: grid;
  place-items: center;
  align-self: stretch;
  min-height: 74px;
  font-size: 19px;
  font-weight: 800;
}

.preview-result__main {
  min-width: 0;
}

.preview-result__top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.preview-score--success {
  background: #ccfbf1;
  color: #0f766e;
}

.preview-score--warning {
  background: #fef3c7;
  color: #b45309;
}

.preview-score--info {
  background: #e2e8f0;
  color: #334155;
}

.preview-result__source,
.preview-result__meta {
  font-size: 14px;
  color: #667085;
}

.preview-result__content {
  margin-top: 14px;
  border-left: 2px solid #cbd5e1;
  background: #f8fafc;
  padding: 12px 14px;
  line-height: 1.8;
  color: #334155;
  white-space: pre-wrap;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}

.preview-result__meta {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preview-result__scores {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-top: 10px;
  font-size: 12px;
  color: #475569;
}


.doc-panel {
  min-width: 0;
  border-top: 1px solid #deded8;
  border-bottom: 1px solid #deded8;
  background: #fafaf7;
  overflow: hidden;
}

.doc-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 32px;
  padding: 20px 4px 18px;
  border-bottom: 1px solid #e7e7e1;
}

.doc-panel__title {
  margin: 0;
  font: 600 17px ui-serif, Georgia, "Songti SC", serif;
  color: #292925;
}

.doc-panel__desc {
  max-width: 70ch;
  margin-top: 4px;
  font-size: 13px;
  line-height: 1.65;
  color: #777770;
}

.doc-toolbar {
  display: flex;
  flex: none;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.doc-panel__body {
  min-width: 0;
  overflow: hidden;
  padding: 0 0 16px;
}

.doc-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 4px 0;
  color: #777770;
  font-size: 13px;
}

:deep(.doc-panel .el-table) {
  --el-table-bg-color: #fafaf7;
  --el-table-tr-bg-color: #fafaf7;
  --el-table-row-hover-bg-color: #f3f3ef;
  --el-table-border-color: #e7e7e1;
  --el-table-text-color: #3d3d38;
  --el-table-header-text-color: #686861;
}

:deep(.doc-panel .el-table__header th.el-table__cell) {
  background: #f4f4f0;
  font-weight: 600;
}

:deep(.doc-panel .el-table__inner-wrapper::before) {
  display: none;
}

:deep(.doc-panel .el-button.is-link) {
  color: #5555d8;
}

.upload-dropzone :deep(.el-upload) {
  width: 100%;
}

.upload-dropzone :deep(.el-upload-dragger) {
  width: 100%;
  border: 1px dashed #cbd5e1;
  border-radius: 16px;
  background: #f8fafc;
  padding: 0;
}

.upload-dropzone__inner {
  display: grid;
  gap: 8px;
  place-items: center;
  padding: 28px 20px;
  text-align: center;
}

.upload-dropzone__icon {
  width: 24px;
  height: 24px;
  color: #0f766e;
}

.upload-dropzone__title {
  font-size: 15px;
  font-weight: 600;
  color: #0f172a;
}

.upload-dropzone__hint {
  font-size: 13px;
  color: #64748b;
}

.upload-selected-file {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  border: 1px solid #dbe4ee;
  border-radius: 12px;
  background: #ffffff;
  padding: 12px 14px;
}

.upload-selected-file__name {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}

.upload-selected-file__meta {
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  background: #cbd5e1;
}

.status-dot--indexed {
  background: #5f9c72;
}

.status-dot--processing {
  background: #60a5fa;
}

.status-dot--failed {
  background: #ef4444;
}

.status-dot--pending {
  background: #94a3b8;
}

@media (max-width: 1100px) {
  .doc-stage__toolbar,
  .doc-panel__header {
    flex-direction: column;
  }

  .doc-stage__actions,
  .doc-toolbar {
    justify-content: flex-start;
  }

  .doc-toolbar {
    flex-wrap: wrap;
  }

  .preview-workbench {
    grid-template-columns: 1fr;
  }

  .preview-query {
    border-right: 0;
    border-bottom: 1px solid #dbe4ee;
  }
}

@media (max-width: 768px) {
  .doc-stage__canvas {
    padding: 20px 16px 28px;
  }

  .doc-tabs {
    gap: 18px;
  }

  .preview-result__top,
  .doc-footer {
    flex-direction: column;
    align-items: flex-start;
  }

  .preview-panel__header,
  .preview-query,
  .preview-results {
    padding: 18px;
  }

  .preview-debug__stats {
    grid-template-columns: 1fr;
  }

  .preview-result {
    grid-template-columns: 1fr;
  }

  .preview-result__score {
    min-height: 48px;
  }
}
</style>
