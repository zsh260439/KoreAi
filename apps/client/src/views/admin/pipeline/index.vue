<script setup lang="ts">
import {
  ClipboardList,
  FileJson2,
  FolderGit2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X
} from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import StatusBadge from '@/components/admin/StatusBadge.vue'
import { useAdminStore } from '@/stores'
import type {
  PipelineDefinition,
  PipelineDefinitionPayload,
  PipelineEnhancerTask,
  PipelineNode,
  PipelineNodeType
} from '@/types'

const route = useRoute()
const router = useRouter()
const adminStore = useAdminStore()

const activeTab = computed({
  get: () => String(route.query.tab || 'pipelines'),
  set: (value: string) => {
    router.replace({
      query: {
        ...route.query,
        tab: value
      }
    })
  }
})

const pipelineKeyword = ref('')
const pipelineSearch = ref('')
const taskStatusFilter = ref('all')
const pipelinePageNo = ref(1)
const taskPageNo = ref(1)
const pageSize = 10

const viewDialogOpen = ref(false)
const editDialogOpen = ref(false)
const editingPipelineId = ref<string | null>(null)
const pipelineJsonMode = ref<'form' | 'json'>('form')
const pipelineJsonDraft = ref('')
const editDialogBodyRef = ref<HTMLDivElement | null>(null)

const pipelineForm = ref<PipelineDefinitionPayload>({
  name: '',
  detail: '',
  owner: 'admin',
  nodes: []
})

const defaultCondition =
  '{"field":"source_type","op":"eq","value":"file"} 或 #context.source.type == "file"'

const enhancerSystemPrompt = `# 角色
你是“文本排版与结构修复器”，专门将从 PDF 解析出来的文本进行格式整理。
**最高原则：任何内容不得被改写、删减、补充、纠错、润色、同义替换或重排语义。只能修复格式，不得改变信息本身。**

# 输入

我会给你一段由 PDF 解析得到的原始文本（可能存在换行错乱、断句、页眉页脚、页码、脚注标记、列表缩进混乱、表格被打散、标题层级不清等问题）。

# 你的任务（只允许做这些）

1. **合并错误换行**：把同一句/同一段中被硬换行打断的文字合并成自然段落。
2. **保留原文字**：所有汉字/标点/数字/英文/单位/日期/专有名词必须与原文完全一致（逐字符一致）。
3. **恢复结构**：

   * 标题与正文分离，整理标题层级（如“1 / 1.1 / （一）/ 一、”等保持原样，只调整换行与缩进）。
   * 列表（编号/项目符号）对齐，确保每一条完整在同一条目下。
4. **表格处理（只做排版，不改内容）**：若原文中的表格被打散，只允许用纯文本方式恢复可读性（例如用制表符\`\\t\`或 \`|\` 分隔列），**不得推断缺失单元格**，无法确定的就保持原样。
5. **去除明显噪声（可选且保守）**：仅当你能100%确认是页眉/页脚/页码/重复水印文本时才可删除；不确定则保留。
6. **不得新增任何解释**：不要总结、不要注释、不要“优化建议”、不要输出“我做了什么”，不要加任何额外段落。

# 绝对禁止

* 禁止改写语句（包括把“可能”改成“也许”、把全角换半角、修改标点、纠错别字、数字格式化等）。
* 禁止补充缺失内容、禁止推断、禁止合并不同段落导致语义顺序改变。
* 禁止输出除“整理后的文本”以外的任何东西（包括标题如“整理结果：”、分隔线说明、markdown解释等）。

# 输出要求

* **只输出整理后的文本本体**，不包含任何前后缀说明。
* 保持原始语言与术语。
* 若遇到无法确定的结构问题，宁可保留原样也不要猜。`

const enhancerUserPrompt = `请整理以下PDF文档内容：

{{text}}`

const viewingPipeline = ref<PipelineDefinition | null>(null)

const filteredPipelines = computed(() => {
  const keyword = pipelineKeyword.value.trim().toLowerCase()
  const list = adminStore.pipelines.filter((item) => {
    if (!keyword) return true
    return item.name.toLowerCase().includes(keyword) || item.detail.toLowerCase().includes(keyword)
  })
  const total = list.length
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(pipelinePageNo.value, pages)
  const start = (current - 1) * pageSize
  return {
    total,
    current,
    pages,
    records: list.slice(start, start + pageSize)
  }
})

