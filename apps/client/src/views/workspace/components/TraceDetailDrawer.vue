<script setup lang="ts">
import { CircleAlert, X } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

import type { TraceDetail, TraceStep } from '@/types'

type DetailNavItem = {
  badge: string
  durationLabel: string
  key: string
  kind: 'overview' | 'step' | 'tools' | 'citations' | 'response' | 'raw'
  step?: TraceStep
  title: string
}

const props = defineProps<{
  open: boolean
  trace?: TraceDetail | null
  desktop?: boolean
}>()

defineEmits<{
  'update:open': [value: boolean]
}>()

const activeKey = ref('overview')

const formatDuration = (durationMs?: number) => {
  const value = durationMs || 0

  if (value < 1000) {
    return value === 0 ? '0 秒' : `${value} 毫秒`
  }

  return `${(value / 1000).toFixed(2)} 秒`
}

const resolveStatusText = (status?: string) => {
  if (status === 'success') {
    return '正常完成'
  }

  if (status === 'running') {
    return '执行中'
  }

  if (status === 'error' || status === 'failed') {
    return '执行异常'
  }

  if (status === 'paused') {
    return '已暂停'
  }

  if (status === 'timeout') {
    return '已超时'
  }

  return status || '未知状态'
}

const toolNameMap: Record<string, string> = {
  knowledge_search: '知识库检索',
  time_lookup: '时间解析',
  weather_lookup: '天气查询',
  web_search_mcp: '网络搜索',
  deepsearch_reasoner: '深度思考'
}

const navigationItems = computed<DetailNavItem[]>(() => {
  const trace = props.trace
  if (!trace) {
    return []
  }

  const items: DetailNavItem[] = [
    {
      key: 'overview',
      kind: 'overview',
      title: '流程总览',
      durationLabel: '0 秒',
      badge: '总'
    }
  ]

  trace.steps.forEach((step, index) => {
    items.push({
      key: `step-${step.id}`,
      kind: 'step',
      title: step.title,
      durationLabel: formatDuration(step.durationMs),
      badge: String(index + 1).padStart(2, '0'),
      step
    })
  })

  if (trace.toolExecutions.length > 0) {
    items.push({
      key: 'tools',
      kind: 'tools',
      title: '工具记录',
      durationLabel: `${trace.toolExecutions.length} 项`,
      badge: '工'
    })
  }

  if (trace.citations.length > 0) {
    items.push({
      key: 'citations',
      kind: 'citations',
      title: '引用片段',
      durationLabel: `${trace.citations.length} 条`,
      badge: '引'
    })
  }

  items.push({
    key: 'response',
    kind: 'response',
    title: '最终回答',
    durationLabel: formatDuration(trace.summary.latencyMs ?? trace.summary.durationMs),
    badge: '答'
  })

  items.push({
    key: 'raw',
    kind: 'raw',
    title: '原始信息',
    durationLabel: 'JSON',
    badge: '源'
  })

  return items
})

const activeItem = computed(
  () => navigationItems.value.find((item) => item.key === activeKey.value) ?? navigationItems.value[0]
)

const recordPreview = computed(() => [
  {
    label: '用户',
    content: props.trace?.summary.question || '暂无用户输入记录'
  },
  {
    label: '助手',
    content: props.trace?.finalAnswer || '暂无模型输出记录'
  }
])

const stepKindLabelMap: Record<TraceStep['kind'], string> = {
  router: '路由',
  retrieval: '检索',
  tool: '工具',
  response: '回答'
}

const getStepKindLabel = (kind: TraceStep['kind']) => stepKindLabelMap[kind] ?? kind

const getToolName = (toolName?: string) => (toolName ? toolNameMap[toolName] ?? toolName : '工具')

const activeStepTool = computed(() => {
  const item = activeItem.value
  const trace = props.trace
  if (!item || item.kind !== 'step' || !item.step || !trace) {
    return null
  }

  if (item.step.kind !== 'tool') {
    return null
  }

  const toolStepIndex = trace.steps
    .filter((step) => step.kind === 'tool')
    .findIndex((step) => step.id === item.step?.id)

  return toolStepIndex >= 0 ? trace.toolExecutions[toolStepIndex] ?? null : null
})

watch(
  () => props.open,
  (open) => {
    if (open) {
      activeKey.value = navigationItems.value[0]?.key ?? 'overview'
    }
  }
)

watch(
  navigationItems,
  (items) => {
    if (!items.some((item) => item.key === activeKey.value)) {
      activeKey.value = items[0]?.key ?? 'overview'
    }
  },
  { immediate: true }
)
</script>

