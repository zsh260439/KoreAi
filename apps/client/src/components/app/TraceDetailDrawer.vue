<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { TraceDetail } from '@/types/models'

const props = defineProps<{
  open: boolean
  trace?: TraceDetail | null
  desktop?: boolean
}>()

defineEmits<{
  'update:open': [value: boolean]
}>()

const activeTab = ref('summary')

watch(
  () => props.open,
  (open) => {
    if (open) {
      activeTab.value = 'summary'
    }
  }
)

const summaryBadges = computed(() => [
  props.trace?.summary.model || 'gpt-5.4',
  `${props.trace?.summary.latencyMs || 0}ms`,
  `输入 ${props.trace?.summary.inputTokens || 0}`,
  `输出 ${props.trace?.summary.outputTokens || 0}`
])
</script>

<template>
  <el-drawer
    v-if="desktop"
    :model-value="open"
    @update:model-value="$emit('update:open', $event)"
    :size="420"
    direction="rtl"
    :with-header="false"
  >
    <div class="flex h-full flex-col">
      <div class="shrink-0 border-b px-6 py-5 text-left">
        <p class="text-base font-semibold text-slate-900">
          {{ trace?.summary.question || '链路详情' }}
        </p>
        <p class="mt-2 text-sm text-slate-500">
          汇总路由、工具、引用与最终回答
        </p>
      </div>
      <div class="flex-1 overflow-y-auto px-6 py-5">
        <el-tabs v-model="activeTab" class="w-full">
          <el-tab-pane label="摘要" name="summary">
            <div class="space-y-4 pt-4">
              <div class="rounded-[12px] border p-4">
                <p class="text-xs text-slate-500">路由</p>
                <p class="mt-1 text-sm font-medium text-slate-900">
                  {{ trace?.summary.route || '未命中' }}
                </p>
                <p class="mt-3 text-xs text-slate-500">路由原因</p>
                <p class="mt-1 text-sm leading-6 text-slate-700">
                  {{ trace?.routeReason || '暂无' }}
                </p>
              </div>

              <div class="flex flex-wrap gap-2">
                <span
                  v-for="badge in summaryBadges"
                  :key="badge"
                  class="rounded-[8px] bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700"
                >
                  {{ badge }}
                </span>
              </div>

              <div class="h-px bg-slate-200" />

              <div
                v-for="step in trace?.steps || []"
                :key="step.id"
                class="rounded-[12px] border p-4"
              >
                <div class="flex items-center justify-between gap-2">
                  <p class="text-sm font-medium text-slate-900">{{ step.title }}</p>
                  <span class="text-xs text-slate-500">{{ step.durationMs }}ms</span>
                </div>
                <p class="mt-2 text-sm text-slate-700">{{ step.detail }}</p>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="工具" name="tool-calls">
            <div class="space-y-4 pt-4">
              <template v-if="trace?.toolExecutions?.length">
                <div
                  v-for="tool in trace.toolExecutions"
                  :key="tool.id"
                  class="rounded-[12px] border p-4"
                >
                  <p class="text-sm font-medium text-slate-900">{{ tool.name }}</p>
                  <p class="mt-2 text-xs text-slate-500">{{ tool.inputPreview }}</p>
                  <p class="mt-2 text-sm text-slate-700">{{ tool.outputPreview }}</p>
                </div>
              </template>
              <p v-else class="text-sm text-slate-500">当前链路没有工具调用。</p>
            </div>
          </el-tab-pane>

          <el-tab-pane label="引用" name="citations">
            <div class="space-y-4 pt-4">
              <template v-if="trace?.citations?.length">
                <div
                  v-for="citation in trace.citations"
                  :key="citation.id"
                  class="rounded-[12px] border p-4"
                >
                  <p class="text-sm font-medium text-slate-900">{{ citation.title }}</p>
                  <p class="mt-1 text-xs text-slate-500">
                    {{ citation.documentName }} / chunk {{ citation.chunkIndex }}
                  </p>
                  <p class="mt-2 text-sm leading-6 text-slate-700">{{ citation.content }}</p>
                </div>
              </template>
              <p v-else class="text-sm text-slate-500">当前链路没有引用内容。</p>
            </div>
          </el-tab-pane>

          <el-tab-pane label="回答" name="response">
            <div class="pt-4">
              <div class="rounded-[12px] border p-4 text-sm leading-6 text-slate-700">
                {{ trace?.finalAnswer || '暂无最终回答' }}
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="原始" name="raw">
            <div class="pt-4">
              <pre class="overflow-x-auto rounded-[12px] border bg-slate-50 p-4 text-xs text-slate-900">{{ JSON.stringify(trace?.rawMeta || {}, null, 2) }}</pre>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>
  </el-drawer>

  <el-drawer
    v-else
    :model-value="open"
    @update:model-value="$emit('update:open', $event)"
    :size="'90%'"
    direction="btt"
    :with-header="false"
  >
    <div class="mx-auto mt-4 h-2 w-[100px] rounded-full bg-slate-200" />
    <div class="px-4 pb-6 pt-4">
      <p class="text-left text-base font-semibold text-slate-900">
        {{ trace?.summary.question || '链路详情' }}
      </p>
      <p class="mt-2 text-left text-sm text-slate-500">
        汇总路由、工具、引用与最终回答
      </p>

      <div class="mt-4 overflow-y-auto">
        <el-tabs v-model="activeTab" class="w-full">
          <el-tab-pane label="摘要" name="summary">
            <div class="space-y-4 pt-4">
              <div class="rounded-[12px] border p-4">
                <p class="text-xs text-slate-500">路由</p>
                <p class="mt-1 text-sm font-medium text-slate-900">
                  {{ trace?.summary.route || '未命中' }}
                </p>
                <p class="mt-3 text-xs text-slate-500">路由原因</p>
                <p class="mt-1 text-sm leading-6 text-slate-700">
                  {{ trace?.routeReason || '暂无' }}
                </p>
              </div>

              <div class="flex flex-wrap gap-2">
                <span
                  v-for="badge in summaryBadges"
                  :key="badge"
                  class="rounded-[8px] bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700"
                >
                  {{ badge }}
                </span>
              </div>

              <div class="h-px bg-slate-200" />

              <div
                v-for="step in trace?.steps || []"
                :key="step.id"
                class="rounded-[12px] border p-4"
              >
                <div class="flex items-center justify-between gap-2">
                  <p class="text-sm font-medium text-slate-900">{{ step.title }}</p>
                  <span class="text-xs text-slate-500">{{ step.durationMs }}ms</span>
                </div>
                <p class="mt-2 text-sm text-slate-700">{{ step.detail }}</p>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="工具" name="tool-calls">
            <div class="space-y-4 pt-4">
              <template v-if="trace?.toolExecutions?.length">
                <div
                  v-for="tool in trace.toolExecutions"
                  :key="tool.id"
                  class="rounded-[12px] border p-4"
                >
                  <p class="text-sm font-medium text-slate-900">{{ tool.name }}</p>
                  <p class="mt-2 text-xs text-slate-500">{{ tool.inputPreview }}</p>
                  <p class="mt-2 text-sm text-slate-700">{{ tool.outputPreview }}</p>
                </div>
              </template>
              <p v-else class="text-sm text-slate-500">当前链路没有工具调用。</p>
            </div>
          </el-tab-pane>

          <el-tab-pane label="引用" name="citations">
            <div class="space-y-4 pt-4">
              <template v-if="trace?.citations?.length">
                <div
                  v-for="citation in trace.citations"
                  :key="citation.id"
                  class="rounded-[12px] border p-4"
                >
                  <p class="text-sm font-medium text-slate-900">{{ citation.title }}</p>
                  <p class="mt-1 text-xs text-slate-500">
                    {{ citation.documentName }} / chunk {{ citation.chunkIndex }}
                  </p>
                  <p class="mt-2 text-sm leading-6 text-slate-700">{{ citation.content }}</p>
                </div>
              </template>
              <p v-else class="text-sm text-slate-500">当前链路没有引用内容。</p>
            </div>
          </el-tab-pane>

          <el-tab-pane label="回答" name="response">
            <div class="pt-4">
              <div class="rounded-[12px] border p-4 text-sm leading-6 text-slate-700">
                {{ trace?.finalAnswer || '暂无最终回答' }}
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="原始" name="raw">
            <div class="pt-4">
              <pre class="overflow-x-auto rounded-[12px] border bg-slate-50 p-4 text-xs text-slate-900">{{ JSON.stringify(trace?.rawMeta || {}, null, 2) }}</pre>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>
  </el-drawer>
</template>
