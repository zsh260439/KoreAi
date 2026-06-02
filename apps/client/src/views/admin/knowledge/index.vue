<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { Database, FileBarChart, FolderOpen, Layers, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import { useKnowledgeBases } from '@/composables/useKnowledgeBases'

const router = useRouter()
const { knowledgeBases, isLoading, loadKnowledgeBases, createKnowledgeBase, updateKnowledgeBase, removeKnowledgeBase } =
  useKnowledgeBases()

const searchInput = ref('')
const keyword = ref('')
const pageNo = ref(1)
const pageSize = 10

const createDialogOpen = ref(false)
const createName = ref('')
const createDescription = ref('')

const renameDialogOpen = ref(false)
const renameTargetId = ref('')
const renameValue = ref('')
const renameDescription = ref('')

const deleteDialogOpen = ref(false)
const deleteTargetId = ref('')

const filteredKnowledgeBases = computed(() => {
  const normalized = keyword.value.trim().toLowerCase()
  const list = knowledgeBases.value.filter((item) => {
    if (!normalized) return true
    return [item.name, item.description].some((value) => value.toLowerCase().includes(normalized))
  })

  const total = list.length
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(pageNo.value, pages)
  const start = (current - 1) * pageSize

  return {
    total,
    pages,
    current,
    records: list.slice(start, start + pageSize)
  }
})

const stats = computed(() => {
  const list = knowledgeBases.value
  return {
    knowledgeBaseCount: list.length,
    documentCount: list.reduce((sum, item) => sum + (item.documentCount || 0), 0),
    nonEmptyCount: list.filter((item) => (item.documentCount || 0) > 0).length,
    embeddingCount: list.filter((item) => item.embeddingModel).length
  }
})

const canCreateKnowledgeBase = computed(() => createName.value.trim().length > 0)

const renderEmbeddingModel = (model?: string | null) => {
  if (!model) {
    return { head: '-', tail: '' }
  }

  const parts = model.split('-')
  if (parts.length < 2) {
    return { head: model, tail: '' }
  }

  return {
    head: parts.slice(0, -1).join('-'),
    tail: parts[parts.length - 1]
  }
}

const getCollectionBadgeClass = (value?: string) => {
  const text = (value || '').toLowerCase()
  if (text.includes('finance')) return 'collection-badge collection-badge--blue'
  if (text.includes('group')) return 'collection-badge collection-badge--sky'
  return 'collection-badge collection-badge--slate'
}

const getCollectionName = (name: string) => {
  return name.trim().toLowerCase().replace(/\s+/g, '_')
}

const handleSearch = () => {
  pageNo.value = 1
  keyword.value = searchInput.value.trim()
}

const handleRefresh = async () => {
  pageNo.value = 1
  await loadKnowledgeBases()
}

const openRename = (id: string, name: string, description: string) => {
  renameTargetId.value = id
  renameValue.value = name
  renameDescription.value = description
  renameDialogOpen.value = true
}

const closeRename = () => {
  renameDialogOpen.value = false
  renameTargetId.value = ''
  renameValue.value = ''
  renameDescription.value = ''
}

const submitRename = async () => {
  if (!renameTargetId.value || !renameValue.value.trim()) return
  await updateKnowledgeBase(renameTargetId.value, {
    name: renameValue.value.trim(),
    description: renameDescription.value.trim()
  })
  ElMessage.success('知识库已更新')
  closeRename()
}

const openDelete = (id: string) => {
  deleteTargetId.value = id
  deleteDialogOpen.value = true
}

const closeDelete = () => {
  deleteDialogOpen.value = false
  deleteTargetId.value = ''
}

const submitDelete = async () => {
  if (!deleteTargetId.value) return
  await removeKnowledgeBase(deleteTargetId.value)
  ElMessage.success('知识库已删除')
  closeDelete()
}

const closeCreate = () => {
  createDialogOpen.value = false
  createName.value = ''
  createDescription.value = ''
}

const submitCreate = async () => {
  if (!canCreateKnowledgeBase.value) return
  const created = await createKnowledgeBase({
    name: createName.value.trim(),
    description: createDescription.value.trim()
  })
  ElMessage.success('知识库已创建')
  closeCreate()
  router.push(`/admin/knowledge/${created.id}`)
}

onMounted(async () => {
  await loadKnowledgeBases()
})
</script>

<template>
  <section class="knowledge-console space-y-6">
    <AdminPageHeader title="知识库管理" description="管理所有知识库及其文档。">
      <template #actions>
        <el-input v-model="searchInput" placeholder="搜索知识库名称" clearable class="!w-[248px]" />
        <el-button @click="handleSearch">搜索</el-button>
        <el-button @click="handleRefresh">
          <RefreshCw class="h-4 w-4" />
          刷新
        </el-button>
        <el-button type="primary" @click="createDialogOpen = true">
          <Plus class="h-4 w-4" />
          新建知识库
        </el-button>
      </template>
    </AdminPageHeader>

    <div class="stats-grid">
      <div class="stats-card">
        <div class="stats-card__main">
          <div class="stats-card__icon"><Database class="h-5 w-5" /></div>
          <div>
            <div class="stats-card__label">知识库</div>
            <div class="stats-card__value">{{ stats.knowledgeBaseCount }}</div>
          </div>
        </div>
        <span class="stats-card__badge">全部</span>
      </div>

      <div class="stats-card">
        <div class="stats-card__main">
          <div class="stats-card__icon"><FileBarChart class="h-5 w-5" /></div>
          <div>
            <div class="stats-card__label">文档数</div>
            <div class="stats-card__value">{{ stats.documentCount }}</div>
          </div>
        </div>
        <span class="stats-card__badge">全部</span>
      </div>

      <div class="stats-card">
        <div class="stats-card__main">
          <div class="stats-card__icon"><FolderOpen class="h-5 w-5" /></div>
          <div>
            <div class="stats-card__label">含文档知识库</div>
            <div class="stats-card__value">{{ stats.nonEmptyCount }}</div>
          </div>
        </div>
        <span class="stats-card__badge">全部</span>
      </div>

      <div class="stats-card">
        <div class="stats-card__main">
          <div class="stats-card__icon"><Layers class="h-5 w-5" /></div>
          <div>
            <div class="stats-card__label">Embedding 已配置</div>
            <div class="stats-card__value">{{ stats.embeddingCount }}</div>
          </div>
        </div>
        <span class="stats-card__badge">全部</span>
      </div>
    </div>

    <div class="content-card">
      <div v-if="isLoading && !knowledgeBases.length" class="empty-block">加载中...</div>
      <div v-else-if="!filteredKnowledgeBases.records.length" class="empty-block">暂无知识库</div>
      <div v-else class="overflow-x-auto">
        <table class="knowledge-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>Embedding 模型</th>
              <th>Collection</th>
              <th>文档数</th>
              <th>创建时间</th>
              <th>修改时间</th>
              <th class="text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredKnowledgeBases.records" :key="item.id">
              <td class="font-medium">
                <el-button link type="primary" class="!px-0" @click="router.push(`/admin/knowledge/${item.id}`)">
                  {{ item.name }}
                </el-button>
              </td>
              <td>
                <div v-if="renderEmbeddingModel(item.embeddingModel).head !== '-'" class="flex flex-col">
                  <span class="font-medium text-slate-700">{{ renderEmbeddingModel(item.embeddingModel).head }}</span>
                  <span class="text-xs text-slate-500">{{ renderEmbeddingModel(item.embeddingModel).tail }}</span>
                </div>
                <span v-else>-</span>
              </td>
              <td>
                <span :class="getCollectionBadgeClass(getCollectionName(item.name))">
                  {{ getCollectionName(item.name) }}
                </span>
              </td>
              <td>{{ item.documentCount }}</td>
              <td>{{ item.createdAt || '-' }}</td>
              <td>{{ item.updatedAt || '-' }}</td>
              <td>
                <div class="flex items-center justify-center gap-2">
                  <el-button @click="openRename(item.id, item.name, item.description)">
                    <Pencil class="h-4 w-4" />
                    编辑
                  </el-button>
                  <el-button @click="openDelete(item.id)">
                    <Trash2 class="h-4 w-4" />
                    删除
                  </el-button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="flex items-center justify-between text-sm text-slate-500">
      <span>共 {{ filteredKnowledgeBases.total }} 条</span>
      <div class="flex items-center gap-3">
        <el-button :disabled="filteredKnowledgeBases.current <= 1" @click="pageNo = Math.max(1, pageNo - 1)">上一页</el-button>
        <span>{{ filteredKnowledgeBases.current }} / {{ filteredKnowledgeBases.pages }}</span>
        <el-button :disabled="filteredKnowledgeBases.current >= filteredKnowledgeBases.pages" @click="pageNo = Math.min(filteredKnowledgeBases.pages, pageNo + 1)">下一页</el-button>
      </div>
    </div>

    <el-dialog v-model="renameDialogOpen" title="编辑知识库" width="420px" destroy-on-close>
      <div class="space-y-3">
        <div>
          <div class="mb-2 text-sm font-medium text-slate-900">名称</div>
          <el-input v-model="renameValue" placeholder="请输入知识库名称" />
        </div>
        <div>
          <div class="mb-2 text-sm font-medium text-slate-900">描述</div>
          <el-input v-model="renameDescription" type="textarea" :rows="4" placeholder="请输入知识库描述" />
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <el-button @click="closeRename">取消</el-button>
          <el-button type="primary" :disabled="!renameValue.trim()" @click="submitRename">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="deleteDialogOpen" title="删除知识库" width="420px" destroy-on-close>
      <p class="text-sm leading-6 text-slate-500">删除后将同时移除该知识库下的文档和分块记录，当前操作不可恢复。</p>
      <template #footer>
        <div class="flex justify-end gap-3">
          <el-button @click="closeDelete">取消</el-button>
          <el-button type="danger" @click="submitDelete">删除</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="createDialogOpen" title="新建知识库" width="620px" destroy-on-close>
      <div class="grid gap-4">
        <div>
          <div class="mb-2 text-sm font-medium text-slate-900">名称</div>
          <el-input v-model="createName" placeholder="例如：财务制度库" />
        </div>
        <div>
          <div class="mb-2 text-sm font-medium text-slate-900">描述</div>
          <el-input v-model="createDescription" type="textarea" :rows="6" placeholder="描述知识库用途与适用范围" />
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <el-button @click="closeCreate">取消</el-button>
          <el-button type="primary" :disabled="!canCreateKnowledgeBase" @click="submitCreate">创建</el-button>
        </div>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.stats-grid {
  display: grid;
  gap: 16px;
}

.stats-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid var(--border-default);
  border-radius: 16px;
  background: #fff;
  padding: 18px 20px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}

