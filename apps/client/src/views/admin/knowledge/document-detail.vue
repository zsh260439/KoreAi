<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { ChevronLeft, Download, RefreshCw } from 'lucide-vue-next'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import VueOfficeDocx from '@vue-office/docx/lib/v3/vue-office-docx.mjs'
import '@vue-office/docx/lib/v3/index.css'

import { useKnowledgeChunks } from '@/composables/knowledge/useKnowledgeChunks'
import { useKnowledgeDocuments } from '@/composables/knowledge/useKnowledgeDocuments'
import { getKnowledgeDocumentFileUrl } from '@/servers/knowledge'
import type { KnowledgeChunk, KnowledgeChunkBlock, KnowledgeChunkMetadata } from 'share-type'

const route = useRoute()
const router = useRouter()

const { currentDocument, loadKnowledgeDocument } = useKnowledgeDocuments()
const { chunks, loadKnowledgeChunks, rebuildKnowledgeChunks } = useKnowledgeChunks()

const kbId = computed(() => String(route.params.kbId || ''))

const docId = computed(() => String(route.params.docId || ''))

const highlightedChunkId = computed(() => {
  const value = route.query.chunkId
  return typeof value === 'string' ? value : ''
})

const searchText = computed(() => {
  const value = route.query.text
  return typeof value === 'string' ? value.trim() : ''
})

const contentDialogOpen = ref(false)
const activeChunk = ref<KnowledgeChunk | null>(null)
const activeView = ref<'structure' | 'original'>('structure')

const documentFileUrl = computed(() => getKnowledgeDocumentFileUrl(docId.value))

const originalDocumentFacts = computed(() => [
  { label: '文件名称', value: currentDocument.value?.name || '-' },
  { label: '文件类型', value: formatDocumentFileType(currentDocument.value?.fileType) },
  { label: '文件大小', value: formatFileSize(currentDocument.value?.fileSizeBytes) },
  { label: '更新时间', value: formatDateTime(currentDocument.value?.updatedAt) },
  { label: '内容指纹', value: currentDocument.value?.contentHash || '-' }
])

const activeChunkBlocks = computed(() => getChunkBlocks(activeChunk.value))

const activeChunkHasBlocks = computed(() => activeChunkBlocks.value.length > 0)

const activeChunkReviewHint = computed(() => {
  if (activeChunkHasBlocks.value) {
    return '当前 chunk 包含结构化 block，适合直接检查切分边界、章节路径和附加元数据。'
  }

  return '当前 chunk 没有结构化 block 数据，页面只展示基础 chunk 信息。'
})

const activeChunkFacts = computed(() => {
  if (!activeChunk.value) {
    return []
  }

  return [
    {
      label: '章节路径',
      value: getChunkPrimaryPath(activeChunk.value) || '未提供章节路径'
    },
    {
      label: '结构类型',
      value: getChunkTypeLabels(activeChunk.value).join(' / ') || '无'
    },
    {
      label: '页码范围',
      value: getChunkPageSummary(activeChunk.value)
    },
    {
      label: '偏移范围',
      value: getChunkOffsetRange(activeChunk.value)
    }
  ]
})

const documentFacts = computed(() => [
  {
    label: '文档状态',
    value: getDocumentStatusLabel(currentDocument.value?.status)
  },
  {
    label: '文件类型',
    value: formatDocumentFileType(currentDocument.value?.fileType)
  },
  {
    label: 'Chunk 数',
    value: String(chunks.value.length)
  },
  {
    label: '解析方式',
    value: getDocumentParseLabel(chunks.value)
  }
])

const tableCaption = computed(() => {
  if (highlightedChunkId.value) {
    return '当前列表已自动定位到搜索命中的 chunk，便于直接检查召回质量和结构切分结果。'
  }

  return '列表按 chunk 顺序展示，重点保留结构路径、偏移范围、页码和 block 类型，方便逐条 review。'
})

const isRebuildingChunks = ref(false)

const rebuildChunks = async () => {
  if (isRebuildingChunks.value) return

  isRebuildingChunks.value = true
  try {
    await rebuildKnowledgeChunks(docId.value)
    await loadKnowledgeDocument(docId.value)
    ElMessage.success('已加入处理队列，请稍后查看状态')
  } catch (error) {
    await loadKnowledgeDocument(docId.value)
    ElMessage.error(error instanceof Error ? error.message : '文档分块失败')
  } finally {
    isRebuildingChunks.value = false
  }
}

