<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { Plus, RefreshCw, ShieldCheck, ShieldOff, SquarePen, Trash2 } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import { useAdminStore } from '@/stores'
import type { KnowledgeChunk } from '@/types'

const route = useRoute()
const router = useRouter()
const adminStore = useAdminStore()

const kbId = computed(() => String(route.params.kbId || ''))
const docId = computed(() => String(route.params.docId || ''))

const documentRecord = computed(() => adminStore.selectedDocument)
const chunks = computed(() => adminStore.chunksByDocument[docId.value] ?? [])

const statusFilter = ref('all')
const selectedChunkIds = ref<string[]>([])

const editDialogOpen = ref(false)
const createDialogOpen = ref(false)
const deleteDialogOpen = ref(false)
const activeChunkId = ref('')
const chunkContent = ref('')

const filteredChunks = computed(() => {
  if (statusFilter.value === 'all') return chunks.value
  return chunks.value.filter((item) => (statusFilter.value === 'enabled' ? item.enabled : !item.enabled))
})

const activeChunk = computed(() => chunks.value.find((item) => item.id === activeChunkId.value) ?? null)
const selectedChunks = computed(() => chunks.value.filter((item) => selectedChunkIds.value.includes(item.id)))

const openEdit = (chunk: KnowledgeChunk) => {
  activeChunkId.value = chunk.id
  chunkContent.value = chunk.content
  editDialogOpen.value = true
}

const submitEdit = async () => {
  if (!activeChunk.value || !chunkContent.value.trim()) return
  await adminStore.updateChunk(kbId.value, docId.value, activeChunk.value.id, {
    content: chunkContent.value.trim()
  })
  editDialogOpen.value = false
  ElMessage.success('分块内容已更新')
}

const submitCreate = async () => {
  if (!chunkContent.value.trim()) return
  await adminStore.createChunk(kbId.value, docId.value, {
    content: chunkContent.value.trim(),
    enabled: true
  })
  createDialogOpen.value = false
  ElMessage.success('新分块已创建')
}

const openDelete = (chunk: KnowledgeChunk) => {
  activeChunkId.value = chunk.id
  deleteDialogOpen.value = true
}

const submitDelete = async () => {
  if (!activeChunk.value) return
  await adminStore.deleteChunk(kbId.value, docId.value, activeChunk.value.id)
  deleteDialogOpen.value = false
  ElMessage.success('分块已删除')
}

const toggleChunk = async (chunk: KnowledgeChunk, enabled: boolean) => {
  await adminStore.setChunkEnabled(kbId.value, docId.value, chunk.id, enabled)
}

const batchToggle = async (enabled: boolean) => {
  for (const chunk of selectedChunks.value) {
    await adminStore.setChunkEnabled(kbId.value, docId.value, chunk.id, enabled)
  }
  ElMessage.success(enabled ? '批量启用完成' : '批量禁用完成')
}

const toggleAll = async (enabled: boolean) => {
  for (const chunk of chunks.value) {
    if (chunk.enabled !== enabled) {
      await adminStore.setChunkEnabled(kbId.value, docId.value, chunk.id, enabled)
    }
  }
  ElMessage.success(enabled ? '全部启用完成' : '全部禁用完成')
}

const rebuildEmbeddings = async () => {
  await adminStore.rebuildEmbeddings(kbId.value, docId.value)
  ElMessage.success('向量已重建')
}

const handleRefresh = async () => {
  await adminStore.loadDocumentDetail(kbId.value, docId.value)
  await adminStore.loadDocumentChunks(docId.value)
}

onMounted(async () => {
  if (!adminStore.knowledgeBases.length) {
    await adminStore.loadKnowledgeBases()
  }
  await adminStore.loadDocumentDetail(kbId.value, docId.value)
  await adminStore.loadDocumentChunks(docId.value)
})
</script>

