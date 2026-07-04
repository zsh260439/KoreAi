<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { ChevronLeft, FileUp, FolderOpen, Pencil, PlayCircle, RefreshCw, Trash2 } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useKnowledgeBases } from '@/composables/useKnowledgeBases'
import { useKnowledgeChunks } from '@/composables/useKnowledgeChunks'
import { useKnowledgeDocuments } from '@/composables/useKnowledgeDocuments'
import { useKnowledgeSearch } from '@/composables/useKnowledgeSearch'
import type { KnowledgeDocument } from 'share-type'

type KnowledgeDocumentUploadForm = {
  name: string
  storagePath: string
  chunkStrategy: string
  chunkConfig?: string
}

type KnowledgeDocumentEditForm = {
  name: string
  chunkStrategy: string
  chunkConfig?: string
}

const route = useRoute()
const router = useRouter()

const { knowledgeBases, loadKnowledgeBases } = useKnowledgeBases()
const { documents, loadKnowledgeDocuments, createKnowledgeDocument, updateKnowledgeDocument, removeKnowledgeDocument } =
  useKnowledgeDocuments()
const { rebuildKnowledgeChunks } = useKnowledgeChunks()
const { searchResults, isSearching, error: searchError, searchKnowledge, clearSearchResults } = useKnowledgeSearch()

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
const uploadName = ref('')
const uploadStoragePath = ref('')
const uploadChunkStrategy = ref<'structure_aware'>('structure_aware')
const uploadTargetChars = ref('1400')
const uploadMaxChars = ref('1800') 
const uploadMinChars = ref('600')
const uploadOverlapChars = ref('0')

const editDialogOpen = ref(false)
const activeDocumentId = ref('')
const editName = ref('')
const editChunkStrategy = ref<'structure_aware'>('structure_aware')
const editTargetChars = ref('1400')
const editMaxChars = ref('1800')
const editMinChars = ref('600')
const editOverlapChars = ref('0')

const chunkDialogOpen = ref(false)
const deleteDialogOpen = ref(false)

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

