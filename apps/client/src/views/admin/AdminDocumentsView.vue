<script setup lang="ts">
import { FileBarChart, FileUp, FolderOpen, Pencil, PlayCircle, RefreshCw, Trash2, UploadCloud } from 'lucide-vue-next'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle
} from 'reka-ui'
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

function handleSearch() {
  current.value = 1
  keyword.value = searchInput.value.trim()
}

function handleRefresh() {
  current.value = 1
}

function handleStatusFilterChange(value: string) {
  current.value = 1
  statusFilter.value = value
}

function handlePrevPage() {
  current.value = Math.max(1, current.value - 1)
}

function handleNextPage() {
  current.value = Math.min(filteredDocuments.value.pages, current.value + 1)
}

function openEdit(documentId: string) {
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

async function openPreview(documentId: string) {
  previewDocument.value = await fetchDocumentDetail(kbId.value, documentId)
  previewOpen.value = true
}

function openDelete(documentId: string) {
  activeDocumentId.value = documentId
  deleteOpen.value = true
}

function openChunk(documentId: string) {
  activeDocumentId.value = documentId
  chunkOpen.value = true
}

async function openChunkLog(documentId: string) {
  activeDocumentId.value = documentId
  chunkLogsLoading.value = true
  chunkLogs.value = await fetchDocumentChunkLogs(documentId)
  chunkLogsLoading.value = false
  logOpen.value = true
}

function formatSourceLabel(sourceType?: string | null) {
  const normalized = sourceType?.toLowerCase()
  if (normalized === 'url') return 'Remote URL'
  if (normalized === 'file') return 'Local File'
  return '-'
}

function formatProcessMode(mode?: string | null) {
  const normalized = mode?.toLowerCase()
  if (normalized === 'pipeline') return '数据通道'
  if (normalized === 'chunk') return '直接分块'
  return mode || '-'
}

function formatChunkStrategy(strategy?: string | null) {
  const normalized = strategy?.toLowerCase()
  if (normalized === 'fixed_size') return '固定大小'
  if (normalized === 'structure_aware') return '语义感知'
  return strategy || '-'
}

function formatSize(size?: number | null) {
  if (!size && size !== 0) return '-'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function statusDotClass(status?: string | null) {
  if (!status) return 'bg-muted-foreground/40'
  const normalized = status.toLowerCase()
  if (normalized === 'success' || normalized === 'indexed') return 'bg-emerald-500'
  if (normalized === 'failed') return 'bg-red-500'
  if (normalized === 'running' || normalized === 'processing') return 'bg-amber-500'
  if (normalized === 'pending') return 'bg-slate-400'
  return 'bg-muted-foreground/40'
}

function formatLogStatus(status?: string | null) {
  const normalized = status?.toLowerCase()
  if (normalized === 'success') return '成功'
  if (normalized === 'failed') return '失败'
  if (normalized === 'running') return '进行中'
  return status || '-'
}

function formatDuration(ms?: number | null) {
  if (!ms && ms !== 0) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function resetUploadForm() {
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

function handleUploadNoChunkToggle() {
  if (uploadNoChunk.value) {
    uploadChunkSize.value = uploadOriginalChunkSize.value
    uploadNoChunk.value = false
    return
  }
  uploadOriginalChunkSize.value = uploadChunkSize.value || '512'
  uploadChunkSize.value = '-1'
  uploadNoChunk.value = true
}

function handleUploadChunkSizeChange(value: string | number) {
  uploadChunkSize.value = String(value)
  if (uploadNoChunk.value && uploadChunkSize.value !== '-1') {
    uploadNoChunk.value = false
  }
}

function triggerUploadFileSelect() {
  uploadFileInput.value?.click()
}

function handleEditNoChunkToggle() {
  if (editNoChunk.value) {
    editChunkSize.value = editOriginalChunkSize.value
    editNoChunk.value = false
    return
  }
  editOriginalChunkSize.value = editChunkSize.value || '512'
  editChunkSize.value = '-1'
  editNoChunk.value = true
}

function handleEditChunkSizeChange(value: string | number) {
  editChunkSize.value = String(value)
  if (editNoChunk.value && editChunkSize.value !== '-1') {
    editNoChunk.value = false
  }
}

async function refreshDocuments() {
  await adminStore.loadDocuments(kbId.value)
}

async function handleUpload(payload: KnowledgeDocumentUploadPayload) {
  await uploadDocument(kbId.value, payload)
  resetUploadForm()
  await adminStore.loadKnowledgeBases()
  await refreshDocuments()
}

async function handleDocumentUpdate(payload: KnowledgeDocumentUpdatePayload) {
  if (!activeDocumentId.value) return
  await updateDocumentDetail(kbId.value, activeDocumentId.value, payload)
  editOpen.value = false
  await refreshDocuments()
}

function submitUpload() {
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

function submitEdit() {
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

async function handleDeleteConfirm() {
  if (!activeDocumentId.value) return
  await deleteDocument(kbId.value, activeDocumentId.value)
  deleteOpen.value = false
  activeDocumentId.value = null
  await adminStore.loadKnowledgeBases()
  await refreshDocuments()
}

async function handleChunkConfirm() {
  if (!activeDocumentId.value) return
  await startDocumentChunk(kbId.value, activeDocumentId.value)
  chunkOpen.value = false
  await refreshDocuments()
}

async function handleToggleEnabled(doc: KnowledgeDocument) {
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
        <button
          type="button"
          class="rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
          @click="router.push('/admin/knowledge')"
        >
          返回知识库
        </button>
        <button
          type="button"
          class="admin-primary-gradient inline-flex items-center gap-2 rounded-[10px] px-4 py-2 text-sm text-white"
          @click="uploadOpen = true"
        >
          <FileUp class="h-4 w-4" />
          上传文档
        </button>
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
            <input
              v-model="searchInput"
              placeholder="搜索文档名称"
              class="h-10 max-w-xs rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
            <button
              type="button"
              class="rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
              @click="handleSearch"
            >
              搜索
            </button>
            <select
              :value="statusFilter"
              class="h-10 w-[160px] rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              @change="handleStatusFilterChange(($event.target as HTMLSelectElement).value)"
            >
              <option value="all">全部状态</option>
              <option value="pending">pending</option>
              <option value="running">running</option>
              <option value="failed">failed</option>
              <option value="success">success</option>
            </select>
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
              @click="handleRefresh"
            >
              <RefreshCw class="h-4 w-4" />
              刷新
            </button>
          </div>
        </div>
      </div>

      <div class="documents-card__content">
        <div v-if="adminStore.loading" class="py-8 text-center text-slate-500">加载中...</div>
        <div v-else-if="!filteredDocuments.records.length" class="py-8 text-center text-slate-500">暂无文档。</div>

        <div v-else class="overflow-x-auto">
          <table class="documents-table min-w-[1120px]">
            <thead class="documents-table__header">
              <tr class="documents-table__row">
                <th class="documents-table__head w-[260px]">文档</th>
                <th class="documents-table__head w-[120px]">来源</th>
                <th class="documents-table__head w-[120px]">处理模式</th>
                <th class="documents-table__head w-[120px]">状态</th>
                <th class="documents-table__head w-[80px]">启用</th>
                <th class="documents-table__head w-[90px]">分块数</th>
                <th class="documents-table__head w-[90px]">类型</th>
                <th class="documents-table__head w-[90px]">大小</th>
                <th class="documents-table__head w-[170px]">更新时间</th>
                <th class="documents-table__head w-[160px] text-left">操作</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="doc in filteredDocuments.records" :key="doc.id" class="documents-table__row">
                <td class="documents-table__cell font-medium">
                  <div class="flex min-w-0 max-w-[280px] items-center gap-2">
                    <FolderOpen class="h-4 w-4 text-slate-400" />
                    <button
                      type="button"
                      class="admin-link min-w-0 flex-1 text-left"
                      :title="doc.docName || doc.name || ''"
                      @click="router.push(`/admin/knowledge/${kbId}/docs/${doc.id}`)"
                    >
                      <span class="min-w-0 truncate">{{ doc.docName || doc.name || '-' }}</span>
                    </button>
                  </div>
                </td>

                <td class="documents-table__cell">
                  <span class="text-xs text-slate-500">{{ formatSourceLabel(doc.sourceType) }}</span>
                </td>

                <td class="documents-table__cell">
                  <span class="text-xs text-slate-500">{{ formatProcessMode(doc.processMode) }}</span>
                </td>

                <td class="documents-table__cell">
                  <div class="inline-flex items-center gap-2 text-xs text-slate-500">
                    <span :class="cn('h-2 w-2 rounded-full', statusDotClass(doc.status))" />
                    <span>{{ doc.status || '-' }}</span>
                  </div>
                </td>

                <td class="documents-table__cell">
                  <button
                    type="button"
                    role="switch"
                    :aria-checked="Boolean(doc.enabled)"
                    :class="
                      cn(
                        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2',
                        doc.enabled ? 'bg-blue-600' : 'bg-slate-200'
                      )
                    "
                    @click="handleToggleEnabled(doc)"
                  >
                    <span
                      :class="
                        cn(
                          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                          doc.enabled ? 'translate-x-4' : 'translate-x-1'
                        )
                      "
                    />
                  </button>
                </td>

                <td class="documents-table__cell">{{ doc.chunks ?? '-' }}</td>
                <td class="documents-table__cell">{{ doc.fileType || doc.type || '-' }}</td>
                <td class="documents-table__cell">{{ formatSize(doc.fileSize) }}</td>
                <td class="documents-table__cell">{{ doc.updateTime || doc.updatedAt }}</td>

                <td class="documents-table__cell text-right">
                  <div class="flex justify-end gap-1">
                    <button type="button" class="rounded-[10px] p-2 text-slate-500 transition hover:bg-slate-100" title="预览" @click="openPreview(doc.id)">
                      <FolderOpen class="h-4 w-4" />
                    </button>
                    <button type="button" class="rounded-[10px] p-2 text-slate-500 transition hover:bg-slate-100" title="编辑" @click="openEdit(doc.id)">
                      <Pencil class="h-4 w-4" />
                    </button>
                    <button type="button" class="rounded-[10px] p-2 text-slate-500 transition hover:bg-slate-100" title="分块" @click="openChunk(doc.id)">
                      <PlayCircle class="h-4 w-4" />
                    </button>
                    <button type="button" class="rounded-[10px] p-2 text-slate-500 transition hover:bg-slate-100" title="分块详情" @click="openChunkLog(doc.id)">
                      <FileBarChart class="h-4 w-4" />
                    </button>
                    <button type="button" class="rounded-[10px] p-2 text-red-600 transition hover:bg-red-50" title="删除" @click="openDelete(doc.id)">
                      <Trash2 class="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
          <span>共 {{ filteredDocuments.total }} 条</span>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded-[10px] border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              @click="handlePrevPage"
              :disabled="filteredDocuments.current <= 1"
            >
              上一页
            </button>
            <span>{{ filteredDocuments.current }} / {{ filteredDocuments.pages }}</span>
            <button
              type="button"
              class="rounded-[10px] border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              @click="handleNextPage"
              :disabled="filteredDocuments.current >= filteredDocuments.pages"
            >
              下一页
            </button>
          </div>
        </div>
      </div>
    </div>

    <DialogRoot :open="uploadOpen" @update:open="uploadOpen = $event">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-50 bg-black/45" />
        <DialogContent class="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-32px)] max-w-[620px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[16px] border bg-white p-0 shadow-xl outline-none">
          <div class="border-b px-6 py-5 text-left">
            <DialogTitle class="text-[18px] font-semibold text-slate-900">上传文档</DialogTitle>
            <DialogDescription class="mt-2 text-sm text-slate-500">支持本地文件或远程 URL，并配置分块策略</DialogDescription>
          </div>

          <div class="space-y-4 px-6 py-6">
            <div>
              <div class="mb-2 text-sm font-medium text-slate-900">来源类型</div>
              <select
                v-model="uploadSourceType"
                class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="file">Local File</option>
                <option value="url">Remote URL</option>
              </select>
            </div>

            <div v-if="uploadSourceType === 'url'">
              <div class="mb-2 text-sm font-medium text-slate-900">来源地址</div>
              <input
                v-model="uploadSourceLocation"
                placeholder="https://raw.githubusercontent.com/bytedance/deer-flow/main/docs/API.md"
                class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
              <div class="mt-1 text-sm text-slate-500">填写远程文档 URL</div>
            </div>

            <div v-else>
              <div class="mb-2 text-sm font-medium text-slate-900">本地文件</div>
              <div
                class="cursor-pointer rounded-[16px] border border-dashed border-slate-200 bg-white p-6 transition-colors hover:border-blue-300"
                @click="triggerUploadFileSelect"
              >
                <input
                  ref="uploadFileInput"
                  type="file"
                  class="hidden"
                  @change="uploadFile = (($event.target as HTMLInputElement).files?.[0] || null)"
                >
                <div class="flex flex-col items-center justify-center text-center">
                  <div class="flex size-12 items-center justify-center rounded-[14px] bg-blue-50 text-blue-600">
                    <UploadCloud class="size-6" />
                  </div>
                  <template v-if="uploadFile">
                    <p class="mt-4 break-all text-sm font-medium text-slate-900">{{ uploadFile.name }}</p>
                    <p class="mt-2 text-sm leading-6 text-slate-500">
                      {{ uploadFile.size < 1024 * 1024 ? `${(uploadFile.size / 1024).toFixed(1)} KB` : `${(uploadFile.size / 1024 / 1024).toFixed(1)} MB` }}
                    </p>
                    <button
                      type="button"
                      class="mt-3 text-xs text-blue-600 hover:underline"
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
                      'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2',
                      uploadScheduleEnabled ? 'bg-blue-600' : 'bg-slate-200'
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
                <input
                  v-model="uploadScheduleCron"
                  placeholder="例如：0 0 0 * * ?"
                  class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                <div class="mt-1 text-sm text-slate-500">支持 cron 表达式，例如每天凌晨</div>
              </div>
            </div>

            <div class="space-y-3 rounded-lg border p-3">
              <div>
                <div class="mb-2 text-sm font-medium text-slate-900">处理模式</div>
                <select
                  v-model="uploadProcessMode"
                  class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="chunk">直接分块</option>
                  <option value="pipeline">数据通道</option>
                </select>
              </div>

              <div v-if="uploadProcessMode === 'pipeline'">
                <div class="mb-2 text-sm font-medium text-slate-900">选择通道</div>
                <select
                  v-model="uploadPipelineId"
                  class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">请选择</option>
                  <option value="pipeline-1">财务制度 nightly sync</option>
                  <option value="pipeline-2">客服 FAQ 每日抽取</option>
                </select>
                <div class="mt-1 text-sm text-slate-500">通过 ETL 处理提升文档数据质量，增强向量搜索效果</div>
              </div>

              <div v-if="uploadProcessMode === 'chunk'" class="space-y-3">
                <div>
                  <div class="mb-2 text-sm font-medium text-slate-900">切分方式</div>
                  <select
                    v-model="uploadChunkStrategy"
                    class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="fixed_size">固定大小</option>
                    <option value="structure_aware">语义感知（Markdown友好）</option>
                  </select>
                </div>

                <div v-if="uploadIsFixedSize" class="grid gap-4 md:grid-cols-3">
                  <div>
                    <div class="mb-2 text-sm font-medium text-slate-900">块大小</div>
                    <input
                      :value="uploadChunkSize"
                      type="number"
                      class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      @input="handleUploadChunkSizeChange(($event.target as HTMLInputElement).value)"
                    >
                  </div>
                  <div>
                    <div class="mb-2 text-sm font-medium text-slate-900">重叠大小</div>
                    <input
                      v-model="uploadOverlapSize"
                      type="number"
                      class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    >
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
                            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2',
                            uploadNoChunk ? 'bg-blue-600' : 'bg-slate-200'
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
                    <input
                      v-model="uploadTargetChars"
                      type="number"
                      class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    >
                  </div>
                  <div>
                    <div class="mb-2 text-sm font-medium text-slate-900">块上限</div>
                    <input
                      v-model="uploadMaxChars"
                      type="number"
                      class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    >
                  </div>
                  <div>
                    <div class="mb-2 text-sm font-medium text-slate-900">块下限</div>
                    <input
                      v-model="uploadMinChars"
                      type="number"
                      class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    >
                  </div>
                  <div>
                    <div class="mb-2 text-sm font-medium text-slate-900">重叠大小</div>
                    <input
                      v-model="uploadOverlapChars"
                      type="number"
                      class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    >
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-3 border-t px-6 py-4">
            <button type="button" class="rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50" @click="uploadOpen = false">取消</button>
            <button type="button" class="rounded-[10px] bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700" @click="submitUpload">上传</button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <DialogRoot :open="previewOpen" @update:open="previewOpen = $event">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-50 bg-black/45" />
        <DialogContent class="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-[16px] border bg-white p-0 shadow-xl outline-none">
          <div class="border-b px-6 py-5 text-left">
            <DialogTitle class="text-[18px] font-semibold text-slate-900">
              {{ previewDocument?.name || '文档预览' }}
            </DialogTitle>
            <DialogDescription class="mt-2 text-sm text-slate-500">
              展示文档基本信息、来源和摘要内容。
            </DialogDescription>
          </div>

          <div class="grid gap-6 px-6 py-6 lg:grid-cols-[280px_1fr]">
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
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <DialogRoot :open="editOpen" @update:open="editOpen = $event">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-50 bg-black/45" />
        <DialogContent class="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-32px)] max-w-[620px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[16px] border bg-white p-0 shadow-xl outline-none">
          <div class="border-b px-6 py-5 text-left">
            <DialogTitle class="text-[18px] font-semibold text-slate-900">编辑文档</DialogTitle>
            <DialogDescription class="mt-2 text-sm text-slate-500">修改文档配置，保存后需重新分块才会生效</DialogDescription>
          </div>

          <div v-if="activeDocumentRecord" class="space-y-4 px-6 py-6">
            <div>
              <div class="mb-2 text-sm font-medium text-slate-900">来源类型</div>
              <div class="flex h-10 items-center rounded-[10px] border bg-slate-50 px-3 text-sm text-slate-500">
                {{ editSourceTypeLabel }}
              </div>
            </div>

            <div>
              <div class="mb-2 text-sm font-medium text-slate-900">{{ editNameLabel }}</div>
              <input
                v-model="editName"
                class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
            </div>

            <template v-if="editIsUrlSource">
              <div>
                <div class="mb-2 text-sm font-medium text-slate-900">来源地址</div>
                <input
                  v-model="editSourceLocation"
                  placeholder="https://example.com/document.pdf"
                  class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
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
                        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2',
                        editScheduleEnabled ? 'bg-blue-600' : 'bg-slate-200'
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
                  <input
                    v-model="editScheduleCron"
                    placeholder="0 0 * * * (每小时)"
                    class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                  <div class="mt-1 text-sm text-slate-500">例如：0 * * * *（每小时）；0 0 * * *（每天）</div>
                </div>
              </div>
            </template>

            <div>
              <div class="mb-2 text-sm font-medium text-slate-900">处理模式</div>
              <select
                v-model="editProcessMode"
                class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="chunk">分块策略</option>
                <option value="pipeline">数据通道</option>
              </select>
              <div class="mt-1 text-sm text-slate-500">分块策略：直接分块；数据通道：使用 Pipeline 清洗</div>
            </div>

            <div v-if="editProcessMode === 'pipeline'">
              <div class="mb-2 text-sm font-medium text-slate-900">数据通道</div>
              <select
                v-model="editPipelineId"
                class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">选择数据通道</option>
                <option value="pipeline-1">财务制度 nightly sync</option>
                <option value="pipeline-2">客服 FAQ 每日抽取</option>
              </select>
            </div>

            <div v-if="editProcessMode === 'chunk'" class="space-y-3 rounded-lg border p-3">
              <div>
                <div class="mb-2 text-sm font-medium text-slate-900">分块策略</div>
                <select
                  v-model="editChunkStrategy"
                  class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="fixed_size">固定大小</option>
                  <option value="structure_aware">语义感知（Markdown 友好）</option>
                </select>
              </div>

              <div v-if="editIsFixedSize" class="grid gap-4 md:grid-cols-3">
                <div>
                  <div class="mb-2 text-sm font-medium text-slate-900">块大小</div>
                  <input
                    :value="editChunkSize"
                    type="number"
                    class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    @input="handleEditChunkSizeChange(($event.target as HTMLInputElement).value)"
                  >
                  <div class="mt-1 text-sm text-slate-500">字符数</div>
                </div>
                <div>
                  <div class="mb-2 text-sm font-medium text-slate-900">重叠大小</div>
                  <input
                    v-model="editOverlapSize"
                    type="number"
                    class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
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
                          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2',
                          editNoChunk ? 'bg-blue-600' : 'bg-slate-200'
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
                  <input
                    v-model="editTargetChars"
                    type="number"
                    class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                </div>
                <div>
                  <div class="mb-2 text-sm font-medium text-slate-900">块上限</div>
                  <input
                    v-model="editMaxChars"
                    type="number"
                    class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                </div>
                <div>
                  <div class="mb-2 text-sm font-medium text-slate-900">块下限</div>
                  <input
                    v-model="editMinChars"
                    type="number"
                    class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                </div>
                <div>
                  <div class="mb-2 text-sm font-medium text-slate-900">重叠大小</div>
                  <input
                    v-model="editOverlapChars"
                    type="number"
                    class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                </div>
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-3 border-t px-6 py-4">
            <button type="button" class="rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50" @click="editOpen = false">关闭</button>
            <button type="button" class="rounded-[10px] bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60" :disabled="!editName.trim()" @click="submitEdit">保存</button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <DialogRoot :open="deleteOpen" @update:open="deleteOpen = $event">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-50 bg-black/45" />
        <DialogContent class="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[16px] border bg-white p-0 shadow-xl outline-none">
          <div class="border-b px-6 py-5 text-left">
            <DialogTitle class="text-[18px] font-semibold text-slate-900">确认删除文档？</DialogTitle>
            <DialogDescription class="mt-2 text-sm text-slate-500">文档删除后当前不提供恢复入口。确定要继续吗？</DialogDescription>
          </div>
          <div class="flex justify-end gap-3 px-6 py-4">
            <button type="button" class="rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50" @click="deleteOpen = false">取消</button>
            <button type="button" class="rounded-[10px] bg-red-600 px-4 py-2 text-sm text-white transition hover:bg-red-700" @click="handleDeleteConfirm">删除</button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <DialogRoot :open="chunkOpen" @update:open="chunkOpen = $event">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-50 bg-black/45" />
        <DialogContent class="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[16px] border bg-white p-0 shadow-xl outline-none">
          <div class="border-b px-6 py-5 text-left">
            <DialogTitle class="text-[18px] font-semibold text-slate-900">{{ activeDocumentRecord?.chunks ? '重新分块？' : '开始分块？' }}</DialogTitle>
            <DialogDescription class="mt-2 text-sm text-slate-500">文档 [{{ activeDocumentName }}] 将开始分块并写入向量库。</DialogDescription>
          </div>
          <div class="flex justify-end gap-3 px-6 py-4">
            <button type="button" class="rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50" @click="chunkOpen = false">取消</button>
            <button type="button" class="rounded-[10px] bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700" @click="handleChunkConfirm">{{ activeDocumentRecord?.chunks ? '重新分块' : '开始分块' }}</button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <DialogRoot :open="logOpen" @update:open="logOpen = $event">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-50 bg-black/45" />
        <DialogContent class="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-32px)] max-w-[800px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[16px] border bg-white p-0 shadow-xl outline-none">
          <div class="border-b px-6 py-5 text-left">
            <DialogTitle class="text-[18px] font-semibold text-slate-900">分块详情</DialogTitle>
            <DialogDescription class="mt-2 text-sm text-slate-500">文档 [{{ activeDocumentName }}] 的分块执行日志</DialogDescription>
          </div>

          <div v-if="chunkLogsLoading" class="px-6 py-8 text-center text-slate-500">加载中...</div>

          <div v-else-if="chunkLogs.length" class="space-y-4 px-6 py-6">
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
                <div class="rounded-lg border bg-blue-50 p-3">
                  <div class="mb-1 text-xs text-blue-600">更新时间</div>
                  <div class="text-sm font-bold text-blue-600">{{ log.updateTime || log.updatedAt || '-' }}</div>
                </div>
              </div>

              <div class="rounded-lg border bg-slate-50/50 p-4 text-sm text-slate-600">
                当前阶段保留与 ragent 相同的信息层级：状态、处理模式、耗时指标和执行明细容器。
              </div>
            </template>
          </div>

          <div v-else class="px-6 py-8 text-center text-slate-500">暂无分块日志</div>

          <div class="flex justify-end border-t px-6 py-4">
            <button type="button" class="rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50" @click="logOpen = false">关闭</button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
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
