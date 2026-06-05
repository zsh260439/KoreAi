<script setup lang="ts">
import { LoaderCircle } from 'lucide-vue-next'
import { computed } from 'vue'

let workspaceSidebarMarkSeed = 0

const props = withDefaults(
  defineProps<{
    size?: number
    busy?: boolean
  }>(),
  {
    size: 40,
    busy: false
  }
)

const style = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`
}))

const markId = workspaceSidebarMarkSeed++
const glowId = `kore-mark-glow-${markId}`
const starGradientId = `kore-mark-star-${markId}`
const coreGlowId = `kore-mark-core-glow-${markId}`
const leftGlowId = `kore-mark-left-glow-${markId}`
const rightGlowId = `kore-mark-right-glow-${markId}`
</script>

<template>
  <span
    class="workspace-sidebar-mark"
    :class="{ 'workspace-sidebar-mark--busy': busy }"
    :style="style"
  >
    <svg class="workspace-sidebar-mark__svg" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <filter :id="glowId" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur deviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient :id="starGradientId" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#7c3aed" />
          <stop offset="55%" stop-color="#8b5cf6" />
          <stop offset="100%" stop-color="#38bdf8" />
        </linearGradient>
        <radialGradient
          :id="coreGlowId"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(50 47.5) rotate(90) scale(22)"
        >
          <stop stop-color="#a855f7" stop-opacity="0.18" />
          <stop offset="0.62" stop-color="#38bdf8" stop-opacity="0.08" />
          <stop offset="1" stop-color="#38bdf8" stop-opacity="0" />
        </radialGradient>
        <radialGradient
          :id="leftGlowId"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(26 73) rotate(90) scale(16)"
        >
          <stop stop-color="#38bdf8" stop-opacity="0.2" />
          <stop offset="1" stop-color="#38bdf8" stop-opacity="0" />
        </radialGradient>
        <radialGradient
          :id="rightGlowId"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(76 22) rotate(90) scale(14)"
        >
          <stop stop-color="#38bdf8" stop-opacity="0.18" />
          <stop offset="1" stop-color="#38bdf8" stop-opacity="0" />
        </radialGradient>
      </defs>

      <circle cx="50" cy="47.5" r="21" :fill="`url(#${coreGlowId})`" />
      <circle cx="26" cy="73" r="16" :fill="`url(#${leftGlowId})`" />
      <circle cx="76" cy="22" r="14" :fill="`url(#${rightGlowId})`" />
      <circle cx="18" cy="28" r="0.95" class="workspace-sidebar-mark__noise-dot" />
      <circle cx="30" cy="66" r="0.85" class="workspace-sidebar-mark__noise-dot is-faint" />
      <circle cx="70" cy="21" r="0.85" class="workspace-sidebar-mark__noise-dot is-faint" />
      <circle cx="82" cy="63" r="0.95" class="workspace-sidebar-mark__noise-dot" />
      <circle cx="58" cy="80" r="0.75" class="workspace-sidebar-mark__noise-dot is-faint" />

      <g class="workspace-sidebar-mark__ring" :filter="`url(#${glowId})`">
        <circle cx="50" cy="50" r="31" class="workspace-sidebar-mark__track" />
        <circle cx="50" cy="18" r="1.8" fill="#38bdf8" />
        <circle cx="50" cy="82" r="1.8" fill="#38bdf8" />
      </g>

      <g class="workspace-sidebar-mark__core" :filter="`url(#${glowId})`">
        <path
          class="workspace-sidebar-mark__star"
          d="M 50,22 Q 50,47.5 76,47.5 Q 50,47.5 50,73 Q 50,47.5 24,47.5 Q 50,47.5 50,22 Z"
          :fill="`url(#${starGradientId})`"
        />
        <circle cx="50" cy="47.5" r="2" fill="#ffffff" />
      </g>
    </svg>

    <LoaderCircle v-if="busy" class="workspace-sidebar-mark__loader" />
  </span>
</template>

<style scoped>
.workspace-sidebar-mark {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  isolation: isolate;
}

.workspace-sidebar-mark__svg {
  display: block;
  width: 100%;
  height: 100%;
}

.workspace-sidebar-mark__noise-dot {
  fill: rgba(99, 102, 241, 0.2);
}

.workspace-sidebar-mark__noise-dot.is-faint {
  fill: rgba(56, 189, 248, 0.16);
}

.workspace-sidebar-mark__track {
  stroke: rgba(168, 85, 247, 0.16);
  stroke-width: 1.35;
  fill: none;
  stroke-dasharray: 1 16;
}

.workspace-sidebar-mark__ring {
  transform-origin: 50px 50px;
  animation: workspace-sidebar-mark-spin-gentle 20s linear infinite;
}

.workspace-sidebar-mark__core {
  transform-origin: 50px 50px;
  animation: workspace-sidebar-mark-pulse 3s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

.workspace-sidebar-mark__star {
  stroke: rgba(255, 255, 255, 0.2);
  stroke-width: 0.75;
}

.workspace-sidebar-mark__loader {
  position: absolute;
  z-index: 2;
  width: 34%;
  height: 34%;
  color: rgba(99, 102, 241, 0.72);
  animation: workspace-sidebar-mark-spin-fast 0.9s linear infinite;
}

.workspace-sidebar-mark--busy .workspace-sidebar-mark__ring {
  animation-duration: 2.2s;
}

.workspace-sidebar-mark--busy .workspace-sidebar-mark__core {
  opacity: 0.55;
}

@keyframes workspace-sidebar-mark-spin-fast {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

@keyframes workspace-sidebar-mark-spin-gentle {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

@keyframes workspace-sidebar-mark-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.92;
  }

  50% {
    transform: scale(1.05);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .workspace-sidebar-mark__ring,
  .workspace-sidebar-mark__core,
  .workspace-sidebar-mark__loader {
    animation: none !important;
  }
}
</style>
