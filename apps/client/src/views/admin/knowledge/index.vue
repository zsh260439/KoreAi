<script setup lang="ts">
import { ElMessage } from 'element-plus'
import {
  ArrowUpRight,
  Database,
  FileBarChart,
  FolderOpen,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2
} from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import { useKnowledgeBases } from '@/composables/knowledge/useKnowledgeBases'

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
    const name = item.name.toLowerCase()
    const description = (item.description || '').toLowerCase()
    return name.includes(normalized) || description.includes(normalized)
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
  const totalDocuments = list.reduce((sum, item) => sum + (item.documentCount ?? 0), 0)
  const activeKnowledgeBases = list.filter((item) => (item.documentCount ?? 0) > 0).length

  return [
    {
      label: '知识库',
      value: list.length,
      hint: '当前已接入'
    },
    {
      label: '文档数',
      value: totalDocuments,
      hint: '跨知识库累计'
    },
    {
      label: '活跃知识库',
      value: activeKnowledgeBases,
      hint: '已有文档内容'
    }
  ]
})

const hasKnowledgeBases = computed(() => knowledgeBases.value.length > 0)
const canCreateKnowledgeBase = computed(() => createName.value.trim().length > 0)

const getCollectionName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, '_')

const getCollectionBadgeClass = (value?: string) => {
  const text = (value || '').toLowerCase()
  if (text.includes('finance')) return 'collection-badge collection-badge--blue'
  if (text.includes('group')) return 'collection-badge collection-badge--sky'
  return 'collection-badge collection-badge--slate'
}

const getDocumentCountLabel = (count?: number) => `${count ?? 0} 篇文档`

