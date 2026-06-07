<script setup lang="ts">
import { MessageSquare } from 'lucide-vue-next'

const emit = defineEmits<{
  openChat: []
}>()
</script>

<template>
  <header class="admin-topbar">
    <div class="admin-topbar-inner">
      <div class="flex items-center gap-3">
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
