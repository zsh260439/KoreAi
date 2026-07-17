<script setup lang="ts">
import {
  ChevronsLeft,
  ChevronsRight,
  Library,
  MessageSquareText,
  Settings,
  Workflow,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import ProviderSettingsDialog from "./ProviderSettingsDialog.vue";

const props = defineProps<{ collapsed: boolean }>();
const emit = defineEmits<{ "update:collapsed": [value: boolean] }>();
const route = useRoute();
const router = useRouter();

const activeKey = computed(() =>
  route.path.startsWith("/workspace")
    ? "chat"
    : route.path.startsWith("/admin/traces")
      ? "trace"
      : "knowledge",
);
const settingsOpen = ref(false);
const items = [
  { key: "chat", label: "对话", path: "/workspace", icon: MessageSquareText },
  {
    key: "knowledge",
    label: "知识库",
    path: "/admin/knowledge",
    icon: Library,
  },
  { key: "trace", label: "链路追踪", path: "/admin/traces", icon: Workflow },
] as const;
</script>

<template>
  <aside class="app-sidebar" :class="{ 'is-collapsed': collapsed }">
    <header class="app-sidebar__brand">
      <span class="app-sidebar__lockup"
        ><img src="/brand-logo.png" alt="" /><strong
          ><span>kore</span><em>Ai</em></strong
        ></span
      >
      <button
        type="button"
        :aria-label="collapsed ? '展开侧栏' : '收起侧栏'"
        @click="emit('update:collapsed', !collapsed)"
      >
        <ChevronsRight v-if="collapsed" :size="17" /><ChevronsLeft
          v-else
          :size="17"
        />
      </button>
    </header>
    <nav class="app-sidebar__nav">
      <button
        v-for="item in items"
        :key="item.key"
        type="button"
        :class="{ 'is-active': activeKey === item.key }"
        @click="router.push(item.path)"
      >
        <component :is="item.icon" :size="18" /><span>{{ item.label }}</span>
      </button>
    </nav>
    <div class="app-sidebar__content"><slot /></div>
    <footer class="app-sidebar__footer">
      <button
        type="button"
        @click="settingsOpen = true"
      ><Settings :size="18" /><span>设置</span></button
      ><span class="app-sidebar__avatar">ZS</span>
    </footer>
    <ProviderSettingsDialog v-model:open="settingsOpen" />
  </aside>
</template>

<style scoped>
.app-sidebar {
  display: flex;
  width: 264px;
  min-width: 0;
  height: 100dvh;
  flex-direction: column;
  border-right: 1px solid #e8e8e2;
  background: #f8f8f5;
  color: #191918;
  transition: width 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.app-sidebar.is-collapsed {
  width: 64px;
}
.app-sidebar button {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.app-sidebar__brand {
  display: flex;
  min-height: 70px;
  align-items: center;
  justify-content: space-between;
  padding: 0 13px;
}
.app-sidebar__lockup {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  overflow: hidden;
}
.app-sidebar__lockup img {
  width: 28px;
  height: 28px;
  flex: none;
  object-fit: contain;
}
.app-sidebar__lockup strong {
  display: flex;
  align-items: baseline;
  font-size: 20px;
  letter-spacing: -0.02em;
}
.app-sidebar__lockup em {
  color: #38bdf8;
  font-style: normal;
}
.app-sidebar__brand > button {
  display: grid;
  width: 34px;
  height: 34px;
  flex: none;
  place-items: center;
  border-radius: 8px;
  color: #60605b;
}
.app-sidebar__brand > button:hover {
  background: #efefea;
}
.app-sidebar__nav {
  display: grid;
  gap: 3px;
  padding: 7px 9px;
}
.app-sidebar__nav button,
.app-sidebar__footer button {
  display: flex;
  min-height: 40px;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  border-radius: 8px;
  color: #575752;
  white-space: nowrap;
}
.app-sidebar__nav button:hover,
.app-sidebar__nav button.is-active,
.app-sidebar__footer button:hover {
  background: #efefea;
  color: #191918;
}
.app-sidebar__nav button.is-active {
  border: 1px solid #e8e8e2;
  background: #fff;
}
.app-sidebar__nav button.is-active :deep(svg) {
  color: #5b5bf7;
}
.app-sidebar__content {
  min-height: 0;
  flex: 1;
  overflow: hidden;
}
.app-sidebar__footer {
  display: flex;
  min-height: 62px;
  align-items: center;
  justify-content: space-between;
  padding: 0 13px;
  border-top: 1px solid #e8e8e2;
}
.app-sidebar__avatar {
  display: grid;
  width: 31px;
  height: 31px;
  flex: none;
  place-items: center;
  border: 1px solid #d8d8d1;
  border-radius: 50%;
  background: #fff;
  font-size: 11px;
  font-weight: 700;
}
.is-collapsed .app-sidebar__brand {
  min-height: 108px;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
  padding: 10px 0;
}
.is-collapsed .app-sidebar__lockup strong,
.is-collapsed .app-sidebar__nav span,
.is-collapsed .app-sidebar__footer button span {
  display: none;
}
.is-collapsed .app-sidebar__nav {
  justify-items: center;
  padding-inline: 0;
}
.is-collapsed .app-sidebar__nav button {
  width: 40px;
  justify-content: center;
  padding: 0;
}
.is-collapsed .app-sidebar__content {
  display: none;
}
.is-collapsed .app-sidebar__footer {
  flex-direction: column;
  justify-content: center;
  gap: 7px;
  padding: 8px 0;
}
.is-collapsed .app-sidebar__footer button {
  width: 38px;
  justify-content: center;
  padding: 0;
}
@media (max-width: 800px) {
  .app-sidebar {
    width: 64px;
  }
  .app-sidebar__brand {
    min-height: 108px;
    flex-direction: column;
    justify-content: center;
    padding: 10px 0;
  }
  .app-sidebar__brand > button,
  .app-sidebar__lockup strong,
  .app-sidebar__nav span,
  .app-sidebar__content,
  .app-sidebar__footer button span {
    display: none;
  }
  .app-sidebar__nav {
    justify-items: center;
    padding-inline: 0;
  }
  .app-sidebar__nav button {
    width: 40px;
    justify-content: center;
    padding: 0;
  }
  .app-sidebar__footer {
    flex-direction: column;
    justify-content: center;
    padding: 8px 0;
  }
}
</style>