const formatDateTime = (value?: string | null) => {
  if (!value) return '-'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  const hours = String(parsed.getHours()).padStart(2, '0')
  const minutes = String(parsed.getMinutes()).padStart(2, '0')
  const seconds = String(parsed.getSeconds()).padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

const handleSearch = () => {
  pageNo.value = 1
  keyword.value = searchInput.value.trim()
}

const handleRefresh = async () => {
  pageNo.value = 1
  await loadKnowledgeBases()
}

const openRename = (id: string, name: string, description?: string) => {
  renameTargetId.value = id
  renameValue.value = name
  renameDescription.value = description || ''
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
  <section class="knowledge-console">
    <AdminPageHeader title="知识库管理" description="管理知识库、文档接入与内容状态。">
      <template #actions>
        <label class="knowledge-search">
          <Search class="h-4 w-4" />
          <input
            v-model="searchInput"
            type="text"
            placeholder="搜索知识库名称"
            @keydown.enter="handleSearch"
          />
        </label>

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

    <div class="stats-strip">
      <article v-for="item in stats" :key="item.label" class="stats-item">
        <div class="stats-item__head">
          <div class="stats-item__icon">
            <Database v-if="item.label === '知识库'" class="h-4 w-4" />
            <FileBarChart v-else-if="item.label === '文档数'" class="h-4 w-4" />
            <FolderOpen v-else class="h-4 w-4" />
          </div>
          <span class="stats-item__label">{{ item.label }}</span>
        </div>
        <strong class="stats-item__value">{{ item.value }}</strong>
        <span class="stats-item__hint">{{ item.hint }}</span>
      </article>
    </div>

    <div class="list-shell">
      <div class="list-shell__header">
        <div>
          <h2>知识库列表</h2>
          <p>
            {{ keyword ? `正在筛选 “${keyword}” 相关结果` : '按知识库名称、集合标识和活跃情况查看当前列表。' }}
          </p>
        </div>
        <div class="list-shell__summary">
          <span>{{ filteredKnowledgeBases.total }} 条记录</span>
          <span v-if="hasKnowledgeBases">共 {{ stats[1]?.value ?? 0 }} 篇文档</span>
        </div>
      </div>

      <div v-if="isLoading && !knowledgeBases.length" class="empty-block">
        正在加载知识库数据...
      </div>

      <div v-else-if="!filteredKnowledgeBases.records.length" class="empty-block empty-block--soft">
        <strong>{{ keyword ? '没有匹配结果' : '还没有知识库' }}</strong>
        <p>
          {{
            keyword
              ? '换一个关键词再试，或者先刷新列表同步最新状态。'
              : '先创建一个知识库，后续文档接入、分块与检索都会从这里开始。'
          }}
        </p>
      </div>

      <div v-else class="knowledge-list">
        <article v-for="item in filteredKnowledgeBases.records" :key="item.id" class="knowledge-row">
          <div class="knowledge-row__main">
            <button class="knowledge-row__title" type="button" @click="router.push(`/admin/knowledge/${item.id}`)">
              {{ item.name }}
              <ArrowUpRight class="h-4 w-4" />
            </button>

            <div class="knowledge-row__meta">
              <span :class="getCollectionBadgeClass(getCollectionName(item.name))">
                {{ getCollectionName(item.name) }}
              </span>
              <span class="knowledge-row__count">{{ getDocumentCountLabel(item.documentCount) }}</span>
            </div>

            <p v-if="item.description" class="knowledge-row__desc">{{ item.description }}</p>
            <p v-else class="knowledge-row__desc knowledge-row__desc--muted">
              暂无描述，点击编辑补充这个知识库的用途和适用范围。
            </p>
          </div>

          <dl class="knowledge-row__facts">
            <div>
              <dt>创建时间</dt>
              <dd>{{ formatDateTime(item.createdAt) }}</dd>
            </div>
            <div>
              <dt>更新时间</dt>
              <dd>{{ formatDateTime(item.updatedAt) }}</dd>
            </div>
          </dl>

          <div class="knowledge-row__actions">
            <button
              class="row-action"
              type="button"
              @click="openRename(item.id, item.name, item.description)"
            >
              <Pencil class="h-4 w-4" />
              编辑
            </button>
            <button class="row-action row-action--danger" type="button" @click="openDelete(item.id)">
              <Trash2 class="h-4 w-4" />
              删除
            </button>
          </div>
        </article>
      </div>

      <div class="list-footer">
        <span>第 {{ filteredKnowledgeBases.current }} / {{ filteredKnowledgeBases.pages }} 页</span>
        <div class="list-footer__actions">
          <el-button :disabled="filteredKnowledgeBases.current <= 1" @click="pageNo = Math.max(1, pageNo - 1)">
            上一页
          </el-button>
          <el-button
            :disabled="filteredKnowledgeBases.current >= filteredKnowledgeBases.pages"
            @click="pageNo = Math.min(filteredKnowledgeBases.pages, pageNo + 1)"
          >
            下一页
          </el-button>
        </div>
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
      <p class="text-sm leading-6 text-slate-500">
        删除后将同时移除该知识库下的文档和分块记录，这个操作不可恢复。
      </p>
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
          <el-input
            v-model="createDescription"
            type="textarea"
            :rows="6"
            placeholder="描述知识库用途与适用范围"
          />
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
.knowledge-console {
  display: grid;
  gap: 18px;
}

.knowledge-search {
  display: flex;
  min-width: min(100%, 280px);
  flex: 1 1 280px;
  align-items: center;
  gap: 8px;
  border: 1px solid #d7dee7;
  border-radius: 10px;
  background: #ffffff;
  padding: 0 12px;
  color: #64748b;
}

.knowledge-search input {
  width: 100%;
  border: 0;
  background: transparent;
  padding: 11px 0;
  font-size: 14px;
  color: #0f172a;
  outline: none;
}

.stats-strip {
  display: grid;
  gap: 0;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  overflow: hidden;
  border: 1px solid #dbe4ee;
  border-radius: 14px;
  background: #ffffff;
}

.stats-item {
  display: grid;
  gap: 6px;
  padding: 18px 20px;
}

.stats-item + .stats-item {
  border-left: 1px solid #eef2f7;
}

.stats-item__head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.stats-item__icon {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 8px;
  background: #f3f6f9;
  color: #5b6b7f;
}

.stats-item__label {
  font-size: 13px;
  color: #64748b;
}

.stats-item__value {
  font-size: 24px;
  line-height: 1;
  font-weight: 700;
  color: #0f172a;
}

.stats-item__hint {
  font-size: 12px;
  color: #94a3b8;
}

.list-shell {
  overflow: hidden;
  border: 1px solid #dbe4ee;
  border-radius: 14px;
  background: #ffffff;
}

.list-shell__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  border-bottom: 1px solid #eef2f7;
  padding: 20px 24px 16px;
}

.list-shell__header h2 {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

.list-shell__header p {
  margin-top: 6px;
  font-size: 14px;
  color: #64748b;
}

.list-shell__summary {
  display: flex;
  gap: 18px;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
}

.knowledge-list {
  display: grid;
}

.knowledge-row {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(240px, 0.8fr) auto;
  gap: 22px;
  align-items: center;
  padding: 20px 24px;
}

.knowledge-row + .knowledge-row {
  border-top: 1px solid #eef2f7;
}

.knowledge-row__main {
  min-width: 0;
}

.knowledge-row__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: 0;
  padding: 0;
  font-size: 16px;
  font-weight: 600;
  color: #0f766e;
  text-align: left;
  cursor: pointer;
}

.knowledge-row__title:hover {
  color: #115e59;
}

.knowledge-row__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.knowledge-row__count {
  font-size: 13px;
  color: #64748b;
}

.knowledge-row__desc {
  margin-top: 12px;
  max-width: 60ch;
  font-size: 14px;
  line-height: 1.75;
  color: #475569;
}

.knowledge-row__desc--muted {
  color: #94a3b8;
}

.knowledge-row__facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 18px;
}

