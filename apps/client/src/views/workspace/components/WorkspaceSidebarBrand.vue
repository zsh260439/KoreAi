<script setup lang="ts">
import WorkspaceSidebarMark from './WorkspaceSidebarMark.vue'
</script>

<template>
  <div class="workspace-sidebar-brand">
    <WorkspaceSidebarMark :size="36" />
    <p class="workspace-sidebar-brand__name" aria-label="koreAi">
      <span class="workspace-sidebar-brand__base">kore</span>
      <span class="workspace-sidebar-brand__accent">Ai</span>
    </p>
  </div>
</template>

<style scoped>
.workspace-sidebar-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.workspace-sidebar-brand__name {
  display: inline-flex;
  align-items: baseline;
  font-size: 22px;
  font-weight: 500;
  line-height: 1;
  letter-spacing: -0.03em;
  color: #111827;
}

.workspace-sidebar-brand__base {
  color: #111827;
}

.workspace-sidebar-brand__accent {
  color: #38bdf8;
  font-weight: 300;
}
</style>
