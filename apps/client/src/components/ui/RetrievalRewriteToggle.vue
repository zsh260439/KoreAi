<script setup lang="ts">
import { Sparkles } from 'lucide-vue-next'
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    disabled?: boolean
    label?: string
    hint?: string
    compact?: boolean
  }>(),
  {
    disabled: false,
    label: 'LLM Rewrite',
    hint: 'Use query rewrite before retrieval',
    compact: false
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const stateLabel = computed(() => (props.modelValue ? 'ON' : 'OFF'))

const toggle = () => {
  if (props.disabled) {
    return
  }

  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <button
    type="button"
    class="rewrite-toggle"
    :class="{
      'rewrite-toggle--active': modelValue,
      'rewrite-toggle--compact': compact
    }"
    :disabled="disabled"
    :aria-pressed="modelValue"
    @click="toggle"
  >
    <span class="rewrite-toggle__icon">
      <Sparkles class="size-[14px]" />
    </span>

    <span class="rewrite-toggle__copy">
      <span class="rewrite-toggle__label">{{ label }}</span>
      <span v-if="!compact && hint" class="rewrite-toggle__hint">{{ hint }}</span>
    </span>

    <span class="rewrite-toggle__status">{{ stateLabel }}</span>
  </button>
</template>

<style scoped>
.rewrite-toggle {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-height: 42px;
  padding: 9px 14px 9px 10px;
  border: 1px solid #d9e4ef;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 250, 252, 0.96));
  color: #475467;
  transition:
    border-color 180ms var(--ease-standard),
    background 180ms var(--ease-standard),
    color 180ms var(--ease-standard),
    transform 180ms var(--ease-standard),
    box-shadow 180ms var(--ease-standard);
}

.rewrite-toggle:hover:not(:disabled) {
  border-color: #bfd3e7;
  color: #1f2937;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
}

.rewrite-toggle:focus-visible {
  outline: 0;
  border-color: #7dd3c7;
  box-shadow: 0 0 0 4px rgba(20, 184, 166, 0.14);
}

.rewrite-toggle:active:not(:disabled) {
  transform: translateY(1px);
}

.rewrite-toggle:disabled {
  cursor: not-allowed;
  opacity: 0.5;
  box-shadow: none;
}

.rewrite-toggle--active {
  border-color: #99f6e4;
  background: linear-gradient(180deg, rgba(240, 253, 250, 0.98), rgba(204, 251, 241, 0.94));
  color: #115e59;
  box-shadow: 0 14px 28px rgba(20, 184, 166, 0.12);
}

.rewrite-toggle--compact {
  min-height: 40px;
  padding-right: 12px;
}

.rewrite-toggle__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: currentColor;
  flex-shrink: 0;
}

.rewrite-toggle__copy {
  display: grid;
  align-items: center;
  text-align: left;
  min-width: 0;
}

.rewrite-toggle__label {
  font-size: 13px;
  font-weight: 700;
  line-height: 1.1;
}

.rewrite-toggle__hint {
  margin-top: 3px;
  font-size: 11px;
  line-height: 1.2;
  color: #6b7280;
}

.rewrite-toggle--active .rewrite-toggle__hint {
  color: #0f766e;
}

.rewrite-toggle__status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 38px;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.14);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.05em;
}

.rewrite-toggle--active .rewrite-toggle__status {
  background: rgba(15, 118, 110, 0.14);
}

.rewrite-toggle--compact .rewrite-toggle__hint {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  .rewrite-toggle {
    transition: none;
  }
}
</style>
