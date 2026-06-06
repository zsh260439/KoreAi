<script setup lang="ts">
import { Github, Menu, MessageSquare } from 'lucide-vue-next'

import type { User } from '@/types'

defineProps<{
  user: User
}>()

const emit = defineEmits<{
  openChat: []
  openSidebar: []
}>()
</script>

<template>
  <header class="admin-topbar">
    <div class="admin-topbar-inner">
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="flex size-9 items-center justify-center rounded-[10px] text-slate-600 transition hover:bg-slate-100 lg:hidden"
          aria-label="打开侧边栏"
          @click="emit('openSidebar')"
        >
          <Menu class="h-5 w-5" />
        </button>

        <div>
          <div class="text-sm font-semibold text-slate-900">KoreAI Admin</div>
          <div class="text-xs text-slate-500">RAG Knowledge Console</div>
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
          href="https://github.com/zsh260439/KoreAi"
          target="_blank"
          rel="noreferrer"
          class="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 sm:flex"
          aria-label="打开 GitHub 仓库"
        >
          <Github class="h-4 w-4" />
          <span class="font-medium">GitHub</span>
        </a>

        <div class="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-600 shadow-sm">
          <span class="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand-primary-soft)] text-xs font-semibold text-[var(--brand-primary)]">
            {{ user.name.slice(0, 1) }}
          </span>
          <span class="hidden sm:inline">{{ user.name }}</span>
        </div>
      </div>
    </div>
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

@media (max-width: 768px) {
  .admin-layout .admin-topbar-inner {
    padding: 0 16px;
  }
}
</style>
