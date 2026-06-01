<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { FileBarChart, FileUp, FolderOpen, Pencil, PlayCircle, RefreshCw, Trash2 } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import { useAdminStore } from '@/stores'
import type {
  KnowledgeDocument,
  KnowledgeDocumentChunkLog,
  KnowledgeDocumentUpdatePayload,
  KnowledgeDocumentUploadPayload
} from '@/types'

const route = useRoute()
const router = useRouter()
const adminStore = useAdminStore()

const kbId = computed(() => String(route.params.kbId || ''))
const knowledgeBase = computed(() => adminStore.knowledgeBases.find((item) => item.id === kbId.value))
const documents = computed(() => adminStore.documentsByKb[kbId.value] ?? [])

const current = ref(1)
const pageSize = 10
const searchInput = ref('')
const keyword = ref('')
const statusFilter = ref('all')

const uploadDialogOpen = ref(false)
const uploadName = ref('')
const uploadProcessMode = ref<'chunk' | 'pipeline'>('chunk')
const uploadChunkStrategy = ref<'fixed_size' | 'structure_aware'>('structure_aware')
const uploadChunkSize = ref('512')
const uploadOverlapSize = ref('128')
const uploadTargetChars = ref('1400')
const uploadMaxChars = ref('1800')
const uploadMinChars = ref('600')
const uploadOverlapChars = ref('0')

const editDialogOpen = ref(false)
const activeDocumentId = ref('')
const editName = ref('')
const editProcessMode = ref<'chunk' | 'pipeline'>('chunk')
const editChunkStrategy = ref<'fixed_size' | 'structure_aware'>('structure_aware')
const editChunkSize = ref('512')
const editOverlapSize = ref('128')
const editTargetChars = ref('1400')
const editMaxChars = ref('1800')
const editMinChars = ref('600')
const editOverlapChars = ref('0')

const chunkDialogOpen = ref(false)
const deleteDialogOpen = ref(false)
const logDialogOpen = ref(false)
const chunkLogs = ref<KnowledgeDocumentChunkLog[]>([])
const chunkLogsLoading = ref(false)

const statusOptions = [
  { value: 'all', label: '全部状态' },
  { value: 'pending', label: 'pending' },
  { value: 'running', label: 'running' },
  { value: 'failed', label: 'failed' },
  { value: 'success', label: 'success' }
]

const activeDocument = computed(() => documents.value.find((item) => item.id === activeDocumentId.value) ?? null)
const activeDocumentName = computed(() => activeDocument.value?.name || '-')
const editIsFixedSize = computed(() => editChunkStrategy.value === 'fixed_size')
const uploadIsFixedSize = computed(() => uploadChunkStrategy.value === 'fixed_size')

