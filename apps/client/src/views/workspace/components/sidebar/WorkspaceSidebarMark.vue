<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    size?: number
    busy?: boolean
    variant?: 'orbit' | 'cross'
  }>(),
  {
    size: 40,
    busy: false,
    variant: 'cross'
  }
)

const style = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`
}))
</script>

<template>
  <span
    class="workspace-sidebar-mark"
    :class="[
      `workspace-sidebar-mark--${variant}`,
      { 'workspace-sidebar-mark--busy': busy }
    ]"
    :style="style"
    aria-hidden="true"
  >
    <span class="workspace-sidebar-mark__ring" />
    <span class="workspace-sidebar-mark__core" />
  </span>
</template>

<style scoped>
.workspace-sidebar-mark {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
}

.workspace-sidebar-mark--orbit .workspace-sidebar-mark__ring {
  position: absolute;
  inset: 18%;
  border: 2px solid #22d3ee;
  border-right-color: #a7f3d0;
  border-radius: 999px;
  animation: workspace-sidebar-orbit 2.8s linear infinite;
}

.workspace-sidebar-mark--orbit .workspace-sidebar-mark__core {
  position: absolute;
  inset: 31%;
  border: 2px solid #67e8f9;
  border-left-color: transparent;
  border-radius: 999px;
  opacity: 0.86;
  animation: workspace-sidebar-orbit 3.8s linear infinite reverse;
}

.workspace-sidebar-mark--cross .workspace-sidebar-mark__ring,
.workspace-sidebar-mark--cross .workspace-sidebar-mark__core {
  position: absolute;
  inset: 50%;
  width: 58%;
  height: 2px;
  border-radius: 999px;
  background: #67e8f9;
  transform-origin: center;
}

.workspace-sidebar-mark--cross .workspace-sidebar-mark__ring {
  transform: translate(-50%, -50%) rotate(45deg);
}

.workspace-sidebar-mark--cross .workspace-sidebar-mark__core {
  transform: translate(-50%, -50%) rotate(-45deg);
}

.workspace-sidebar-mark--busy .workspace-sidebar-mark__ring,
.workspace-sidebar-mark--busy .workspace-sidebar-mark__core {
  animation-duration: 0.9s;
}

@keyframes workspace-sidebar-orbit {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .workspace-sidebar-mark--orbit .workspace-sidebar-mark__ring,
  .workspace-sidebar-mark--orbit .workspace-sidebar-mark__core {
    animation: none !important;
  }
}
</style>
