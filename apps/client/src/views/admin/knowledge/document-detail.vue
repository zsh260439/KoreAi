<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { RefreshCw } from 'lucide-vue-next'
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import { useKnowledgeChunks } from '@/composables/useKnowledgeChunks'
import { useKnowledgeDocuments } from '@/composables/useKnowledgeDocuments'

const route = useRoute()
const router = useRouter()
const { currentDocument, loadKnowledgeDocument } = useKnowledgeDocuments()
const { chunks, loadKnowledgeChunks, rebuildKnowledgeChunks } = useKnowledgeChunks()

const kbId = computed(() => String(route.params.kbId || ''))
const docId = computed(() => String(route.params.docId || ''))

const rebuildChunks = async () => {
  await rebuildKnowledgeChunks(docId.value)
  await loadKnowledgeDocument(docId.value)
  ElMessage.success('文档已重新分块')
}

const handleRefresh = async () => {
  await loadKnowledgeDocument(docId.value)
  await loadKnowledgeChunks(docId.value)
}

onMounted(async () => {
  await loadKnowledgeDocument(docId.value)
  await loadKnowledgeChunks(docId.value)
})
</script>

<template>
  <section class="space-y-6">
    <AdminPageHeader
      title="分块详情"
      :description="currentDocument ? `${currentDocument.name}（知识库: ${kbId}）` : docId"
    >
      <template #actions>
        <el-button @click="router.push(`/admin/knowledge/${kbId}`)">返回文档</el-button>
        <el-button @click="handleRefresh">
          <RefreshCw class="h-4 w-4" />
          刷新
        </el-button>
        <el-button type="primary" @click="rebuildChunks">重新分块</el-button>
      </template>
    </AdminPageHeader>

    <div class="chunk-card">
      <div class="chunk-card__header">
        <div>
          <h2 class="chunk-card__title">Chunk 列表</h2>
          <p class="chunk-card__desc">当前页面只展示文档切分结果，不支持手动增删改。</p>
        </div>
      </div>

      <div class="chunk-card__body">
        <el-table :data="chunks" row-key="id">
          <el-table-column label="序号" width="80">
            <template #default="{ row }">{{ row.sequence }}</template>
          </el-table-column>
          <el-table-column label="内容" min-width="680">
            <template #default="{ row }">
              <div class="line-clamp-3 leading-8 text-slate-600">{{ row.content }}</div>
            </template>
          </el-table-column>
          <el-table-column label="字符数" width="110">
            <template #default="{ row }">{{ row.charCount }}</template>
          </el-table-column>
          <el-table-column label="Token 数" width="110">
            <template #default="{ row }">{{ row.tokenCount }}</template>
          </el-table-column>
          <el-table-column label="更新时间" width="180">
            <template #default="{ row }">{{ row.updatedAt }}</template>
          </el-table-column>
        </el-table>

        <div class="chunk-footer">
          <span>共 {{ chunks.length }} 条</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.chunk-card {
  border: 1px solid var(--border-default);
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
  overflow: hidden;
}

.chunk-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 28px 18px;
  border-bottom: 1px solid #edf2f7;
}

.chunk-card__title {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.chunk-card__desc {
  margin-top: 4px;
  font-size: 14px;
  color: #64748b;
}

.chunk-card__body {
  padding: 0 16px 18px;
}

.chunk-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 18px 12px 0;
  color: #64748b;
  font-size: 14px;
}
</style>
