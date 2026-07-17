<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import AppSidebar from "@/components/shell/AppSidebar.vue";

const route = useRoute();
const sidebarCollapsed = ref(false);
const edgeToEdge = computed(
  () =>
    route.path === "/admin/knowledge" || route.path.startsWith("/admin/traces"),
);
</script>

<template>
  <main class="admin-shell">
    <AppSidebar v-model:collapsed="sidebarCollapsed" />
    <section
      class="admin-shell__content"
      :class="{ 'is-edge-to-edge': edgeToEdge }"
    >
      <router-view />
    </section>
  </main>
</template>

<style scoped>
.admin-shell {
  display: flex;
  height: 100dvh;
  overflow: hidden;
  background: #fafaf7;
  color: #191918;
}
.admin-shell__content {
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 28px 32px 56px;
}
.admin-shell__content.is-edge-to-edge {
  overflow: hidden;
  padding: 0;
}
.admin-shell__content :deep(.trace-page) {
  height: 100%;
  min-height: 0;
}
@media (max-width: 800px) {
  .admin-shell__content {
    padding: 20px 16px 44px;
  }
  .admin-shell__content.is-edge-to-edge {
    padding: 0;
  }
}
</style>
