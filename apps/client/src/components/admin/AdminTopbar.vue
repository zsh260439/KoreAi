<script setup lang="ts">
import { ChevronDown, Github, KeyRound, LogOut, Menu, MessageSquare, Search } from 'lucide-vue-next'
import { computed, ref } from 'vue'


import ChangePasswordDialog from '@/components/admin/ChangePasswordDialog.vue'
import type { SearchSuggestionGroup, User } from '@/types'

const props = defineProps<{
  searchValue: string
  searchLoading?: boolean
  suggestions?: SearchSuggestionGroup[]
  user: User
}>()

const emit = defineEmits<{
  searchChange: [value: string]
  searchSelect: [href: string]
  openChat: []
  logout: []
  openSidebar: []
}>()

const searchFocused = ref(false)
const passwordDialogOpen = ref(false)

const hasQuery = computed(() => props.searchValue.trim().length > 0)
const showSuggest = computed(() => searchFocused.value && hasQuery.value)
const roleLabel = computed(() => (props.user?.role === 'admin' ? '管理员' : props.user?.role || '成员'))
const avatarLabel = computed(() => props.user?.name || '管理员')

const handleFocus = () => {
  searchFocused.value = true
}

const handleBlur = () => {
  window.setTimeout(() => {
    searchFocused.value = false
  }, 150)
}

const handleSelect = (href: string) => {
  emit('searchSelect', href)
  searchFocused.value = false
}

const handleCommand = (command: string) => {
  if (command === 'password') passwordDialogOpen.value = true
  if (command === 'logout') emit('logout')
}
</script>

<template>
  <header class="admin-topbar">
    <div class="admin-topbar-inner">
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="flex size-9 items-center justify-center rounded-[10px] text-slate-600 transition hover:bg-slate-100 lg:hidden"
          aria-label="切换侧边栏"
          @click="emit('openSidebar')"
        >
          <Menu class="h-5 w-5" />
        </button>

        <div class="admin-topbar-search">
          <el-input
            :model-value="searchValue"
            placeholder="筛选知识库..."
            clearable
            @input="emit('searchChange', $event)"
            @focus="handleFocus"
            @blur="handleBlur"
          >
            <template #prefix>
              <Search class="h-4 w-4 text-slate-400" />
            </template>
            <template #suffix>
              <span class="admin-topbar-kbd">Ctrl K</span>
            </template>
          </el-input>

          <div
            v-if="showSuggest"
            class="admin-topbar-suggest"
            @mousedown.prevent
          >
            <div
              v-if="searchLoading && !(suggestions?.length)"
              class="admin-topbar-suggest-item text-slate-400"
            >
              搜索中...
            </div>

            <template v-for="group in suggestions" :key="group.label">
              <div v-if="group.items.length" class="admin-topbar-suggest-section">
                <div class="admin-topbar-suggest-group">{{ group.label }}</div>
                <button
                  v-for="item in group.items"
                  :key="item.id"
                  type="button"
                  class="admin-topbar-suggest-item"
                  @mousedown.prevent="handleSelect(item.href)"
                >
                  <span class="font-medium text-slate-900">{{ item.title }}</span>
                  <span class="text-xs text-slate-400">{{ item.description }}</span>
                </button>
              </div>
            </template>

            <div
              v-if="!searchLoading && !(suggestions?.some((group) => group.items.length))"
              class="admin-topbar-suggest-item text-slate-400"
            >
              暂无匹配结果
            </div>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="hidden items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 sm:inline-flex"
          @click="emit('openChat')"
        >
          <MessageSquare class="h-4 w-4" />
          返回聊天
        </button>

        <a
          href="https://github.com/nageoffer/ragent"
          target="_blank"
          rel="noreferrer"
          class="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          aria-label="打开 GitHub 仓库"
        >
          <Github class="h-4 w-4" />
          <span class="font-medium">Star</span>
          <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">--</span>
        </a>

        <el-dropdown trigger="click" @command="handleCommand">
          <button
            type="button"
            class="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-600 shadow-sm"
          >
            <span class="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand-primary-soft)] text-xs font-semibold text-[var(--brand-primary)]">
              {{ avatarLabel.slice(0, 1) }}
            </span>
            <span class="hidden sm:inline">{{ avatarLabel }}</span>
            <ChevronDown class="h-4 w-4 text-slate-400" />
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <div class="px-3 py-2 text-xs text-slate-500">
                {{ avatarLabel }} / {{ roleLabel }}
              </div>
              <el-dropdown-item command="password" :icon="KeyRound">修改密码</el-dropdown-item>
              <el-dropdown-item divided command="logout" :icon="LogOut">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <ChangePasswordDialog :open="passwordDialogOpen" @update:open="passwordDialogOpen = $event" />
  </header>
</template>

<style>
.admin-layout .admin-topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  border-bottom: 1px solid rgba(226, 232, 240, 0.7);
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(12px);
}

.admin-layout .admin-topbar-inner {
  width: 100%;
  max-width: 1600px;
  height: 64px;
  margin: 0 auto;
  padding: 0 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.admin-layout .admin-topbar-search {
  position: relative;
  width: 100%;
  max-width: 420px;
}

.admin-layout .admin-topbar-kbd {
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  padding: 2px 8px;
  font-size: 10px;
  color: #94a3b8;
  white-space: nowrap;
}

.admin-layout .admin-topbar-suggest {
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  z-index: 30;
  margin-top: 8px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  padding: 4px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
}

.admin-layout .admin-topbar-suggest-section + .admin-topbar-suggest-section {
  margin-top: 4px;
  border-top: 1px solid #f1f5f9;
  padding-top: 4px;
}

.admin-layout .admin-topbar-suggest-group {
  padding: 8px 12px 4px;
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
}

.admin-layout .admin-topbar-suggest-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  border-radius: 8px;
  padding: 8px 12px;
  text-align: left;
  font-size: 14px;
  transition: background-color 0.15s ease;
}

.admin-layout .admin-topbar-suggest-item:hover {
  background: #f1f5f9;
}

@media (max-width: 768px) {
  .admin-layout .admin-topbar-inner {
    padding: 0 16px;
  }

  .admin-layout .admin-topbar-search {
    max-width: none;
  }
}
</style>
