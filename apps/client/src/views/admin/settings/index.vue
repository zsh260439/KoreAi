<script setup lang="ts">
import { Ellipsis, Pencil, Trash2 } from 'lucide-vue-next'
import { onMounted, ref, watch } from 'vue'

import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import ConfirmActionDialog from '@/components/admin/ConfirmActionDialog.vue'
import StatusBadge from '@/components/admin/StatusBadge.vue'
import { useAdminStore } from '@/stores'
import type { McpServer, PromptStrategy, ProviderConfig } from '@/types'

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

const openProviderEdit = (provider: ProviderConfig) => {
  activeProvider.value = provider
  providerDialogOpen.value = true
}

const openStrategyEdit = (strategy: PromptStrategy) => {
  activeStrategy.value = strategy
  strategyDialogOpen.value = true
}

const openServerEdit = (server: McpServer) => {
  activeServer.value = server
  serverDialogOpen.value = true
}

const openServerDelete = (server: McpServer) => {
  activeServer.value = server
  serverDeleteOpen.value = true
}

const handleServerCommand = (command: string, server: McpServer) => {
  if (command === 'edit') {
    openServerEdit(server)
  } else if (command === 'delete') {
    openServerDelete(server)
  }
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
        <el-button type="primary">保存配置</el-button>
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
                <el-dropdown @command="(cmd: string) => handleServerCommand(cmd, server)">
                  <button
                    type="button"
                    class="flex size-8 items-center justify-center rounded-[10px] text-slate-500 transition hover:bg-slate-100"
                    aria-label="更多操作"
                  >
                    <Ellipsis class="size-4" />
                  </button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="edit">
                        <Pencil class="size-4" />
                        编辑
                      </el-dropdown-item>
                      <el-dropdown-item command="delete" divided>
                        <Trash2 class="size-4" />
                        删除
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
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

    <el-dialog
      :model-value="providerDialogOpen"
      @update:model-value="providerDialogOpen = $event"
      title="编辑 Provider"
      width="640px"
      :close-on-click-modal="false"
    >
      <p class="text-sm text-slate-500">更新模型提供方配置。</p>

      <div class="space-y-4 py-6">
        <div class="space-y-2">
          <label class="text-sm font-medium text-slate-900">名称</label>
          <el-input v-model="providerName" />
        </div>
        <div class="space-y-2">
          <label class="text-sm font-medium text-slate-900">Endpoint</label>
          <el-input v-model="providerEndpoint" />
        </div>
        <div class="space-y-2">
          <label class="text-sm font-medium text-slate-900">默认模型</label>
          <el-input v-model="providerModel" />
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <button type="button" class="rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50" @click="providerDialogOpen = false">取消</button>
          <el-button type="primary" @click="providerDialogOpen = false">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      :model-value="strategyDialogOpen"
      @update:model-value="strategyDialogOpen = $event"
      title="编辑 Prompt 策略"
      width="672px"
      :close-on-click-modal="false"
    >
      <p class="text-sm text-slate-500">调整策略说明和参数。</p>

      <div class="grid gap-6 py-6 lg:grid-cols-2">
        <div class="space-y-4">
          <div class="space-y-2">
            <label class="text-sm font-medium text-slate-900">名称</label>
            <el-input v-model="strategyName" />
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-2">
              <label class="text-sm font-medium text-slate-900">Temperature</label>
              <el-input v-model="strategyTemperature" />
            </div>
            <div class="space-y-2">
              <label class="text-sm font-medium text-slate-900">Max Tokens</label>
              <el-input v-model="strategyMaxTokens" />
            </div>
          </div>
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium text-slate-900">描述</label>
          <el-input v-model="strategyDescription" type="textarea" />
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <button type="button" class="rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50" @click="strategyDialogOpen = false">取消</button>
          <el-button type="primary" @click="strategyDialogOpen = false">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      :model-value="serverDialogOpen"
      @update:model-value="serverDialogOpen = $event"
      title="编辑 MCP Server"
      width="512px"
      :close-on-click-modal="false"
    >
      <p class="text-sm text-slate-500">更新服务名称和连接地址。</p>

      <div class="space-y-4 py-6">
        <div class="space-y-2">
          <label class="text-sm font-medium text-slate-900">名称</label>
          <el-input v-model="serverName" />
        </div>
        <div class="space-y-2">
          <label class="text-sm font-medium text-slate-900">地址</label>
          <el-input v-model="serverUrl" />
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <button type="button" class="rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50" @click="serverDialogOpen = false">取消</button>
          <el-button type="primary" @click="serverDialogOpen = false">保存</el-button>
        </div>
      </template>
    </el-dialog>

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