.knowledge-row__facts dt {
  font-size: 12px;
  color: #94a3b8;
}

.knowledge-row__facts dd {
  margin-top: 6px;
  font-size: 14px;
  font-weight: 600;
  color: #334155;
}

.knowledge-row__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.row-action {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  gap: 8px;
  border: 1px solid #dbe4ee;
  border-radius: 10px;
  background: #ffffff;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 500;
  color: #334155;
  cursor: pointer;
}

.row-action:hover {
  border-color: #99f6e4;
  background: #f0fdfa;
  color: #0f766e;
}

.row-action--danger:hover {
  border-color: #fecaca;
  background: #fef2f2;
  color: #dc2626;
}

.collection-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 9999px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
}

.collection-badge--blue {
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #2563eb;
}

.collection-badge--sky {
  border: 1px solid #bae6fd;
  background: #f0f9ff;
  color: #0369a1;
}

.collection-badge--slate {
  border: 1px solid #dbe2ea;
  background: #f8fafc;
  color: #475569;
}

.empty-block {
  display: grid;
  place-items: center;
  gap: 10px;
  padding: 72px 24px;
  text-align: center;
  color: #64748b;
}

.empty-block strong {
  font-size: 18px;
  color: #0f172a;
}

.empty-block p {
  max-width: 44ch;
  line-height: 1.75;
}

.empty-block--soft {
  background: linear-gradient(180deg, #ffffff, #f8fafc);
}

.list-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid #eef2f7;
  padding: 16px 24px;
  font-size: 14px;
  color: #64748b;
}

.list-footer__actions {
  display: flex;
  gap: 10px;
}

@media (max-width: 1240px) {
  .list-shell__header,
  .knowledge-row {
    display: grid;
    grid-template-columns: 1fr;
  }

  .knowledge-row__actions {
    justify-content: flex-start;
  }
}

@media (max-width: 960px) {
  .stats-strip {
    grid-template-columns: 1fr;
  }

  .stats-item + .stats-item {
    border-top: 1px solid #eef2f7;
    border-left: 0;
  }

  .list-shell__header,
  .knowledge-row,
  .list-footer {
    padding-left: 20px;
    padding-right: 20px;
  }
}

@media (max-width: 640px) {
  .knowledge-search {
    min-width: 100%;
  }

  .knowledge-row__facts,
  .list-footer {
    display: grid;
    grid-template-columns: 1fr;
  }

  .list-footer {
    align-items: flex-start;
    gap: 12px;
  }
}
</style>
