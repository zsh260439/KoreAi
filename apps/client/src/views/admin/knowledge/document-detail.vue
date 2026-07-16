<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { ChevronLeft, RefreshCw } from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useKnowledgeChunks } from '@/composables/useKnowledgeChunks'
import { useKnowledgeDocuments } from '@/composables/useKnowledgeDocuments'
import type { KnowledgeChunk, KnowledgeChunkBlock, KnowledgeChunkMetadata } from 'share-type'

const route = useRoute()
const router = useRouter()

const { currentDocument, loadKnowledgeDocument } = useKnowledgeDocuments()
const { chunks, loadKnowledgeChunks, rebuildKnowledgeChunks } = useKnowledgeChunks()

//声明知识库标识读取
const kbId = computed(() => String(route.params.kbId || ''))

//声明文档标识读取
const docId = computed(() => String(route.params.docId || ''))

//声明命中分块标识读取
const highlightedChunkId = computed(() => {
  const value = route.query.chunkId
  return typeof value === 'string' ? value : ''
})

//声明搜索文本读取
const searchText = computed(() => {
  const value = route.query.text
  return typeof value === 'string' ? value.trim() : ''
})

const contentDialogOpen = ref(false)
const activeChunk = ref<KnowledgeChunk | null>(null)

//声明当前弹窗分块结构块列表
const activeChunkBlocks = computed(() => getChunkBlocks(activeChunk.value))

//声明当前弹窗是否存在结构块
const activeChunkHasBlocks = computed(() => activeChunkBlocks.value.length > 0)

//声明当前弹窗审阅提示文案
const activeChunkReviewHint = computed(() => {
  if (activeChunkHasBlocks.value) {
    return '当前 chunk 包含结构化 block，适合直接检查切分边界、章节路径和附加元数据。'
  }

  return '当前 chunk 没有结构化 block 数据，页面只展示基础 chunk 信息。'
})

//声明当前弹窗概览信息
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

//声明页面顶部文档概览信息
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

//声明表格说明文案
const tableCaption = computed(() => {
  if (highlightedChunkId.value) {
    return '当前列表已自动定位到搜索命中的 chunk，便于直接检查召回质量和结构切分结果。'
  }

  return '列表按 chunk 顺序展示，重点保留结构路径、偏移范围、页码和 block 类型，方便逐条 review。'
})

//声明重新分块处理
const rebuildChunks = async () => {
  try {
    const rebuiltChunks = await rebuildKnowledgeChunks(docId.value)
    await loadKnowledgeDocument(docId.value)
    await loadKnowledgeChunks(docId.value)
    ElMessage.success(formatChunkResultMessage(rebuiltChunks))
    await scrollToHighlightedChunk()
  } catch (error) {
    await loadKnowledgeDocument(docId.value)
    ElMessage.error(error instanceof Error ? error.message : '文档分块失败')
  }
}

function formatChunkResultMessage(items: KnowledgeChunk[]): string {
  const ocrPageCount = getOcrPageNumbers(items).length
  return ocrPageCount > 0
    ? `文档已重新分块，OCR 识别 ${ocrPageCount} 页，共 ${items.length} 个分块`
    : `文档已重新分块，共 ${items.length} 个分块`
}

function getDocumentParseLabel(items: KnowledgeChunk[]): string {
  const sourceKinds = new Set(items.map((item) => item.metadata?.sourceKind).filter(Boolean))
  const ocrPageCount = getOcrPageNumbers(items).length

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

//声明刷新处理
const handleRefresh = async () => {
  await loadKnowledgeDocument(docId.value)
  await loadKnowledgeChunks(docId.value)
  await scrollToHighlightedChunk()
}

//声明命中分块高亮判断
const isHighlightedChunk = (chunkId: string) => chunkId === highlightedChunkId.value

//声明分块摘要裁剪
const getChunkPreview = (content: string, limit = 180) => {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) {
    return normalized
  }

  return `${normalized.slice(0, limit)}...`
}

//声明分块内容弹窗打开
const openChunkContent = (chunk: KnowledgeChunk) => {
  activeChunk.value = chunk
  contentDialogOpen.value = true
}

//声明分块表格行样式
const getChunkRowClassName = ({ row }: { row: KnowledgeChunk }) =>
  (isHighlightedChunk(row.id) ? 'chunk-row--active' : '')

//声明命中分块滚动定位
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

//声明文档状态文案映射
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

//声明文档类型文案格式化
function formatDocumentFileType(fileType?: string | null): string {
  if (!fileType) {
    return '-'
  }

  return fileType.toUpperCase()
}

//声明分块元数据读取
function getChunkMetadata(chunk: KnowledgeChunk | null | undefined): KnowledgeChunkMetadata | null {
  return chunk?.metadata ?? null
}

//声明分块结构块列表读取
function getChunkBlocks(chunk: KnowledgeChunk | null | undefined): KnowledgeChunkBlock[] {
  return getChunkMetadata(chunk)?.blocks ?? []
}