function getDocumentParseLabel(items: KnowledgeChunk[]): string {
  const sourceKinds = new Set(items.map((item) => item.metadata?.sourceKind).filter(Boolean))
  const ocrPageCount = getOcrPageNumbers(items).length

  if (sourceKinds.has('pdf-mineru')) {
    return 'MinerU'
  }

  if (ocrPageCount > 0 || sourceKinds.has('pdf-ocr')) {
    return `OCR · ${ocrPageCount} 页`
  }

  if (sourceKinds.has('pdf-copyable') || sourceKinds.has('pdf-complex')) {
    return 'PDF 文本'
  }

  return items.length > 0 ? '文档文本' : '-'
}

function getOcrPageNumbers(items: KnowledgeChunk[]): number[] {
  return Array.from(new Set(
    items.flatMap((item) =>
      (item.metadata?.blocks ?? [])
        .filter((block) => block.blockType === 'ocr_page' && typeof block.pageNumber === 'number')
        .map((block) => block.pageNumber as number)
    )
  ))
}

const handleRefresh = async () => {
  await loadKnowledgeDocument(docId.value)
  await loadKnowledgeChunks(docId.value)
  await scrollToHighlightedChunk()
}

const isHighlightedChunk = (chunkId: string) => chunkId === highlightedChunkId.value

const getChunkPreview = (content: string, limit = 180) => {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) {
    return normalized
  }

  return `${normalized.slice(0, limit)}...`
}

const openChunkContent = (chunk: KnowledgeChunk) => {
  activeChunk.value = chunk
  contentDialogOpen.value = true
}

const getChunkRowClassName = ({ row }: { row: KnowledgeChunk }) =>
  (isHighlightedChunk(row.id) ? 'chunk-row--active' : '')

const scrollToHighlightedChunk = async () => {
  if (!highlightedChunkId.value) {
    return
  }

  await nextTick()

  const element = document.querySelector('.chunk-row--active')
  if (!(element instanceof HTMLElement)) {
    return
  }

  element.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  })
}

function getDocumentStatusLabel(status?: string | null): string {
  if (status === 'indexed') {
    return '已完成'
  }

  if (status === 'processing') {
    return '处理中'
  }

  if (status === 'failed') {
    return '失败'
  }

  if (status === 'pending') {
    return '待处理'
  }

  return '-'
}

function formatDocumentFileType(fileType?: string | null): string {
  if (!fileType) {
    return '-'
  }

  return fileType.toUpperCase()
}