const filteredDocuments = computed(() => {
  const normalized = keyword.value.trim().toLowerCase()
  const list = documents.value.filter((item) => {
    const matchesKeyword = !normalized || [item.name, item.summary || '']
      .some((value) => value.toLowerCase().includes(normalized))
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

const parseChunkConfig = (value?: string) => {
  if (!value) return {}
  try {
    return JSON.parse(value) as Record<string, number>
  } catch {
    return {}
  }
}

const formatSourceLabel = (value?: string | null) => {
  if (!value) return '-'
  return value.toLowerCase() === 'url' ? 'Remote URL' : 'Local File'
}

const formatProcessMode = (value?: string | null) => {
  if (!value) return '-'
  return value.toLowerCase() === 'pipeline' ? 'pipeline' : 'chunk'
}

const formatSize = (value?: number | null) => {
  if (value === undefined || value === null) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

const handleSearch = () => {
  current.value = 1
  keyword.value = searchInput.value.trim()
}

const handleRefresh = async () => {
  current.value = 1
  await adminStore.loadDocuments(kbId.value)
}

const resetUploadDialog = () => {
  uploadDialogOpen.value = false
  uploadName.value = ''
  uploadProcessMode.value = 'chunk'
  uploadChunkStrategy.value = 'structure_aware'
  uploadChunkSize.value = '512'
  uploadOverlapSize.value = '128'
  uploadTargetChars.value = '1400'
  uploadMaxChars.value = '1800'
  uploadMinChars.value = '600'
  uploadOverlapChars.value = '0'
}

const submitUpload = async () => {
  const payload: KnowledgeDocumentUploadPayload = {
    sourceType: 'file',
    name: uploadName.value.trim() || '新文档',
    processMode: uploadProcessMode.value,
    chunkStrategy: uploadProcessMode.value === 'chunk' ? uploadChunkStrategy.value : undefined,
    chunkConfig: uploadProcessMode.value === 'chunk'
      ? uploadChunkStrategy.value === 'fixed_size'
        ? JSON.stringify({
            chunkSize: Number(uploadChunkSize.value),
            overlapSize: Number(uploadOverlapSize.value)
          })
        : JSON.stringify({
            targetChars: Number(uploadTargetChars.value),
            maxChars: Number(uploadMaxChars.value),
            minChars: Number(uploadMinChars.value),
            overlapChars: Number(uploadOverlapChars.value)
          })
      : undefined
  }

  await adminStore.uploadKnowledgeDocument(kbId.value, payload)
  ElMessage.success('文档已创建')
  resetUploadDialog()
}

const openEdit = (document: KnowledgeDocument) => {
  activeDocumentId.value = document.id
  editName.value = document.name
  editProcessMode.value = document.processMode === 'pipeline' ? 'pipeline' : 'chunk'
  editChunkStrategy.value = (document.chunkStrategy as 'fixed_size' | 'structure_aware') || 'structure_aware'
  const config = parseChunkConfig(document.chunkConfig)
  editChunkSize.value = String(config.chunkSize ?? 512)
  editOverlapSize.value = String(config.overlapSize ?? 128)
  editTargetChars.value = String(config.targetChars ?? 1400)
  editMaxChars.value = String(config.maxChars ?? 1800)
  editMinChars.value = String(config.minChars ?? 600)
  editOverlapChars.value = String(config.overlapChars ?? 0)
  editDialogOpen.value = true
}

const submitEdit = async () => {
  if (!activeDocument.value) return
  const payload: KnowledgeDocumentUpdatePayload = {
    name: editName.value.trim(),
    processMode: editProcessMode.value,
    chunkStrategy: editProcessMode.value === 'chunk' ? editChunkStrategy.value : undefined,
    chunkConfig: editProcessMode.value === 'chunk'
      ? editChunkStrategy.value === 'fixed_size'
        ? JSON.stringify({
            chunkSize: Number(editChunkSize.value),
            overlapSize: Number(editOverlapSize.value)
          })
        : JSON.stringify({
            targetChars: Number(editTargetChars.value),
            maxChars: Number(editMaxChars.value),
            minChars: Number(editMinChars.value),
            overlapChars: Number(editOverlapChars.value)
          })
      : undefined
  }

  await adminStore.updateDocument(kbId.value, activeDocument.value.id, payload)
  editDialogOpen.value = false
  ElMessage.success('文档配置已更新')
}

const openChunkConfirm = (document: KnowledgeDocument) => {
  activeDocumentId.value = document.id
  chunkDialogOpen.value = true
}

const submitChunkConfirm = async () => {
  if (!activeDocument.value) return
  await adminStore.runDocumentChunk(kbId.value, activeDocument.value.id)
  chunkDialogOpen.value = false
  ElMessage.success('已重新执行分块')
}

const openDeleteConfirm = (document: KnowledgeDocument) => {
  activeDocumentId.value = document.id
  deleteDialogOpen.value = true
}

const submitDeleteConfirm = async () => {
  if (!activeDocument.value) return
  await adminStore.removeDocument(kbId.value, activeDocument.value.id)
  deleteDialogOpen.value = false
  ElMessage.success('文档已删除')
}

const openChunkLog = async (document: KnowledgeDocument) => {
  activeDocumentId.value = document.id
  chunkLogsLoading.value = true
  chunkLogs.value = await adminStore.loadDocumentChunkLogs(document.id)
  chunkLogsLoading.value = false
  logDialogOpen.value = true
}

const handleToggleEnabled = async (document: KnowledgeDocument) => {
  await adminStore.setDocumentEnabled(kbId.value, document.id, !document.enabled)
}

const formatLogStatus = (value?: string | null) => {
  if (!value) return '-'
  if (value === 'success') return '成功'
  if (value === 'failed') return '失败'
  if (value === 'running') return '执行中'
  return value
}

const formatDuration = (value?: number | null) => {
  if (value === undefined || value === null) return '-'
  if (value < 1000) return `${value}ms`
  return `${(value / 1000).toFixed(2)}s`
}

onMounted(async () => {
  if (!adminStore.knowledgeBases.length) {
    await adminStore.loadKnowledgeBases()
  }
  await adminStore.loadDocuments(kbId.value)
})
</script>

<template>
  <section class="space-y-6">
    <AdminPageHeader
      title="文档管理"
      :description="knowledgeBase ? `${knowledgeBase.name}（${knowledgeBase.collectionName || kbId}）` : kbId"
    >
      <template #actions>
        <el-button @click="router.push('/admin/knowledge')">返回知识库</el-button>
        <el-button type="primary" @click="uploadDialogOpen = true">
          <FileUp class="h-4 w-4" />
          上传文档
        </el-button>
      </template>
    </AdminPageHeader>

    <div class="doc-card">
      <div class="doc-card__header">
        <div>
          <h2 class="doc-card__title">文档列表</h2>
          <p class="doc-card__desc">支持筛选与分块管理</p>
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

          <el-table-column label="处理模式" width="120">
            <template #default="{ row }">{{ formatProcessMode(row.processMode) }}</template>
          </el-table-column>

          <el-table-column label="状态" width="120">
            <template #default="{ row }">
              <div class="inline-flex items-center gap-2 text-sm text-slate-600">
                <span class="status-dot" :class="`status-dot--${row.status}`" />
                <span>{{ row.status }}</span>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="启用" width="90" align="center">
            <template #default="{ row }">
              <el-switch :model-value="Boolean(row.enabled)" @change="() => handleToggleEnabled(row)" />
            </template>
          </el-table-column>

          <el-table-column label="分块数" width="96">
            <template #default="{ row }">{{ row.chunkCount ?? 0 }}</template>
          </el-table-column>

          <el-table-column label="类型" width="110">
            <template #default="{ row }">{{ row.fileType || row.type || '-' }}</template>
          </el-table-column>

          <el-table-column label="大小" width="110">
            <template #default="{ row }">{{ formatSize(row.fileSize) }}</template>
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
                <el-button link @click="openChunkConfirm(row)" title="重新执行分块">
                  <PlayCircle class="h-4 w-4" />
                </el-button>
                <el-button link @click="openChunkLog(row)" title="分块详情">
                  <FileBarChart class="h-4 w-4" />
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

    <el-dialog v-model="uploadDialogOpen" title="上传文档" width="640px" destroy-on-close>
      <div class="space-y-4">
        <div>
          <div class="mb-2 text-sm font-medium text-slate-900">文档名称</div>
          <el-input v-model="uploadName" placeholder="请输入文档名称" />
        </div>
        <div>
          <div class="mb-2 text-sm font-medium text-slate-900">处理模式</div>
          <el-select v-model="uploadProcessMode" class="w-full">
            <el-option value="chunk" label="分块策略" />
            <el-option value="pipeline" label="数据通道" />
          </el-select>
        </div>
        <template v-if="uploadProcessMode === 'chunk'">
          <div>
            <div class="mb-2 text-sm font-medium text-slate-900">分块策略</div>
            <el-select v-model="uploadChunkStrategy" class="w-full">
              <el-option value="structure_aware" label="structure_aware" />
              <el-option value="fixed_size" label="fixed_size" />
            </el-select>
          </div>

          <div v-if="uploadIsFixedSize" class="grid gap-4 md:grid-cols-2">
            <div>
              <div class="mb-2 text-sm font-medium text-slate-900">块大小</div>
              <el-input v-model="uploadChunkSize" />
            </div>
            <div>
              <div class="mb-2 text-sm font-medium text-slate-900">重叠大小</div>
              <el-input v-model="uploadOverlapSize" />
            </div>
          </div>

          <div v-else class="grid gap-4 md:grid-cols-2">
            <div>
              <div class="mb-2 text-sm font-medium text-slate-900">理想块大小</div>
              <el-input v-model="uploadTargetChars" />
            </div>
            <div>
              <div class="mb-2 text-sm font-medium text-slate-900">块上限</div>
              <el-input v-model="uploadMaxChars" />
            </div>
            <div>
              <div class="mb-2 text-sm font-medium text-slate-900">块下限</div>
              <el-input v-model="uploadMinChars" />
            </div>
            <div>
              <div class="mb-2 text-sm font-medium text-slate-900">重叠大小</div>
              <el-input v-model="uploadOverlapChars" />
            </div>
          </div>
        </template>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <el-button @click="resetUploadDialog">取消</el-button>
          <el-button type="primary" @click="submitUpload">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="editDialogOpen" title="编辑文档" width="700px" destroy-on-close>
      <div v-if="activeDocument" class="space-y-4">
        <p class="text-sm text-slate-500">修改文档名称，查看文档配置信息</p>

        <div>
          <div class="mb-2 text-sm font-medium text-slate-900">来源类型</div>
          <el-input :model-value="formatSourceLabel(activeDocument.sourceType)" readonly />
        </div>

        <div>
          <div class="mb-2 text-sm font-medium text-slate-900">本地文件</div>
          <el-input v-model="editName" />
          <div class="mt-1 text-sm text-slate-500">仅支持修改文件名</div>
        </div>

        <div>
          <div class="mb-2 text-sm font-medium text-slate-900">处理模式</div>
          <el-input model-value="分块策略" readonly />
          <div class="mt-1 text-sm text-slate-500">分块策略：直接分块；数据通道：使用 Pipeline 清洗</div>
        </div>

        <div class="rounded-[12px] border border-[var(--border-default)] p-4">
          <div class="mb-3 text-sm font-medium text-slate-900">分块策略</div>
          <el-input v-model="editChunkStrategy" readonly />

          <div v-if="editIsFixedSize" class="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <div class="mb-2 text-sm font-medium text-slate-900">块大小</div>
              <el-input v-model="editChunkSize" />
            </div>
            <div>
              <div class="mb-2 text-sm font-medium text-slate-900">重叠大小</div>
              <el-input v-model="editOverlapSize" />
            </div>
          </div>

          <div v-else class="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <div class="mb-2 text-sm font-medium text-slate-900">理想块大小</div>
              <el-input v-model="editTargetChars" />
            </div>
            <div>
              <div class="mb-2 text-sm font-medium text-slate-900">块上限</div>
              <el-input v-model="editMaxChars" />
            </div>
            <div>
              <div class="mb-2 text-sm font-medium text-slate-900">块下限</div>
              <el-input v-model="editMinChars" />
            </div>
            <div>
              <div class="mb-2 text-sm font-medium text-slate-900">重叠大小</div>
              <el-input v-model="editOverlapChars" />
            </div>
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

    <el-dialog v-model="chunkDialogOpen" title="重新分块?" width="460px" destroy-on-close>
      <div class="space-y-2 text-sm">
        <p>文档 [{{ activeDocumentName }}] 已有 {{ activeDocument?.chunkCount ?? 0 }} 个分块记录。</p>
        <p class="text-[#f59e0b]">重新分块会清空原有 Chunk 记录及向量数据。</p>
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <el-button @click="chunkDialogOpen = false">取消</el-button>
          <el-button type="primary" @click="submitChunkConfirm">确认</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="logDialogOpen" title="分块详情" width="760px" destroy-on-close>
      <p class="mb-4 text-sm text-slate-500">文档 [{{ activeDocumentName }}] 的分块执行日志</p>

      <div v-if="chunkLogsLoading" class="py-8 text-center text-slate-500">加载中...</div>

      <div v-else-if="chunkLogs.length" class="rounded-[14px] border border-[var(--border-default)] bg-[#fbfcff] p-4">
        <template v-for="log in chunkLogs.slice(0, 1)" :key="log.id">
          <div class="flex items-center justify-between">
            <div class="space-y-3">
              <div class="text-lg font-semibold text-slate-900">
                执行状态:
                <span class="text-[var(--brand-primary)]">{{ formatLogStatus(log.status) }}</span>
              </div>
              <div class="grid gap-3 text-sm text-slate-700 md:grid-cols-2">
                <div>处理模式: 分块策略</div>
                <div>分块策略: {{ log.chunkStrategy || '-' }}</div>
                <div>分块数量: {{ log.chunkCount ?? 0 }}</div>
                <div>{{ log.updatedAt }}</div>
                <div>文本提取: {{ formatDuration(log.extractDuration) }}</div>
                <div>分块耗时: {{ formatDuration(log.chunkDuration) }}</div>
                <div>向量化: {{ formatDuration(log.embedDuration) }}</div>
                <div>其他耗时: {{ formatDuration(log.otherDuration) }}</div>
                <div>总耗时: {{ formatDuration(log.totalDuration) }}</div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div v-else class="py-8 text-center text-slate-500">暂无分块日志</div>

      <template #footer>
        <div class="flex justify-end">
          <el-button @click="logDialogOpen = false">关闭</el-button>
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

.status-dot--success {
  background: var(--brand-primary);
}

.status-dot--running {
  background: #60a5fa;
}

.status-dot--failed {
  background: #93c5fd;
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
}
</style>