// 数据库查询文档列表
const filteredDocuments = computed(() => {
  const normalized = keyword.value.trim().toLowerCase()
  const list = documents.value.filter((item) => {
    const matchesKeyword =
      !normalized || [item.name, item.summary || ''].some((value) => value.toLowerCase().includes(normalized))
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

// 搜索结果补充展示字段，直接显示后端返回的融合排序分
const previewResults = computed(() => {
  return searchResults.value.map((item) => ({
    ...item,
    scoreLabel: item.score.toFixed(2)
  }))
})

// 解析分块配置
const parseChunkConfig = (value?: string | Record<string, unknown> | null) => {
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

// 构建上传分块配置文本
const buildChunkConfigText = () => {
  return JSON.stringify({
    targetChars: Number(uploadTargetChars.value),
    maxChars: Number(uploadMaxChars.value),
    minChars: Number(uploadMinChars.value),
    overlapChars: Number(uploadOverlapChars.value)
  })
}

// 构建编辑分块配置文本
const buildEditChunkConfigText = () => {
  return JSON.stringify({
    targetChars: Number(editTargetChars.value),
    maxChars: Number(editMaxChars.value),
    minChars: Number(editMinChars.value),
    overlapChars: Number(editOverlapChars.value)
  })
}

// 格式化文档来源标签
const formatSourceLabel = (value?: string | null) => {
  if (!value) return '-'
  return value.toLowerCase() === 'url' ? '远程 URL' : '本地文件'
}

// 格式化文档大小
const formatSize = (value?: number | null) => {
  if (value === undefined || value === null) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

// 处理文档名称搜索
const handleSearch = () => {
  current.value = 1
  keyword.value = searchInput.value.trim()
}

// 处理知识库内容搜索
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

  await searchKnowledge(kbId.value, query)
   router.replace({
    path: route.path,
    query: {
      ...route.query,
      tab: activeTab.value === 'preview' ? 'preview' : undefined,
      text: contentSearchInput.value.trim()
    }
  })
}

// 清除内容搜索结果
const handleClearContentSearch = () => {
  contentSearchInput.value = ''
  hasSearchedContent.value = false
  clearSearchResults()
}

// 刷新文档列表
const handleRefresh = async () => {
  current.value = 1
  await loadKnowledgeDocuments(kbId.value)
}

// 重置上传对话框
const resetUploadDialog = () => {
  uploadDialogOpen.value = false
  uploadName.value = ''
  uploadStoragePath.value = ''
  uploadChunkStrategy.value = 'structure_aware'
  uploadTargetChars.value = '1400'
  uploadMaxChars.value = '1800'
  uploadMinChars.value = '600'
  uploadOverlapChars.value = '0'
}

// 提交上传文档
const submitUpload = async () => {
  const payload: KnowledgeDocumentUploadForm = {
    name: uploadName.value.trim() || '新文档',
    storagePath: uploadStoragePath.value.trim(),
    chunkStrategy: uploadChunkStrategy.value,
    chunkConfig: buildChunkConfigText()
  }

  await createKnowledgeDocument(kbId.value, {
    name: payload.name,
    storagePath: payload.storagePath,
    chunkStrategy: payload.chunkStrategy,
    chunkConfig: payload.chunkConfig ? JSON.parse(payload.chunkConfig) : undefined
  })

  await loadKnowledgeBases()
  ElMessage.success('文档已创建')
  resetUploadDialog()
}

// 打开编辑对话框
const openEdit = (document: KnowledgeDocument) => {
  activeDocumentId.value = document.id
  editName.value = document.name
  editChunkStrategy.value = 'structure_aware'

  const config = parseChunkConfig(document.chunkConfig)
  editTargetChars.value = String(config.targetChars ?? 1400)
  editMaxChars.value = String(config.maxChars ?? 1800)
  editMinChars.value = String(config.minChars ?? 600)
  editOverlapChars.value = String(config.overlapChars ?? 0)
  editDialogOpen.value = true
}

// 提交编辑文档
const submitEdit = async () => {
  if (!activeDocument.value) return

  const payload: KnowledgeDocumentEditForm = {
    name: editName.value.trim(),
    chunkStrategy: editChunkStrategy.value,
    chunkConfig: buildEditChunkConfigText()
  }

  await updateKnowledgeDocument(activeDocument.value.id, {
    name: payload.name,
    chunkStrategy: payload.chunkStrategy,
    chunkConfig: payload.chunkConfig ? JSON.parse(payload.chunkConfig) : undefined
  })

  editDialogOpen.value = false
  ElMessage.success('文档配置已更新')
}

// 打开重建分块确认框
const openChunkConfirm = (document: KnowledgeDocument) => {
  activeDocumentId.value = document.id
  chunkDialogOpen.value = true
}

// 提交重建分块
const submitChunkConfirm = async () => {
  if (!activeDocument.value) return

  await rebuildKnowledgeChunks(activeDocument.value.id)
  await loadKnowledgeDocuments(kbId.value)
  chunkDialogOpen.value = false
  ElMessage.success('已重新执行分块')
}

// 打开删除确认框
const openDeleteConfirm = (document: KnowledgeDocument) => {
  activeDocumentId.value = document.id
  deleteDialogOpen.value = true
}

// 提交删除确认
const submitDeleteConfirm = async () => {
  if (!activeDocument.value) return

  await removeKnowledgeDocument(activeDocument.value.id)
  await loadKnowledgeBases()
  deleteDialogOpen.value = false
  ElMessage.success('文档已删除')
}

// 打开分块详情页
const openChunkLog = (document: KnowledgeDocument) => {
  router.push(`/admin/knowledge/${kbId.value}/docs/${document.id}`)
}

// 打开搜索命中文档
const openSearchHitDocument = (documentId: string, chunkId: string) => {
  router.push({
    path: `/admin/knowledge/${kbId.value}/docs/${documentId}`,
    query: {
      chunkId,
      text: contentSearchInput.value.trim()
    }
  })
}

const getPreviewScoreTone = (score: number) => {
  if (score >= 80) return 'success'
  if (score >= 60) return 'warning'
  return 'info'
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
  if (route.query.text) {
    contentSearchInput.value = route.query.text as string
    handleContentSearch()
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
          <el-button @click="handleRefresh">
            <RefreshCw class="h-4 w-4" />
            刷新
          </el-button>
          <el-button type="primary" @click="uploadDialogOpen = true">
            <FileUp class="h-4 w-4" />
            新建文档
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
        <div class="preview-search">
          <div class="preview-search__box">
            <input
              v-model="contentSearchInput"
              class="preview-search__input"
              type="text"
              placeholder="输入问题，测试知识库召回效果..."
              @keyup.enter="handleContentSearch"
            />
            <button class="preview-search__button" type="button" :disabled="isSearching" @click="handleContentSearch">
              {{ isSearching ? '检索中...' : '检索' }}
            </button>
          </div>

          <button
            v-if="contentSearchInput || hasSearchedContent"
            class="preview-search__clear"
            type="button"
            @click="handleClearContentSearch"
          >
            清空结果
          </button>
        </div>

        <div class="preview-search__hint">这里搜索的是当前知识库内已切分的 chunk 内容，不是文档名称。</div>

        <div v-if="searchError" class="preview-panel__error">{{ searchError }}</div>

        <div v-if="hasSearchedContent" class="preview-results">
          <div v-if="!previewResults.length && !isSearching" class="preview-results__empty">
            当前知识库下没有命中内容
          </div>

          <div v-else class="preview-results__list">
            <article v-for="item in previewResults" :key="item.chunkId" class="preview-result">
              <div class="preview-result__top">
                <div class="preview-result__info">
                  <span class="preview-score" :class="`preview-score--${getPreviewScoreTone(item.score)}`">
                    融合排序分: {{ item.scoreLabel }}
                  </span>
                  <span class="preview-result__source">来源: {{ item.documentName }}</span>
                </div>

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
                <span>Chunk ID: {{ item.chunkId }}</span>
              </div>
            </article>
          </div>
        </div>

        <div v-else class="preview-results__placeholder">输入问题后，这里会展示当前知识库内命中的文档片段。</div>
      </div>

      <div v-else class="doc-panel">
        <div class="doc-panel__header">
          <div>
            <h2 class="doc-panel__title">文档列表</h2>
            <p class="doc-panel__desc">
              当前支持本地 txt / md / docx / pdf 文档，后端会根据 storagePath 读取真实文件并按结构化规则切块。这里的搜索只按文档名称筛选，不会搜索正文内容。
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
              <template #default="{ row }">{{ row.updatedAt }}</template>
            </el-table-column>

            <el-table-column label="操作" width="230" align="right">
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

    <el-dialog v-model="uploadDialogOpen" title="新建文档" width="640px" destroy-on-close>
      <div class="space-y-4">
        <div>
          <div class="mb-2 text-sm font-medium text-slate-900">文档名称</div>
          <el-input v-model="uploadName" placeholder="例如：demo-doc.md / demo-doc.docx / demo-doc.pdf" />
        </div>

        <div>
          <div class="mb-2 text-sm font-medium text-slate-900">本地文件路径</div>
          <el-input
            v-model="uploadStoragePath"
            placeholder="例如：C:\\Users\\123\\Desktop\\Mustfollow-prompt\\demo-doc.pdf"
          />
        </div>

        <div>
          <div class="mb-2 text-sm font-medium text-slate-900">分块策略</div>
          <el-select v-model="uploadChunkStrategy" class="w-full">
            <el-option value="structure_aware" label="structure_aware" />
          </el-select>
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
          <el-button type="primary" :disabled="!uploadStoragePath.trim()" @click="submitUpload">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="editDialogOpen" title="编辑文档" width="700px" destroy-on-close>
      <div v-if="activeDocument" class="space-y-4">
        <p class="text-sm text-slate-500">当前只更新稳定字段：文档名称、分块策略、分块配置。</p>

        <div>
          <div class="mb-2 text-sm font-medium text-slate-900">文档名称</div>
          <el-input v-model="editName" />
        </div>

        <div>
          <div class="mb-2 text-sm font-medium text-slate-900">分块策略</div>
          <el-select v-model="editChunkStrategy" class="w-full">
            <el-option value="structure_aware" label="structure_aware" />
          </el-select>
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
          <el-button type="primary" :disabled="!editName.trim()" @click="submitEdit">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="chunkDialogOpen" title="重新分块" width="460px" destroy-on-close>
      <div class="space-y-2 text-sm">
        <p>文档 [{{ activeDocumentName }}] 当前已有 {{ activeDocument?.chunkCount ?? 0 }} 条分块记录。</p>
        <p class="text-[#f59e0b]">重新分块会清空旧 chunk，再按当前 storagePath 和分块配置重新生成。</p>
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <el-button @click="chunkDialogOpen = false">取消</el-button>
          <el-button type="primary" @click="submitChunkConfirm">确认</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="deleteDialogOpen" title="删除文档" width="420px" destroy-on-close>
      <p class="text-sm leading-6 text-slate-500">删除后不可恢复，确认删除当前文档吗？</p>
      <template #footer>
        <div class="flex justify-end gap-3">
          <el-button @click="deleteDialogOpen = false">取消</el-button>
          <el-button type="danger" @click="submitDeleteConfirm">删除</el-button>
        </div>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.doc-stage {
  padding: 8px 0 4px;
}

.doc-stage__canvas {
  margin: 0 auto;
  max-width: 1120px;
  border-radius: 28px;
  background: #f3f6fb;
  padding: 28px 28px 32px;
}

.doc-stage__toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.doc-stage__path {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #667085;
}

.doc-stage__back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  padding: 0;
  color: #4f46e5;
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
  margin-top: 22px;
}

.doc-stage__title {
  font-size: 26px;
  font-weight: 700;
  color: #111827;
}

.doc-stage__subtitle {
  margin-top: 8px;
  font-size: 14px;
  color: #6b7280;
}

.doc-tabs {
  margin-top: 26px;
  display: flex;
  flex-wrap: wrap;
  gap: 28px;
}

.doc-tab {
  position: relative;
  border: 0;
  background: transparent;
  padding: 0 0 12px;
  font-size: 16px;
  font-weight: 500;
  color: #475467;
  cursor: pointer;
}

.doc-tab--active {
  color: #4f46e5;
  font-weight: 700;
}

.doc-tab--active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  border-radius: 9999px;
  background: #4f46e5;
}

.preview-panel,
.doc-panel {
  margin-top: 22px;
}

.preview-search__box {
  display: flex;
  align-items: center;
  gap: 14px;
  border: 2px solid #4f46e5;
  border-radius: 18px;
  background: #fff;
  padding: 10px 12px 10px 20px;
  box-shadow: 0 12px 24px rgba(79, 70, 229, 0.08);
}

.preview-search__input {
  width: 100%;
  border: 0;
  background: transparent;
  font-size: 16px;
  color: #111827;
  outline: none;
}

.preview-search__input::placeholder {
  color: #98a2b3;
}

.preview-search__button {
  min-width: 88px;
  border: 0;
  border-radius: 12px;
  background: linear-gradient(180deg, #5b5cff 0%, #4f46e5 100%);
  padding: 12px 20px;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
}

.preview-search__button:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.preview-search__clear {
  margin-top: 12px;
  border: 0;
  background: transparent;
  padding: 0;
  font-size: 13px;
  color: #667085;
  cursor: pointer;
}

.preview-search__hint {
  margin-top: 10px;
  font-size: 13px;
  color: #667085;
}

.preview-panel__error {
  margin-top: 12px;
  font-size: 13px;
  color: #dc2626;
}

.preview-results {
  margin-top: 20px;
}

.preview-results__list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.preview-results__empty,
.preview-results__placeholder {
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.74);
  padding: 22px 24px;
  font-size: 14px;
  color: #6b7280;
}

.preview-result {
  border-radius: 18px;
  background: #fff;
  padding: 18px 18px 16px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
}

.preview-result__top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.preview-result__info {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.preview-score {
  display: inline-flex;
  align-items: center;
  border-radius: 9999px;
  padding: 5px 12px;
  font-size: 14px;
  font-weight: 700;
}

.preview-score--success {
  background: #dcfce7;
  color: #16a34a;
}

.preview-score--warning {
  background: #ffedd5;
  color: #f97316;
}

.preview-score--info {
  background: #e0e7ff;
  color: #4f46e5;
}

.preview-result__source,
.preview-result__meta {
  font-size: 14px;
  color: #667085;
}

.preview-result__content {
  margin-top: 14px;
  border-radius: 12px;
  background: #f8fafc;
  padding: 14px 16px;
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
}


.doc-panel {
  border: 1px solid var(--border-default);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
  overflow: hidden;
}

.doc-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 24px 18px;
  border-bottom: 1px solid #edf2f7;
}

.doc-panel__title {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.doc-panel__desc {
  margin-top: 4px;
  font-size: 14px;
  color: #64748b;
}

.doc-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.doc-panel__body {
  padding: 0 16px 18px;
}

.doc-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 12px 0;
  color: #64748b;
  font-size: 14px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  background: #cbd5e1;
}

.status-dot--indexed {
  background: var(--brand-primary);
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

  .preview-search__box {
    flex-direction: column;
    align-items: stretch;
    padding: 14px;
  }
}

@media (max-width: 768px) {
  .doc-stage__canvas {
    padding: 22px 16px 24px;
    border-radius: 20px;
  }

  .doc-tabs {
    gap: 18px;
  }

  .preview-result__top,
  .doc-footer {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
