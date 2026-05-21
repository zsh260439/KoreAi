<script setup lang="ts">
import { Database, FileBarChart, FolderOpen, Layers, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-vue-next'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
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

function handleSearch() {
  pageNo.value = 1
  keyword.value = searchName.value.trim()
}

function handleRefresh() {
  pageNo.value = 1
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '-'
  return dateStr
}

function renderEmbeddingModel(model?: string) {
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

function getCollectionBadgeClass(name?: string) {
  const value = (name || '').toLowerCase()
  if (value.includes('biz')) return 'border-blue-200 bg-blue-50 text-blue-700'
  if (value.includes('group')) return 'border-purple-200 bg-purple-50 text-purple-700'
  return 'border-slate-200 bg-slate-100 text-slate-600'
}

function openRename(kbId: string, currentName: string) {
  renameDialog.value = { open: true, kbId }
  renameValue.value = currentName
}

function closeRename() {
  renameDialog.value = { open: false, kbId: null }
  renameValue.value = ''
}

function closeCreateDialog() {
  createDialogOpen.value = false
  createName.value = ''
  createDescription.value = ''
  createOwner.value = '平台知识组'
}

function submitCreateDialog() {
  if (!canCreateKnowledgeBase.value) return
  closeCreateDialog()
}

function handleRename() {
  closeRename()
}

function handleDelete() {
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
        <input
          v-model="searchName"
          placeholder="搜索知识库名称"
          class="h-10 w-[220px] rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        >
        <button
          type="button"
          class="rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
          @click="handleSearch"
        >
          搜索
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
          @click="handleRefresh"
        >
          <RefreshCw class="h-4 w-4" />
          刷新
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-[10px] border border-[var(--border-default)] bg-transparent px-4 py-2 text-sm font-medium text-slate-500 transition hover:bg-white hover:text-slate-900"
          @click="createDialogOpen = true"
        >
          <Plus class="h-4 w-4" />
          新建知识库
        </button>
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
                  <button
                    type="button"
                    class="admin-link max-w-[200px] truncate text-left"
                    @click="router.push(`/admin/knowledge/${kb.id}`)"
                  >
                    {{ kb.name }}
                  </button>
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
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 rounded-[10px] border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
                      @click="openRename(kb.id, kb.name)"
                    >
                      <Pencil class="h-4 w-4" />
                      编辑
                    </button>
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 rounded-[10px] px-3 py-1.5 text-sm text-red-600 transition hover:bg-red-50"
                      @click="deleteTargetId = kb.id"
                    >
                      <Trash2 class="h-4 w-4" />
                      删除
                    </button>
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

    <DialogRoot :open="renameDialog.open" @update:open="(open) => !open && closeRename()">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-50 bg-black/45" />
        <DialogContent class="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[16px] border bg-white p-0 shadow-xl outline-none">
          <div class="border-b px-6 py-5 text-left">
            <DialogTitle class="text-[18px] font-semibold text-slate-900">重命名知识库</DialogTitle>
            <DialogDescription class="mt-2 text-sm text-slate-500">修改知识库名称</DialogDescription>
          </div>
          <div class="space-y-2 px-6 py-6">
            <label class="text-sm font-medium text-slate-900">名称</label>
            <input
              v-model="renameValue"
              class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
          </div>
          <div class="flex justify-end gap-3 border-t px-6 py-4">
            <button type="button" class="rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50" @click="closeRename">取消</button>
            <button type="button" class="rounded-[10px] bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700" @click="handleRename">保存</button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <DialogRoot :open="Boolean(deleteTargetId)" @update:open="(open) => !open && (deleteTargetId = null)">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-50 bg-black/45" />
        <DialogContent class="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[16px] border bg-white p-0 shadow-xl outline-none">
          <div class="border-b px-6 py-5 text-left">
            <DialogTitle class="text-[18px] font-semibold text-slate-900">确认删除</DialogTitle>
            <DialogDescription class="mt-2 text-sm text-slate-500">知识库删除后当前不提供恢复入口。确定要继续吗？</DialogDescription>
          </div>
          <div class="flex justify-end gap-3 px-6 py-4">
            <button type="button" class="rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50" @click="deleteTargetId = null">取消</button>
            <button type="button" class="rounded-[10px] bg-red-600 px-4 py-2 text-sm text-white transition hover:bg-red-700" @click="handleDelete">删除</button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <DialogRoot :open="createDialogOpen" @update:open="createDialogOpen = $event">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-50 bg-black/45" />
        <DialogContent class="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-[16px] border bg-white p-0 shadow-xl outline-none">
          <div class="border-b px-6 py-5 text-left">
            <DialogTitle class="text-[18px] font-semibold text-slate-900">新建知识库</DialogTitle>
            <DialogDescription class="mt-2 text-sm text-slate-500">
              填写知识库名称、归属信息和使用范围。
            </DialogDescription>
          </div>

          <div class="grid gap-6 px-6 py-6 lg:grid-cols-2">
            <div class="space-y-4">
              <div class="space-y-2">
                <label class="text-sm font-medium text-slate-900">名称</label>
                <input
                  v-model="createName"
                  class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="例如：财务制度库"
                >
              </div>

              <div class="space-y-2">
                <label class="text-sm font-medium text-slate-900">归属团队</label>
                <input
                  v-model="createOwner"
                  class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="例如：平台知识组"
                >
              </div>
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium text-slate-900">描述</label>
              <textarea
                v-model="createDescription"
                class="min-h-[128px] w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="描述知识库范围、适用业务和使用场景"
              />
            </div>
          </div>

          <div class="flex justify-end gap-3 border-t px-6 py-4">
            <button type="button" class="rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50" @click="closeCreateDialog">取消</button>
            <button type="button" class="admin-primary-gradient rounded-[10px] px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60" :disabled="!canCreateKnowledgeBase" @click="submitCreateDialog">创建</button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
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
