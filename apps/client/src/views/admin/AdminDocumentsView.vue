<script setup lang="ts">
import { FileBarChart, FileUp, FolderOpen, Pencil, PlayCircle, RefreshCw, Trash2, UploadCloud } from 'lucide-vue-next'

import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import {
  deleteDocument,
  fetchDocumentChunkLogs,
  fetchDocumentDetail,
  startDocumentChunk,
  toggleDocumentEnabled,
  updateDocumentDetail,
  uploadDocument
} from '@/servers/admin'
import { useAdminStore } from '@/stores/admin'
import type {
  KnowledgeDocument,
  KnowledgeDocumentChunkLog,
  KnowledgeDocumentUpdatePayload,
  KnowledgeDocumentUploadPayload
} from '@/types/models'
import { cn } from '@/utils/cn'

const route = useRoute()
const router = useRouter()
const adminStore = useAdminStore()

const uploadOpen = ref(false)
const editOpen = ref(false)
const deleteOpen = ref(false)
const chunkOpen = ref(false)
const logOpen = ref(false)
const previewOpen = ref(false)
const current = ref(1)
const statusFilter = ref('all')
const keyword = ref('')
const searchInput = ref('')
const activeDocumentId = ref<string | null>(null)
const previewDocument = ref<KnowledgeDocument | null>(null)
const chunkLogs = ref<KnowledgeDocumentChunkLog[]>([])
const chunkLogsLoading = ref(false)
const uploadFileInput = ref<HTMLInputElement | null>(null)
const uploadFile = ref<File | null>(null)
const uploadSourceType = ref<'file' | 'url'>('file')
const uploadSourceLocation = ref('')
const uploadScheduleEnabled = ref(false)
const uploadScheduleCron = ref('')
const uploadProcessMode = ref<'chunk' | 'pipeline'>('chunk')
const uploadChunkStrategy = ref('fixed_size')
const uploadPipelineId = ref('')
const uploadChunkSize = ref('512')
const uploadOverlapSize = ref('128')
const uploadTargetChars = ref('1400')
const uploadMaxChars = ref('1800')
const uploadMinChars = ref('600')
const uploadOverlapChars = ref('0')
const uploadNoChunk = ref(false)
const uploadOriginalChunkSize = ref('512')
const editName = ref('')
const editSourceLocation = ref('')
const editScheduleEnabled = ref(false)
const editScheduleCron = ref('')
const editProcessMode = ref<'chunk' | 'pipeline'>('chunk')
const editChunkStrategy = ref('structure_aware')
const editPipelineId = ref('')
const editChunkSize = ref('512')
const editOverlapSize = ref('128')
const editTargetChars = ref('1400')
const editMaxChars = ref('1800')
const editMinChars = ref('600')
const editOverlapChars = ref('0')
const editNoChunk = ref(false)
const editOriginalChunkSize = ref('512')

const statusOptions = [
  { value: 'all', label: '全部状态' },
  { value: 'pending', label: 'pending' },
  { value: 'running', label: 'running' },
  { value: 'failed', label: 'failed' },
  { value: 'success', label: 'success' }
]

const pageSize = 10
const kbId = computed(() => String(route.params.kbId || ''))
const documents = computed(() => adminStore.documentsByKb[kbId.value] ?? [])
const knowledgeBase = computed(() => adminStore.knowledgeBases.find((item) => item.id === kbId.value))
const activeDocumentRecord = computed(() => documents.value.find((item) => item.id === activeDocumentId.value) ?? null)
const activeDocumentName = computed(() => activeDocumentRecord.value?.docName || activeDocumentRecord.value?.name || '-')
const editIsUrlSource = computed(() => activeDocumentRecord.value?.sourceType?.toLowerCase() === 'url')
const editNameLabel = computed(() => (editIsUrlSource.value ? '文档名称' : '本地文件'))
const editSourceTypeLabel = computed(() => formatSourceLabel(activeDocumentRecord.value?.sourceType))
const uploadIsFixedSize = computed(() => uploadChunkStrategy.value === 'fixed_size')
const editIsFixedSize = computed(() => editChunkStrategy.value === 'fixed_size')

