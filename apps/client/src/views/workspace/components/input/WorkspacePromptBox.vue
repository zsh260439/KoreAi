<script setup lang="ts">
import { ArrowUp, Brain, Paperclip, Square, X } from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import type { PromptCapabilities } from '@/types'
import type { KnowledgeBase } from 'share-type'

type PromptSubmitPayload = {
  files: File[]
  message: string
  capabilities: PromptCapabilities
  knowledgeBaseId?: string
}

const props = withDefaults(
  defineProps<{
    disabled?: boolean
    knowledgeBases?: Pick<KnowledgeBase, 'id' | 'name'>[]
    selectedKnowledgeBaseId?: string
    modelValue: string
    showHint?: boolean
    streaming?: boolean
  }>(),
  {
    disabled: false,
    knowledgeBases: () => [],
    selectedKnowledgeBaseId: '',
    showHint: false,
    streaming: false
  }
)

const emit = defineEmits<{
  submit: [payload: PromptSubmitPayload]
  stop: []
  'update:selectedKnowledgeBaseId': [value: string]
  'update:modelValue': [value: string]
}>()

const fileInputRef = ref<HTMLInputElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const attachedFiles = ref<File[]>([])
const thinkEnabled = ref(false)

const promptCapabilities = computed<PromptCapabilities>(() => ({
  think: thinkEnabled.value,
  search: false
}))

const hasContent = computed(() => props.modelValue.trim().length > 0 || attachedFiles.value.length > 0)

const currentPlaceholder = computed(() => {
  if (thinkEnabled.value) {
    return '发起需要更长推理链路的问题...'
  }

  return '输入问题，直接开始对话...'
})

const resizeTextarea = async () => {
  await nextTick()

  if (!textareaRef.value) {
    return
  }

  textareaRef.value.style.height = '0px'
  textareaRef.value.style.height = `${Math.min(Math.max(textareaRef.value.scrollHeight, 40), 128)}px`
}

const triggerFileSelect = () => {
  if (props.disabled || props.streaming) {
    return
  }

  fileInputRef.value?.click()
}

const handleFileChange = (event: Event) => {
  const input = event.target as HTMLInputElement
  const nextFiles = Array.from(input.files ?? [])

  if (!nextFiles.length) {
    return
  }

  attachedFiles.value = [...attachedFiles.value, ...nextFiles].slice(0, 4)
  input.value = ''
}

const removeFile = (index: number) => {
  attachedFiles.value = attachedFiles.value.filter((_, fileIndex) => fileIndex !== index)
}

const updateSelectedKnowledgeBase = (event: Event) => {
  const target = event.target as HTMLSelectElement
  emit('update:selectedKnowledgeBaseId', target.value)
}

const updateValue = (event: Event) => {
  const target = event.target as HTMLTextAreaElement
  emit('update:modelValue', target.value)
}

const toggleThinkMode = () => {
  if (props.disabled || props.streaming) {
    return
  }

  thinkEnabled.value = !thinkEnabled.value
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
    files: [...attachedFiles.value],
    message: props.modelValue.trim(),
    capabilities: promptCapabilities.value,
    knowledgeBaseId: props.selectedKnowledgeBaseId || undefined
  })

  attachedFiles.value = []
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    submit()
  }
}

watch(() => props.modelValue, resizeTextarea, { immediate: true })
watch(attachedFiles, resizeTextarea, { deep: true })

onMounted(() => {
  void resizeTextarea()
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
          <button
            type="button"
            class="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/80 bg-[#0f172a]/5 text-[#111827] transition hover:bg-[#0f172a]/8 disabled:cursor-not-allowed disabled:opacity-45"
            aria-label="添加附件"
            :disabled="disabled || streaming"
            @click="triggerFileSelect"
          >
            <Paperclip class="size-[17px]" />
          </button>

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

        <div v-if="attachedFiles.length" class="mt-3 flex flex-wrap gap-2 px-1">
          <div
            v-for="(file, index) in attachedFiles"
            :key="`${file.name}-${index}`"
            class="inline-flex max-w-full items-center gap-2 rounded-full border border-[#e6ebf2] bg-[#f8fafc] px-3 py-1.5 text-[13px] text-[#475467]"
          >
            <Paperclip class="size-3.5 text-[#667085]" />
            <span class="max-w-[180px] truncate">{{ file.name }}</span>
            <button
              type="button"
              class="flex size-4 items-center justify-center rounded-full text-[#98a2b3] transition hover:bg-white hover:text-[#111827]"
              aria-label="移除附件"
              @click="removeFile(index)"
            >
              <X class="size-3" />
            </button>
          </div>
        </div>
      </div>

      <input
        ref="fileInputRef"
        type="file"
        class="hidden"
        multiple
        @change="handleFileChange"
      />
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-2 px-1">
      <div class="relative">
        <select
          :value="selectedKnowledgeBaseId"
          :disabled="disabled || streaming"
          class="min-w-[180px] rounded-full border border-[#e6ebf2] bg-white px-4 py-2 text-[14px] text-[#475467] transition hover:border-[#d9e2ef] focus:border-[#dbe6ff] focus:outline-none disabled:cursor-not-allowed disabled:opacity-45"
          @change="updateSelectedKnowledgeBase"
        >
          <option value="">全库搜索（默认）</option>
          <option
            v-for="base in knowledgeBases"
            :key="base.id"
            :value="base.id"
          >
            {{ base.name }}
          </option>
        </select>
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
    </div>
  </div>
</template>
