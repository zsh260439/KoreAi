<script setup lang="ts">
withDefaults(
  defineProps<{
    text?: string
  }>(),
  {
    text: 'KoreAI is thinking...'
  }
)
</script>

<template>
  <div class="shining-text text-[14px] font-normal leading-6">
    {{ text }}
  </div>
</template>

<style scoped>
.shining-text {
  display: inline-block;
  color: transparent;
  background-image: linear-gradient(110deg, #404040 34%, #d4d4d4 46%, #ffffff 50%, #d4d4d4 54%, #404040 66%);
  background-size: 200% 100%;
  background-clip: text;
  -webkit-background-clip: text;
  animation: shining-text-scan 2s linear infinite;
}

@keyframes shining-text-scan {
  0% {
    background-position: 200% 0;
  }

  100% {
    background-position: -200% 0;
  }
}
</style>
