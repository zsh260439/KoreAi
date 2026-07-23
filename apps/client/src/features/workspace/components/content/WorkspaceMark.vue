<script setup lang="ts">
import { computed } from 'vue'

import koreAvatarSvg from '@/assets/kore-avatar.svg?raw'
const props = withDefaults(
  defineProps<{
    size?: number
    active?: boolean
  }>(),
  {
    size: 28,
    active: false
  }
)

const style = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`
}))
</script>

<template>
  <span class="workspace-mark" :class="{ 'workspace-mark--active': active }" :style="style">
    <span class="workspace-mark__inner" v-html="koreAvatarSvg" />
  </span>
</template>

<style scoped>
.workspace-mark {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
}

.workspace-mark__inner {
  display: inline-flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
}

.workspace-mark__inner :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}

.workspace-mark__inner :deep(.kore-outer-ring) {
  animation-duration: 16s !important;
}

.workspace-mark__inner :deep(.kore-orbital-blades) {
  animation-duration: 10s !important;
}

.workspace-mark__inner :deep(.kore-inner-core) {
  animation-duration: 3.2s !important;
}

.workspace-mark--active .workspace-mark__inner :deep(.kore-outer-ring) {
  animation-duration: 2.2s !important;
}

.workspace-mark--active .workspace-mark__inner :deep(.kore-orbital-blades) {
  animation-duration: 1.4s !important;
}

.workspace-mark--active .workspace-mark__inner :deep(.kore-inner-core) {
  animation-duration: 0.85s !important;
}
</style>
