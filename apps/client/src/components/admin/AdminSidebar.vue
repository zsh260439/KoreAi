<script setup lang="ts">
import { computed } from 'vue'

import type { AdminNavItem } from '@/types/navigation'

const props = defineProps<{
  activePath: string
  items: AdminNavItem[]
}>()

const emit = defineEmits<{
  navigate: [path: string]
}>()

const activeMenuIndex = computed(() => {
  const currentPath = props.activePath.split('?')[0]
  const matchedItem = props.items.find((item) => {
    const itemPath = item.href.split('?')[0]
    return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`)
  })

  return matchedItem?.href || currentPath
})

const handleSelect = (path: string) => {
  emit('navigate', path)
}
</script>

<template>
  <aside class="admin-sidebar">
    <div class="admin-sidebar__brand">
      <div class="flex items-center gap-3">
        <div class="admin-sidebar__logo">R</div>
        <div class="min-w-0">
          <h1 class="admin-sidebar__title">Ragent AI 管理后台</h1>
          <p class="admin-sidebar__subtitle">Knowledge Console</p>
        </div>
      </div>
    </div>

    <div class="admin-sidebar__menu-wrap">
      <el-menu
        router
        :default-active="activeMenuIndex"
        class="admin-sidebar__menu"
        background-color="transparent"
        text-color="rgba(255, 255, 255, 0.68)"
        active-text-color="#ffffff"
        @select="handleSelect"
      >
        <el-menu-item v-for="item in items" :key="item.href" :index="item.href">
          <component v-if="item.icon" :is="item.icon" class="admin-sidebar__icon" />
          <span>{{ item.title }}</span>
        </el-menu-item>
      </el-menu>
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
  background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%);
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

.admin-layout .admin-sidebar__menu-wrap {
  flex: 1;
  padding: 0 8px 16px;
}

.admin-layout .admin-sidebar__menu {
  border-right: 0;
}

.admin-layout .admin-sidebar__menu .el-menu-item {
  height: 40px;
  margin: 2px 0;
  border-radius: 8px;
  padding: 0 12px !important;
  font-size: 14px;
  font-weight: 500;
}

.admin-layout .admin-sidebar__menu .el-menu-item:hover {
  background: rgba(255, 255, 255, 0.1) !important;
  color: #ffffff !important;
}

.admin-layout .admin-sidebar__menu .el-menu-item.is-active {
  background: rgba(59, 130, 246, 0.22) !important;
}

.admin-layout .admin-sidebar__icon {
  margin-right: 10px;
  height: 16px;
  width: 16px;
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.5);
}
</style>
