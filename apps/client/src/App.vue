<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'

const route = useRoute()

const shellClassName = computed(() => {
  const shell = route.meta.appShell

  if (shell === 'admin') {
    return 'admin-shell'
  }

  if (shell === 'workspace') {
    return 'workspace-shell'
  }

  return 'marketing-shell'
})
</script>

<template>
  <div :class="shellClassName">
    <RouterView />
  </div>
</template>
