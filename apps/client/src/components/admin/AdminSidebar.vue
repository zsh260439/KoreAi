<script setup lang="ts">
import { ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import { cn } from '@/utils/cn'
import type { User } from '@/types/models'
import type { AdminNavGroup, AdminNavItem } from '@/types/navigation'

const props = defineProps<{
  collapsed: boolean
  activePath: string
  groups: AdminNavGroup[]
  user: User
}>()

const emit = defineEmits<{
  toggleCollapse: []
  navigate: [path: string]
}>()

const openGroups = ref<Record<string, boolean>>({
  ingestion: true,
  intent: true
})

function splitTarget(target?: string) {
  if (!target) {
    return { path: '', search: '' }
  }
  const [path, search = ''] = target.split('?')
  return {
    path,
    search: search ? `?${search}` : ''
  }
}

function isLeafActive(path: string, search?: string) {
  const { path: currentPath, search: currentSearch } = splitTarget(props.activePath)
  if (currentPath !== path && !currentPath.startsWith(`${path}/`)) {
    return false
  }
  if (search) {
    return currentSearch === search
  }
  return true
}

function matchChild(item: AdminNavItem) {
  const target = splitTarget(item.href)
  return isLeafActive(target.path, item.search ?? target.search)
}

function isGroupActive(item: AdminNavItem) {
  return item.children?.some((child) => matchChild(child)) ?? false
}

function syncOpenGroups() {
  const nextState = { ...openGroups.value }
  props.groups.forEach((group) => {
    group.items.forEach((item) => {
      if (item.children?.length) {
        nextState[item.navKey] = nextState[item.navKey] ?? isGroupActive(item)
        if (isGroupActive(item)) {
          nextState[item.navKey] = true
        }
      }
    })
  })
  openGroups.value = nextState
}

function navigateTo(href?: string) {
  if (href) {
    emit('navigate', href)
  }
}

watch(
  () => [props.activePath, props.groups],
  () => {
    syncOpenGroups()
  },
  { immediate: true, deep: true }
)

const avatarLabel = computed(() => props.user?.name || '管理员')
const roleLabel = computed(() => (props.user?.role === 'admin' ? '管理员' : props.user?.role || '成员'))
</script>

<template>
  <aside :class="cn('admin-sidebar', collapsed && 'admin-sidebar--collapsed')">
    <div class="admin-sidebar__brand">
      <div :class="cn('flex items-center gap-3', collapsed && 'justify-center')">
        <div class="admin-sidebar__logo">R</div>
        <div v-if="!collapsed" class="min-w-0">
          <h1 class="admin-sidebar__title">Ragent AI 管理后台</h1>
          <p class="admin-sidebar__subtitle">Knowledge Console</p>
        </div>
      </div>
    </div>

    <div v-if="!collapsed" class="admin-sidebar__user">
      <div class="admin-sidebar__avatar">
        <span class="text-sm font-semibold text-white">{{ avatarLabel.slice(0, 1) }}</span>
      </div>
      <div class="min-w-0">
        <p class="truncate text-sm font-medium text-white">{{ avatarLabel }}</p>
        <div class="mt-1">
          <span class="admin-sidebar__role">{{ roleLabel }}</span>
        </div>
      </div>
    </div>

    <nav class="flex-1 space-y-4 px-2 pb-4">
      <div v-for="group in groups" :key="group.title" class="space-y-2">
        <p v-if="!collapsed" class="admin-sidebar__group-title">{{ group.title }}</p>
        <div class="space-y-1">
          <template v-for="item in group.items" :key="item.navKey">
            <RouterLink
              v-if="item.href"
              :to="item.href"
              :title="collapsed ? item.title : undefined"
              :class="
                cn(
                  'admin-sidebar__item',
                  matchChild(item) && 'admin-sidebar__item--active',
                  collapsed && 'justify-center'
                )
              "
              @click="navigateTo(item.href)"
            >
              <span
                :class="cn('admin-sidebar__item-indicator', matchChild(item) && 'is-active')"
              />
              <component :is="item.icon" class="admin-sidebar__item-icon" />
              <span v-if="collapsed" class="sr-only">{{ item.title }}</span>
              <span v-else>{{ item.title }}</span>
            </RouterLink>

            <template v-else-if="item.children?.length">
              <template v-if="collapsed">
                <RouterLink
                  v-for="child in item.children"
                  :key="child.navKey"
                  :to="child.href!"
                  :title="child.title"
                  :class="
                    cn(
                      'admin-sidebar__item justify-center',
                      matchChild(child) && 'admin-sidebar__item--active'
                    )
                  "
                  @click="navigateTo(child.href)"
                >
                  <span
                    :class="cn('admin-sidebar__item-indicator', matchChild(child) && 'is-active')"
                  />
                  <component :is="child.icon" class="admin-sidebar__item-icon" />
                  <span class="sr-only">{{ child.title }}</span>
                </RouterLink>
              </template>
              <div v-else class="space-y-1">
                <button
                  type="button"
                  :class="
                    cn(
                      'admin-sidebar__item admin-sidebar__item--group w-full text-white/60',
                      isGroupActive(item) && 'admin-sidebar__item--group-active text-white'
                    )
                  "
                  @click="openGroups[item.navKey] = !openGroups[item.navKey]"
                >
                  <span
                    :class="cn('admin-sidebar__item-indicator', isGroupActive(item) && 'is-group-active')"
                  />
                  <component :is="item.icon" class="admin-sidebar__item-icon" />
                  <span class="flex-1 text-left">{{ item.title }}</span>
                  <ChevronDown v-if="openGroups[item.navKey]" class="h-4 w-4 text-white/60" />
                  <ChevronRight v-else class="h-4 w-4 text-white/60" />
                </button>
                <div v-if="openGroups[item.navKey]" class="ml-6 space-y-1">
                  <RouterLink
                    v-for="child in item.children"
                    :key="child.navKey"
                    :to="child.href!"
                    :class="
                      cn(
                        'admin-sidebar__item text-[13px]',
                        matchChild(child) && 'admin-sidebar__item--active'
                      )
                    "
                    @click="navigateTo(child.href)"
                  >
                    <span
                      :class="cn('admin-sidebar__item-indicator', matchChild(child) && 'is-active')"
                    />
                    <component :is="child.icon" class="admin-sidebar__item-icon" />
                    <span>{{ child.title }}</span>
                  </RouterLink>
                </div>
              </div>
            </template>
          </template>
        </div>
      </div>
    </nav>

    <div class="admin-sidebar__footer space-y-2">
      <button
        type="button"
        class="admin-sidebar__collapse"
        @click="emit('toggleCollapse')"
      >
        <ChevronsRight v-if="collapsed" class="h-4 w-4" />
        <ChevronsLeft v-else class="h-4 w-4" />
        <span v-if="!collapsed">收起侧边栏</span>
      </button>
    </div>
  </aside>
</template>

<style>
.admin-layout .admin-sidebar {
  display: flex;
  width: 256px;
  flex-direction: column;
  background: linear-gradient(180deg, #1a1f2e 0%, #252d3d 100%);
  color: rgba(255, 255, 255, 0.7);
  transition: width 0.2s ease;
}

.admin-layout .admin-sidebar--collapsed {
  width: 64px;
}

.admin-layout .admin-sidebar__brand {
  padding: 24px 20px 16px;
}

.admin-layout .admin-sidebar__logo {
  display: flex;
  height: 40px;
  width: 40px;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
}

.admin-layout .admin-sidebar__title {
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
}

.admin-layout .admin-sidebar__subtitle {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.admin-layout .admin-sidebar__user {
  margin: 0 16px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  padding: 8px 12px;
}

.admin-layout .admin-sidebar__avatar {
  position: relative;
  display: flex;
  height: 36px;
  width: 36px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
}

.admin-layout .admin-sidebar__avatar::after {
  content: "";
  position: absolute;
  right: -2px;
  bottom: -2px;
  height: 10px;
  width: 10px;
  border-radius: 999px;
  border: 2px solid #252d3d;
  background: #34d399;
}

.admin-layout .admin-sidebar__role {
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 8px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.7);
}

.admin-layout .admin-sidebar__group-title {
  padding: 0 16px 8px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.4);
}

.admin-layout .admin-sidebar__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: 500;
  color: inherit;
  text-decoration: none;
  transition: background-color 0.15s ease;
}

