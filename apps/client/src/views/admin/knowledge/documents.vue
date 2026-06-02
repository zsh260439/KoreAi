<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { FileUp, FolderOpen, Pencil, PlayCircle, RefreshCw, Search, Trash2 } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import { useKnowledgeBases } from '@/composables/useKnowledgeBases'
import { useKnowledgeChunks } from '@/composables/useKnowledgeChunks'
import { useKnowledgeDocuments } from '@/composables/useKnowledgeDocuments'
import { useKnowledgeSearch } from '@/composables/useKnowledgeSearch'
import type { KnowledgeDocument, KnowledgeDocumentUpdatePayload, KnowledgeDocumentUploadPayload } from '@/types'

const route = useRoute()
const router = useRouter()
const { knowledgeBases, loadKnowledgeBases } = useKnowledgeBases()
const { documents, loadKnowledgeDocuments, createKnowledgeDocument, updateKnowledgeDocument, removeKnowledgeDocument } =
  useKnowledgeDocuments()
const { rebuildKnowledgeChunks } = useKnowledgeChunks()
const { searchResults, isSearching, error: searchError, searchKnowledge, clearSearchResults } = useKnowledgeSearch()

const kbId = computed(() => String(route.params.kbId || ''))
const knowledgeBase = computed(() => knowledgeBases.value.find((item) => item.id === kbId.value))

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
const uploadChunkStrategy = ref<'fixed_size' | 'structure_aware'>('fixed_size')
const uploadChunkSize = ref('500')
const uploadOverlap = ref('100')
const uploadTargetChars = ref('1400')
const uploadMaxChars = ref('1800')
const uploadMinChars = ref('600')
const uploadOverlapChars = ref('0')

const editDialogOpen = ref(false)
const activeDocumentId = ref('')
const editName = ref('')
const editChunkStrategy = ref<'fixed_size' | 'structure_aware'>('fixed_size')
const editChunkSize = ref('500')
const editOverlap = ref('100')
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

const activeDocument = computed(() => documents.value.find((item) => item.id === activeDocumentId.value) ?? null)
const activeDocumentName = computed(() => activeDocument.value?.name || '-')
const editIsFixedSize = computed(() => editChunkStrategy.value === 'fixed_size')
const uploadIsFixedSize = computed(() => uploadChunkStrategy.value === 'fixed_size')
//数据库查询文档列表
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
//解析分块配置
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

//构建分块配置文本
const buildChunkConfigText = (strategy: 'fixed_size' | 'structure_aware') => {
  if (strategy === 'fixed_size') {
    return JSON.stringify({
      chunkSize: Number(uploadChunkSize.value),
      overlap: Number(uploadOverlap.value)
    })
  }

  return JSON.stringify({
    targetChars: Number(uploadTargetChars.value),
    maxChars: Number(uploadMaxChars.value),
    minChars: Number(uploadMinChars.value),
    overlapChars: Number(uploadOverlapChars.value)
  })
}
//构建编辑分块配置文本
const buildEditChunkConfigText = (strategy: 'fixed_size' | 'structure_aware') => {
  if (strategy === 'fixed_size') {
    return JSON.stringify({
      chunkSize: Number(editChunkSize.value),
      overlap: Number(editOverlap.value)
    })
  }

  return JSON.stringify({
    targetChars: Number(editTargetChars.value),
    maxChars: Number(editMaxChars.value),
    minChars: Number(editMinChars.value),
    overlapChars: Number(editOverlapChars.value)
  })
}
//格式化文档来源标签
const formatSourceLabel = (value?: string | null) => {
  if (!value) return '-'
  return value.toLowerCase() === 'url' ? '远程URL' : '本地文件'
}
//格式化文档大小
const formatSize = (value?: number | null) => {
  if (value === undefined || value === null) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}