function formatFileSize(size?: number | null): string {
  if (!size) return '-'
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function formatDateTime(value?: string | null): string {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-'
}

function getChunkMetadata(chunk: KnowledgeChunk | null | undefined): KnowledgeChunkMetadata | null {
  return chunk?.metadata ?? null
}

function getChunkBlocks(chunk: KnowledgeChunk | null | undefined): KnowledgeChunkBlock[] {
  return getChunkMetadata(chunk)?.blocks ?? []
}

function getChunkBlockCount(chunk: KnowledgeChunk | null | undefined): number {
  return getChunkBlocks(chunk).length
}

function getChunkPrimaryPath(chunk: KnowledgeChunk | null | undefined): string {
  const blocks = getChunkBlocks(chunk)
  const firstPath = blocks.find((item) => item.sectionPath.length > 0)?.sectionPath ?? []
  if (firstPath.length > 0) {
    return formatSectionPath(firstPath)
  }

  const metadata = getChunkMetadata(chunk)
  const metadataPath = metadata?.sectionPaths?.find((item) => item.length > 0) ?? []
  return formatSectionPath(metadataPath)
}

function getChunkTypeLabels(chunk: KnowledgeChunk | null | undefined): string[] {
  const types = getChunkBlocks(chunk).map((item) => item.blockType)
  return Array.from(new Set(types)).slice(0, 4)
}

function getChunkStructureStatus(chunk: KnowledgeChunk | null | undefined): string {
  const count = getChunkBlockCount(chunk)
  if (count > 0) {
    return `${count} 个结构块`
  }

  return '无结构块元数据'
}

function getChunkInspectButtonLabel(chunk: KnowledgeChunk | null | undefined): string {
  return getChunkBlockCount(chunk) > 0 ? '查看结构' : '查看详情'
}

function getChunkOffsetRange(chunk: KnowledgeChunk | null | undefined): string {
  const blocks = getChunkBlocks(chunk)
  const startOffset = blocks.find((item) => typeof item.startOffset === 'number')?.startOffset
  const endOffset = [...blocks].reverse().find((item) => typeof item.endOffset === 'number')?.endOffset

  if (typeof startOffset === 'number' && typeof endOffset === 'number') {
    return `${startOffset} - ${endOffset}`
  }

  return '-'
}

function getChunkPageSummary(chunk: KnowledgeChunk | null | undefined): string {
  const pageNumbers = getChunkMetadata(chunk)?.pageNumbers ?? []
  if (!pageNumbers.length) {
    return '-'
  }

  return pageNumbers.join(', ')
}

function formatSectionPath(path: string[] | undefined): string {
  if (!path?.length) {
    return ''
  }

  return path.join(' / ')
}

function formatBlockOffsetRange(block: KnowledgeChunkBlock): string {
  if (typeof block.startOffset === 'number' && typeof block.endOffset === 'number') {
    return `${block.startOffset} - ${block.endOffset}`
  }

  return '-'
}

function getBlockMetaSummary(block: KnowledgeChunkBlock): string {
  const metadata = block.metadata ?? {}
  const parts: string[] = []

  if (typeof metadata.listType === 'string') {
    parts.push(`列表:${metadata.listType}`)
  }

  if (typeof metadata.ilvl === 'number') {
    parts.push(`层级:${metadata.ilvl}`)
  }

  if (typeof metadata.rowCount === 'number' && typeof metadata.columnCount === 'number') {
    parts.push(`表格:${metadata.rowCount}x${metadata.columnCount}`)
  }

  if (typeof metadata.mergedCellCount === 'number' && metadata.mergedCellCount > 0) {
    parts.push(`合并:${metadata.mergedCellCount}`)
  }

  if (typeof block.pageNumber === 'number') {
    parts.push(`页码:${block.pageNumber}`)
  }

  return parts.join(' / ')
}

watch(
  () => [highlightedChunkId.value, chunks.value.length],
  async () => {
    await scrollToHighlightedChunk()
  }
)

onMounted(async () => {
  await loadKnowledgeDocument(docId.value)
  await loadKnowledgeChunks(docId.value)
  await scrollToHighlightedChunk()
})

const processingPoll = window.setInterval(async () => {
  if (currentDocument.value?.status !== 'processing') return

  const refreshedDocument = await loadKnowledgeDocument(docId.value)
  if (refreshedDocument?.status === 'indexed') {
    await loadKnowledgeChunks(docId.value)
    ElMessage.success('文档分块已完成')
  } else if (refreshedDocument?.status === 'failed') {
    ElMessage.error('文档分块失败，请检查解析配置后重试')
  }
}, 2000)

onUnmounted(() => window.clearInterval(processingPoll))
</script>

<template>
  <section class="chunk-stage">
    <div class="chunk-stage__topbar">
      <div class="chunk-stage__path">
        <button
          class="chunk-stage__back"
          type="button"
          @click="
            router.push({
              path: `/admin/knowledge/${kbId}`,
              query: highlightedChunkId ? { tab: 'preview', text: searchText || undefined } : {}
            })
          "
        >
          <ChevronLeft class="h-4 w-4" />
          返回文档
        </button>
        <span class="chunk-stage__divider">/</span>
        <span>{{ currentDocument?.name || docId }}</span>
        <span class="chunk-stage__divider">/</span>
        <span>{{ activeView === 'structure' ? '结构查看' : '原文档' }}</span>
      </div>

      <div class="chunk-stage__actions">
        <div class="document-view-switch" aria-label="文档视图">
          <button
            type="button"
            :class="{ 'is-active': activeView === 'structure' }"
            @click="activeView = 'structure'"
          >
            结构查看
          </button>
          <button
            type="button"
            :class="{ 'is-active': activeView === 'original' }"
            @click="activeView = 'original'"
          >
            原文档
          </button>
        </div>
        <el-button @click="handleRefresh">
          <RefreshCw class="h-4 w-4" />
          刷新
        </el-button>
        <el-button
          type="primary"
          :loading="isRebuildingChunks"
          :disabled="currentDocument?.status === 'processing'"
          @click="rebuildChunks"
        >
          {{ currentDocument?.status === 'processing' ? '处理中' : '重新分块' }}
        </el-button>
      </div>
    </div>

    <div class="chunk-stage__intro">
      <div class="chunk-stage__copy">
        <h1 class="chunk-stage__title">{{ currentDocument?.name || '结构查看' }}</h1>
        <p class="chunk-stage__subtitle">
          {{
            activeView === 'structure'
              ? '查看每个 chunk 的结构来源、切分范围和真实内容，判断当前解析链路是否稳定。'
              : '查看入库时保存的原始文件、文件信息和原版式，不经过切分或内容重排。'
          }}
        </p>
      </div>

      <dl class="chunk-stage__facts">
        <div v-for="fact in documentFacts" :key="fact.label" class="chunk-stage__fact">
          <dt>{{ fact.label }}</dt>
          <dd>{{ fact.value }}</dd>
        </div>
      </dl>
    </div>

    <section v-if="activeView === 'original'" class="original-document">
      <aside class="original-document__meta">
        <div class="original-document__meta-head">
          <div>
            <h2>原文档信息</h2>
            <p>这里展示入库时保存的原始文件，不经过切块和内容重排。</p>
          </div>
          <a :href="documentFileUrl" class="original-document__download" download>
            <Download class="h-4 w-4" />
            下载原文件
          </a>
        </div>
        <dl>
          <div v-for="fact in originalDocumentFacts" :key="fact.label">
            <dt>{{ fact.label }}</dt>
            <dd :title="fact.value">{{ fact.value }}</dd>
          </div>
        </dl>
      </aside>

      <div class="original-document__viewer">
        <VueOfficeDocx
          v-if="currentDocument?.fileType === 'docx'"
          :src="documentFileUrl"
          class="original-document__docx"
        />
        <iframe
          v-else-if="['pdf', 'txt', 'md'].includes(currentDocument?.fileType || '')"
          :src="documentFileUrl"
          :title="`${currentDocument?.name || '文档'}原文预览`"
        />
        <div v-else class="original-document__unsupported">
          当前文件类型不能在线预览，请下载原文件查看。
        </div>
      </div>
    </section>

    <div v-if="activeView === 'structure' && highlightedChunkId" class="chunk-stage__notice">
      已根据搜索结果自动定位到命中的 chunk。
    </div>

    <div v-if="activeView === 'structure'" class="chunk-stage__table-shell">
      <div class="chunk-stage__table-caption">{{ tableCaption }}</div>

      <el-table
        :data="chunks"
        row-key="id"
        class="chunk-table"
        :row-class-name="getChunkRowClassName"
      >
        <el-table-column label="Chunk" width="110">
          <template #default="{ row }">
            <span class="chunk-sequence">#{{ row.sequence }}</span>
          </template>
        </el-table-column>

        <el-table-column label="内容摘要" min-width="420">
          <template #default="{ row }">
            <div class="chunk-preview">
              {{ getChunkPreview(row.content) }}
            </div>
          </template>
        </el-table-column>

        <el-table-column label="结构摘要" min-width="320">
          <template #default="{ row }">
            <div class="chunk-structure">
              <div class="chunk-structure__status">
                {{ getChunkStructureStatus(row) }}
              </div>
              <div v-if="getChunkPrimaryPath(row)" class="chunk-structure__path">
                {{ getChunkPrimaryPath(row) }}
              </div>
              <div v-else class="chunk-structure__empty">未提供章节路径</div>
              <div class="chunk-structure__meta">
                <span>偏移 {{ getChunkOffsetRange(row) }}</span>
                <span>页码 {{ getChunkPageSummary(row) }}</span>
              </div>
              <div v-if="getChunkTypeLabels(row).length" class="chunk-structure__tags">
                <span v-for="label in getChunkTypeLabels(row)" :key="label" class="chunk-tag">
                  {{ label }}
                </span>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="字数" width="90" align="center">
          <template #default="{ row }">
            {{ row.charCount }}
          </template>
        </el-table-column>

        <el-table-column label="约 Token" width="110" align="center">
          <template #default="{ row }">
            ≈{{ row.tokenCount }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openChunkContent(row)">
              {{ getChunkInspectButtonLabel(row) }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div v-if="activeView === 'structure'" class="chunk-footer">
      <span>共 {{ chunks.length }} 条 chunk</span>
    </div>

    <el-dialog v-model="contentDialogOpen" width="980px" destroy-on-close class="chunk-dialog">
      <template #header>
        <div class="chunk-dialog__header">
          <div class="chunk-dialog__title">
            {{ activeChunk ? `Chunk #${activeChunk.sequence}` : 'Chunk 详情' }}
          </div>
          <div v-if="activeChunk" class="chunk-dialog__meta">
            <span>字数 {{ activeChunk.charCount }}</span>
            <span>约 Token ≈{{ activeChunk.tokenCount }}</span>
            <span>块数 {{ activeChunkBlocks.length }}</span>
            <span>偏移 {{ getChunkOffsetRange(activeChunk) }}</span>
            <span v-if="getChunkPrimaryPath(activeChunk)">路径 {{ getChunkPrimaryPath(activeChunk) }}</span>
            <span v-if="getChunkTypeLabels(activeChunk).length">
              类型 {{ getChunkTypeLabels(activeChunk).join(' / ') }}
            </span>
          </div>
        </div>
      </template>

      <div
        v-if="activeChunk"
        :class="[
          'chunk-dialog__content',
          activeChunkHasBlocks ? 'chunk-dialog__content--stacked' : ''
        ]"
      >
        <section v-if="activeChunkHasBlocks" class="chunk-dialog__section chunk-dialog__section--table">
          <div class="chunk-dialog__section-head">
            <div class="chunk-dialog__section-title">Block 列表</div>
            <div class="chunk-dialog__section-caption">{{ activeChunkBlocks.length }} 个 block</div>
          </div>
          <el-table
            :data="activeChunkBlocks"
            row-key="startOffset"
            height="100%"
            class="chunk-blocks__table"
            table-layout="fixed"
          >
            <el-table-column label="#" width="56">
              <template #default="{ $index }">
                {{ $index + 1 }}
              </template>
            </el-table-column>

            <el-table-column label="类型" width="112">
              <template #default="{ row }">
                <span class="chunk-tag chunk-tag--strong">{{ row.blockType }}</span>
              </template>
            </el-table-column>

            <el-table-column label="路径" width="220" show-overflow-tooltip>
              <template #default="{ row }">
                <div class="block-path">{{ formatSectionPath(row.sectionPath) || '-' }}</div>
              </template>
            </el-table-column>

            <el-table-column label="范围" width="120">
              <template #default="{ row }">
                {{ formatBlockOffsetRange(row) }}
              </template>
            </el-table-column>

            <el-table-column label="附加信息" width="160" show-overflow-tooltip>
              <template #default="{ row }">
                <div class="block-extra">{{ getBlockMetaSummary(row) || '-' }}</div>
              </template>
            </el-table-column>

            <el-table-column label="内容预览" min-width="260">
              <template #default="{ row }">
                <div class="block-preview">
                  {{ getChunkPreview(row.content, 120) }}
                </div>
              </template>
            </el-table-column>
          </el-table>
        </section>

        <section v-else class="chunk-dialog__summary">
          <div class="chunk-dialog__summary-copy">
            <div class="chunk-dialog__section-title">Review 重点</div>
            <p class="chunk-dialog__hint">
              {{ activeChunkReviewHint }}
            </p>
          </div>

          <dl class="chunk-dialog__facts-grid">
            <div v-for="fact in activeChunkFacts" :key="fact.label" class="chunk-dialog__fact-card">
              <dt>{{ fact.label }}</dt>
              <dd>{{ fact.value }}</dd>
            </div>
          </dl>
        </section>

        <section v-if="!activeChunkHasBlocks" class="chunk-dialog__section chunk-dialog__section--empty">
          <div class="chunk-dialog__section-title">结构状态</div>
          <p class="chunk-dialog__empty-text">当前 chunk 没有结构化 block 数据。</p>
          <p class="chunk-dialog__empty-subtitle">
            如果你要 review 结构化切分效果，这说明当前 chunk 只保留了基础文本，没有附带 block 级元数据。
          </p>
        </section>

        <details class="chunk-dialog__details" open>
          <summary class="chunk-dialog__details-summary">Chunk 原文</summary>
          <div class="chunk-dialog__raw">
            {{ activeChunk.content }}
          </div>
        </details>
      </div>
    </el-dialog>
  </section>
</template>

<style scoped>
.chunk-stage {
  margin: 0 auto;
  max-width: 1280px;
  padding: 4px 0 32px;
  color: #252522;
}

.chunk-stage__topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  border-bottom: 1px solid #e3e3dd;
  padding-bottom: 16px;
}

.chunk-stage__path {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #777770;
}

.chunk-stage__back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  padding: 0;
  color: #4f4fd8;
  cursor: pointer;
}