//声明分块结构块数量读取
function getChunkBlockCount(chunk: KnowledgeChunk | null | undefined): number {
  return getChunkBlocks(chunk).length
}

//声明分块主章节路径读取
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

//声明分块结构类型标签读取
function getChunkTypeLabels(chunk: KnowledgeChunk | null | undefined): string[] {
  const types = getChunkBlocks(chunk).map((item) => item.blockType)
  return Array.from(new Set(types)).slice(0, 4)
}

//声明分块结构状态文案读取
function getChunkStructureStatus(chunk: KnowledgeChunk | null | undefined): string {
  const count = getChunkBlockCount(chunk)
  if (count > 0) {
    return `${count} 个结构块`
  }

  return '无结构块元数据'
}

//声明分块查看按钮文案读取
function getChunkInspectButtonLabel(chunk: KnowledgeChunk | null | undefined): string {
  return getChunkBlockCount(chunk) > 0 ? '查看结构' : '查看详情'
}

//声明分块偏移范围读取
function getChunkOffsetRange(chunk: KnowledgeChunk | null | undefined): string {
  const blocks = getChunkBlocks(chunk)
  const startOffset = blocks.find((item) => typeof item.startOffset === 'number')?.startOffset
  const endOffset = [...blocks].reverse().find((item) => typeof item.endOffset === 'number')?.endOffset

  if (typeof startOffset === 'number' && typeof endOffset === 'number') {
    return `${startOffset} - ${endOffset}`
  }

  return '-'
}

//声明分块页码摘要读取
function getChunkPageSummary(chunk: KnowledgeChunk | null | undefined): string {
  const pageNumbers = getChunkMetadata(chunk)?.pageNumbers ?? []
  if (!pageNumbers.length) {
    return '-'
  }

  return pageNumbers.join(', ')
}

//声明结构块路径格式化
function formatSectionPath(path: string[] | undefined): string {
  if (!path?.length) {
    return ''
  }

  return path.join(' / ')
}

//声明结构块偏移范围格式化
function formatBlockOffsetRange(block: KnowledgeChunkBlock): string {
  if (typeof block.startOffset === 'number' && typeof block.endOffset === 'number') {
    return `${block.startOffset} - ${block.endOffset}`
  }

  return '-'
}

//声明结构块附加摘要格式化
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

//声明命中分块监听
watch(
  () => [highlightedChunkId.value, chunks.value.length],
  async () => {
    await scrollToHighlightedChunk()
  }
)

//声明页面初始化加载
onMounted(async () => {
  await loadKnowledgeDocument(docId.value)
  await loadKnowledgeChunks(docId.value)
  await scrollToHighlightedChunk()
})
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
        <span>结构查看</span>
      </div>

      <div class="chunk-stage__actions">
        <el-button @click="handleRefresh">
          <RefreshCw class="h-4 w-4" />
          刷新
        </el-button>
        <el-button type="primary" @click="rebuildChunks">重新分块</el-button>
      </div>
    </div>

    <div class="chunk-stage__intro">
      <div class="chunk-stage__copy">
        <h1 class="chunk-stage__title">{{ currentDocument?.name || '结构查看' }}</h1>
        <p class="chunk-stage__subtitle">
          这个页面只做 review，不做花哨展示。重点是快速查看每个 chunk 的结构来源、切分范围和真实内容，方便判断当前解析链路是否稳定。
        </p>
      </div>

      <dl class="chunk-stage__facts">
        <div v-for="fact in documentFacts" :key="fact.label" class="chunk-stage__fact">
          <dt>{{ fact.label }}</dt>
          <dd>{{ fact.value }}</dd>
        </div>
      </dl>
    </div>

    <div v-if="highlightedChunkId" class="chunk-stage__notice">
      已根据搜索结果自动定位到命中的 chunk。
    </div>

    <div class="chunk-stage__table-shell">
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

    <div class="chunk-footer">
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
  max-width: 1400px;
  padding: 8px 0 24px;
}

.chunk-stage__topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  border-bottom: 1px solid #d9e2ec;
  padding-bottom: 18px;
}

.chunk-stage__path {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #52606d;
}

.chunk-stage__back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  padding: 0;
  color: #0f766e;
  cursor: pointer;
}

.chunk-stage__divider {
  color: #9aa5b1;
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
  gap: 24px;
  padding: 24px 0 20px;
}

.chunk-stage__copy {
  max-width: 680px;
}

.chunk-stage__title {
  font-size: 26px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.03em;
  color: #102a43;
}

.chunk-stage__subtitle {
  margin-top: 10px;
  font-size: 14px;
  line-height: 1.8;
  color: #52606d;
}

.chunk-stage__facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  overflow: hidden;
  border: 1px solid #d9e2ec;
  border-radius: 18px;
  background: #ffffff;
}

.chunk-stage__fact {
  padding: 16px 18px;
}

.chunk-stage__fact:nth-child(odd) {
  border-right: 1px solid #e5edf5;
}

