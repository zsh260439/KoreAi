<script setup lang="ts">
import { ref, watch } from 'vue'

import { renderMessageMarkdown } from '@/utils/chat-markdown'

const COPY_DEFAULT_LABEL = '\u590d\u5236'
const COPY_SUCCESS_LABEL = '\u5df2\u590d\u5236'
const EXPAND_LABEL = '\u5c55\u5f00'
const COLLAPSE_LABEL = '\u6536\u8d77'

const props = withDefaults(
  defineProps<{
    content: string
    showCursor?: boolean
  }>(),
  {
    showCursor: false
  }
)

const renderedHtml = ref('')

let renderTaskId = 0
let copiedButton: HTMLButtonElement | null = null
let copiedTimer: number | null = null

const resetCopiedButton = () => {
  if (!copiedButton) {
    return
  }

  copiedButton.textContent = copiedButton.dataset.defaultLabel || COPY_DEFAULT_LABEL
  copiedButton.dataset.copied = 'false'
  copiedButton = null

  if (copiedTimer) {
    window.clearTimeout(copiedTimer)
    copiedTimer = null
  }
}

const setToggleButtonState = (button: HTMLButtonElement, isCollapsed: boolean) => {
  const currentLabel = isCollapsed
    ? button.dataset.expandLabel || EXPAND_LABEL
    : button.dataset.collapseLabel || COLLAPSE_LABEL
  const language = button.dataset.language || ''
  const title = language ? `${currentLabel} ${language}` : currentLabel

  button.dataset.collapsed = String(isCollapsed)
  button.setAttribute('aria-expanded', String(!isCollapsed))
  button.setAttribute('aria-label', title)
  button.title = title
}

const updateRenderedHtml = async (content: string) => {
  const taskId = ++renderTaskId

  if (!content.trim()) {
    renderedHtml.value = ''
    resetCopiedButton()
    return
  }

  try {
    const html = await renderMessageMarkdown(content)
    if (taskId === renderTaskId) {
      renderedHtml.value = html
    }
  } catch {
    if (taskId === renderTaskId) {
      renderedHtml.value = ''
      resetCopiedButton()
    }
  }
}

const handleToggle = (event: MouseEvent): boolean => {
  const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
    '[data-toggle-code]'
  )
  if (!button) {
    return false
  }

  const shell = button.closest<HTMLElement>('.message-code-shell')
  if (!shell) {
    return true
  }

  const isCollapsed = shell.dataset.collapsed === 'true'
  const nextCollapsed = !isCollapsed

  shell.dataset.collapsed = String(nextCollapsed)
  setToggleButtonState(button, nextCollapsed)

  return true
}

const handleCopy = async (event: MouseEvent) => {
  const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
    '[data-copy-code]'
  )
  if (!button) {
    return
  }

  const shell = button.closest<HTMLElement>('.message-code-shell')
  const code = shell?.querySelector('pre code')?.textContent
  if (!code) {
    return
  }

  await navigator.clipboard.writeText(code)

  if (copiedButton && copiedButton !== button) {
    resetCopiedButton()
  }

  button.dataset.copied = 'true'
  button.textContent = COPY_SUCCESS_LABEL
  copiedButton = button

  if (copiedTimer) {
    window.clearTimeout(copiedTimer)
  }

  copiedTimer = window.setTimeout(() => {
    if (copiedButton === button) {
      resetCopiedButton()
    }
  }, 1600)
}

const handleToolbarAction = (event: MouseEvent) => {
  if (handleToggle(event)) {
    return
  }

  void handleCopy(event)
}

watch(
  () => props.content,
  (content) => {
    void updateRenderedHtml(content)
  },
  { immediate: true }
)
</script>

<template>
  <div
    v-if="renderedHtml"
    class="message-markdown"
    @click="handleToolbarAction"
  >
    <div v-html="renderedHtml" />
    <span v-if="showCursor" class="message-markdown__cursor" />
  </div>
</template>

<style scoped>
.message-markdown {
  color: inherit;
}

.message-markdown :deep(p),
.message-markdown :deep(ul),
.message-markdown :deep(ol),
.message-markdown :deep(blockquote),
.message-markdown :deep(.message-code-shell) {
  margin: 0 0 0.9rem;
}