.chunk-stage__divider {
  color: #b0b0a9;
}

.chunk-stage__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.chunk-stage__intro {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 40px;
  padding: 38px 0 32px;
}

.chunk-stage__copy {
  max-width: 680px;
}

.chunk-stage__title {
  margin: 0;
  font: 600 30px / 1.2 ui-serif, Georgia, "Songti SC", serif;
  letter-spacing: -0.03em;
  color: #20201d;
}

.chunk-stage__subtitle {
  margin-top: 10px;
  font-size: 14px;
  line-height: 1.8;
  color: #66665f;
}

.chunk-stage__facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  border-top: 1px solid #deded8;
  border-bottom: 1px solid #deded8;
}

.chunk-stage__fact {
  padding: 16px;
}

.chunk-stage__fact:nth-child(odd) {
  border-right: 1px solid #e7e7e1;
}

.chunk-stage__fact:nth-child(-n + 2) {
  border-bottom: 1px solid #e7e7e1;
}

.chunk-stage__fact dt {
  font-size: 12px;
  color: #85857e;
}

.chunk-stage__fact dd {
  margin-top: 6px;
  font: 600 18px ui-serif, Georgia, "Songti SC", serif;
  color: #292925;
}

.chunk-stage__notice {
  margin-bottom: 18px;
  border-left: 2px solid #6767ed;
  background: #f4f3ff;
  padding: 14px 16px;
  font-size: 14px;
  color: #4f4f99;
}

