<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { ChevronLeft, RefreshCw } from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useKnowledgeChunks } from '@/composables/useKnowledgeChunks'
import { useKnowledgeDocuments } from '@/composables/useKnowledgeDocuments'
import type { KnowledgeChunk } from '@/types'
import { getKnowledgeHighlightParts, getKnowledgePreviewHighlightParts } from '@/utils/knowledge-highlight'

const route = useRoute()
const router = useRouter()

const { currentDocument, loadKnowledgeDocument } = useKnowledgeDocuments()
const { chunks, loadKnowledgeChunks, rebuildKnowledgeChunks } = useKnowledgeChunks()

const kbId = computed(() => String(route.params.kbId || ''))
const docId = computed(() => String(route.params.docId || ''))

// 选中的分块 ID, 跳转会传入
const highlightedChunkId = computed(() => {
  const value = route.query.chunkId
  return typeof value === 'string' ? value : ''
})

// 当前命中关键词，来自命中测试页跳转参数
const highlightedKeyword = computed(() => {
  const value = route.query.text
  return typeof value === 'string' ? value.trim() : ''
})

const highlightedChunkElementId = ref('')
const contentDialogOpen = ref(false)
const activeChunk = ref<KnowledgeChunk | null>(null)

const rebuildChunks = async () => {
  await rebuildKnowledgeChunks(docId.value)
  await loadKnowledgeDocument(docId.value)
  ElMessage.success('文档已重新分块')
  await scrollToHighlightedChunk()
}

const handleRefresh = async () => {
  await loadKnowledgeDocument(docId.value)
  await loadKnowledgeChunks(docId.value)
  await scrollToHighlightedChunk()
}

const isHighlightedChunk = (chunkId: string) => {
  return chunkId === highlightedChunkId.value
}

const getChunkPreview = (content: string) => {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (normalized.length <= 180) return normalized
  return `${normalized.slice(0, 180)}...`
}

const openChunkContent = (chunk: KnowledgeChunk) => {
  activeChunk.value = chunk
  contentDialogOpen.value = true
}

const getHighlightedContentParts = (content: string) => {
  return getKnowledgeHighlightParts(content, highlightedKeyword.value)
}

const getHighlightedPreviewParts = (content: string) => {
  if (!highlightedKeyword.value) {
    return [{ text: getChunkPreview(content), matched: false }]
  }

  return getKnowledgePreviewHighlightParts(content, highlightedKeyword.value, 180)
}

const scrollToHighlightedChunk = async () => {
  if (!highlightedChunkId.value) return

  const targetChunk = chunks.value.find((item) => item.id === highlightedChunkId.value)
  if (!targetChunk) return
 
  highlightedChunkElementId.value = `chunk-card-${targetChunk.id}`

  await nextTick()

  const element = document.getElementById(highlightedChunkElementId.value)
  if (!element) return

  element.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  })
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
</script>

<template>
  <section class="chunk-stage">
    <div class="chunk-stage__canvas">
      <div class="chunk-stage__toolbar">
        <div class="chunk-stage__path">
          <button class="chunk-stage__back" type="button" @click="router.push({
            path: `/admin/knowledge/${kbId}`,
            query: highlightedChunkId ? { tab: 'preview',text: highlightedKeyword } : {}
          })">
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
        <p class="chunk-stage__subtitle">默认只展示 chunk 摘要，完整内容可按需展开查看。</p>
      </div>

      <div v-if="highlightedChunkId" class="chunk-stage__notice">
        已根据搜索结果自动定位命中 chunk。
        <span v-if="highlightedKeyword" class="chunk-stage__keyword">关键词：{{ highlightedKeyword }}</span>
      </div>

      <div class="chunk-list">
        <article
          v-for="chunk in chunks"
          :id="`chunk-card-${chunk.id}`"
          :key="chunk.id"
          class="chunk-item"
          :class="{ 'chunk-item--active': isHighlightedChunk(chunk.id) }"
        >
          <div class="chunk-item__header">
            <div class="chunk-item__meta">
              <span class="chunk-item__index">Chunk #{{ chunk.sequence }}</span>
              <span v-if="isHighlightedChunk(chunk.id)" class="chunk-item__badge">搜索命中</span>
            </div>
            <span class="chunk-item__time">{{ chunk.updatedAt }}</span>
          </div>

          <div class="chunk-item__content">
            <template v-for="(part, index) in getHighlightedPreviewParts(chunk.content)" :key="`${chunk.id}-${index}-${part.text}`">
              <mark v-if="part.matched" class="chunk-item__mark">{{ part.text }}</mark>
              <template v-else>{{ part.text }}</template>
            </template>
          </div>

          <div class="chunk-item__footer">
            <span>字符数：{{ chunk.charCount }}</span>
            <span>Token 数：{{ chunk.tokenCount }}</span>
            <span class="chunk-item__id">Chunk ID：{{ chunk.id }}</span>
            <el-button link type="primary" class="chunk-item__view" @click="openChunkContent(chunk)">
              查看内容
            </el-button>
          </div>
        </article>
      </div>

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
            <span>字符数：{{ activeChunk.charCount }}</span>
            <span>Token 数：{{ activeChunk.tokenCount }}</span>
            <span>更新时间：{{ activeChunk.updatedAt }}</span>
          </div>
        </div>
      </template>

      <div v-if="activeChunk" class="chunk-dialog__content">
        <template v-for="(part, index) in getHighlightedContentParts(activeChunk.content)" :key="`${index}-${part.text}`">
          <mark v-if="part.matched" class="chunk-dialog__mark">{{ part.text }}</mark>
          <template v-else>{{ part.text }}</template>
        </template>
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

.chunk-stage__keyword {
  margin-left: 8px;
  font-weight: 700;
}

.chunk-list {
  margin-top: 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.chunk-item {
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.96);
  padding: 20px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
  scroll-margin-top: 120px;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.chunk-item--active {
  border-color: #6366f1;
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.12);
  transform: translateY(-1px);
}

.chunk-item__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.chunk-item__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.chunk-item__index {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.chunk-item__badge {
  display: inline-flex;
  align-items: center;
  border-radius: 9999px;
  background: #e0e7ff;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  color: #4338ca;
}

.chunk-item__time {
  font-size: 13px;
  color: #667085;
}

.chunk-item__content {
  margin-top: 14px;
  border-radius: 14px;
  background: #f8fafc;
  padding: 16px;
  line-height: 1.85;
  color: #334155;
  white-space: pre-wrap;
}

.chunk-item__mark {
  border-radius: 4px;
  background: #fde68a;
  padding: 0 2px;
  color: #92400e;
}

.chunk-item__footer {
  margin-top: 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 13px;
  color: #667085;
}

.chunk-item__id {
  word-break: break-all;
}

.chunk-item__view {
  margin-left: auto;
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

.chunk-dialog__mark {
  border-radius: 4px;
  background: #fde68a;
  padding: 0 2px;
  color: #92400e;
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

  .chunk-item {
    padding: 16px;
  }

  .chunk-item__header,
  .chunk-item__footer {
    flex-direction: column;
    align-items: flex-start;
  }

  .chunk-item__view {
    margin-left: 0;
  }
}
</style>