.stats-card__main {
  display: flex;
  align-items: center;
  gap: 14px;
}

.stats-card__icon {
  display: flex;
  width: 42px;
  height: 42px;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: #dbeafe;
  color: #2563eb;
}

.stats-card__label {
  font-size: 13px;
  color: #64748b;
}

.stats-card__value {
  margin-top: 4px;
  font-size: 22px;
  line-height: 1;
  font-weight: 700;
  color: #0f172a;
}

.stats-card__badge {
  border: 1px solid #e2e8f0;
  border-radius: 9999px;
  background: #fff;
  padding: 4px 10px;
  font-size: 12px;
  color: #94a3b8;
}

.content-card {
  border: 1px solid var(--border-default);
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
  overflow: hidden;
}

.empty-block {
  padding: 64px 24px;
  text-align: center;
  color: #64748b;
}

.knowledge-table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
}

.knowledge-table thead {
  background: #f8fafc;
}

.knowledge-table th,
.knowledge-table td {
  border-bottom: 1px solid #eef2f7;
  padding: 18px 20px;
  text-align: left;
  vertical-align: middle;
  color: #475569;
}

.knowledge-table th {
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
}

.knowledge-table tbody tr:hover {
  background: #f8fbff;
}

.collection-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 9999px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
}

.collection-badge--blue {
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #2563eb;
}

.collection-badge--sky {
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
}

.collection-badge--slate {
  border: 1px solid #dbe2ea;
  background: #f8fafc;
  color: #475569;
}

@media (min-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1280px) {
  .stats-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>
