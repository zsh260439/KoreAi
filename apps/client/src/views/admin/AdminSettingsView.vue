<script setup lang="ts">
import { Ellipsis, Pencil, Trash2 } from 'lucide-vue-next'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from 'reka-ui'
import { onMounted, ref, watch } from 'vue'

import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import ConfirmActionDialog from '@/components/admin/ConfirmActionDialog.vue'
import StatusBadge from '@/components/admin/StatusBadge.vue'
import { useAdminStore } from '@/stores/admin'
import type { McpServer, PromptStrategy, ProviderConfig } from '@/types/models'

const adminStore = useAdminStore()

const activeProvider = ref<ProviderConfig | null>(null)
const providerDialogOpen = ref(false)
const providerName = ref('')
const providerEndpoint = ref('')
const providerModel = ref('')

const activeStrategy = ref<PromptStrategy | null>(null)
const strategyDialogOpen = ref(false)
const strategyName = ref('')
const strategyDescription = ref('')
const strategyTemperature = ref('')
const strategyMaxTokens = ref('')

const activeServer = ref<McpServer | null>(null)
const serverDialogOpen = ref(false)
const serverDeleteOpen = ref(false)
const serverName = ref('')
const serverUrl = ref('')

watch(
  activeProvider,
  (value) => {
    providerName.value = value?.name ?? ''
    providerEndpoint.value = value?.endpoint ?? ''
    providerModel.value = value?.model ?? ''
  },
  { immediate: true }
)

watch(
  activeStrategy,
  (value) => {
    strategyName.value = value?.name ?? ''
    strategyDescription.value = value?.description ?? ''
    strategyTemperature.value = value ? String(value.temperature) : ''
    strategyMaxTokens.value = value ? String(value.maxTokens) : ''
  },
  { immediate: true }
)

watch(
  activeServer,
  (value) => {
    serverName.value = value?.name ?? ''
    serverUrl.value = value?.url ?? ''
  },
  { immediate: true }
)

function openProviderEdit(provider: ProviderConfig) {
  activeProvider.value = provider
  providerDialogOpen.value = true
}

function openStrategyEdit(strategy: PromptStrategy) {
  activeStrategy.value = strategy
  strategyDialogOpen.value = true
}

function openServerEdit(server: McpServer) {
  activeServer.value = server
  serverDialogOpen.value = true
}

function openServerDelete(server: McpServer) {
  activeServer.value = server
  serverDeleteOpen.value = true
}

onMounted(async () => {
  if (!adminStore.settings) {
    await adminStore.loadSettings()
  }
})
</script>