.chunk-stage__fact:nth-child(-n + 2) {
  border-bottom: 1px solid #e5edf5;
}

.chunk-stage__fact dt {
  font-size: 12px;
  color: #7b8794;
}

.chunk-stage__fact dd {
  margin-top: 6px;
  font-size: 18px;
  font-weight: 600;
  color: #102a43;
}

.chunk-stage__notice {
  margin-bottom: 18px;
  border-left: 3px solid #0f766e;
  background: #f0fdfa;
  padding: 14px 16px;
  font-size: 14px;
  color: #115e59;
}

.chunk-stage__table-shell {
  overflow: hidden;
  border: 1px solid #d9e2ec;
  border-radius: 18px;
  background: #ffffff;
}

.chunk-stage__table-caption {
  border-bottom: 1px solid #e5edf5;
  padding: 14px 18px;
  font-size: 13px;
  line-height: 1.7;
  color: #52606d;
}

.chunk-table {
  margin-top: 0;
}

.chunk-sequence {
  font-weight: 700;
  color: #102a43;
}

.chunk-preview {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  color: #334155;
  line-height: 1.75;
}

.chunk-structure {
  display: grid;
  gap: 6px;
}

.chunk-structure__status {
  font-size: 13px;
  font-weight: 600;
  color: #102a43;
}

.chunk-structure__path {
  font-size: 13px;
  line-height: 1.6;
  color: #0f172a;
}

.chunk-structure__empty {
  font-size: 13px;
  color: #7b8794;
}

.chunk-structure__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 12px;
  color: #64748b;
}

.chunk-structure__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chunk-tag {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: #f0fdfa;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #0f766e;
}

.chunk-tag--strong {
  background: #f1f5f9;
  color: #0f172a;
}

.chunk-footer {
  display: flex;
  justify-content: flex-end;
  padding: 14px 4px 0;
  color: #64748b;
  font-size: 14px;
}

.chunk-dialog__header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chunk-dialog__title {
  font-size: 18px;
  font-weight: 700;
  color: #102a43;
}

.chunk-dialog__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 13px;
  color: #667085;
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
  border: 1px solid #d9e2ec;
  border-radius: 16px;
  background: #ffffff;
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
  color: #52606d;
}

.chunk-dialog__facts-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  overflow: hidden;
  border: 1px solid #e5edf5;
  border-radius: 14px;
  background: #f8fafc;
}

.chunk-dialog__fact-card {
  padding: 14px 16px;
}

.chunk-dialog__fact-card:nth-child(odd) {
  border-right: 1px solid #e5edf5;
}

.chunk-dialog__fact-card:nth-child(-n + 2) {
  border-bottom: 1px solid #e5edf5;
}

.chunk-dialog__fact-card dt {
  font-size: 12px;
  color: #7b8794;
}

.chunk-dialog__fact-card dd {
  margin-top: 6px;
  line-height: 1.7;
  color: #102a43;
}

.chunk-dialog__section {
  border: 1px solid #d9e2ec;
  border-radius: 16px;
  background: #ffffff;
  padding: 16px 18px;
}

.chunk-dialog__section--table {
  border: 0;
  border-top: 1px solid #e5edf5;
  border-radius: 0;
  background: transparent;
  min-height: 0;
  overflow: hidden;
  padding: 12px 0 0;
}

.chunk-dialog__section--empty {
  background: #f8fafc;
}

.chunk-dialog__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.chunk-dialog__section-title {
  font-size: 14px;
  font-weight: 700;
  color: #102a43;
}

.chunk-dialog__section-caption {
  font-size: 12px;
  color: #7b8794;
}

.chunk-dialog__empty-text {
  font-size: 14px;
  font-weight: 600;
  color: #102a43;
}

.chunk-dialog__empty-subtitle {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.75;
  color: #52606d;
}

.block-path,
.block-extra,
.block-preview {
  line-height: 1.65;
  color: #334155;
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
  border-top: 1px solid #e5edf5;
  background: #ffffff;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  padding-top: 12px;
}

.chunk-dialog__details-summary {
  cursor: pointer;
  list-style: none;
  font-size: 14px;
  font-weight: 700;
  color: #102a43;
}

.chunk-dialog__details-summary::-webkit-details-marker {
  display: none;
}

.chunk-dialog__raw {
  margin-top: 12px;
  height: 100%;
  min-height: 0;
  overflow: auto;
  border-radius: 14px;
  background: #f8fafc;
  padding: 16px;
  line-height: 1.85;
  color: #334155;
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
  background: #f8fafc;
  color: #475467;
  font-weight: 700;
}

:deep(.chunk-table .el-table__body td.el-table__cell),
:deep(.chunk-blocks__table .el-table__body td.el-table__cell) {
  padding-top: 8px;
  padding-bottom: 8px;
  vertical-align: top;
}

:deep(.chunk-table .el-table__row.chunk-row--active > td.el-table__cell) {
  background: #f0fdfa;
}

@media (max-width: 1080px) {
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
