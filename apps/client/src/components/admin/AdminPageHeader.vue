<script setup lang="ts">
defineProps<{
  title: string
  description: string
  breadcrumbs?: string[]
}>()
</script>

<template>
  <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
    <div>
      <h1 class="text-3xl font-semibold text-foreground">{{ title }}</h1>
      <p class="mt-1 text-sm text-muted-foreground">{{ description }}</p>
    </div>
    <div class="flex flex-1 flex-wrap items-center justify-end gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