<template>
  <section>
    <AdminPageHeader
      title="系统设置"
      description="配置模型提供方、提示词策略和 MCP 服务。"
      :breadcrumbs="['首页', '系统设置']"
    >
      <template #actions>
        <button type="button" class="rounded-[10px] bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700">保存配置</button>
      </template>
    </AdminPageHeader>

    <template v-if="adminStore.settings">
      <div class="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section class="admin-surface rounded-[14px] p-6">
          <h2 class="text-lg font-semibold text-[var(--text-primary)]">Provider 配置</h2>
          <div class="mt-4 space-y-4">
            <article
              v-for="provider in adminStore.settings.providers"
              :key="provider.id"
              class="rounded-[14px] border border-[var(--border-default)] bg-white p-5"
            >
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="text-sm font-medium text-[var(--text-primary)]">{{ provider.name }}</p>
                  <p class="mt-1 text-xs text-[var(--text-muted)]">{{ provider.endpoint }}</p>
                  <p class="mt-3 text-sm text-[var(--text-secondary)]">默认模型：{{ provider.model }}</p>
                </div>
                <div class="flex items-center gap-3">
                  <div
                    class="relative inline-flex h-6 w-11 items-center rounded-full"
                    :class="provider.enabled ? 'bg-[var(--brand-primary)]' : 'bg-[var(--bg-surface-hover)]'"
                  >
                    <span
                      class="block size-5 rounded-full bg-white transition-transform"
                      :class="provider.enabled ? 'translate-x-5' : 'translate-x-0.5'"
                    />
                  </div>
                  <button
                    type="button"
                    class="inline-flex h-8 items-center gap-1 rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-700 transition hover:bg-slate-50"
                    @click="openProviderEdit(provider)"
                  >
                    <Pencil class="size-4" />
                    编辑
                  </button>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section class="admin-surface rounded-[14px] p-6">
          <h2 class="text-lg font-semibold text-[var(--text-primary)]">Prompt 策略</h2>
          <div class="mt-4 space-y-4">
            <article
              v-for="strategy in adminStore.settings.promptStrategies"
              :key="strategy.id"
              class="rounded-[14px] border border-[var(--border-default)] bg-white p-5"
            >
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="text-sm font-medium text-[var(--text-primary)]">{{ strategy.name }}</p>
                  <p class="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{{ strategy.description }}</p>
                </div>
                <div class="flex items-center gap-2">
                  <span
                    v-if="strategy.isDefault"
                    class="rounded-[8px] bg-[var(--brand-primary-soft)] px-2 py-1 text-[10px] font-medium text-[var(--brand-primary)]"
                  >
                    默认
                  </span>
                  <button
                    type="button"
                    class="inline-flex h-8 items-center gap-1 rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-700 transition hover:bg-slate-50"
                    @click="openStrategyEdit(strategy)"
                  >
                    <Pencil class="size-4" />
                    编辑
                  </button>
                </div>
              </div>
              <div class="mt-4 grid gap-3 sm:grid-cols-2">
                <div class="rounded-[12px] bg-[var(--bg-surface-subtle)] p-3">
                  <p class="text-xs text-[var(--text-muted)]">Temperature</p>
                  <p class="mt-2 text-sm font-medium text-[var(--text-primary)]">{{ strategy.temperature }}</p>
                </div>
                <div class="rounded-[12px] bg-[var(--bg-surface-subtle)] p-3">
                  <p class="text-xs text-[var(--text-muted)]">Max Tokens</p>
                  <p class="mt-2 text-sm font-medium text-[var(--text-primary)]">{{ strategy.maxTokens }}</p>
                </div>
              </div>
            </article>
          </div>
        </section>
      </div>

      <section class="admin-surface mt-6 rounded-[14px] p-6">
        <h2 class="text-lg font-semibold text-[var(--text-primary)]">MCP Server</h2>
        <div class="mt-4 grid gap-4 xl:grid-cols-2">
          <article
            v-for="server in adminStore.settings.mcpServers"
            :key="server.id"
            class="rounded-[14px] border border-[var(--border-default)] bg-white p-5"
          >
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="text-sm font-medium text-[var(--text-primary)]">{{ server.name }}</p>
                <p class="mt-1 text-xs text-[var(--text-muted)]">{{ server.url }}</p>
              </div>
              <div class="flex items-start gap-2">
                <StatusBadge :status="server.status" />
                <DropdownMenuRoot>
                  <DropdownMenuTrigger as-child>
                    <button
                      type="button"
                      class="flex size-8 items-center justify-center rounded-[10px] text-slate-500 transition hover:bg-slate-100"
                      aria-label="更多操作"
                    >
                      <Ellipsis class="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuContent
                      align="end"
                      class="z-50 w-40 rounded-[12px] border bg-white p-1 shadow-lg outline-none"
                    >
                      <DropdownMenuItem
                        class="flex cursor-pointer items-center gap-2 rounded-[8px] px-3 py-2 text-sm text-slate-700 outline-none transition hover:bg-slate-50"
                        @click="openServerEdit(server)"
                      >
                        <Pencil class="size-4" />
                        编辑
                      </DropdownMenuItem>
                      <DropdownMenuSeparator class="my-1 h-px bg-slate-100" />
                      <DropdownMenuItem
                        class="flex cursor-pointer items-center gap-2 rounded-[8px] px-3 py-2 text-sm text-red-600 outline-none transition hover:bg-red-50"
                        @click="openServerDelete(server)"
                      >
                        <Trash2 class="size-4" />
                        删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenuPortal>
                </DropdownMenuRoot>
              </div>
            </div>
            <div class="mt-4 grid gap-3 sm:grid-cols-2">
              <div class="rounded-[12px] bg-[var(--bg-surface-subtle)] p-3">
                <p class="text-xs text-[var(--text-muted)]">工具数量</p>
                <p class="mt-2 text-sm font-medium text-[var(--text-primary)]">{{ server.toolCount }}</p>
              </div>
              <div class="rounded-[12px] bg-[var(--bg-surface-subtle)] p-3">
                <p class="text-xs text-[var(--text-muted)]">最近检查</p>
                <p class="mt-2 text-sm font-medium text-[var(--text-primary)]">{{ server.lastCheckedAt }}</p>
              </div>
            </div>
            <div class="mt-4">
              <p class="mb-2 text-xs text-[var(--text-muted)]">工具列表</p>
              <div class="flex flex-wrap gap-2">
                <span
                  v-for="tool in server.tools"
                  :key="tool"
                  class="rounded-[8px] border border-[var(--border-default)] bg-white px-2.5 py-1 text-xs text-[var(--text-secondary)]"
                >
                  {{ tool }}
                </span>
              </div>
            </div>
            <button type="button" class="mt-4 rounded-[10px] border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50">测试连接</button>
          </article>
        </div>
      </section>
    </template>

    <DialogRoot :open="providerDialogOpen" @update:open="providerDialogOpen = $event">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-50 bg-black/45" />
        <DialogContent class="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-[16px] border bg-white p-0 shadow-xl outline-none">
          <div class="border-b px-6 py-5 text-left">
            <DialogTitle class="text-[18px] font-semibold text-slate-900">编辑 Provider</DialogTitle>
            <DialogDescription class="mt-2 text-sm text-slate-500">更新模型提供方配置。</DialogDescription>
          </div>

          <div class="space-y-4 px-6 py-6">
            <div class="space-y-2">
              <label class="text-sm font-medium text-slate-900">名称</label>
              <input v-model="providerName" class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
            </div>
            <div class="space-y-2">
              <label class="text-sm font-medium text-slate-900">Endpoint</label>
              <input v-model="providerEndpoint" class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
            </div>
            <div class="space-y-2">
              <label class="text-sm font-medium text-slate-900">默认模型</label>
              <input v-model="providerModel" class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
            </div>
          </div>

          <div class="flex justify-end gap-3 border-t px-6 py-4">
            <button type="button" class="rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50" @click="providerDialogOpen = false">取消</button>
            <button type="button" class="rounded-[10px] bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700" @click="providerDialogOpen = false">保存</button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <DialogRoot :open="strategyDialogOpen" @update:open="strategyDialogOpen = $event">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-50 bg-black/45" />
        <DialogContent class="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-[16px] border bg-white p-0 shadow-xl outline-none">
          <div class="border-b px-6 py-5 text-left">
            <DialogTitle class="text-[18px] font-semibold text-slate-900">编辑 Prompt 策略</DialogTitle>
            <DialogDescription class="mt-2 text-sm text-slate-500">调整策略说明和参数。</DialogDescription>
          </div>

          <div class="grid gap-6 px-6 py-6 lg:grid-cols-2">
            <div class="space-y-4">
              <div class="space-y-2">
                <label class="text-sm font-medium text-slate-900">名称</label>
                <input v-model="strategyName" class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
              </div>
              <div class="grid gap-4 sm:grid-cols-2">
                <div class="space-y-2">
                  <label class="text-sm font-medium text-slate-900">Temperature</label>
                  <input v-model="strategyTemperature" class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                </div>
                <div class="space-y-2">
                  <label class="text-sm font-medium text-slate-900">Max Tokens</label>
                  <input v-model="strategyMaxTokens" class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                </div>
              </div>
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium text-slate-900">描述</label>
              <textarea v-model="strategyDescription" class="min-h-[140px] w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            </div>
          </div>

          <div class="flex justify-end gap-3 border-t px-6 py-4">
            <button type="button" class="rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50" @click="strategyDialogOpen = false">取消</button>
            <button type="button" class="rounded-[10px] bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700" @click="strategyDialogOpen = false">保存</button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <DialogRoot :open="serverDialogOpen" @update:open="serverDialogOpen = $event">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-50 bg-black/45" />
        <DialogContent class="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[16px] border bg-white p-0 shadow-xl outline-none">
          <div class="border-b px-6 py-5 text-left">
            <DialogTitle class="text-[18px] font-semibold text-slate-900">编辑 MCP Server</DialogTitle>
            <DialogDescription class="mt-2 text-sm text-slate-500">更新服务名称和连接地址。</DialogDescription>
          </div>

          <div class="space-y-4 px-6 py-6">
            <div class="space-y-2">
              <label class="text-sm font-medium text-slate-900">名称</label>
              <input v-model="serverName" class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
            </div>
            <div class="space-y-2">
              <label class="text-sm font-medium text-slate-900">地址</label>
              <input v-model="serverUrl" class="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
            </div>
          </div>

          <div class="flex justify-end gap-3 border-t px-6 py-4">
            <button type="button" class="rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50" @click="serverDialogOpen = false">取消</button>
            <button type="button" class="rounded-[10px] bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700" @click="serverDialogOpen = false">保存</button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <ConfirmActionDialog
      :open="serverDeleteOpen"
      title="删除 MCP Server"
      :description="`确认删除 ${activeServer?.name || '当前服务'} 吗？相关工具将不再可用。`"
      confirm-text="确认删除"
      @update:open="serverDeleteOpen = $event"
      @confirm="serverDeleteOpen = false"
    />
  </section>
</template>