.chunk-stage__table-shell {
  overflow: hidden;
  border-top: 1px solid #deded8;
  border-bottom: 1px solid #deded8;
  background: #fafaf7;
}

.chunk-stage__table-caption {
  border-bottom: 1px solid #e7e7e1;
  padding: 13px 4px;
  font-size: 13px;
  line-height: 1.7;
  color: #777770;
}

.chunk-table {
  margin-top: 0;
}

.chunk-sequence {
  font: 600 14px ui-monospace, SFMono-Regular, Consolas, monospace;
  color: #5b5bf7;
}

.chunk-preview {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  color: #3d3d38;
  line-height: 1.75;
}

.chunk-structure {
  display: grid;
  gap: 6px;
}

.chunk-structure__status {
  font-size: 13px;
  font-weight: 600;
  color: #292925;
}

.chunk-structure__path {
  font-size: 13px;
  line-height: 1.6;
  color: #3d3d38;
}

.chunk-structure__empty {
  font-size: 13px;
  color: #888881;
}

.chunk-structure__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 12px;
  color: #85857e;
}

.chunk-structure__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chunk-tag {
  display: inline-flex;
  align-items: center;
  border: 1px solid #deded8;
  border-radius: 5px;
  background: #f7f7f3;
  padding: 3px 8px;
  font-size: 12px;
  font-weight: 600;
  color: #62625c;
}