<template>
  <section class="space-y-6">
    <AdminPageHeader
      title="分块管理"
      :description="documentRecord ? `${documentRecord.name}（知识库: ${kbId}）` : docId"
    >
      <template #actions>
        <el-button @click="router.push(`/admin/knowledge/${kbId}`)">返回文档</el-button>
        <el-button @click="rebuildEmbeddings">重建向量</el-button>
        <el-button type="primary" @click="chunkContent = ''; createDialogOpen = true">
          <Plus class="h-4 w-4" />
          新建分块
        </el-button>
      </template>
    </AdminPageHeader>

    <div class="chunk-card">
      <div class="chunk-card__header">
        <div>
          <h2 class="chunk-card__title">Chunk 列表</h2>
          <p class="chunk-card__desc">支持编辑、启停、批量操作</p>
        </div>

        <div class="chunk-toolbar">
          <el-select v-model="statusFilter" class="!w-[180px]">
            <el-option value="all" label="全部状态" />
            <el-option value="enabled" label="已启用" />
            <el-option value="disabled" label="已禁用" />
          </el-select>
          <el-button @click="handleRefresh">
            <RefreshCw class="h-4 w-4" />
            刷新
          </el-button>
          <el-button :disabled="!selectedChunkIds.length" @click="batchToggle(true)">
            <ShieldCheck class="h-4 w-4" />
            批量启用
          </el-button>
          <el-button :disabled="!selectedChunkIds.length" @click="batchToggle(false)">
            <ShieldOff class="h-4 w-4" />
            批量禁用
          </el-button>
          <el-button @click="toggleAll(true)">全量启用</el-button>
          <el-button @click="toggleAll(false)">全量禁用</el-button>
        </div>
      </div>

      <div class="chunk-card__body">
        <el-table :data="filteredChunks" row-key="id" @selection-change="(rows: KnowledgeChunk[]) => selectedChunkIds = rows.map((item) => item.id)">
          <el-table-column type="selection" width="54" />
          <el-table-column label="序号" width="80">
            <template #default="{ row }">{{ row.sequence }}</template>
          </el-table-column>
          <el-table-column label="内容" min-width="620">
            <template #default="{ row }">
              <div class="line-clamp-2 leading-8 text-slate-600">{{ row.content }}</div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <span class="inline-flex rounded-full border px-3 py-1 text-sm" :class="row.enabled ? 'border-[#bfdbfe] bg-[#eff6ff] text-[#2563eb]' : 'border-slate-200 bg-slate-100 text-slate-500'">
                {{ row.enabled ? '启用' : '禁用' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="字符数" width="110">
            <template #default="{ row }">{{ row.charCount }}</template>
          </el-table-column>
          <el-table-column label="Token数" width="110">
            <template #default="{ row }">{{ row.tokenCount }}</template>
          </el-table-column>
          <el-table-column label="更新时间" width="180">
            <template #default="{ row }">{{ row.updatedAt }}</template>
          </el-table-column>
          <el-table-column label="操作" width="220" align="right">
            <template #default="{ row }">
              <div class="chunk-actions">
                <el-button class="chunk-action-btn" @click="openEdit(row)">
                  <SquarePen class="h-4 w-4" />
                  编辑
                </el-button>
                <el-button class="chunk-action-btn" @click="toggleChunk(row, !row.enabled)">
                  {{ row.enabled ? '禁用' : '启用' }}
                </el-button>
                <el-button class="chunk-action-btn" @click="openDelete(row)">
                  <Trash2 class="h-4 w-4" />
                  删除
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>

        <div class="chunk-footer">
          <span>共 {{ filteredChunks.length }} 条</span>
          <div class="flex items-center gap-3">
            <el-button disabled>上一页</el-button>
            <span>1 / 1</span>
            <el-button disabled>下一页</el-button>
          </div>
        </div>
      </div>
    </div>

    <el-dialog v-model="editDialogOpen" title="编辑分块" width="860px" destroy-on-close>
      <p class="mb-4 text-sm text-slate-500">手动维护分块内容</p>
      <div>
        <div class="mb-2 text-sm font-medium text-slate-900">内容</div>
        <el-input v-model="chunkContent" type="textarea" :rows="18" />
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <el-button @click="editDialogOpen = false">取消</el-button>
          <el-button type="primary" :disabled="!chunkContent.trim()" @click="submitEdit">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="createDialogOpen" title="新建分块" width="860px" destroy-on-close>
      <p class="mb-4 text-sm text-slate-500">新增一条 chunk 内容</p>
      <div>
        <div class="mb-2 text-sm font-medium text-slate-900">内容</div>
        <el-input v-model="chunkContent" type="textarea" :rows="18" />
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <el-button @click="createDialogOpen = false">取消</el-button>
          <el-button type="primary" :disabled="!chunkContent.trim()" @click="submitCreate">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="deleteDialogOpen" title="删除分块" width="420px" destroy-on-close>
      <p class="text-sm text-slate-500">确认删除当前分块吗？</p>
      <template #footer>
        <div class="flex justify-end gap-3">
          <el-button @click="deleteDialogOpen = false">取消</el-button>
          <el-button type="danger" @click="submitDelete">删除</el-button>
        </div>
      </template>
    </el-dialog>
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

.chunk-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.chunk-card__body {
  padding: 0 16px 18px;
}

.chunk-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 12px 0;
  color: #64748b;
  font-size: 14px;
}

.chunk-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  white-space: nowrap;
}

:deep(.chunk-action-btn) {
  min-width: 0;
  height: 36px;
  margin-left: 0;
  padding: 0 14px;
  border-radius: 10px;
}

:deep(.chunk-action-btn > span) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  line-height: 1;
}

@media (max-width: 1200px) {
  .chunk-card__header {
    flex-direction: column;
  }

  .chunk-toolbar {
    justify-content: flex-start;
  }
}
</style>
