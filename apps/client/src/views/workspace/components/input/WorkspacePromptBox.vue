<script setup lang="ts">
import { ArrowUp, Brain, Square } from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import RetrievalRewriteToggle from '@/components/ui/RetrievalRewriteToggle.vue'
import type { WorkspacePromptCapabilities } from 'share-type'

const ALL_KNOWLEDGE_BASES_VALUE = '__all__'

type PromptSubmitPayload = {
  message: string
  capabilities: WorkspacePromptCapabilities
  knowledgeBaseId?: string
}

const props = withDefaults(
  defineProps<{
    capabilities?: WorkspacePromptCapabilities
    disabled?: boolean
    knowledgeBases?: {
      id: string
      name: string
    }[]
    selectedKnowledgeBaseId?: string
    modelValue: string
    streaming?: boolean
  }>(),
  {
    capabilities: () => ({
      think: false,
      rewrite: true
    }),
    disabled: false,
    knowledgeBases: () => [],
    selectedKnowledgeBaseId: '',
    streaming: false
  }
)

const emit = defineEmits<{
  submit: [payload: PromptSubmitPayload]
  stop: []
  'update:capabilities': [value: WorkspacePromptCapabilities]
  'update:selectedKnowledgeBaseId': [value: string]
  'update:modelValue': [value: string]
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const thinkEnabled = ref(false)
const rewriteEnabled = ref(true)

// 统一从本地状态导出能力开关，避免父子状态分叉
const promptCapabilities = computed<WorkspacePromptCapabilities>(() => ({
  think: thinkEnabled.value,
  rewrite: rewriteEnabled.value
}))
const selectedKnowledgeBaseSelectValue = computed({
  get: () => props.selectedKnowledgeBaseId || ALL_KNOWLEDGE_BASES_VALUE,
  set: (value: string) => {
    emit('update:selectedKnowledgeBaseId', value === ALL_KNOWLEDGE_BASES_VALUE ? '' : value)
  }
})

const hasContent = computed(() => props.modelValue.trim().length > 0)

const currentPlaceholder = computed(() => {
  if (thinkEnabled.value) {
    return '请输入需要深度思考的问题'
  }

  return '输入问题，直接开始对话'
})

const resizeTextarea = async () => {
  await nextTick()

  if (!textareaRef.value) {
    return
  }

  textareaRef.value.style.height = '0px'
  textareaRef.value.style.height = `${Math.min(Math.max(textareaRef.value.scrollHeight, 40), 128)}px`
}

const updateValue = (event: Event) => {
  const target = event.target as HTMLTextAreaElement
  emit('update:modelValue', target.value)
}

const toggleThinkMode = () => {
  thinkEnabled.value = !thinkEnabled.value
}

const updateRewriteEnabled = (value: boolean) => {
  rewriteEnabled.value = value
}

const focusComposer = async () => {
  await nextTick()

  if (!textareaRef.value) {
    return
  }

  const length = textareaRef.value.value.length
  textareaRef.value.focus()
  textareaRef.value.setSelectionRange(length, length)
}

const submit = () => {
  if (props.streaming) {
    emit('stop')
    return
  }

  if (props.disabled || !hasContent.value) {
    return
  }

  emit('submit', {
    message: props.modelValue.trim(),
    capabilities: promptCapabilities.value,
    knowledgeBaseId: props.selectedKnowledgeBaseId || undefined
  })
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    submit()
  }
}

watch(() => props.modelValue, resizeTextarea, { immediate: true })

watch(
  () => props.capabilities,
  (value) => {
    thinkEnabled.value = Boolean(value?.think)
    rewriteEnabled.value = value?.rewrite !== false
  },
  { immediate: true, deep: true }
)

watch(
  promptCapabilities,
  (value) => {
    emit('update:capabilities', value)
  },
  { immediate: true, deep: true }
)

onMounted(() => {
  void resizeTextarea()
})

defineExpose({
  focusComposer
})
</script>

