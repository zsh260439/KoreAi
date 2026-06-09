<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { ChevronLeft, RefreshCw } from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useKnowledgeChunks } from '@/composables/useKnowledgeChunks'
import { useKnowledgeDocuments } from '@/composables/useKnowledgeDocuments'
import type { KnowledgeChunk } from 'share-type'

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

//声明重新分块处理
const rebuildChunks = async () => {
  await rebuildKnowledgeChunks(docId.value)
  await loadKnowledgeDocument(docId.value)
  ElMessage.success('文档已重新分块')
  await scrollToHighlightedChunk()
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
const getChunkPreview = (content: string) => {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (normalized.length <= 180) {
    return normalized
  }

  return `${normalized.slice(0, 180)}...`
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
    <div class="chunk-stage__canvas">
      <div class="chunk-stage__toolbar">
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
          <span>分块详情</span>
        </div>

        <div class="chunk-stage__actions">
          <el-button @click="handleRefresh">
            <RefreshCw class="h-4 w-4" />
            刷新
          </el-button>
          <el-button type="primary" @click="rebuildChunks">重新分块</el-button>
        </div>
      </div>

      <div class="chunk-stage__headline">
        <h1 class="chunk-stage__title">{{ currentDocument?.name || '分块详情' }}</h1>
        <p class="chunk-stage__subtitle">默认展示 chunk 摘要，完整内容可按需展开查看。</p>
      </div>

      <div v-if="highlightedChunkId" class="chunk-stage__notice">
        已根据搜索结果自动定位到命中 chunk。
      </div>

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

        <el-table-column label="内容摘要" min-width="520">
          <template #default="{ row }">
            <div class="chunk-preview">
              {{ getChunkPreview(row.content) }}
            </div>
          </template>
        </el-table-column>

        <el-table-column label="字数" width="110" align="center">
          <template #default="{ row }">
            {{ row.charCount }}
          </template>
        </el-table-column>

        <el-table-column label="约 Token" width="120" align="center">
          <template #default="{ row }">
            ≈ {{ row.tokenCount }}
          </template>
        </el-table-column>

        <el-table-column label="更新时间" min-width="190">
          <template #default="{ row }">
            {{ row.updatedAt }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openChunkContent(row)">查看内容</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="chunk-footer">
        <span>共 {{ chunks.length }} 条</span>
      </div>
    </div>

    <el-dialog v-model="contentDialogOpen" width="760px" destroy-on-close>
      <template #header>
        <div class="chunk-dialog__header">
          <div class="chunk-dialog__title">
            {{ activeChunk ? `Chunk #${activeChunk.sequence}` : 'Chunk 详情' }}
          </div>
          <div v-if="activeChunk" class="chunk-dialog__meta">
            <span>字数：{{ activeChunk.charCount }}</span>
            <span>约 Token：≈ {{ activeChunk.tokenCount }}</span>
            <span>更新时间：{{ activeChunk.updatedAt }}</span>
          </div>
        </div>
      </template>

      <div v-if="activeChunk" class="chunk-dialog__content">
        {{ activeChunk.content }}
      </div>
    </el-dialog>
  </section>
</template>

<style scoped>
.chunk-stage {
  padding: 8px 0 4px;
}

.chunk-stage__canvas {
  margin: 0 auto;
  max-width: 1120px;
  border-radius: 28px;
  background: #f3f6fb;
  padding: 28px 28px 32px;
}

.chunk-stage__toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.chunk-stage__path {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #667085;
}

.chunk-stage__back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  padding: 0;
  color: #4f46e5;
  cursor: pointer;
}

.chunk-stage__divider {
  color: #98a2b3;
}

.chunk-stage__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.chunk-stage__headline {
  margin-top: 22px;
}

.chunk-stage__title {
  font-size: 26px;
  font-weight: 700;
  color: #111827;
}

.chunk-stage__subtitle {
  margin-top: 8px;
  font-size: 14px;
  color: #6b7280;
}

.chunk-stage__notice {
  margin-top: 22px;
  border-radius: 16px;
  background: #eef2ff;
  padding: 14px 16px;
  font-size: 14px;
  color: #4338ca;
}

.chunk-table {
  margin-top: 22px;
}

.chunk-sequence {
  font-weight: 700;
  color: #0f172a;
}

.chunk-preview {
  color: #334155;
  line-height: 1.75;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.chunk-footer {
  display: flex;
  justify-content: flex-end;
  padding: 18px 4px 0;
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
  color: #111827;
}

.chunk-dialog__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 13px;
  color: #667085;
}

.chunk-dialog__content {
  max-height: 60vh;
  overflow: auto;
  border-radius: 14px;
  background: #f8fafc;
  padding: 16px;
  line-height: 1.85;
  color: #334155;
  white-space: pre-wrap;
}

:deep(.chunk-table .el-table) {
  border-radius: 20px;
}

:deep(.chunk-table .el-table__inner-wrapper::before) {
  display: none;
}

:deep(.chunk-table .el-table__header th.el-table__cell) {
  background: #f8fafc;
  color: #475467;
  font-weight: 700;
}

:deep(.chunk-table .el-table__body td.el-table__cell) {
  padding-top: 14px;
  padding-bottom: 14px;
  vertical-align: top;
}

:deep(.chunk-table .el-table__row.chunk-row--active > td.el-table__cell) {
  background: #eef2ff;
}

@media (max-width: 960px) {
  .chunk-stage__toolbar {
    flex-direction: column;
  }

  .chunk-stage__actions {
    justify-content: flex-start;
  }
}

@media (max-width: 768px) {
  .chunk-stage__canvas {
    padding: 22px 16px 24px;
    border-radius: 20px;
  }
}
</style>