//处理搜索
const handleSearch = () => {
  current.value = 1
  keyword.value = searchInput.value.trim()
}
//处理内容搜索
const handleContentSearch = async () => {
  const query = contentSearchInput.value.trim()
  if (!query) {
    hasSearchedContent.value = false
    clearSearchResults()
    return
  }

  hasSearchedContent.value = true
  await searchKnowledge(kbId.value, query)
}
//清除内容搜索结果
const handleClearContentSearch = () => {
  contentSearchInput.value = ''
  hasSearchedContent.value = false
  clearSearchResults()
}
//刷新文档列表
const handleRefresh = async () => {
  current.value = 1
  await loadKnowledgeDocuments(kbId.value)
}
//重置上传对话框
const resetUploadDialog = () => {
  uploadDialogOpen.value = false
  uploadName.value = ''
  uploadStoragePath.value = ''
  uploadChunkStrategy.value = 'fixed_size'
  uploadChunkSize.value = '500'
  uploadOverlap.value = '100'
  uploadTargetChars.value = '1400'
  uploadMaxChars.value = '1800'
  uploadMinChars.value = '600'
  uploadOverlapChars.value = '0'
}
//提交上传文档
const submitUpload = async () => {
  const payload: KnowledgeDocumentUploadPayload = {
    name: uploadName.value.trim() || '新文档',
    storagePath: uploadStoragePath.value.trim(),
    chunkStrategy: uploadChunkStrategy.value,
    chunkConfig: buildChunkConfigText(uploadChunkStrategy.value)
  }

  await createKnowledgeDocument(kbId.value, {
    name: payload.name,
    storagePath: payload.storagePath || '',
    chunkStrategy: payload.chunkStrategy,
    chunkConfig: payload.chunkConfig ? JSON.parse(payload.chunkConfig) : undefined
  })
  await loadKnowledgeBases()
  ElMessage.success('文档已创建')
  resetUploadDialog()
}
//打开编辑对话框
const openEdit = (document: KnowledgeDocument) => {
  activeDocumentId.value = document.id
  editName.value = document.name
  editChunkStrategy.value = (document.chunkStrategy as 'fixed_size' | 'structure_aware') || 'fixed_size'

  const config = parseChunkConfig(document.chunkConfig)
  editChunkSize.value = String(config.chunkSize ?? 500)
  editOverlap.value = String(config.overlap ?? 100)
  editTargetChars.value = String(config.targetChars ?? 1400)
  editMaxChars.value = String(config.maxChars ?? 1800)
  editMinChars.value = String(config.minChars ?? 600)
  editOverlapChars.value = String(config.overlapChars ?? 0)
  editDialogOpen.value = true
}
//提交编辑文档
const submitEdit = async () => {
  if (!activeDocument.value) return

  const payload: KnowledgeDocumentUpdatePayload = {
    name: editName.value.trim(),
    chunkStrategy: editChunkStrategy.value,
    chunkConfig: buildEditChunkConfigText(editChunkStrategy.value)
  }

  await updateKnowledgeDocument(activeDocument.value.id, {
    name: payload.name,
    chunkStrategy: payload.chunkStrategy,
    chunkConfig: payload.chunkConfig ? JSON.parse(payload.chunkConfig) : undefined
  })
  editDialogOpen.value = false
  ElMessage.success('文档配置已更新')
}
//打开分块确认对话框
const openChunkConfirm = (document: KnowledgeDocument) => {
  activeDocumentId.value = document.id
  chunkDialogOpen.value = true
}

const submitChunkConfirm = async () => {
  if (!activeDocument.value) return
  await rebuildKnowledgeChunks(activeDocument.value.id)
  await loadKnowledgeDocuments(kbId.value)
  chunkDialogOpen.value = false
  ElMessage.success('已重新执行分块')
}
//打开删除确认对话框
const openDeleteConfirm = (document: KnowledgeDocument) => {
  activeDocumentId.value = document.id
  deleteDialogOpen.value = true
}
//提交删除确认
const submitDeleteConfirm = async () => {
  if (!activeDocument.value) return
  await removeKnowledgeDocument(activeDocument.value.id)
  await loadKnowledgeBases()
  deleteDialogOpen.value = false
  ElMessage.success('文档已删除')
}