<template>
  <el-dialog
    :model-value="open"
    :width="desktop ? '920px' : '94vw'"
    top="6vh"
    append-to-body
    align-center
    :show-close="false"
    :close-on-click-modal="true"
    class="trace-detail-dialog"
    @update:model-value="$emit('update:open', $event)"
  >
    <div class="flex items-center justify-between border-b border-b-[#eef2f7] pb-4">
      <div class="flex items-center gap-2">
        <h3 class="text-[28px] font-semibold tracking-[-0.02em] text-[#111827]">完整响应</h3>
        <CircleAlert class="size-4 text-[#9aa4b2]" />
      </div>

      <button
        type="button"
        class="flex size-9 items-center justify-center rounded-full text-[#6b7280] transition hover:bg-[#f5f7fa] hover:text-[#111827]"
        @click="$emit('update:open', false)"
      >
        <X class="size-5" />
      </button>
    </div>

    <div :class="desktop ? 'mt-5 flex h-[72vh] min-h-0 gap-5' : 'mt-5 flex max-h-[72vh] flex-col gap-4'">
      <aside
        :class="
          desktop
            ? 'w-[184px] shrink-0 rounded-[18px] border border-[#edf1f6] bg-[#fafbfc] p-3'
            : 'rounded-[18px] border border-[#edf1f6] bg-[#fafbfc] p-3'
        "
      >
        <div :class="desktop ? 'space-y-2' : 'flex gap-2 overflow-x-auto pb-1'">
          <button
            v-for="item in navigationItems"
            :key="item.key"
            type="button"
            class="flex items-center gap-3 rounded-[14px] border px-3 py-3 text-left transition"
            :class="
              activeKey === item.key
                ? 'border-[#dbe6ff] bg-[#f3f7ff] shadow-sm'
                : 'border-transparent bg-transparent hover:bg-white'
            "
            :style="desktop ? undefined : { minWidth: '168px' }"
            @click="activeKey = item.key"
          >
            <div
              class="flex size-10 shrink-0 items-center justify-center rounded-[12px] border border-[#e7ebf2] bg-white text-[12px] font-semibold text-[#4e79ff]"
            >
              {{ item.badge }}
            </div>
            <div class="min-w-0">
              <p class="truncate text-[14px] font-medium text-[#1f2937]">{{ item.title }}</p>
              <p class="mt-0.5 truncate text-[12px] text-[#8a94a6]">{{ item.durationLabel }}</p>
            </div>
          </button>
        </div>
      </aside>

      <section class="min-w-0 flex-1 overflow-hidden rounded-[18px] border border-[#edf1f6] bg-white">
        <div class="h-full overflow-y-auto px-5 py-5">
          <template v-if="trace && activeItem?.kind === 'overview'">
            <div class="space-y-4">
              <div class="rounded-[16px] border border-[#edf1f6] bg-[#f8fafc] p-4">
                <p class="text-[13px] font-medium text-[#6b7280]">过程说明</p>
                <p class="mt-2 text-[14px] leading-7 text-[#374151]">
                  {{ trace.routeReason || '暂无流程说明' }}
                </p>
              </div>

              <div class="grid gap-3 md:grid-cols-2">
                <div class="rounded-[14px] border border-[#edf1f6] bg-white p-4">
                  <p class="text-[12px] text-[#8a94a6]">名称</p>
                  <p class="mt-1 text-[14px] font-medium text-[#111827]">
                    {{ trace.summary.traceName || '未命名流程' }}
                  </p>
                </div>
                <div class="rounded-[14px] border border-[#edf1f6] bg-white p-4">
                  <p class="text-[12px] text-[#8a94a6]">完成原因</p>
                  <p class="mt-1 text-[14px] font-medium text-[#111827]">
                    {{ resolveStatusText(trace.summary.status) }}
                  </p>
                </div>
                <div class="rounded-[14px] border border-[#edf1f6] bg-white p-4">
                  <p class="text-[12px] text-[#8a94a6]">模型</p>
                  <p class="mt-1 text-[14px] font-medium text-[#111827]">
                    {{ trace.summary.model || '助手' }}
                  </p>
                </div>
                <div class="rounded-[14px] border border-[#edf1f6] bg-white p-4">
                  <p class="text-[12px] text-[#8a94a6]">总耗时</p>
                  <p class="mt-1 text-[14px] font-medium text-[#111827]">
                    {{ formatDuration(trace.summary.latencyMs ?? trace.summary.durationMs) }}
                  </p>
                </div>
                <div class="rounded-[14px] border border-[#edf1f6] bg-white p-4">
                  <p class="text-[12px] text-[#8a94a6]">输入 tokens</p>
                  <p class="mt-1 text-[14px] font-medium text-[#111827]">
                    {{ trace.summary.inputTokens ?? 0 }}
                  </p>
                </div>
                <div class="rounded-[14px] border border-[#edf1f6] bg-white p-4">
                  <p class="text-[12px] text-[#8a94a6]">输出 tokens</p>
                  <p class="mt-1 text-[14px] font-medium text-[#111827]">
                    {{ trace.summary.outputTokens ?? 0 }}
                  </p>
                </div>
                <div class="rounded-[14px] border border-[#edf1f6] bg-white p-4">
                  <p class="text-[12px] text-[#8a94a6]">问题 / 检索词</p>
                  <p class="mt-1 break-all text-[14px] font-medium text-[#111827]">
                    {{ trace.retrievalQuery || trace.summary.question || '暂无' }}
                  </p>
                </div>
                <div class="rounded-[14px] border border-[#edf1f6] bg-white p-4">
                  <p class="text-[12px] text-[#8a94a6]">上下文命中数</p>
                  <p class="mt-1 text-[14px] font-medium text-[#111827]">
                    {{ trace.hitChunks }}
                  </p>
                </div>
              </div>

              <div class="rounded-[16px] border border-[#edf1f6] bg-white p-4">
                <p class="text-[14px] font-medium text-[#111827]">记录预览（仅展示部分内容）</p>
                <div class="mt-4 space-y-4">
                  <div v-for="item in recordPreview" :key="item.label">
                    <p class="text-[12px] font-semibold tracking-[0.08em] text-[#6b7280]">
                      {{ item.label }}
                    </p>
                    <div
                      class="mt-2 rounded-[14px] border border-[#edf1f6] bg-[#fafbfc] px-4 py-3 text-[14px] leading-7 text-[#374151]"
                    >
                      {{ item.content }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <template v-else-if="trace && activeItem?.kind === 'step' && activeItem.step">
            <div class="space-y-4">
              <div class="grid gap-3 md:grid-cols-2">
                <div class="rounded-[14px] border border-[#edf1f6] bg-white p-4">
                  <p class="text-[12px] text-[#8a94a6]">名称</p>
                  <p class="mt-1 text-[14px] font-medium text-[#111827]">{{ activeItem.step.title }}</p>
                </div>
                <div class="rounded-[14px] border border-[#edf1f6] bg-white p-4">
                  <p class="text-[12px] text-[#8a94a6]">状态</p>
                  <p class="mt-1 text-[14px] font-medium text-[#111827]">
                    {{ resolveStatusText(activeItem.step.status) }}
                  </p>
                </div>
                <div class="rounded-[14px] border border-[#edf1f6] bg-white p-4">
                  <p class="text-[12px] text-[#8a94a6]">类型</p>
                  <p class="mt-1 text-[14px] font-medium text-[#111827]">
                    {{ getStepKindLabel(activeItem.step.kind) }}
                  </p>
                </div>
                <div class="rounded-[14px] border border-[#edf1f6] bg-white p-4">
                  <p class="text-[12px] text-[#8a94a6]">耗时</p>
                  <p class="mt-1 text-[14px] font-medium text-[#111827]">
                    {{ formatDuration(activeItem.step.durationMs) }}
                  </p>
                </div>
                <div class="rounded-[14px] border border-[#edf1f6] bg-white p-4">
                  <p class="text-[12px] text-[#8a94a6]">开始时间</p>
                  <p class="mt-1 text-[14px] font-medium text-[#111827]">{{ activeItem.step.startAt }}</p>
                </div>
                <div class="rounded-[14px] border border-[#edf1f6] bg-white p-4">
                  <p class="text-[12px] text-[#8a94a6]">结束时间</p>
                  <p class="mt-1 text-[14px] font-medium text-[#111827]">{{ activeItem.step.endAt }}</p>
                </div>
              </div>

              <div class="rounded-[16px] border border-[#edf1f6] bg-[#f8fafc] p-4">
                <p class="text-[13px] font-medium text-[#6b7280]">步骤说明</p>
                <p class="mt-2 text-[14px] leading-7 text-[#374151]">
                  {{ activeItem.step.detail || '暂无步骤说明' }}
                </p>
              </div>

              <div v-if="activeStepTool" class="rounded-[16px] border border-[#edf1f6] bg-white p-4">
                <p class="text-[14px] font-medium text-[#111827]">关联工具</p>
                <div class="mt-4 space-y-3">
                  <div class="rounded-[14px] border border-[#edf1f6] bg-[#fafbfc] p-4">
                    <p class="text-[12px] text-[#8a94a6]">工具名称</p>
                    <p class="mt-1 text-[14px] text-[#374151]">{{ getToolName(activeStepTool.name) }}</p>
                  </div>
                  <div class="rounded-[14px] border border-[#edf1f6] bg-[#fafbfc] p-4">
                    <p class="text-[12px] text-[#8a94a6]">工具输入</p>
                    <p class="mt-1 whitespace-pre-wrap break-all text-[14px] text-[#374151]">
                      {{ activeStepTool.inputPreview }}
                    </p>
                  </div>
                  <div class="rounded-[14px] border border-[#edf1f6] bg-[#fafbfc] p-4">
                    <p class="text-[12px] text-[#8a94a6]">工具输出</p>
                    <p class="mt-1 whitespace-pre-wrap text-[14px] text-[#374151]">
                      {{ activeStepTool.outputPreview }}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <template v-else-if="trace && activeItem?.kind === 'tools'">
            <div class="space-y-4">
              <div
                v-for="tool in trace.toolExecutions"
                :key="tool.id"
                class="rounded-[16px] border border-[#edf1f6] bg-white p-4"
              >
                <div class="flex items-center justify-between gap-4">
                  <div>
                    <p class="text-[14px] font-medium text-[#111827]">{{ getToolName(tool.name) }}</p>
                    <p class="mt-1 text-[12px] text-[#8a94a6]">{{ tool.summary }}</p>
                  </div>
                  <span class="text-[12px] text-[#7b8798]">{{ formatDuration(tool.durationMs) }}</span>
                </div>

                <div class="mt-4 space-y-3">
                  <div class="rounded-[14px] border border-[#edf1f6] bg-[#fafbfc] p-4">
                    <p class="text-[12px] text-[#8a94a6]">输入</p>
                    <p class="mt-1 whitespace-pre-wrap break-all text-[14px] text-[#374151]">
                      {{ tool.inputPreview }}
                    </p>
                  </div>
                  <div class="rounded-[14px] border border-[#edf1f6] bg-[#fafbfc] p-4">
                    <p class="text-[12px] text-[#8a94a6]">输出</p>
                    <p class="mt-1 whitespace-pre-wrap text-[14px] text-[#374151]">
                      {{ tool.outputPreview }}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <template v-else-if="trace && activeItem?.kind === 'citations'">
            <div class="space-y-4">
              <div
                v-for="citation in trace.citations"
                :key="citation.id"
                class="rounded-[16px] border border-[#edf1f6] bg-white p-4"
              >
                <p class="text-[14px] font-medium text-[#111827]">{{ citation.title }}</p>
                <p class="mt-1 text-[12px] text-[#8a94a6]">
                  {{ citation.documentName }} / Chunk {{ citation.chunkIndex }}
                </p>
                <p class="mt-3 whitespace-pre-wrap text-[14px] leading-7 text-[#374151]">
                  {{ citation.content }}
                </p>
              </div>
            </div>
          </template>

          <template v-else-if="trace && activeItem?.kind === 'response'">
            <div class="space-y-4">
              <div class="rounded-[16px] border border-[#edf1f6] bg-[#f8fafc] p-4">
                <p class="text-[13px] font-medium text-[#6b7280]">最终回答</p>
                <p class="mt-2 whitespace-pre-wrap text-[14px] leading-7 text-[#374151]">
                  {{ trace.finalAnswer || '暂无最终回答' }}
                </p>
              </div>
            </div>
          </template>

          <template v-else-if="trace && activeItem?.kind === 'raw'">
            <pre class="overflow-x-auto rounded-[16px] border border-[#edf1f6] bg-[#fafbfc] p-4 text-[12px] leading-6 text-[#1f2937]">{{ JSON.stringify(trace.rawMeta || {}, null, 2) }}</pre>
          </template>
        </div>
      </section>
    </div>
  </el-dialog>
</template>

<style scoped>
:deep(.trace-detail-dialog .el-dialog) {
  border-radius: 24px;
  overflow: hidden;
  padding: 0;
}

:deep(.trace-detail-dialog .el-dialog__header) {
  display: none;
}

:deep(.trace-detail-dialog .el-dialog__body) {
  padding: 24px;
}

@media (max-width: 1279px) {
  :deep(.trace-detail-dialog .el-dialog__body) {
    padding: 18px;
  }
}
</style>
