<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  TabsContent,
  TabsList,
  TabsRoot,
  TabsTrigger
} from 'reka-ui'
import {
  DrawerContent,
  DrawerDescription,
  DrawerOverlay,
  DrawerPortal,
  DrawerRoot,
  DrawerTitle
} from 'vaul-vue'

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
  <DialogRoot v-if="desktop" :open="open" @update:open="$emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/30 xl:bg-transparent" />
      <DialogContent
        class="fixed inset-y-0 right-0 z-50 w-[420px] max-w-[420px] border-l bg-white p-0 shadow-xl outline-none"
      >
        <div class="border-b px-6 py-5 text-left">
          <DialogTitle class="text-base font-semibold text-slate-900">
            {{ trace?.summary.question || '链路详情' }}
          </DialogTitle>
          <DialogDescription class="mt-2 text-sm text-slate-500">
            汇总路由、工具、引用与最终回答
          </DialogDescription>
        </div>
        <div class="h-full overflow-y-auto px-6 py-5">
          <TabsRoot v-model="activeTab" class="w-full">
            <TabsList class="grid w-full grid-cols-5 rounded-[12px] bg-slate-100 p-1">
              <TabsTrigger v-for="tab in ['summary', 'tool-calls', 'citations', 'response', 'raw']" :key="tab" :value="tab" class="inline-flex items-center justify-center rounded-[10px] px-2 py-2 text-xs font-medium text-slate-500 transition data-[state=active]:bg-white data-[state=active]:text-slate-900">
                {{ tab === 'summary' ? '摘要' : tab === 'tool-calls' ? '工具' : tab === 'citations' ? '引用' : tab === 'response' ? '回答' : '原始' }}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="summary" class="space-y-4 pt-4">
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
            </TabsContent>

            <TabsContent value="tool-calls" class="space-y-4 pt-4">
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
            </TabsContent>

            <TabsContent value="citations" class="space-y-4 pt-4">
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
            </TabsContent>

            <TabsContent value="response" class="pt-4">
              <div class="rounded-[12px] border p-4 text-sm leading-6 text-slate-700">
                {{ trace?.finalAnswer || '暂无最终回答' }}
              </div>
            </TabsContent>

            <TabsContent value="raw" class="pt-4">
              <pre class="overflow-x-auto rounded-[12px] border bg-slate-50 p-4 text-xs text-slate-900">{{ JSON.stringify(trace?.rawMeta || {}, null, 2) }}</pre>
            </TabsContent>
          </TabsRoot>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <DrawerRoot v-else :open="open" @update:open="$emit('update:open', $event)">
    <DrawerPortal>
      <DrawerOverlay class="fixed inset-0 z-40 bg-black/45" />
      <DrawerContent class="fixed inset-x-0 bottom-0 z-50 mt-24 max-h-[88vh] rounded-t-[18px] border bg-white">
        <div class="mx-auto mt-4 h-2 w-[100px] rounded-full bg-slate-200" />
        <div class="px-4 pb-6 pt-4">
          <DrawerTitle class="text-left text-base font-semibold text-slate-900">
            {{ trace?.summary.question || '链路详情' }}
          </DrawerTitle>
          <DrawerDescription class="mt-2 text-left text-sm text-slate-500">
            汇总路由、工具、引用与最终回答
          </DrawerDescription>

          <div class="mt-4 overflow-y-auto">
            <TabsRoot v-model="activeTab" class="w-full">
              <TabsList class="grid w-full grid-cols-5 rounded-[12px] bg-slate-100 p-1">
                <TabsTrigger v-for="tab in ['summary', 'tool-calls', 'citations', 'response', 'raw']" :key="tab" :value="tab" class="inline-flex items-center justify-center rounded-[10px] px-2 py-2 text-xs font-medium text-slate-500 transition data-[state=active]:bg-white data-[state=active]:text-slate-900">
                  {{ tab === 'summary' ? '摘要' : tab === 'tool-calls' ? '工具' : tab === 'citations' ? '引用' : tab === 'response' ? '回答' : '原始' }}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="summary" class="space-y-4 pt-4">
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
              </TabsContent>

              <TabsContent value="tool-calls" class="space-y-4 pt-4">
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
              </TabsContent>

              <TabsContent value="citations" class="space-y-4 pt-4">
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
              </TabsContent>

              <TabsContent value="response" class="pt-4">
                <div class="rounded-[12px] border p-4 text-sm leading-6 text-slate-700">
                  {{ trace?.finalAnswer || '暂无最终回答' }}
                </div>
              </TabsContent>

              <TabsContent value="raw" class="pt-4">
                <pre class="overflow-x-auto rounded-[12px] border bg-slate-50 p-4 text-xs text-slate-900">{{ JSON.stringify(trace?.rawMeta || {}, null, 2) }}</pre>
              </TabsContent>
            </TabsRoot>
          </div>
        </div>
      </DrawerContent>
    </DrawerPortal>
  </DrawerRoot>
</template>