const filteredDocuments = computed(() => {
  const normalized = keyword.value.trim().toLowerCase()
  const list = documents.value.filter((doc) => {
    const matchesKeyword =
      !normalized ||
      (doc.docName || doc.name).toLowerCase().includes(normalized) ||
      (doc.summary || '').toLowerCase().includes(normalized)
    const matchesStatus = statusFilter.value === 'all' || doc.status === statusFilter.value
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

const handleSearch = () => {
  current.value = 1
  keyword.value = searchInput.value.trim()
}

const handleRefresh = () => {
  current.value = 1
}



const openEdit = (documentId: string) => {
  activeDocumentId.value = documentId
  const doc = documents.value.find((item) => item.id === documentId)
  editName.value = doc?.docName || doc?.name || ''
  editSourceLocation.value = doc?.sourceLocation || ''
  editScheduleEnabled.value = Boolean(doc?.scheduleEnabled)
  editScheduleCron.value = doc?.scheduleCron || ''
  editProcessMode.value = doc?.processMode === 'pipeline' ? 'pipeline' : 'chunk'
  editChunkStrategy.value = doc?.chunkStrategy || 'structure_aware'
  editPipelineId.value = doc?.pipelineId || ''
  editChunkSize.value = '512'
  editOverlapSize.value = '128'
  editTargetChars.value = '1400'
  editMaxChars.value = '1800'
  editMinChars.value = '600'
  editOverlapChars.value = '0'
  editOriginalChunkSize.value = editChunkSize.value
  editNoChunk.value = false
  editOpen.value = true
}

const openPreview = async (documentId: string) => {
  previewDocument.value = await fetchDocumentDetail(kbId.value, documentId)
  previewOpen.value = true
}

const openDelete = (documentId: string) => {
  activeDocumentId.value = documentId
  deleteOpen.value = true
}

const openChunk = (documentId: string) => {
  activeDocumentId.value = documentId
  chunkOpen.value = true
}

const openChunkLog = async (documentId: string) => {
  activeDocumentId.value = documentId
  chunkLogsLoading.value = true
  chunkLogs.value = await fetchDocumentChunkLogs(documentId)
  chunkLogsLoading.value = false
  logOpen.value = true
}

const formatSourceLabel = (sourceType?: string | null) => {
  const normalized = sourceType?.toLowerCase()
  if (normalized === 'url') return 'Remote URL'
  if (normalized === 'file') return 'Local File'
  return '-'
}

const formatProcessMode = (mode?: string | null) => {
  const normalized = mode?.toLowerCase()
  if (normalized === 'pipeline') return '数据通道'
  if (normalized === 'chunk') return '直接分块'
  return mode || '-'
}

const formatChunkStrategy = (strategy?: string | null) => {
  const normalized = strategy?.toLowerCase()
  if (normalized === 'fixed_size') return '固定大小'
  if (normalized === 'structure_aware') return '语义感知'
  return strategy || '-'
}

const formatSize = (size?: number | null) => {
  if (!size && size !== 0) return '-'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
}

const statusDotClass = (status?: string | null) => {
  if (!status) return 'bg-muted-foreground/40'
  const normalized = status.toLowerCase()
  if (normalized === 'success' || normalized === 'indexed') return 'bg-emerald-500'
  if (normalized === 'failed') return 'bg-red-500'
  if (normalized === 'running' || normalized === 'processing') return 'bg-amber-500'
  if (normalized === 'pending') return 'bg-slate-400'
  return 'bg-muted-foreground/40'
}

const formatLogStatus = (status?: string | null) => {
  const normalized = status?.toLowerCase()
  if (normalized === 'success') return '成功'
  if (normalized === 'failed') return '失败'
  if (normalized === 'running') return '进行中'
  return status || '-'
}

const formatDuration = (ms?: number | null) => {
  if (!ms && ms !== 0) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

const resetUploadForm = () => {
  uploadFile.value = null
  uploadSourceType.value = 'file'
  uploadSourceLocation.value = ''
  uploadScheduleEnabled.value = false
  uploadScheduleCron.value = ''
  uploadProcessMode.value = 'chunk'
  uploadChunkStrategy.value = 'fixed_size'
  uploadPipelineId.value = ''
  uploadChunkSize.value = '512'
  uploadOverlapSize.value = '128'
  uploadTargetChars.value = '1400'
  uploadMaxChars.value = '1800'
  uploadMinChars.value = '600'
  uploadOverlapChars.value = '0'
  uploadNoChunk.value = false
  uploadOriginalChunkSize.value = '512'
}

const handleUploadNoChunkToggle = () => {
  if (uploadNoChunk.value) {
    uploadChunkSize.value = uploadOriginalChunkSize.value
    uploadNoChunk.value = false
    return
  }
  uploadOriginalChunkSize.value = uploadChunkSize.value || '512'
  uploadChunkSize.value = '-1'
  uploadNoChunk.value = true
}

const handleUploadChunkSizeChange = (value: string | number) => {
  uploadChunkSize.value = String(value)
  if (uploadNoChunk.value && uploadChunkSize.value !== '-1') {
    uploadNoChunk.value = false
  }
}

const triggerUploadFileSelect = () => {
  uploadFileInput.value?.click()
}

const handleEditNoChunkToggle = () => {
  if (editNoChunk.value) {
    editChunkSize.value = editOriginalChunkSize.value
    editNoChunk.value = false
    return
  }
  editOriginalChunkSize.value = editChunkSize.value || '512'
  editChunkSize.value = '-1'
  editNoChunk.value = true
}

const handleEditChunkSizeChange = (value: string | number) => {
  editChunkSize.value = String(value)
  if (editNoChunk.value && editChunkSize.value !== '-1') {
    editNoChunk.value = false
  }
}

const refreshDocuments = async () => {
  await adminStore.loadDocuments(kbId.value)
}

const handleUpload = async (payload: KnowledgeDocumentUploadPayload) => {
  await uploadDocument(kbId.value, payload)
  resetUploadForm()
  await adminStore.loadKnowledgeBases()
  await refreshDocuments()
}

const handleDocumentUpdate = async (payload: KnowledgeDocumentUpdatePayload) => {
  if (!activeDocumentId.value) return
  await updateDocumentDetail(kbId.value, activeDocumentId.value, payload)
  editOpen.value = false
  await refreshDocuments()
}

const submitUpload = () => {
  const payload: KnowledgeDocumentUploadPayload = {
    sourceType: uploadSourceType.value,
    file: uploadFile.value,
    docName:
      uploadSourceType.value === 'file'
        ? uploadFile.value?.name || '新文档'
        : uploadSourceLocation.value.split('/').filter(Boolean).pop() || '远程文档',
    sourceLocation: uploadSourceType.value === 'url' ? uploadSourceLocation.value.trim() : '',
    scheduleEnabled: uploadSourceType.value === 'url' ? uploadScheduleEnabled.value : false,
    scheduleCron: uploadSourceType.value === 'url' && uploadScheduleEnabled.value ? uploadScheduleCron.value.trim() : '',
    processMode: uploadProcessMode.value,
    chunkStrategy: uploadProcessMode.value === 'chunk' ? uploadChunkStrategy.value : undefined,
    pipelineId: uploadProcessMode.value === 'pipeline' ? uploadPipelineId.value : undefined,
    chunkConfig:
      uploadProcessMode.value === 'chunk'
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
  void handleUpload(payload)
  uploadOpen.value = false
}

const submitEdit = () => {
  const payload: KnowledgeDocumentUpdatePayload = {
    docName: editName.value.trim(),
    sourceLocation: editIsUrlSource.value ? editSourceLocation.value.trim() : '',
    scheduleEnabled: editIsUrlSource.value ? editScheduleEnabled.value : false,
    scheduleCron: editIsUrlSource.value && editScheduleEnabled.value ? editScheduleCron.value.trim() : '',
    processMode: editProcessMode.value,
    chunkStrategy: editProcessMode.value === 'chunk' ? editChunkStrategy.value : undefined,
    pipelineId: editProcessMode.value === 'pipeline' ? editPipelineId.value : undefined,
    chunkConfig:
      editProcessMode.value === 'chunk'
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
  void handleDocumentUpdate(payload)
}

const handleDeleteConfirm = async () => {
  if (!activeDocumentId.value) return
  await deleteDocument(kbId.value, activeDocumentId.value)
  deleteOpen.value = false
  activeDocumentId.value = null
  await adminStore.loadKnowledgeBases()
  await refreshDocuments()
}

const handleChunkConfirm = async () => {
  if (!activeDocumentId.value) return
  await startDocumentChunk(kbId.value, activeDocumentId.value)
  chunkOpen.value = false
  await refreshDocuments()
}

const handleToggleEnabled = async (doc: KnowledgeDocument) => {
  await toggleDocumentEnabled(kbId.value, doc.id, !doc.enabled)
  await refreshDocuments()
}

onMounted(async () => {
  if (!adminStore.knowledgeBases.length) {
    await adminStore.loadKnowledgeBases()
  }
  await adminStore.loadDocuments(kbId.value)
})
</script>

<template>
  <section class="admin-page">
    <AdminPageHeader
      title="文档管理"
      :description="knowledgeBase ? `${knowledgeBase.name}（${knowledgeBase.collectionName || ''}）` : kbId"
    >
      <template #actions>
        <el-button @click="router.push('/admin/knowledge')">
          返回知识库
        </el-button>
        <el-button type="primary" @click="uploadOpen = true">
          <FileUp class="h-4 w-4" />
          上传文档
        </el-button>
      </template>
    </AdminPageHeader>

    <div class="documents-card">
      <div class="documents-card__header">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 class="documents-card__title">文档列表</h2>
            <p class="documents-card__description">支持筛选与分块管理</p>
          </div>
          <div class="flex flex-1 flex-wrap items-center justify-end gap-2">
            <el-input
              v-model="searchInput"
              placeholder="搜索文档名称"
              clearable
              class="w-[200px]"
            />
            <el-button type="primary" @click="handleSearch">
              搜索
            </el-button>
            <el-select v-model="statusFilter" placeholder="全部状态" class="w-[160px]" @change="current = 1">
              <el-option
                v-for="item in statusOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
            <el-button @click="handleRefresh">
              <RefreshCw class="h-4 w-4" />
              刷新
            </el-button>
          </div>
        </div>
      </div>

      <div class="documents-card__content">
        <div v-if="adminStore.loading" class="py-8 text-center text-slate-500">加载中...</div>
        <div v-else-if="!filteredDocuments.records.length" class="py-8 text-center text-slate-500">暂无文档。</div>

        <el-table :data="filteredDocuments.records" stripe style="width: 100%" @row-click="(row: any) => router.push(`/admin/knowledge/${kbId}/docs/${row.id}`)">
          <el-table-column label="文档" min-width="260">
            <template #default="{ row }">
              <div class="flex items-center gap-2">
                <FolderOpen class="h-4 w-4 shrink-0 text-slate-400" />
                <span class="truncate">{{ row.docName || row.name || '-' }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="来源" width="120" prop="sourceType" :formatter="(_: any, __: any, val: any) => formatSourceLabel(val)" />
          <el-table-column label="处理模式" width="120" :formatter="(_: any, __: any, val: any) => formatProcessMode(val)">
            <template #default="{ row }">
              <span class="text-xs text-slate-500">{{ formatProcessMode(row.processMode) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="120">
            <template #default="{ row }">
              <div class="inline-flex items-center gap-2 text-xs text-slate-500">
                <span :class="['h-2 w-2 rounded-full', statusDotClass(row.status)]" />
                <span>{{ row.status || '-' }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="启用" width="80" align="center">
            <template #default="{ row }">
              <el-switch :model-value="Boolean(row.enabled)" size="small" @click.stop @change="() => handleToggleEnabled(row)" />
            </template>
          </el-table-column>
          <el-table-column label="分块数" width="90" prop="chunks" />
          <el-table-column label="类型" width="90">
            <template #default="{ row }">{{ row.fileType || row.type || '-' }}</template>
          </el-table-column>
          <el-table-column label="大小" width="90" :formatter="(_: any, __: any, val: any) => formatSize(val)">
            <template #default="{ row }">{{ formatSize(row.fileSize) }}</template>
          </el-table-column>
          <el-table-column label="更新时间" width="170">
            <template #default="{ row }">{{ row.updateTime || row.updatedAt }}</template>
          </el-table-column>
          <el-table-column label="操作" width="200" align="right">
            <template #default="{ row }">
              <div class="flex justify-end gap-1" @click.stop>
                <el-button link size="small" @click="openPreview(row.id)" title="预览"><FolderOpen class="h-3.5 w-3.5" /></el-button>
                <el-button link size="small" @click="openEdit(row.id)" title="编辑"><Pencil class="h-3.5 w-3.5" /></el-button>
                <el-button link size="small" @click="openChunk(row.id)" title="分块"><PlayCircle class="h-3.5 w-3.5" /></el-button>
                <el-button link size="small" @click="openChunkLog(row.id)" title="分块详情"><FileBarChart class="h-3.5 w-3.5" /></el-button>
                <el-button link size="small" type="danger" @click="openDelete(row.id)" title="删除"><Trash2 class="h-3.5 w-3.5" /></el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>

        <div class="flex items-center justify-between px-4 py-3">
          <span class="text-sm text-slate-500">共 {{ filteredDocuments.total }} 条</span>
          <el-pagination
            v-model:current-page="current"
            :page-size="pageSize"
            :total="filteredDocuments.total"
            layout="prev, pager, next"
            small
            background
          />
        </div>
      </div>
    </div>

    <el-dialog
      :model-value="uploadOpen"
      @update:model-value="uploadOpen = $event"
      title="上传文档"
      width="620px"
      :close-on-click-modal="false"
      append-to-body
    >
      <p class="mb-6 text-sm text-slate-500">支持本地文件或远程 URL，并配置分块策略</p>

      <div class="space-y-4">
            <div>
              <div class="mb-2 text-sm font-medium text-slate-900">来源类型</div>
              <el-select v-model="uploadSourceType" class="w-full">
                <el-option value="file" label="Local File" />
                <el-option value="url" label="Remote URL" />
              </el-select>
            </div>

            <div v-if="uploadSourceType === 'url'">
              <div class="mb-2 text-sm font-medium text-slate-900">来源地址</div>
              <el-input
                v-model="uploadSourceLocation"
                placeholder="https://raw.githubusercontent.com/bytedance/deer-flow/main/docs/API.md"
              />
              <div class="mt-1 text-sm text-slate-500">填写远程文档 URL</div>
            </div>

            <div v-else>
              <div class="mb-2 text-sm font-medium text-slate-900">本地文件</div>
              <div
                class="cursor-pointer rounded-[16px] border border-dashed border-slate-200 bg-white p-6 transition-colors hover:border-zinc-300"
                @click="triggerUploadFileSelect"
              >
                <input
                  ref="uploadFileInput"
                  type="file"
                  class="hidden"
                  @change="uploadFile = (($event.target as HTMLInputElement).files?.[0] || null)"
                >
                <div class="flex flex-col items-center justify-center text-center">
                  <div class="flex size-12 items-center justify-center rounded-[14px] bg-zinc-50 text-zinc-700">
                    <UploadCloud class="size-6" />
                  </div>
                  <template v-if="uploadFile">
                    <p class="mt-4 break-all text-sm font-medium text-slate-900">{{ uploadFile.name }}</p>
                    <p class="mt-2 text-sm leading-6 text-slate-500">
                      {{ uploadFile.size < 1024 * 1024 ? `${(uploadFile.size / 1024).toFixed(1)} KB` : `${(uploadFile.size / 1024 / 1024).toFixed(1)} MB` }}
                    </p>
                    <button
                      type="button"
                      class="mt-3 text-xs text-zinc-600 hover:underline"
                      @click.stop="uploadFile = null"
                    >
                      重新选择
                    </button>
                  </template>
                  <template v-else>
                    <p class="mt-4 text-sm font-medium text-slate-900">上传文档</p>
                    <p class="mt-2 max-w-md text-sm leading-6 text-slate-500">
                      支持 PDF、DOCX、PPTX。拖拽上传或点击选择文件。
                    </p>
                    <p class="mt-3 text-xs text-slate-400">单文件建议不超过 20MB，失败任务可在数据通道页重试。</p>
                  </template>
                </div>
              </div>
            </div>

            <div v-if="uploadSourceType === 'url'" class="space-y-3 rounded-lg border p-3">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-sm font-medium text-slate-900">开启定时拉取</div>
                  <div class="text-sm text-slate-500">开启后按频率自动更新文档</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  :aria-checked="uploadScheduleEnabled"
                  :class="
                    cn(
                      'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-300 focus:ring-offset-2',
                      uploadScheduleEnabled ? 'bg-zinc-800' : 'bg-slate-200'
                    )
                  "
                  @click="uploadScheduleEnabled = !uploadScheduleEnabled"
                >
                  <span
                    :class="
                      cn(
                        'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                        uploadScheduleEnabled ? 'translate-x-4' : 'translate-x-1'
                      )
                    "
                  />
                </button>
              </div>
              <div v-if="uploadScheduleEnabled">
                <div class="mb-2 text-sm font-medium text-slate-900">拉取频率</div>
                <el-input
                  v-model="uploadScheduleCron"
                  placeholder="例如：0 0 0 * * ?"
                />
                <div class="mt-1 text-sm text-slate-500">支持 cron 表达式，例如每天凌晨</div>
              </div>
            </div>

            <div class="space-y-3 rounded-lg border p-3">
              <div>
                <div class="mb-2 text-sm font-medium text-slate-900">处理模式</div>
                <el-select v-model="uploadProcessMode" class="w-full">
                  <el-option value="chunk" label="直接分块" />
                  <el-option value="pipeline" label="数据通道" />
                </el-select>
              </div>

              <div v-if="uploadProcessMode === 'pipeline'">
                <div class="mb-2 text-sm font-medium text-slate-900">选择通道</div>
                <el-select v-model="uploadPipelineId" class="w-full" placeholder="请选择">
                  <el-option value="" label="请选择" />
                  <el-option value="pipeline-1" label="财务制度 nightly sync" />
                  <el-option value="pipeline-2" label="客服 FAQ 每日抽取" />
                </el-select>
                <div class="mt-1 text-sm text-slate-500">通过 ETL 处理提升文档数据质量，增强向量搜索效果</div>
              </div>

              <div v-if="uploadProcessMode === 'chunk'" class="space-y-3">
                <div>
                  <div class="mb-2 text-sm font-medium text-slate-900">切分方式</div>
                  <el-select v-model="uploadChunkStrategy" class="w-full">
                    <el-option value="fixed_size" label="固定大小" />
                    <el-option value="structure_aware" label="语义感知（Markdown友好）" />
                  </el-select>
                </div>

                <div v-if="uploadIsFixedSize" class="grid gap-4 md:grid-cols-3">
                  <div>
                    <div class="mb-2 text-sm font-medium text-slate-900">块大小</div>
                    <el-input
                      :model-value="uploadChunkSize"
                      type="number"
                      @input="handleUploadChunkSizeChange"
                    />
                  </div>
                  <div>
                    <div class="mb-2 text-sm font-medium text-slate-900">重叠大小</div>
                    <el-input
                      v-model="uploadOverlapSize"
                      type="number"
                    />
                  </div>
                  <div>
                    <div class="mb-2 text-sm font-medium text-slate-900">不分块</div>
                    <div class="flex h-10 items-center">
                      <button
                        type="button"
                        role="switch"
                        :aria-checked="uploadNoChunk"
                        :class="
                          cn(
                            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-300 focus:ring-offset-2',
                            uploadNoChunk ? 'bg-zinc-800' : 'bg-slate-200'
                          )
                        "
                        @click="handleUploadNoChunkToggle"
                      >
                        <span
                          :class="
                            cn(
                              'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                              uploadNoChunk ? 'translate-x-4' : 'translate-x-1'
                            )
                          "
                        />
                      </button>
                    </div>
                    <div class="mt-1 text-sm text-slate-500">开启后块大小为 -1</div>
                  </div>
                </div>

                <div v-else class="grid gap-4 md:grid-cols-2">
                  <div>
                    <div class="mb-2 text-sm font-medium text-slate-900">理想块大小</div>
                    <el-input
                      v-model="uploadTargetChars"
                      type="number"
                    />
                  </div>
                  <div>
                    <div class="mb-2 text-sm font-medium text-slate-900">块上限</div>
                    <el-input
                      v-model="uploadMaxChars"
                      type="number"
                    />
                  </div>
                  <div>
                    <div class="mb-2 text-sm font-medium text-slate-900">块下限</div>
                    <el-input
                      v-model="uploadMinChars"
                      type="number"
                    />
                  </div>
                  <div>
                    <div class="mb-2 text-sm font-medium text-slate-900">重叠大小</div>
                    <el-input
                      v-model="uploadOverlapChars"
                      type="number"
                    />
                  </div>
                </div>
              </div>
            </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <el-button @click="uploadOpen = false">取消</el-button>
          <el-button type="primary" @click="submitUpload">上传</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      :model-value="previewOpen"
      @update:model-value="previewOpen = $event"
      :title="previewDocument?.name || '文档预览'"
      width="768px"
      :close-on-click-modal="false"
      append-to-body
    >
      <p class="mb-6 text-sm text-slate-500">展示文档基本信息、来源和摘要内容。</p>

      <div class="grid gap-6 lg:grid-cols-[280px_1fr]">
            <div class="space-y-4">
              <div class="rounded-[14px] border bg-slate-50 p-4">
                <p class="text-xs text-slate-500">来源</p>
                <p class="mt-2 text-sm font-medium text-slate-900">{{ previewDocument?.source || '-' }}</p>
              </div>

              <div class="rounded-[14px] border bg-slate-50 p-4">
                <p class="text-xs text-slate-500">更新时间</p>
                <p class="mt-2 text-sm text-slate-900">{{ previewDocument?.updatedAt || '-' }}</p>
              </div>

              <div class="rounded-[14px] border bg-slate-50 p-4">
                <p class="text-xs text-slate-500">分块数</p>
                <p class="mt-2 text-sm text-slate-900">{{ previewDocument?.chunks ?? 0 }}</p>
              </div>
            </div>

            <div class="space-y-4">
              <div class="rounded-[14px] border bg-white p-5">
                <p class="text-xs text-slate-500">摘要</p>
                <p class="mt-3 text-sm leading-7 text-slate-600">
                  {{ previewDocument?.summary || '暂无摘要' }}
                </p>
              </div>

              <div class="rounded-[14px] border bg-white p-5">
                <p class="text-xs text-slate-500">预览片段</p>
                <div class="mt-3 rounded-[12px] bg-slate-50 p-4">
                  <p class="text-sm leading-7 text-slate-600">
                    {{ previewDocument?.contentPreview || '此处保持企业后台文档详情的阅读区结构。第一阶段仍使用 mock 内容，后续可替换成 PDF / DOCX 解析结果。' }}
                  </p>
                </div>
              </div>
            </div>
          </div>
    </el-dialog>

    <el-dialog
      :model-value="editOpen"
      @update:model-value="editOpen = $event"
      title="编辑文档"
      width="620px"
      :close-on-click-modal="false"
      append-to-body
    >
      <p class="mb-6 text-sm text-slate-500">修改文档配置，保存后需重新分块才会生效</p>

      <div v-if="activeDocumentRecord" class="space-y-4">
            <div>
              <div class="mb-2 text-sm font-medium text-slate-900">来源类型</div>
              <div class="flex h-10 items-center rounded-[10px] border bg-slate-50 px-3 text-sm text-slate-500">
                {{ editSourceTypeLabel }}
              </div>
            </div>

            <div>
              <div class="mb-2 text-sm font-medium text-slate-900">{{ editNameLabel }}</div>
              <el-input v-model="editName" />
            </div>

            <template v-if="editIsUrlSource">
              <div>
                <div class="mb-2 text-sm font-medium text-slate-900">来源地址</div>
                <el-input
                  v-model="editSourceLocation"
                  placeholder="https://example.com/document.pdf"
                />
              </div>

              <div class="space-y-3 rounded-lg border p-3">
                <div class="flex items-center justify-between">
                  <div>
                    <div class="text-sm font-medium text-slate-900">开启定时拉取</div>
                    <div class="text-sm text-slate-500">开启后按频率自动更新文档</div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    :aria-checked="editScheduleEnabled"
                    :class="
                      cn(
                        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-300 focus:ring-offset-2',
                        editScheduleEnabled ? 'bg-zinc-800' : 'bg-slate-200'
                      )
                    "
                    @click="editScheduleEnabled = !editScheduleEnabled"
                  >
                    <span
                      :class="
                        cn(
                          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                          editScheduleEnabled ? 'translate-x-4' : 'translate-x-1'
                        )
                      "
                    />
                  </button>
                </div>
                <div v-if="editScheduleEnabled">
                  <div class="mb-2 text-sm font-medium text-slate-900">拉取频率（Cron 表达式）</div>
                  <el-input
                    v-model="editScheduleCron"
                    placeholder="0 0 * * * (每小时)"
                  />
                  <div class="mt-1 text-sm text-slate-500">例如：0 * * * *（每小时）；0 0 * * *（每天）</div>
                </div>
              </div>
            </template>

            <div>
              <div class="mb-2 text-sm font-medium text-slate-900">处理模式</div>
              <el-select v-model="editProcessMode" class="w-full">
                <el-option value="chunk" label="分块策略" />
                <el-option value="pipeline" label="数据通道" />
              </el-select>
              <div class="mt-1 text-sm text-slate-500">分块策略：直接分块；数据通道：使用 Pipeline 清洗</div>
            </div>

            <div v-if="editProcessMode === 'pipeline'">
              <div class="mb-2 text-sm font-medium text-slate-900">数据通道</div>
              <el-select v-model="editPipelineId" class="w-full" placeholder="选择数据通道">
                <el-option value="" label="选择数据通道" />
                <el-option value="pipeline-1" label="财务制度 nightly sync" />
                <el-option value="pipeline-2" label="客服 FAQ 每日抽取" />
              </el-select>
            </div>

            <div v-if="editProcessMode === 'chunk'" class="space-y-3 rounded-lg border p-3">
              <div>
                <div class="mb-2 text-sm font-medium text-slate-900">分块策略</div>
                <el-select v-model="editChunkStrategy" class="w-full">
                  <el-option value="fixed_size" label="固定大小" />
                  <el-option value="structure_aware" label="语义感知（Markdown 友好）" />
                </el-select>
              </div>

              <div v-if="editIsFixedSize" class="grid gap-4 md:grid-cols-3">
                <div>
                  <div class="mb-2 text-sm font-medium text-slate-900">块大小</div>
                  <el-input
                    :model-value="editChunkSize"
                    type="number"
                    @input="handleEditChunkSizeChange"
                  />
                  <div class="mt-1 text-sm text-slate-500">字符数</div>
                </div>
                <div>
                  <div class="mb-2 text-sm font-medium text-slate-900">重叠大小</div>
                  <el-input
                    v-model="editOverlapSize"
                    type="number"
                  />
                </div>
                <div>
                  <div class="mb-2 text-sm font-medium text-slate-900">不分块</div>
                  <div class="flex h-10 items-center">
                    <button
                      type="button"
                      role="switch"
                      :aria-checked="editNoChunk"
                      :class="
                        cn(
                          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-300 focus:ring-offset-2',
                          editNoChunk ? 'bg-zinc-800' : 'bg-slate-200'
                        )
                      "
                      @click="handleEditNoChunkToggle"
                    >
                      <span
                        :class="
                          cn(
                            'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                            editNoChunk ? 'translate-x-4' : 'translate-x-1'
                          )
                        "
                      />
                    </button>
                  </div>
                  <div class="mt-1 text-sm text-slate-500">开启后块大小为 -1</div>
                </div>
              </div>

              <div v-else class="grid gap-4 md:grid-cols-2">
                <div>
                  <div class="mb-2 text-sm font-medium text-slate-900">理想块大小</div>
                  <el-input
                    v-model="editTargetChars"
                    type="number"
                  />
                </div>
                <div>
                  <div class="mb-2 text-sm font-medium text-slate-900">块上限</div>
                  <el-input
                    v-model="editMaxChars"
                    type="number"
                  />
                </div>
                <div>
                  <div class="mb-2 text-sm font-medium text-slate-900">块下限</div>
                  <el-input
                    v-model="editMinChars"
                    type="number"
                  />
                </div>
                <div>
                  <div class="mb-2 text-sm font-medium text-slate-900">重叠大小</div>
                  <el-input
                    v-model="editOverlapChars"
                    type="number"
                  />
                </div>
              </div>
            </div>
          </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <el-button @click="editOpen = false">关闭</el-button>
          <el-button type="primary" :disabled="!editName.trim()" @click="submitEdit">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      :model-value="deleteOpen"
      @update:model-value="deleteOpen = $event"
      title="确认删除文档？"
      width="420px"
      :close-on-click-modal="false"
      append-to-body
    >
      <p class="mb-6 text-sm text-slate-500">文档删除后当前不提供恢复入口。确定要继续吗？</p>
      <template #footer>
        <div class="flex justify-end gap-3">
          <el-button @click="deleteOpen = false">取消</el-button>
          <el-button type="danger" @click="handleDeleteConfirm">删除</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      :model-value="chunkOpen"
      @update:model-value="chunkOpen = $event"
      :title="activeDocumentRecord?.chunks ? '重新分块？' : '开始分块？'"
      width="420px"
      :close-on-click-modal="false"
      append-to-body
    >
      <p class="mb-6 text-sm text-slate-500">文档 [{{ activeDocumentName }}] 将开始分块并写入向量库。</p>

      <template #footer>
        <div class="flex justify-end gap-3">
          <el-button @click="chunkOpen = false">取消</el-button>
          <el-button type="primary" @click="handleChunkConfirm">{{ activeDocumentRecord?.chunks ? '重新分块' : '开始分块' }}</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      :model-value="logOpen"
      @update:model-value="logOpen = $event"
      title="分块详情"
      width="800px"
      :close-on-click-modal="false"
      append-to-body
    >
      <p class="mb-6 text-sm text-slate-500">文档 [{{ activeDocumentName }}] 的分块执行日志</p>

      <div v-if="chunkLogsLoading" class="px-6 py-8 text-center text-slate-500">加载中...</div>

      <div v-else-if="chunkLogs.length" class="space-y-4">
            <template v-for="log in chunkLogs.slice(0, 1)" :key="log.id">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <span
                    :class="
                      cn(
                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                        log.status === 'success'
                          ? 'bg-emerald-50 text-emerald-700'
                          : log.status === 'failed'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-amber-50 text-amber-700'
                      )
                    "
                  >
                    {{ formatLogStatus(log.status) }}
                  </span>
                  <span class="text-sm text-slate-500">
                    {{ formatProcessMode(log.processMode) }}
                    <template v-if="log.processMode === 'chunk'">
                      / {{ formatChunkStrategy(log.chunkStrategy) }}
                    </template>
                    <template v-if="log.processMode === 'pipeline' && (log.pipelineName || log.pipelineId)">
                      / {{ log.pipelineName || log.pipelineId }}
                    </template>
                  </span>
                </div>
                <span class="text-2xl font-semibold tabular-nums">
                  {{ log.chunkCount ?? 0 }}
                  <span class="text-sm font-normal text-slate-500">块</span>
                </span>
              </div>

              <div class="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
                <div v-if="log.processMode !== 'pipeline'" class="rounded-lg border bg-slate-50/50 p-3">
                  <div class="mb-1 text-xs text-slate-500">文本提取</div>
                  <div class="text-lg font-semibold tabular-nums">{{ formatDuration(log.extractDuration) }}</div>
                </div>
                <div class="rounded-lg border bg-slate-50/50 p-3">
                  <div class="mb-1 text-xs text-slate-500">{{ log.processMode === 'pipeline' ? '通道执行' : '分块耗时' }}</div>
                  <div class="text-lg font-semibold tabular-nums">{{ formatDuration(log.chunkDuration) }}</div>
                </div>
                <div v-if="log.processMode !== 'pipeline'" class="rounded-lg border bg-slate-50/50 p-3">
                  <div class="mb-1 text-xs text-slate-500">向量化</div>
                  <div class="text-lg font-semibold tabular-nums">{{ formatDuration(log.embedDuration) }}</div>
                </div>
                <div class="rounded-lg border bg-slate-50/50 p-3">
                  <div class="mb-1 text-xs text-slate-500">持久化</div>
                  <div class="text-lg font-semibold tabular-nums">{{ formatDuration(log.persistDuration) }}</div>
                </div>
                <div class="rounded-lg border bg-zinc-50 p-3">
                  <div class="mb-1 text-xs text-zinc-700">更新时间</div>
                  <div class="text-sm font-bold text-zinc-700">{{ log.updateTime || log.updatedAt || '-' }}</div>
                </div>
              </div>

              <div class="rounded-lg border bg-slate-50/50 p-4 text-sm text-slate-600">
                当前阶段保留与 ragent 相同的信息层级：状态、处理模式、耗时指标和执行明细容器。
              </div>
            </template>
          </div>

      <div v-else class="px-6 py-8 text-center text-slate-500">暂无分块日志</div>

      <template #footer>
        <div class="flex justify-end">
          <el-button @click="logOpen = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>
  </section>
</template>

<style>
.admin-layout .documents-card {
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
}

.admin-layout .documents-card__header {
  border-bottom: 1px solid #f1f5f9;
  padding: 20px 24px 16px;
}

.admin-layout .documents-card__title {
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}

.admin-layout .documents-card__description {
  font-size: 14px;
  color: #64748b;
}

.admin-layout .documents-card__content {
  padding: 0 24px 24px;
}

.admin-layout .documents-table {
  border-collapse: collapse;
  font-size: 13px;
  color: #334155;
}

.admin-layout .documents-table__header {
  background: #f9fafb;
}

.admin-layout .documents-table__row {
  border-bottom: 1px solid #f1f5f9;
}

.admin-layout .documents-table__head {
  height: 56px;
  padding: 0 16px;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  text-align: left;
}

.admin-layout .documents-table__cell {
  padding: 14px 16px;
  vertical-align: middle;
}
</style>