const filteredTasks = computed(() => {
  const list = adminStore.tasks.filter((item) => {
    if (taskStatusFilter.value === 'all') return true
    return item.status === taskStatusFilter.value
  })
  const total = list.length
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(taskPageNo.value, pages)
  const start = (current - 1) * pageSize
  return {
    total,
    current,
    pages,
    records: list.slice(start, start + pageSize)
  }
})

const taskStatusOptions = [
  { label: '全部状态', value: 'all' },
  { label: '运行中', value: 'running' },
  { label: '成功', value: 'success' },
  { label: '失败', value: 'error' }
]

const createDefaultEnhancerTask = (): PipelineEnhancerTask => ({
  id: `enhancer-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  taskType: 'context_enhance',
  systemPrompt: enhancerSystemPrompt,
  userPromptTemplate: enhancerUserPrompt
})

const createNode = (nodeType: PipelineNodeType = 'fetcher'): PipelineNode => ({
  id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  nodeId: '',
  nodeType,
  nextNodeId: '',
  condition: defaultCondition,
  parserRules:
    nodeType === 'parser'
      ? JSON.stringify(
          [
            {
              mimeType: 'PDF'
            }
          ],
          null,
          2
        )
      : '',
  modelId: nodeType === 'enhancer' ? 'qwen-plus' : '',
  enhanceTasks: nodeType === 'enhancer' ? [createDefaultEnhancerTask()] : [],
  chunkStrategy: nodeType === 'chunker' ? 'fixed_size' : '',
  chunkSize: nodeType === 'chunker' ? 512 : null,
  overlapSize: nodeType === 'chunker' ? 128 : null,
  customSeparator: '',
  embeddingModel: nodeType === 'indexer' ? 'qwen-emb-8b' : '',
  metadataFields: ''
})

const clonePipeline = (pipeline?: PipelineDefinition | null): PipelineDefinitionPayload => ({
  name: pipeline?.name || '',
  detail: pipeline?.detail || '',
  owner: pipeline?.owner || 'admin',
  nodes:
    pipeline?.nodes.map((node) => ({
      ...node,
      enhanceTasks: node.enhanceTasks.map((task) => ({ ...task }))
    })) || []
})

const handlePipelineSearch = () => {
  pipelinePageNo.value = 1
  pipelineKeyword.value = pipelineSearch.value.trim()
}

const handleRefresh = async () => {
  await adminStore.loadPipelines()
}

const formatNodeTypeLabel = (type: PipelineNodeType) => type

const getNodeConfigPreview = (node: PipelineNode) => {
  if (node.nodeType === 'fetcher') return '-'
  if (node.nodeType === 'parser') {
    return JSON.stringify({ rules: safeJsonParse(node.parserRules) || [] }, null, 2)
  }
  if (node.nodeType === 'enhancer') {
    return JSON.stringify(
      {
        modelId: node.modelId,
        tasks: node.enhanceTasks.map((task) => ({
          type: task.taskType,
          systemPrompt: `${task.systemPrompt.slice(0, 40)}...`
        }))
      },
      null,
      2
    )
  }
  if (node.nodeType === 'chunker') {
    return JSON.stringify(
      {
        strategy: node.chunkStrategy,
        chunkSize: node.chunkSize,
        overlapSize: node.overlapSize
      },
      null,
      2
    )
  }
  return JSON.stringify(
    {
      embeddingModel: node.embeddingModel,
      metadataFields: node.metadataFields
    },
    null,
    2
  )
}

const safeJsonParse = (value: string) => {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const openViewDialog = (pipeline: PipelineDefinition) => {
  viewingPipeline.value = pipeline
  viewDialogOpen.value = true
}

const syncJsonDraft = () => {
  pipelineJsonDraft.value = JSON.stringify(pipelineForm.value.nodes, null, 2)
}

const openCreateDialog = () => {
  editingPipelineId.value = null
  pipelineJsonMode.value = 'form'
  pipelineForm.value = {
    name: '',
    detail: '',
    owner: 'admin',
    nodes: []
  }
  syncJsonDraft()
  editDialogOpen.value = true
  nextTick(() => {
    editDialogBodyRef.value?.scrollTo({ top: 0 })
  })
}

const openEditDialog = (pipeline: PipelineDefinition) => {
  editingPipelineId.value = pipeline.id
  pipelineJsonMode.value = 'form'
  pipelineForm.value = clonePipeline(pipeline)
  syncJsonDraft()
  editDialogOpen.value = true
  nextTick(() => {
    editDialogBodyRef.value?.scrollTo({ top: 0 })
  })
}

const closeEditDialog = () => {
  editDialogOpen.value = false
  editingPipelineId.value = null
  pipelineJsonMode.value = 'form'
}

const handleJsonModeChange = (mode: 'form' | 'json') => {
  if (mode === pipelineJsonMode.value) return
  if (mode === 'json') {
    syncJsonDraft()
    pipelineJsonMode.value = mode
    return
  }

  try {
    const parsed = JSON.parse(pipelineJsonDraft.value) as PipelineNode[]
    pipelineForm.value.nodes = parsed.map((node) => ({
      ...createNode(node.nodeType),
      ...node,
      enhanceTasks: (node.enhanceTasks || []).map((task) => ({
        ...createDefaultEnhancerTask(),
        ...task
      }))
    }))
    pipelineJsonMode.value = mode
  } catch {
    return
  }
}

const addNode = () => {
  pipelineForm.value.nodes.push(createNode())
  if (pipelineJsonMode.value === 'json') {
    syncJsonDraft()
  }
}

const removeNode = (index: number) => {
  pipelineForm.value.nodes.splice(index, 1)
  if (pipelineJsonMode.value === 'json') {
    syncJsonDraft()
  }
}

const handleNodeTypeChange = (node: PipelineNode, type: PipelineNodeType) => {
  const nextNode = createNode(type)
  node.nodeType = type
  node.parserRules = nextNode.parserRules
  node.modelId = nextNode.modelId
  node.enhanceTasks = nextNode.enhanceTasks
  node.chunkStrategy = nextNode.chunkStrategy
  node.chunkSize = nextNode.chunkSize
  node.overlapSize = nextNode.overlapSize
  node.customSeparator = nextNode.customSeparator
  node.embeddingModel = nextNode.embeddingModel
  node.metadataFields = nextNode.metadataFields
}

const addEnhancerTask = (node: PipelineNode) => {
  node.enhanceTasks.push(createDefaultEnhancerTask())
}

const removeEnhancerTask = (node: PipelineNode, taskIndex: number) => {
  node.enhanceTasks.splice(taskIndex, 1)
}

const savePipeline = async () => {
  const payload: PipelineDefinitionPayload = {
    name: pipelineForm.value.name.trim(),
    detail: pipelineForm.value.detail.trim(),
    owner: pipelineForm.value.owner.trim() || 'admin',
    nodes:
      pipelineJsonMode.value === 'json'
        ? (JSON.parse(pipelineJsonDraft.value) as PipelineNode[])
        : pipelineForm.value.nodes
  }

  if (!payload.name) return

  if (editingPipelineId.value) {
    await adminStore.updatePipelineDefinitionEntry(editingPipelineId.value, payload)
  } else {
    await adminStore.createPipelineDefinitionEntry(payload)
  }

  closeEditDialog()
}

const deleteTargetPipelineId = ref<string | null>(null)

const confirmDelete = async (pipelineId: string) => {
  if (deleteTargetPipelineId.value === pipelineId) {
    await adminStore.removePipelineDefinitionEntry(pipelineId)
    deleteTargetPipelineId.value = null
    return
  }
  deleteTargetPipelineId.value = pipelineId
  window.setTimeout(() => {
    if (deleteTargetPipelineId.value === pipelineId) {
      deleteTargetPipelineId.value = null
    }
  }, 2400)
}

const isDeletePending = (pipelineId: string) => deleteTargetPipelineId.value === pipelineId

onMounted(async () => {
  if (!adminStore.pipelines.length && !adminStore.tasks.length) {
    await adminStore.loadPipelines()
  }
})
</script>

<template>
  <section class="space-y-6">
    <AdminPageHeader
      title="数据通道"
      description="管理通道流水线与任务执行情况"
      :breadcrumbs="['首页', '数据通道']"
    >
      <template #actions>
        <div class="inline-flex rounded-[14px] border border-[var(--border-default)] bg-white p-1">
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-[10px] px-4 py-2 text-sm transition-all"
            :class="
              activeTab === 'pipelines'
                ? 'bg-[var(--brand-primary)] text-white shadow-[0_8px_20px_rgba(37,99,235,0.18)]'
                : 'text-[var(--text-secondary)]'
            "
            @click="activeTab = 'pipelines'"
          >
            <FolderGit2 class="size-4" />
            流水线
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-[10px] px-4 py-2 text-sm transition-all"
            :class="
              activeTab === 'tasks'
                ? 'bg-[var(--brand-primary)] text-white shadow-[0_8px_20px_rgba(37,99,235,0.18)]'
                : 'text-[var(--text-secondary)]'
            "
            @click="activeTab = 'tasks'"
          >
            <ClipboardList class="size-4" />
            任务
          </button>
        </div>
      </template>
    </AdminPageHeader>

    <section class="rounded-[22px] border border-[var(--border-default)] bg-white shadow-[var(--shadow-sm)]">
      <div class="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border-soft)] px-7 py-6">
        <div>
          <h2 class="text-[18px] font-semibold text-[var(--text-primary)]">
            {{ activeTab === 'pipelines' ? '通道流水线' : '通道任务' }}
          </h2>
          <p class="mt-1 text-sm text-[var(--text-muted)]">
            {{ activeTab === 'pipelines' ? '配置节点顺序与处理逻辑' : '监控执行状态与节点日志' }}
          </p>
        </div>

        <div v-if="activeTab === 'pipelines'" class="flex flex-wrap items-center gap-3">
          <el-input
            v-model="pipelineSearch"
            placeholder="搜索流水线名称"
            class="!w-[360px]"
            clearable
            @keyup.enter="handlePipelineSearch"
          />
          <el-button @click="handlePipelineSearch">搜索</el-button>
          <el-button @click="handleRefresh">
            <RefreshCw class="mr-1 size-4" />
            刷新
          </el-button>
          <el-button type="primary" @click="openCreateDialog">
            <Plus class="mr-1 size-4" />
            新建流水线
          </el-button>
        </div>

        <div v-else class="flex flex-wrap items-center gap-3">
          <el-select v-model="taskStatusFilter" class="!w-[204px]">
            <el-option
              v-for="option in taskStatusOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <el-button @click="handleRefresh">
            <RefreshCw class="mr-1 size-4" />
            刷新
          </el-button>
          <el-button>
            <Upload class="mr-1 size-4" />
            上传文件
          </el-button>
          <el-button type="primary">
            <Plus class="mr-1 size-4" />
            新建任务
          </el-button>
        </div>
      </div>

      <div v-if="activeTab === 'pipelines'">
        <div v-if="adminStore.loading && !adminStore.pipelines.length" class="px-8 py-12 text-center text-slate-500">
          加载中...
        </div>

        <div v-else-if="!filteredPipelines.records.length" class="px-8 py-12 text-center text-slate-500">
          暂无流水线
        </div>

        <div v-else class="overflow-x-auto">
          <table class="min-w-[1200px] w-full border-collapse text-sm text-slate-700">
            <thead class="border-b border-[var(--border-soft)] bg-slate-50/70">
              <tr>
                <th class="px-7 py-5 text-left text-xs font-semibold text-slate-500">名称</th>
                <th class="px-7 py-5 text-left text-xs font-semibold text-slate-500">描述</th>
                <th class="px-7 py-5 text-left text-xs font-semibold text-slate-500">节点数</th>
                <th class="px-7 py-5 text-left text-xs font-semibold text-slate-500">负责人</th>
                <th class="px-7 py-5 text-left text-xs font-semibold text-slate-500">更新时间</th>
                <th class="px-7 py-5 text-left text-xs font-semibold text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="pipeline in filteredPipelines.records"
                :key="pipeline.id"
                class="border-b border-[var(--border-soft)] last:border-b-0"
              >
                <td class="px-7 py-5 align-middle">
                  <div class="text-[15px] font-medium text-[var(--text-primary)]">{{ pipeline.name }}</div>
                </td>
                <td class="px-7 py-5 align-middle text-[15px] text-[var(--text-secondary)]">
                  {{ pipeline.detail }}
                </td>
                <td class="px-7 py-5 align-middle">{{ pipeline.nodes.length }}</td>
                <td class="px-7 py-5 align-middle">{{ pipeline.owner }}</td>
                <td class="px-7 py-5 align-middle">{{ pipeline.updatedAt }}</td>
                <td class="px-7 py-5 align-middle">
                  <div class="flex items-center gap-3">
                    <button
                      type="button"
                      class="inline-flex items-center rounded-[10px] border border-[var(--border-default)] px-4 py-2 text-[14px] text-[var(--text-primary)] transition-all hover:bg-slate-50"
                      @click="openViewDialog(pipeline)"
                    >
                      查看节点
                    </button>
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 text-[14px] text-[var(--text-primary)] transition-opacity hover:opacity-70"
                      @click="openEditDialog(pipeline)"
                    >
                      <Pencil class="size-4" />
                      编辑
                    </button>
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 text-[14px] transition-opacity"
                      :class="isDeletePending(pipeline.id) ? 'text-red-600' : 'text-slate-500 hover:text-red-600'"
                      @click="confirmDelete(pipeline.id)"
                    >
                      <Trash2 class="size-4" />
                      {{ isDeletePending(pipeline.id) ? '确认删除' : '删除' }}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="flex items-center justify-between px-7 py-6 text-sm text-[var(--text-muted)]">
          <span>共 {{ filteredPipelines.total }} 条</span>
          <div class="flex items-center gap-3">
            <button
              type="button"
              class="rounded-[12px] border border-[var(--border-default)] px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="filteredPipelines.current <= 1"
              @click="pipelinePageNo = Math.max(1, pipelinePageNo - 1)"
            >
              上一页
            </button>
            <span>{{ filteredPipelines.current }} / {{ filteredPipelines.pages }}</span>
            <button
              type="button"
              class="rounded-[12px] border border-[var(--border-default)] px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="filteredPipelines.current >= filteredPipelines.pages"
              @click="pipelinePageNo = Math.min(filteredPipelines.pages, pipelinePageNo + 1)"
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      <div v-else>
        <div v-if="adminStore.loading && !adminStore.tasks.length" class="px-8 py-12 text-center text-slate-500">
          加载中...
        </div>

        <div v-else-if="!filteredTasks.records.length" class="px-8 py-12 text-center text-slate-500">
          暂无任务
        </div>

        <div v-else class="overflow-x-auto">
          <table class="min-w-[1120px] w-full border-collapse text-sm text-slate-700">
            <thead class="border-b border-[var(--border-soft)] bg-slate-50/70">
              <tr>
                <th class="px-7 py-5 text-left text-xs font-semibold text-slate-500">任务名称</th>
                <th class="px-7 py-5 text-left text-xs font-semibold text-slate-500">描述</th>
                <th class="px-7 py-5 text-left text-xs font-semibold text-slate-500">状态</th>
                <th class="px-7 py-5 text-left text-xs font-semibold text-slate-500">进度</th>
                <th class="px-7 py-5 text-left text-xs font-semibold text-slate-500">负责人</th>
                <th class="px-7 py-5 text-left text-xs font-semibold text-slate-500">更新时间</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="task in filteredTasks.records"
                :key="task.id"
                class="border-b border-[var(--border-soft)] last:border-b-0"
              >
                <td class="px-7 py-5">
                  <div class="text-[15px] font-medium text-[var(--text-primary)]">{{ task.name }}</div>
                </td>
                <td class="px-7 py-5 text-[15px] text-[var(--text-secondary)]">{{ task.detail }}</td>
                <td class="px-7 py-5"><StatusBadge :status="task.status" /></td>
                <td class="px-7 py-5">
                  <div class="w-[180px]">
                    <div class="h-2 rounded-full bg-[var(--bg-surface-subtle)]">
                      <div
                        class="h-2 rounded-full bg-[var(--brand-primary)]"
                        :style="{ width: `${task.progress}%` }"
                      />
                    </div>
                    <div class="mt-2 text-xs text-[var(--text-muted)]">{{ task.progress }}%</div>
                  </div>
                </td>
                <td class="px-7 py-5">{{ task.owner }}</td>
                <td class="px-7 py-5">{{ task.updatedAt }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="flex items-center justify-between px-7 py-6 text-sm text-[var(--text-muted)]">
          <span>共 {{ filteredTasks.total }} 条</span>
          <div class="flex items-center gap-3">
            <button
              type="button"
              class="rounded-[12px] border border-[var(--border-default)] px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="filteredTasks.current <= 1"
              @click="taskPageNo = Math.max(1, taskPageNo - 1)"
            >
              上一页
            </button>
            <span>{{ filteredTasks.current }} / {{ filteredTasks.pages }}</span>
            <button
              type="button"
              class="rounded-[12px] border border-[var(--border-default)] px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="filteredTasks.current >= filteredTasks.pages"
              @click="taskPageNo = Math.min(filteredTasks.pages, taskPageNo + 1)"
            >
              下一页
            </button>
          </div>
        </div>
      </div>
    </section>

    <el-dialog
      v-model="viewDialogOpen"
      width="840px"
      align-center
      destroy-on-close
      class="pipeline-dialog"
      :show-close="false"
    >
      <template #header>
        <div class="flex items-start justify-between">
          <div>
            <h3 class="text-[18px] font-semibold text-[var(--text-primary)]">流水线节点</h3>
            <p class="mt-2 text-sm text-[var(--text-muted)]">{{ viewingPipeline?.name }}</p>
          </div>
          <button
            type="button"
            class="inline-flex size-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100"
            @click="viewDialogOpen = false"
          >
            <X class="size-5" />
          </button>
        </div>
      </template>

      <div class="overflow-hidden rounded-[18px] border border-[var(--border-soft)]">
        <table class="min-w-full border-collapse text-sm text-slate-700">
          <thead class="border-b border-[var(--border-soft)] bg-slate-50/70">
            <tr>
              <th class="px-5 py-4 text-left text-xs font-semibold text-slate-500">#</th>
              <th class="px-5 py-4 text-left text-xs font-semibold text-slate-500">节点ID</th>
              <th class="px-5 py-4 text-left text-xs font-semibold text-slate-500">类型</th>
              <th class="px-5 py-4 text-left text-xs font-semibold text-slate-500">下一节点</th>
              <th class="px-5 py-4 text-left text-xs font-semibold text-slate-500">配置</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(node, index) in viewingPipeline?.nodes || []"
              :key="node.id"
              class="border-b border-[var(--border-soft)] align-top last:border-b-0"
            >
              <td class="px-5 py-6">{{ index + 1 }}</td>
              <td class="px-5 py-6 font-medium text-[var(--text-primary)]">{{ node.nodeId }}</td>
              <td class="px-5 py-6">
                <span class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                  {{ formatNodeTypeLabel(node.nodeType) }}
                </span>
              </td>
              <td class="px-5 py-6">{{ node.nextNodeId || '-' }}</td>
              <td class="px-5 py-6">
                <pre class="max-w-[280px] whitespace-pre-wrap break-all font-mono text-[12px] leading-6 text-slate-500">{{ getNodeConfigPreview(node) }}</pre>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </el-dialog>

    <el-dialog
      v-model="editDialogOpen"
      width="1000px"
      align-center
      destroy-on-close
      class="pipeline-dialog"
      :show-close="false"
    >
      <template #header>
        <div class="flex items-start justify-between">
          <div>
            <h3 class="text-[18px] font-semibold text-[var(--text-primary)]">
              {{ editingPipelineId ? '编辑流水线' : '新建流水线' }}
            </h3>
            <p class="mt-2 text-sm text-[var(--text-muted)]">配置节点顺序与处理逻辑</p>
          </div>
          <button
            type="button"
            class="inline-flex size-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100"
            @click="closeEditDialog"
          >
            <X class="size-5" />
          </button>
        </div>
      </template>

      <div ref="editDialogBodyRef" class="max-h-[72vh] overflow-y-auto pr-1">
        <div class="space-y-6">
          <div>
            <div class="mb-3 text-sm font-medium text-[var(--text-primary)]">流水线名称</div>
            <el-input v-model="pipelineForm.name" placeholder="例如：通用文档通道" />
          </div>

          <div>
            <div class="mb-3 text-sm font-medium text-[var(--text-primary)]">描述</div>
            <el-input
              v-model="pipelineForm.detail"
              type="textarea"
              :rows="3"
              placeholder="说明流水线用途或流程"
            />
          </div>

          <div>
            <div class="mb-4 flex items-center justify-between gap-4">
              <div class="text-sm font-medium text-[var(--text-primary)]">节点配置</div>
              <div class="inline-flex rounded-[14px] border border-[var(--border-default)] bg-white p-1">
                <button
                  type="button"
                  class="rounded-[10px] px-4 py-2 text-sm transition-all"
                  :class="
                    pipelineJsonMode === 'form'
                      ? 'bg-[var(--brand-primary)] text-white shadow-[0_8px_20px_rgba(37,99,235,0.18)]'
                      : 'text-[var(--text-primary)]'
                  "
                  @click="handleJsonModeChange('form')"
                >
                  表单配置
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-2 rounded-[10px] px-4 py-2 text-sm transition-all"
                  :class="
                    pipelineJsonMode === 'json'
                      ? 'bg-[var(--brand-primary)] text-white shadow-[0_8px_20px_rgba(37,99,235,0.18)]'
                      : 'text-[var(--text-primary)]'
                  "
                  @click="handleJsonModeChange('json')"
                >
                  <FileJson2 class="size-4" />
                  JSON配置
                </button>
              </div>
            </div>

            <div v-if="pipelineJsonMode === 'json'" class="rounded-[18px] border border-[var(--border-soft)] bg-slate-50/40 p-4">
              <el-input v-model="pipelineJsonDraft" type="textarea" :rows="18" />
            </div>

            <div v-else class="space-y-4">
              <div
                v-if="!pipelineForm.nodes.length"
                class="rounded-[18px] border border-dashed border-[var(--border-default)] px-6 py-10 text-center text-[15px] text-[var(--text-muted)]"
              >
                暂无节点，请添加节点配置
              </div>

              <div
                v-for="(node, index) in pipelineForm.nodes"
                :key="node.id"
                class="rounded-[18px] border border-[var(--border-default)] bg-slate-50/35 p-5"
              >
                <div class="mb-5 flex items-center justify-between gap-3">
                  <div class="flex items-center gap-3">
                    <span class="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                      {{ node.nodeType }}
                    </span>
                    <span class="text-sm text-[var(--text-muted)]">节点 {{ index + 1 }}</span>
                  </div>
                  <button type="button" class="text-sm text-red-500" @click="removeNode(index)">删除</button>
                </div>

                <div class="grid gap-4 md:grid-cols-2">
                  <div>
                    <div class="mb-2 text-sm font-medium text-[var(--text-primary)]">节点ID</div>
                    <el-input v-model="node.nodeId" placeholder="例如：fetcher-1" />
                  </div>
                  <div>
                    <div class="mb-2 text-sm font-medium text-[var(--text-primary)]">节点类型</div>
                    <el-select
                      :model-value="node.nodeType"
                      class="w-full"
                      @update:model-value="handleNodeTypeChange(node, $event)"
                    >
                      <el-option label="fetcher" value="fetcher" />
                      <el-option label="parser" value="parser" />
                      <el-option label="enhancer" value="enhancer" />
                      <el-option label="chunker" value="chunker" />
                      <el-option label="indexer" value="indexer" />
                    </el-select>
                  </div>
                </div>

                <div class="mt-4">
                  <div class="mb-2 text-sm font-medium text-[var(--text-primary)]">下一节点ID</div>
                  <el-input v-model="node.nextNodeId" placeholder="例如：parser-1" />
                </div>

                <div v-if="node.nodeType === 'fetcher'" class="mt-4 rounded-[14px] bg-slate-100 px-4 py-4 text-sm text-[var(--text-muted)]">
                  Fetcher 无额外配置
                </div>

                <div v-if="node.nodeType === 'parser'" class="mt-4">
                  <div class="mb-2 text-sm font-medium text-[var(--text-primary)]">解析规则（JSON）</div>
                  <el-input v-model="node.parserRules" type="textarea" :rows="6" />
                </div>

                <div v-if="node.nodeType === 'enhancer'" class="mt-4 space-y-4">
                  <div>
                    <div class="mb-2 text-sm font-medium text-[var(--text-primary)]">模型ID</div>
                    <el-input v-model="node.modelId" placeholder="例如：qwen-plus" />
                  </div>

                  <div>
                    <div class="mb-3 flex items-center justify-between">
                      <div class="text-sm font-medium text-[var(--text-primary)]">增强任务</div>
                      <button
                        type="button"
                        class="inline-flex items-center gap-1 rounded-full border border-[var(--border-default)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
                        @click="addEnhancerTask(node)"
                      >
                        <Plus class="size-3.5" />
                        添加任务
                      </button>
                    </div>

                    <div
                      v-for="(task, taskIndex) in node.enhanceTasks"
                      :key="task.id"
                      class="mb-4 rounded-[16px] border border-[var(--border-default)] bg-white p-4 last:mb-0"
                    >
                      <div class="mb-4 flex items-center justify-between">
                        <div class="text-sm font-medium text-[var(--text-primary)]">任务 {{ taskIndex + 1 }}</div>
                        <button type="button" class="text-sm text-red-500" @click="removeEnhancerTask(node, taskIndex)">
                          删除
                        </button>
                      </div>

                      <div>
                        <div class="mb-2 text-sm font-medium text-[var(--text-primary)]">任务类型</div>
                        <el-input v-model="task.taskType" />
                      </div>
                      <div class="mt-4">
                        <div class="mb-2 text-sm font-medium text-[var(--text-primary)]">System Prompt</div>
                        <el-input v-model="task.systemPrompt" type="textarea" :rows="10" />
                      </div>
                      <div class="mt-4">
                        <div class="mb-2 text-sm font-medium text-[var(--text-primary)]">User Prompt 模板</div>
                        <el-input v-model="task.userPromptTemplate" type="textarea" :rows="4" />
                      </div>
                    </div>
                  </div>
                </div>

                <div v-if="node.nodeType === 'chunker'" class="mt-4 space-y-4">
                  <div>
                    <div class="mb-2 text-sm font-medium text-[var(--text-primary)]">分块策略</div>
                    <el-select v-model="node.chunkStrategy" class="w-full">
                      <el-option label="fixed_size" value="fixed_size" />
                    </el-select>
                  </div>
                  <div class="grid gap-4 md:grid-cols-2">
                    <div>
                      <div class="mb-2 text-sm font-medium text-[var(--text-primary)]">Chunk Size</div>
                      <el-input v-model.number="node.chunkSize" />
                    </div>
                    <div>
                      <div class="mb-2 text-sm font-medium text-[var(--text-primary)]">Overlap Size</div>
                      <el-input v-model.number="node.overlapSize" />
                    </div>
                  </div>
                  <div>
                    <div class="mb-2 text-sm font-medium text-[var(--text-primary)]">自定义分隔符</div>
                    <el-input v-model="node.customSeparator" placeholder="可选" />
                  </div>
                </div>

                <div v-if="node.nodeType === 'indexer'" class="mt-4 space-y-4">
                  <div>
                    <div class="mb-2 text-sm font-medium text-[var(--text-primary)]">Embedding 模型</div>
                    <el-input v-model="node.embeddingModel" placeholder="例如：qwen-emb-8b" />
                  </div>
                  <div>
                    <div class="mb-2 text-sm font-medium text-[var(--text-primary)]">元数据字段</div>
                    <el-input v-model="node.metadataFields" placeholder="用逗号分隔，如 keywords,summary" />
                  </div>
                </div>

                <div class="mt-4">
                  <div class="mb-2 text-sm font-medium text-[var(--text-primary)]">条件（JSON / SpEL，可选）</div>
                  <el-input v-model="node.condition" type="textarea" :rows="3" />
                </div>
              </div>
            </div>

            <button
              v-if="pipelineJsonMode === 'form'"
              type="button"
              class="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--border-default)] bg-white px-4 py-2 text-sm text-[var(--text-primary)] transition hover:bg-slate-50"
              @click="addNode"
            >
              <Plus class="size-4" />
              添加节点
            </button>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3 border-t border-[var(--border-soft)] bg-white pt-4">
          <button
            type="button"
            class="rounded-full border border-[var(--border-default)] bg-white px-7 py-3 text-sm text-[var(--text-primary)]"
            @click="closeEditDialog"
          >
            取消
          </button>
          <button
            type="button"
            class="rounded-full bg-[var(--brand-primary)] px-7 py-3 text-sm text-white shadow-[0_10px_24px_rgba(37,99,235,0.24)]"
            @click="savePipeline"
          >
            保存
          </button>
        </div>
      </template>
    </el-dialog>
  </section>
</template>