.chunk-tag--strong {
  border-color: #d8d6ff;
  background: #f4f3ff;
  color: #5555c7;
}

.chunk-footer {
  display: flex;
  justify-content: flex-end;
  padding: 14px 4px 0;
  color: #85857e;
  font-size: 14px;
}

.chunk-dialog__header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chunk-dialog__title {
  font: 600 20px ui-serif, Georgia, "Songti SC", serif;
  color: #252522;
}

.chunk-dialog__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 13px;
  color: #7c7c75;
}

.chunk-dialog__content {
  display: grid;
  gap: 10px;
}

.chunk-dialog__content--stacked {
  grid-template-rows: minmax(0, 1fr) minmax(0, 220px);
  height: min(68vh, 620px);
  min-height: 0;
}

.chunk-dialog__summary {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 16px;
  border-top: 1px solid #e2e2dc;
  border-bottom: 1px solid #e2e2dc;
  background: transparent;
  padding: 16px 18px;
}

.chunk-dialog__summary-copy {
  display: grid;
  align-content: start;
  gap: 8px;
}

.chunk-dialog__hint {
  font-size: 13px;
  line-height: 1.75;
  color: #66665f;
}

.chunk-dialog__facts-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  border-top: 1px solid #e7e7e1;
  border-bottom: 1px solid #e7e7e1;
}

