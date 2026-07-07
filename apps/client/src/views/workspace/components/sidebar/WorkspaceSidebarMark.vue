<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    size?: number
    busy?: boolean
    variant?: 'orbit' | 'cross'
  }>(),
  {
    size: 40
  }
)

const style = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`
}))
</script>

<template>
  <img
    class="workspace-sidebar-mark"
    src="/brand-logo.png"
    alt="Ragent AI"
    :style="style"
  />
</template>

<style scoped>
.workspace-sidebar-mark {
  display: block;
  flex-shrink: 0;
  object-fit: contain;
}
</style>