<template>
  <div class="w-full">
    <div
      class="group relative overflow-hidden rounded-[30px] border border-white/70 bg-white/80 shadow-[0_20px_48px_rgba(15,23,42,0.08)] backdrop-blur-2xl transition-all duration-300"
      :class="
        streaming
          ? 'border-[#dbe7ff] shadow-[0_22px_52px_rgba(37,99,235,0.10)]'
          : 'hover:border-[#e6edf7] hover:shadow-[0_28px_64px_rgba(15,23,42,0.12)] focus-within:border-[#cfdcff] focus-within:shadow-[0_28px_64px_rgba(59,130,246,0.10)]'
      "
    >
      <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,#eef4ff_0%,transparent_48%)] opacity-80" />
      <div class="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.72),rgba(255,255,255,0.18))]" />

      <div class="relative z-10 px-3 py-3">
        <div class="flex items-end gap-2">
          <div class="min-w-0 flex-1">
            <textarea
              ref="textareaRef"
              :value="modelValue"
              :disabled="disabled || streaming"
              :placeholder="currentPlaceholder"
              class="block min-h-[40px] w-full resize-none border-0 bg-transparent px-2 py-[7px] text-[15px] leading-7 text-[#111827] outline-none placeholder:text-[#8a94a6]"
              @input="updateValue"
              @keydown="handleKeydown"
            />
          </div>

          <button
            type="button"
            class="flex size-10 shrink-0 items-center justify-center rounded-full border-0 bg-[#0a1217] text-white transition hover:shadow-[0_12px_28px_rgba(15,23,42,0.18)] disabled:cursor-not-allowed disabled:bg-[#c7ced8] disabled:text-white/70"
            :aria-label="streaming ? '停止生成' : '发送消息'"
            :disabled="!streaming && !hasContent"
            @click="submit"
          >
            <Square v-if="streaming" class="size-[15px]" />
            <ArrowUp v-else class="size-[17px]" />
          </button>
        </div>
      </div>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-2 px-1">
      <div class="relative">
        <el-select
          v-model="selectedKnowledgeBaseSelectValue"
          :disabled="disabled || streaming"
          class="workspace-kb-select"
          popper-class="knowledge-scope-select-popper"
        >
          <el-option label="全库搜索（默认）" :value="ALL_KNOWLEDGE_BASES_VALUE" />
          <el-option
            v-for="base in knowledgeBases"
            :key="base.id"
            :label="base.name"
            :value="base.id"
          />
        </el-select>
      </div>

      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[14px] font-medium transition disabled:cursor-not-allowed disabled:opacity-45"
        :class="
          thinkEnabled
            ? 'border-[#dbe6ff] bg-[#eef4ff] text-[#23416e]'
            : 'border-[#e6ebf2] bg-white text-[#475467] hover:border-[#d9e2ef] hover:bg-[#f8fafc] hover:text-[#111827]'
        "
        :disabled="disabled || streaming"
        @click="toggleThinkMode"
      >
        <Brain class="size-4 shrink-0" />
        <span>深度思考</span>
      </button>

      <RetrievalRewriteToggle
        :model-value="rewriteEnabled"
        :disabled="disabled || streaming"
        compact
        label="LLM Rewrite"
        hint="Rewrite retrieval query"
        @update:model-value="updateRewriteEnabled"
      />
    </div>
  </div>
</template>

<style scoped>
.workspace-kb-select {
  width: 180px;
}

.workspace-kb-select :deep(.el-select__wrapper) {
  min-height: 34px;
  border-radius: 999px;
  box-shadow: 0 0 0 1px #e6ebf2 inset;
}

.workspace-kb-select :deep(.el-select__wrapper.is-hovering),
.workspace-kb-select :deep(.el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1px #d9e2ef inset;
}

.workspace-kb-select :deep(.el-select__selected-item) {
  color: #475467;
  font-size: 14px;
}

:global(.knowledge-scope-select-popper) {
  border-radius: 10px;
}

:global(.knowledge-scope-select-popper .el-select-dropdown__wrap) {
  max-height: 248px;
}

:global(.knowledge-scope-select-popper .el-select-dropdown__item) {
  height: 34px;
  padding: 0 12px;
  color: #334155;
  font-size: 13px;
  line-height: 34px;
}

:global(.knowledge-scope-select-popper .el-select-dropdown__item.is-hovering) {
  background: #f1f5f9;
}

:global(.knowledge-scope-select-popper .el-select-dropdown__item.is-selected) {
  background: #ecfdf5;
  color: #0f766e;
  font-weight: 700;
}
</style>