.chunk-dialog__fact-card {
  padding: 14px 16px;
}

.chunk-dialog__fact-card:nth-child(odd) {
  border-right: 1px solid #e7e7e1;
}

.chunk-dialog__fact-card:nth-child(-n + 2) {
  border-bottom: 1px solid #e7e7e1;
}

.chunk-dialog__fact-card dt {
  font-size: 12px;
  color: #85857e;
}

.chunk-dialog__fact-card dd {
  margin-top: 6px;
  line-height: 1.7;
  color: #292925;
}

.chunk-dialog__section {
  border-top: 1px solid #e2e2dc;
  border-bottom: 1px solid #e2e2dc;
  background: transparent;
  padding: 16px 18px;
}

.chunk-dialog__section--table {
  border: 0;
  border-top: 1px solid #e7e7e1;
  border-radius: 0;
  background: transparent;
  min-height: 0;
  overflow: hidden;
  padding: 12px 0 0;
}

.chunk-dialog__section--empty {
  background: #f7f7f3;
}

.chunk-dialog__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.chunk-dialog__section-title {
  font: 600 15px ui-serif, Georgia, "Songti SC", serif;
  color: #292925;
}

.chunk-dialog__section-caption {
  font-size: 12px;
  color: #85857e;
}

.chunk-dialog__empty-text {
  font-size: 14px;
  font-weight: 600;
  color: #292925;
}

.chunk-dialog__empty-subtitle {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.75;
  color: #66665f;
}

.block-path,
.block-extra,
.block-preview {
  line-height: 1.65;
  color: #4a4a44;
}