const openChunkLog = (document: KnowledgeDocument) => {
  router.push(`/admin/knowledge/${kbId.value}/docs/${document.id}`)
}

const getScorePercent = (score: number) => {
  return Math.max(0, Math.min(100, Math.round(score)))
}

onMounted(async () => {
  if (!knowledgeBases.value.length) {
    await loadKnowledgeBases()
  }
  await loadKnowledgeDocuments(kbId.value)
})
</script>

<template>
  <section class="space-y-6">
    <AdminPageHeader
      title="文档管理"
      :description="knowledgeBase ? `${knowledgeBase.name}（${knowledgeBase.name.trim().toLowerCase().replace(/\s+/g, '_')}）` : kbId"
    >
      <template #actions>
        <el-button @click="router.push('/admin/knowledge')">返回知识库</el-button>
        <el-button type="primary" @click="uploadDialogOpen = true">
          <FileUp class="h-4 w-4" />
          新建文档
        </el-button>
      </template>
    </AdminPageHeader>

    <div class="doc-card">
      <div class="doc-card__header">
        <div>
          <h2 class="doc-card__title">文档列表</h2>
          <p class="doc-card__desc">当前阶段只支持本地 txt / md 文档，后端会根据 storagePath 读取真实文件再切块。</p>
        </div>

        <div class="doc-toolbar">
          <el-input v-model="searchInput" placeholder="搜索文档名称" clearable class="!w-[360px]" />
          <el-button @click="handleSearch">搜索</el-button>
          <el-select v-model="statusFilter" placeholder="全部状态" class="!w-[160px]" @change="current = 1">
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-button @click="handleRefresh">
            <RefreshCw class="h-4 w-4" />
            刷新
          </el-button>
        </div>
      </div>

      <div class="doc-card__body">
        <div class="search-panel">
          <div class="search-panel__head">
            <div>
              <div class="search-panel__title">知识内容搜索</div>
              <div class="search-panel__desc">在当前知识库下搜索已经切分完成的 chunk 内容。</div>
            </div>
          </div>

          <div class="search-panel__toolbar">
            <el-input
              v-model="contentSearchInput"
              placeholder="输入关键词，例如：报销、审批、差旅"
              clearable
              class="!w-full"
              @keyup.enter="handleContentSearch"
            >
              <template #prefix>
                <Search class="h-4 w-4 text-slate-400" />
              </template>
            </el-input>
            <el-button type="primary" :loading="isSearching" @click="handleContentSearch">搜索内容</el-button>
            <el-button @click="handleClearContentSearch">清空</el-button>
          </div>

          <div v-if="searchError" class="search-panel__error">{{ searchError }}</div>

          <div v-if="hasSearchedContent" class="search-results">
            <div v-if="!searchResults.length && !isSearching" class="search-results__empty">当前知识库下没有命中内容</div>

              <div v-else class="search-results__list">
                <div v-for="item in searchResults" :key="item.chunkId" class="search-result-item">
                  <div class="search-result-item__meta">
                    <span>文档：{{ item.documentName }}</span>
                    <span>Chunk ID：{{ item.chunkId }}</span>
                    <span>分数：{{ item.score }}</span>
                    <el-button
                      link
                      type="primary"
                      class="!px-0"
                      @click="router.push(`/admin/knowledge/${kbId}/docs/${item.documentId}`)"
                    >
                      查看文档
                    </el-button>
                  </div>
                  <div class="search-result-item__score">
                    <div class="search-result-item__score-fill" :style="{ width: `${getScorePercent(item.score)}%` }" />
                  </div>
                  <div class="search-result-item__content">
                    {{ item.content }}
                  </div>
                </div>
              </div>
          </div>
        </div>

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
            <el-button :disabled="filteredDocuments.current <= 1" @click="current = Math.max(1, current - 1)">上一页</el-button>
            <span>{{ filteredDocuments.current }} / {{ filteredDocuments.pages }}</span>
            <el-button :disabled="filteredDocuments.current >= filteredDocuments.pages" @click="current = Math.min(filteredDocuments.pages, current + 1)">下一页</el-button>
          </div>
        </div>
      </div>
    </div>

    <el-dialog v-model="uploadDialogOpen" title="新建文档" width="640px" destroy-on-close>
      <div class="space-y-4">
        <div>
          <div class="mb-2 text-sm font-medium text-slate-900">文档名称</div>
          <el-input v-model="uploadName" placeholder="例如：demo-doc.txt" />
        </div>

        <div>
          <div class="mb-2 text-sm font-medium text-slate-900">本地文件路径</div>
          <el-input
            v-model="uploadStoragePath"
            placeholder="例如：C:\\Users\\123\\Desktop\\Mustfollow-prompt\\demo-doc.txt"
          />
        </div>

        <div>
          <div class="mb-2 text-sm font-medium text-slate-900">分块策略</div>
          <el-select v-model="uploadChunkStrategy" class="w-full">
            <el-option value="fixed_size" label="fixed_size" />
            <el-option value="structure_aware" label="structure_aware" />
          </el-select>
        </div>

        <div v-if="uploadIsFixedSize" class="grid gap-4 md:grid-cols-2">
          <div>
            <div class="mb-2 text-sm font-medium text-slate-900">chunkSize</div>
            <el-input v-model="uploadChunkSize" />
          </div>
          <div>
            <div class="mb-2 text-sm font-medium text-slate-900">overlap</div>
            <el-input v-model="uploadOverlap" />
          </div>
        </div>

        <div v-else class="grid gap-4 md:grid-cols-2">
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
            <el-option value="fixed_size" label="fixed_size" />
            <el-option value="structure_aware" label="structure_aware" />
          </el-select>
        </div>

        <div v-if="editIsFixedSize" class="grid gap-4 md:grid-cols-2">
          <div>
            <div class="mb-2 text-sm font-medium text-slate-900">chunkSize</div>
            <el-input v-model="editChunkSize" />
          </div>
          <div>
            <div class="mb-2 text-sm font-medium text-slate-900">overlap</div>
            <el-input v-model="editOverlap" />
          </div>
        </div>

        <div v-else class="grid gap-4 md:grid-cols-2">
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
.doc-card {
  border: 1px solid var(--border-default);
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
  overflow: hidden;
}