.admin-layout .admin-sidebar__item:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.admin-layout .admin-sidebar__item--active {
  background: rgba(99, 102, 241, 0.2);
  color: #ffffff;
}

.admin-layout .admin-sidebar__item--group-active {
  background: rgba(255, 255, 255, 0.05);
  color: #ffffff;
}

.admin-layout .admin-sidebar__item-indicator {
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 999px;
  background: transparent;
}

.admin-layout .admin-sidebar__item-indicator.is-active {
  background: #818cf8;
}

.admin-layout .admin-sidebar__item-indicator.is-group-active {
  background: rgba(255, 255, 255, 0.2);
}

.admin-layout .admin-sidebar__item-icon {
  height: 16px;
  width: 16px;
  color: rgba(255, 255, 255, 0.5);
  flex-shrink: 0;
}

.admin-layout .admin-sidebar__item--active .admin-sidebar__item-icon {
  color: #a5b4fc;
}

.admin-layout .admin-sidebar__item--group-active .admin-sidebar__item-icon {
  color: rgba(255, 255, 255, 0.7);
}

.admin-layout .admin-sidebar__footer {
  margin-top: auto;
  padding: 0 16px 20px;
}

.admin-layout .admin-sidebar__collapse {
  margin-top: 12px;
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 8px 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  background: transparent;
}
</style>