.block-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.block-extra {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.block-preview {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  font-size: 13px;
}

.chunk-dialog__details {
  min-height: 0;
  border-top: 1px solid #e7e7e1;
  background: transparent;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  padding-top: 12px;
}

.chunk-dialog__details-summary {
  cursor: pointer;
  list-style: none;
  font-size: 14px;
  font: 600 15px ui-serif, Georgia, "Songti SC", serif;
  color: #292925;
}

.chunk-dialog__details-summary::-webkit-details-marker {
  display: none;
}

.chunk-dialog__raw {
  margin-top: 12px;
  height: 100%;
  min-height: 0;
  overflow: auto;
  border-left: 2px solid #d8d6ff;
  background: #f7f7f3;
  padding: 16px;
  line-height: 1.85;
  color: #3d3d38;
  white-space: pre-wrap;
}

:deep(.chunk-table .el-table),
:deep(.chunk-blocks__table .el-table) {
  border-radius: 0;
}

:deep(.chunk-dialog) {
  max-height: calc(100vh - 48px);
}

:deep(.chunk-dialog .el-dialog__body) {
  overflow: hidden;
}

:deep(.chunk-table .el-table__inner-wrapper::before),
:deep(.chunk-blocks__table .el-table__inner-wrapper::before) {
  display: none;
}

:deep(.chunk-table .el-table__header th.el-table__cell),
:deep(.chunk-blocks__table .el-table__header th.el-table__cell) {
  background: #f4f4f0;
  color: #686861;
  font-weight: 600;
}

:deep(.chunk-table .el-table__body td.el-table__cell),
:deep(.chunk-blocks__table .el-table__body td.el-table__cell) {
  padding-top: 8px;
  padding-bottom: 8px;
  vertical-align: top;
}

:deep(.chunk-table .el-table__row.chunk-row--active > td.el-table__cell) {
  background: #f2f1ff;
}

:deep(.chunk-table),
:deep(.chunk-blocks__table) {
  --el-table-bg-color: #fafaf7;
  --el-table-tr-bg-color: #fafaf7;
  --el-table-row-hover-bg-color: #f4f4f0;
  --el-table-border-color: #e7e7e1;
  --el-table-text-color: #3d3d38;
}

:deep(.chunk-dialog) {
  border-radius: 12px;
  background: #fafaf7;
}

.document-view-switch {
  display: flex;
  padding: 3px;
  border: 1px solid #deded7;
  border-radius: 8px;
  background: #f2f2ee;
}

.document-view-switch button {
  min-height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #6f6f68;
  font-size: 13px;
  cursor: pointer;
}

.document-view-switch button:hover {
  color: #30302c;
}

.document-view-switch button:focus-visible {
  outline: 2px solid #5b5bf7;
  outline-offset: 1px;
}

.document-view-switch button.is-active {
  background: #fff;
  color: #30302c;
  box-shadow: 0 1px 2px rgb(25 25 24 / 8%);
}

.original-document {
  display: grid;
  min-height: 0;
  flex: 1;
  grid-template-columns: 280px minmax(0, 1fr);
  overflow: hidden;
  border-top: 1px solid #e5e5df;
  background: #f1f1ed;
}

.original-document__meta {
  overflow: auto;
  padding: 24px 20px;
  border-right: 1px solid #dfdfd8;
  background: #fafaf7;
}

.original-document__meta-head {
  display: grid;
  gap: 16px;
  margin-bottom: 22px;
}

.original-document__meta h2 {
  margin: 0 0 6px;
  color: #262622;
  font-size: 16px;
}

.original-document__meta p {
  margin: 0;
  color: #6f6f68;
  font-size: 12px;
  line-height: 1.65;
}

.original-document__download {
  display: inline-flex;
  width: fit-content;
  min-height: 34px;
  align-items: center;
  gap: 7px;
  padding: 0 11px;
  border: 1px solid #d8d8d1;
  border-radius: 7px;
  color: #3f3f3a;
  font-size: 12px;
  text-decoration: none;
}

.original-document__download:hover {
  border-color: #aaaaf5;
  color: #4f4fe8;
}

.original-document__meta dl {
  margin: 0;
}

.original-document__meta dl div {
  padding: 12px 0;
  border-top: 1px solid #e8e8e2;
}

.original-document__meta dt {
  margin-bottom: 5px;
  color: #85857d;
  font-size: 11px;
}

.original-document__meta dd {
  overflow: hidden;
  margin: 0;
  color: #33332f;
  font-size: 12px;
  line-height: 1.55;
  text-overflow: ellipsis;
}

.original-document__viewer {
  min-width: 0;
  overflow: auto;
  padding: 24px;
}

.original-document__viewer iframe,
.original-document__docx {
  display: block;
  width: 100%;
  min-height: 100%;
  border: 0;
  background: #fff;
}

.original-document__docx {
  min-height: 800px;
}

.original-document__unsupported {
  display: grid;
  min-height: 320px;
  place-items: center;
  color: #6f6f68;
  background: #fff;
  font-size: 13px;
}

@media (max-width: 1080px) {
  .original-document {
    grid-template-columns: 220px minmax(0, 1fr);
  }

  .chunk-stage__intro,
  .chunk-dialog__summary {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 960px) {
  .chunk-stage__topbar {
    flex-direction: column;
  }

  .chunk-stage__actions {
    justify-content: flex-start;
  }
}

@media (max-width: 768px) {
  .original-document {
    display: block;
    overflow: auto;
  }

  .original-document__meta {
    border-right: 0;
    border-bottom: 1px solid #dfdfd8;
  }

  .original-document__viewer {
    min-height: 70vh;
    padding: 12px;
  }

  .chunk-stage__facts {
    grid-template-columns: 1fr;
  }

  .chunk-dialog__facts-grid {
    grid-template-columns: 1fr;
  }

  .chunk-stage__fact:nth-child(odd) {
    border-right: 0;
  }

  .chunk-stage__fact:not(:last-child) {
    border-bottom: 1px solid #e5edf5;
  }

  .chunk-dialog__fact-card:nth-child(odd) {
    border-right: 0;
  }

  .chunk-dialog__fact-card:not(:last-child) {
    border-bottom: 1px solid #e5edf5;
  }
}
</style>