.doc-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 28px 18px;
  border-bottom: 1px solid #edf2f7;
}

.doc-card__title {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.doc-card__desc {
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

.doc-card__body {
  padding: 0 16px 18px;
}

.search-panel {
  margin: 20px 0 24px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #f8fbff;
  padding: 18px;
}

.search-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.search-panel__title {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.search-panel__desc {
  margin-top: 4px;
  font-size: 13px;
  color: #64748b;
}

.search-panel__toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.search-panel__error {
  margin-top: 12px;
  font-size: 13px;
  color: #dc2626;
}

.search-results {
  margin-top: 16px;
}

.search-results__empty {
  padding: 20px 0 4px;
  font-size: 14px;
  color: #64748b;
}

.search-results__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.search-result-item {
  border: 1px solid #dbeafe;
  border-radius: 14px;
  background: #fff;
  padding: 14px 16px;
}

.search-result-item__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: #64748b;
}

.search-result-item__content {
  margin-top: 10px;
  line-height: 1.8;
  color: #334155;
  white-space: pre-wrap;
}

.search-result-item__score {
  margin-top: 10px;
  height: 8px;
  overflow: hidden;
  border-radius: 9999px;
  background: #e2e8f0;
}

.search-result-item__score-fill {
  height: 100%;
  border-radius: 9999px;
  background: linear-gradient(90deg, #60a5fa 0%, #2563eb 100%);
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
  .doc-card__header {
    flex-direction: column;
  }

  .doc-toolbar {
    justify-content: flex-start;
  }

  .search-panel__toolbar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
