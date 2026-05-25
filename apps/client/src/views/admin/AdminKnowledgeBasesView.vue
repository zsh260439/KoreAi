<script setup lang="ts">
import { Database, FileBarChart, FolderOpen, Layers, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import { useAdminStore } from '@/stores/admin'
import { cn } from '@/utils/cn'

const router = useRouter()
const adminStore = useAdminStore()

const searchName = ref('')
const keyword = ref('')
const createDialogOpen = ref(false)
const renameDialog = ref<{ open: boolean; kbId: string | null }>({
  open: false,
  kbId: null
})
const renameValue = ref('')
const deleteTargetId = ref<string | null>(null)
const pageNo = ref(1)
const pageSize = 10
const createName = ref('')
const createDescription = ref('')
const createOwner = ref('平台知识组')

const filteredKnowledgeBases = computed(() => {
  const normalized = keyword.value.trim()
  const list = adminStore.knowledgeBases.filter((item) => {
    if (!normalized) return true
    return (
      item.name.toLowerCase().includes(normalized.toLowerCase()) ||
      item.description.toLowerCase().includes(normalized.toLowerCase()) ||
      (item.collectionName || '').toLowerCase().includes(normalized.toLowerCase())
    )
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
  const list = adminStore.knowledgeBases
  return {
    totalCount: list.length,
    documentCount: list.reduce((sum, item) => sum + (item.documentCount || 0), 0),
    activeCount: list.filter((item) => (item.documentCount || 0) > 0).length,
    creatorCount: new Set(list.map((item) => item.createdBy).filter(Boolean)).size
  }
})

const canCreateKnowledgeBase = computed(() => createName.value.trim().length > 0)

const handleSearch = () => {
  pageNo.value = 1
  keyword.value = searchName.value.trim()
}

const handleRefresh = () => {
  pageNo.value = 1
}

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '-'
  return dateStr
}

const renderEmbeddingModel = (model?: string) => {
  if (!model) return { head: '-', tail: '' }
  const parts = model.split('-')
  if (parts.length < 2) {
    return { head: model, tail: '' }
  }
  return {
    head: parts.slice(0, -1).join('-'),
    tail: parts[parts.length - 1]
  }
}

const getCollectionBadgeClass = (name?: string) => {
  const value = (name || '').toLowerCase()
  if (value.includes('biz')) return 'border-zinc-200 bg-zinc-50 text-zinc-700'
  if (value.includes('group')) return 'border-purple-200 bg-purple-50 text-purple-700'
  return 'border-slate-200 bg-slate-100 text-slate-600'
}

const openRename = (kbId: string, currentName: string) => {
  renameDialog.value = { open: true, kbId }
  renameValue.value = currentName
}

const closeRename = () => {
  renameDialog.value = { open: false, kbId: null }
  renameValue.value = ''
}

const closeCreateDialog = () => {
  createDialogOpen.value = false
  createName.value = ''
  createDescription.value = ''
  createOwner.value = '平台知识组'
}

const submitCreateDialog = () => {
  if (!canCreateKnowledgeBase.value) return
  closeCreateDialog()
}

const handleRename = () => {
  closeRename()
}

const handleDelete = () => {
  deleteTargetId.value = null
}

onMounted(async () => {
  if (!adminStore.knowledgeBases.length) {
    await adminStore.loadKnowledgeBases()
  }
})
</script>

<template>
  <section class="admin-page">
    <AdminPageHeader
      title="知识库管理"
      description="管理所有知识库及其文档。"
    >
      <template #actions>
        <el-input
          v-model="searchName"
          placeholder="搜索知识库名称"
          clearable
          class="!w-[220px]"
        />
        <el-button type="primary" @click="handleSearch">搜索</el-button>
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

    <div class="admin-stat-grid">
      <div class="admin-stat-card">
        <div class="flex items-center gap-3">
          <div class="admin-stat-icon"><Database class="h-5 w-5" /></div>
          <div>
            <div class="admin-stat-label">知识库</div>
            <div class="admin-stat-value">{{ stats.totalCount }}</div>
          </div>
        </div>
        <span class="admin-stat-scope admin-stat-scope--stamp">全部</span>
      </div>
      <div class="admin-stat-card">
        <div class="flex items-center gap-3">
          <div class="admin-stat-icon"><FileBarChart class="h-5 w-5" /></div>
          <div>
            <div class="admin-stat-label">文档数</div>
            <div class="admin-stat-value">{{ stats.documentCount }}</div>
          </div>
        </div>
        <span class="admin-stat-scope admin-stat-scope--stamp">全部</span>
      </div>
      <div class="admin-stat-card">
        <div class="flex items-center gap-3">
          <div class="admin-stat-icon"><FolderOpen class="h-5 w-5" /></div>
          <div>
            <div class="admin-stat-label">含文档知识库</div>
            <div class="admin-stat-value">{{ stats.activeCount }}</div>
          </div>
        </div>
        <span class="admin-stat-scope admin-stat-scope--stamp">全部</span>
      </div>
      <div class="admin-stat-card">
        <div class="flex items-center gap-3">
          <div class="admin-stat-icon"><Layers class="h-5 w-5" /></div>
          <div>
            <div class="admin-stat-label">创建用户数</div>
            <div class="admin-stat-value">{{ stats.creatorCount }}</div>
          </div>
        </div>
        <span class="admin-stat-scope admin-stat-scope--stamp">全部</span>
      </div>
    </div>

    <div class="mt-6 rounded-[16px] border border-[var(--border-default)] bg-white">
      <div class="px-6 pb-6 pt-6">
        <div v-if="adminStore.loading && !adminStore.knowledgeBases.length" class="py-8 text-center text-slate-500">
          加载中...
        </div>
        <div v-else-if="!filteredKnowledgeBases.records.length" class="py-8 text-center text-slate-500">
          暂无知识库，点击上方按钮创建
        </div>
        <div v-else class="overflow-x-auto">
          <table class="min-w-[980px] w-full border-collapse text-sm text-slate-700">
            <thead class="border-b bg-slate-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">名称</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">Embedding模型</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">Collection</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">文档数</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">负责人</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">创建时间</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">修改时间</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="kb in filteredKnowledgeBases.records"
                :key="kb.id"
                class="border-b last:border-b-0 hover:bg-slate-50"
              >
                <td class="px-4 py-3 font-medium">
                  <el-button link type="primary" class="!max-w-[200px] truncate text-left" @click="router.push(`/admin/knowledge/${kb.id}`)">
                    {{ kb.name }}
                  </el-button>
                </td>
                <td class="px-4 py-3">
                  <div v-if="renderEmbeddingModel(kb.embeddingModel).head !== '-'" class="flex flex-col text-xs text-slate-500">
                    <span class="font-medium text-slate-700">{{ renderEmbeddingModel(kb.embeddingModel).head }}</span>
                    <span>{{ renderEmbeddingModel(kb.embeddingModel).tail }}</span>
                  </div>
                  <span v-else>-</span>
                </td>
                <td class="px-4 py-3">
                  <span
                    v-if="kb.collectionName"
                    :class="cn('inline-flex rounded-full border px-3 py-1 text-xs font-medium', getCollectionBadgeClass(kb.collectionName))"
                  >
                    {{ kb.collectionName }}
                  </span>
                  <span v-else>-</span>
                </td>
                <td class="px-4 py-3">{{ kb.documentCount ?? '-' }}</td>
                <td class="px-4 py-3">{{ kb.createdBy || '-' }}</td>
                <td class="px-4 py-3 text-slate-500">{{ formatDate(kb.createTime) }}</td>
                <td class="px-4 py-3 text-slate-500">{{ formatDate(kb.updateTime) }}</td>
                <td class="px-4 py-3 text-center">
                  <div class="flex justify-center gap-2">
                    <el-button size="small" type="primary" link @click="openRename(kb.id, kb.name)">
                      <Pencil class="h-4 w-4" />
                      编辑
                    </el-button>
                    <el-button size="small" type="danger" link @click="deleteTargetId = kb.id">
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
    </div>

    <div class="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
      <span>共 {{ filteredKnowledgeBases.total }} 条</span>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-[10px] border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          @click="pageNo = Math.max(1, pageNo - 1)"
          :disabled="filteredKnowledgeBases.current <= 1"
        >
          上一页
        </button>
        <span>{{ filteredKnowledgeBases.current }} / {{ filteredKnowledgeBases.pages }}</span>
        <button
          type="button"
          class="rounded-[10px] border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          @click="pageNo = Math.min(filteredKnowledgeBases.pages, pageNo + 1)"
          :disabled="filteredKnowledgeBases.current >= filteredKnowledgeBases.pages"
        >
          下一页
        </button>
      </div>
    </div>

    <el-dialog
      :model-value="renameDialog.open"
      @update:model-value="(open: boolean) => !open && closeRename()"
      title="重命名知识库"
      width="420px"
      :close-on-click-modal="false"
      align-center
      top="30vh"
      class="reka-to-el-dialog"
    >
      <p class="mt-2 text-sm text-slate-500">修改知识库名称</p>
      <div class="space-y-2 py-4">
        <label class="text-sm font-medium text-slate-900">名称</label>
        <el-input v-model="renameValue" />
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <el-button @click="closeRename">取消</el-button>
          <el-button type="primary" @click="handleRename">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      :model-value="Boolean(deleteTargetId)"
      @update:model-value="(open: boolean) => !open && (deleteTargetId = null)"
      title="确认删除"
      width="420px"
      :close-on-click-modal="false"
      align-center
      top="30vh"
      class="reka-to-el-dialog"
    >
      <p class="mt-2 text-sm text-slate-500">知识库删除后当前不提供恢复入口。确定要继续吗？</p>
      <template #footer>
        <div class="flex justify-end gap-3">
          <el-button @click="deleteTargetId = null">取消</el-button>
          <el-button type="danger" @click="handleDelete">删除</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      :model-value="createDialogOpen"
      @update:model-value="createDialogOpen = $event"
      title="新建知识库"
      width="720px"
      :close-on-click-modal="false"
      align-center
      top="10vh"
      class="reka-to-el-dialog"
    >
      <p class="mt-2 text-sm text-slate-500">填写知识库名称、归属信息和使用范围。</p>

      <div class="grid gap-6 py-4 lg:grid-cols-2">
        <div class="space-y-4">
          <div class="space-y-2">
            <label class="text-sm font-medium text-slate-900">名称</label>
            <el-input v-model="createName" placeholder="例如：财务制度库" />
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium text-slate-900">归属团队</label>
            <el-input v-model="createOwner" placeholder="例如：平台知识组" />
          </div>
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium text-slate-900">描述</label>
          <textarea
            v-model="createDescription"
            class="min-h-[128px] w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
            placeholder="描述知识库范围、适用业务和使用场景"
          />
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <el-button @click="closeCreateDialog">取消</el-button>
          <el-button type="primary" :disabled="!canCreateKnowledgeBase" @click="submitCreateDialog">创建</el-button>
        </div>
      </template>
    </el-dialog>
  </section>
</template>

<style>
.admin-layout .admin-stat-grid {
  display: grid;
  gap: 16px;
}

.admin-layout .admin-stat-card {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: none;
  border-radius: 12px;
  background: transparent;
  padding: 16px;
  box-shadow: none;
}

.admin-layout .admin-stat-icon {
  display: flex;
  width: 40px;
  height: 40px;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: rgb(238 242 255);
  color: rgb(79 70 229);
}

.admin-layout .admin-stat-label {
  font-size: 12px;
  line-height: 16px;
  color: rgb(100 116 139);
}

.admin-layout .admin-stat-value {
  font-size: 24px;
  line-height: 32px;
  font-weight: 600;
  color: rgb(15 23 42);
}

.admin-layout .admin-stat-scope {
  font-size: 10px;
  line-height: 14px;
  font-weight: 500;
  color: rgb(148 163 184);
}

.admin-layout .admin-stat-scope--stamp {
  border: 1px solid rgba(226, 232, 240, 0.7);
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.7);
  padding: 2px 8px;
  backdrop-filter: blur(8px);
}

@media (min-width: 768px) {
  .admin-layout .admin-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1280px) {
  .admin-layout .admin-stat-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>