.message-markdown :deep(p:last-child),
.message-markdown :deep(ul:last-child),
.message-markdown :deep(ol:last-child),
.message-markdown :deep(blockquote:last-child),
.message-markdown :deep(.message-code-shell:last-child) {
  margin-bottom: 0;
}

.message-markdown :deep(ul),
.message-markdown :deep(ol) {
  padding-left: 1.4rem;
}

.message-markdown :deep(li + li) {
  margin-top: 0.2rem;
}

.message-markdown :deep(a) {
  color: #2563eb;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.message-markdown :deep(blockquote) {
  border-left: 3px solid #dbe4f0;
  padding-left: 0.9rem;
  color: #475467;
}

.message-markdown :deep(code:not(pre code)) {
  border-radius: 0.4rem;
  background: #f3f4f6;
  padding: 0.12rem 0.38rem;
  font-size: 0.92em;
  color: #1f2937;
}

.message-markdown :deep(.message-code-shell) {
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 1rem;
  background: #fff;
  box-shadow: 0 10px 30px rgb(15 23 42 / 0.04);
}

.message-markdown :deep(.message-code-toolbar) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid #eceff3;
  background: linear-gradient(180deg, #fbfbfc 0%, #f5f7fa 100%);
  padding: 0.7rem 1rem;
  transition: border-color 0.24s ease;
}

.message-markdown :deep(.message-code-shell[data-collapsed='true'] .message-code-toolbar) {
  border-bottom-color: transparent;
}

.message-markdown :deep(.message-code-toolbar__meta) {
  min-width: 0;
}

.message-markdown :deep(.message-code-toolbar__actions) {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.message-markdown :deep(.message-code-toolbar__toggle) {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  border: none;
  background: transparent;
  padding: 0;
  color: #475467;
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition: color 0.2s ease;
}

.message-markdown :deep(.message-code-toolbar__toggle:hover) {
  color: #111827;
}

.message-markdown :deep(.message-code-toolbar__language) {
  white-space: nowrap;
  text-transform: lowercase;
}

.message-markdown :deep(.message-code-toolbar__chevron) {
  width: 0.5rem;
  height: 0.5rem;
  flex-shrink: 0;
  border-top: 1.5px solid currentColor;
  border-right: 1.5px solid currentColor;
  transform: rotate(-45deg);
  transform-origin: center;
  transition: transform 0.24s ease;
}

.message-markdown :deep(.message-code-toolbar__toggle[data-collapsed='true'] .message-code-toolbar__chevron) {
  transform: rotate(135deg);
}

.message-markdown :deep(.message-code-toolbar__copy) {
  flex-shrink: 0;
  border: 1px solid #d7deea;
  border-radius: 999px;
  background: #fff;
  padding: 0.28rem 0.72rem;
  color: #475467;
  font-size: 0.78rem;
  line-height: 1.2;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

.message-markdown :deep(.message-code-toolbar__copy:hover) {
  border-color: #bfc9d8;
  background: #f8fafc;
}

.message-markdown :deep(.message-code-toolbar__copy[data-copied='true']) {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
}

.message-markdown :deep(.message-code-content) {
  display: grid;
  grid-template-rows: 1fr;
  opacity: 1;
  transition:
    grid-template-rows 0.26s ease,
    opacity 0.22s ease;
}

.message-markdown :deep(.message-code-content__inner) {
  min-height: 0;
  overflow: hidden;
}

.message-markdown :deep(.message-code-shell[data-collapsed='true'] .message-code-content) {
  grid-template-rows: 0fr;
  opacity: 0;
}

.message-markdown :deep(pre.shiki),
.message-markdown :deep(pre.message-code-block) {
  overflow-x: auto;
  margin: 0;
  padding: 1.15rem 1rem 1.05rem;
  font-size: 13px;
  line-height: 1.8;
}

.message-markdown :deep(pre.shiki) {
  background: #fff !important;
}

.message-markdown :deep(pre.message-code-block) {
  background: #fff;
  color: #374151;
}

.message-markdown :deep(pre code) {
  display: block;
  font-family: var(--font-mono-family);
}

.message-markdown__cursor {
  display: inline-block;
  width: 1px;
  height: 0.95rem;
  margin-left: 2px;
  vertical-align: middle;
  background: #374151;
  animation: message-markdown-cursor-blink 0.8s infinite;
}

@keyframes message-markdown-cursor-blink {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0;
  }
}
</style>
