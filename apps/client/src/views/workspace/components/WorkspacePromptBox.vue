<script setup lang="ts">
import { Brain, Globe, Paperclip, Send, Square, X } from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import type { PromptCapabilities } from '@/types'

type PromptSubmitPayload = {
  files: File[]
  message: string
  capabilities: PromptCapabilities
}

const props = withDefaults(
  defineProps<{
    disabled?: boolean
    modelValue: string
    showHint?: boolean
    streaming?: boolean
  }>(),
  {
    disabled: false,
    showHint: false,
    streaming: false
  }
)

const emit = defineEmits<{
  submit: [payload: PromptSubmitPayload]
  stop: []
  'update:modelValue': [value: string]
}>()

const fileInputRef = ref<HTMLInputElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const attachedFiles = ref<File[]>([])
const thinkEnabled = ref(false)
const searchEnabled = ref(false)
const thinkSpinTurns = ref(0)
const searchSpinTurns = ref(0)

const promptCapabilities = computed<PromptCapabilities>(() => ({
  think: thinkEnabled.value,
  search: searchEnabled.value
}))

const hasContent = computed(() => props.modelValue.trim().length > 0 || attachedFiles.value.length > 0)

const currentPlaceholder = computed(() => {
  if (thinkEnabled.value && searchEnabled.value) {
    return '结合深度思考和网络搜索发起提问...'
  }

  if (thinkEnabled.value) {
    return '发起需要更深推理的问题...'
  }

  if (searchEnabled.value) {
    return '发起需要联网补充信息的问题...'
  }

  return '输入你的问题...'
})

const helperText = computed(() => {
  if (thinkEnabled.value && searchEnabled.value) {
    return '已开启深度思考和网络搜索，回复中会展示思考链路和外部搜索过程。'
  }

  if (thinkEnabled.value) {
    return '已开启深度思考，适合需要更长推理链路的问题。'
  }

  if (searchEnabled.value) {
    return '已开启网络搜索，适合需要实时外部信息的问题。'
  }

  return '如果只需要直接回答，可以保持这两个开关关闭。'
})

const resizeTextarea = async () => {
  await nextTick()

  if (!textareaRef.value) {
    return
  }

  textareaRef.value.style.height = '0px'
  textareaRef.value.style.height = `${Math.min(Math.max(textareaRef.value.scrollHeight, 42), 144)}px`
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

const updateValue = (event: Event) => {
  const target = event.target as HTMLTextAreaElement
  emit('update:modelValue', target.value)
}

const toggleThinkMode = () => {
  thinkSpinTurns.value += 1
  thinkEnabled.value = !thinkEnabled.value
}

const toggleSearchMode = () => {
  searchSpinTurns.value += 1
  searchEnabled.value = !searchEnabled.value
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
    capabilities: promptCapabilities.value
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
      class="rounded-[32px] border border-[#edf1f5] bg-white px-5 py-4 shadow-[0_20px_48px_rgba(15,23,42,0.08)] transition-all duration-300"
      :class="streaming ? 'shadow-[0_16px_40px_rgba(15,23,42,0.12)]' : 'hover:shadow-[0_24px_58px_rgba(15,23,42,0.1)]'"
    >
      <div v-if="attachedFiles.length" class="mt-3 flex flex-wrap gap-2">
        <div
          v-for="(file, index) in attachedFiles"
          :key="`${file.name}-${index}`"
          class="inline-flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-[#f8fafc] px-3 py-1.5 text-[13px] text-[#4b5563]"
        >
          <Paperclip class="size-3.5 text-[#6b7280]" />
          <span class="max-w-[180px] truncate">{{ file.name }}</span>
          <button
            type="button"
            class="flex size-5 items-center justify-center rounded-full text-[#94a3b8] transition hover:bg-white hover:text-[#111827]"
            aria-label="Remove attachment"
            @click="removeFile(index)"
          >
            <X class="size-3.5" />
          </button>
        </div>
      </div>

      <div class="flex items-start gap-3">
        <button
          type="button"
          class="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full text-[#111827] transition hover:bg-[#f5f7fa]"
          aria-label="Attach files"
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
            class="block min-h-[42px] w-full resize-none border-0 bg-transparent px-0 py-0 text-[16px] leading-7 text-[#111827] outline-none placeholder:text-[#a0aec0]"
            @input="updateValue"
            @keydown="handleKeydown"
          />
        </div>

        <button
          type="button"
          class="mt-0.5 flex size-12 shrink-0 items-center justify-center rounded-full bg-[#111111] text-white shadow-[0_12px_24px_rgba(17,17,17,0.18)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_28px_rgba(17,17,17,0.22)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45"
          :aria-label="streaming ? 'Stop response' : 'Send message'"
          :disabled="!streaming && !hasContent"
          @click="submit"
        >
          <Square v-if="streaming" class="size-[18px]" />
          <Send v-else class="size-[18px] translate-x-[1px]" />
        </button>
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="inline-flex h-12 items-center rounded-full border px-4 text-[15px] font-medium transition"
          :class="
            thinkEnabled
              ? 'border-[#82a6f8] bg-[#eef4ff] text-[#23416e]'
              : 'border-[#edf1f5] bg-[#f7f8fa] text-[#657181] hover:border-[#dbe6ff] hover:bg-[#f3f7ff]'
          "
          :disabled="disabled || streaming"
          @click="toggleThinkMode"
        >
          <Brain
            class="size-[18px] shrink-0 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            :style="{ transform: `rotate(${thinkSpinTurns * 180}deg)` }"
          />
          <span class="ml-2">深度思考</span>
        </button>

        <button
          type="button"
          class="inline-flex h-12 items-center overflow-hidden rounded-full border transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          :class="
            searchEnabled
              ? 'border-[#82a6f8] bg-[#eef4ff] px-4 text-[#23416e]'
              : 'w-12 justify-center border-[#edf1f5] bg-[#f7f8fa] px-0 text-[#657181] hover:border-[#dbe6ff] hover:bg-[#f3f7ff]'
          "
          :disabled="disabled || streaming"
          @click="toggleSearchMode"
        >
          <Globe
            class="size-[18px] shrink-0 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            :style="{ transform: `rotate(${searchSpinTurns * 180}deg)` }"
          />
          <span
            class="overflow-hidden whitespace-nowrap text-[15px] font-medium transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            :class="searchEnabled ? 'ml-2 max-w-[72px] opacity-100' : 'ml-0 max-w-0 opacity-0'"
          >
            搜索
          </span>
        </button>
      </div>

      <input
        ref="fileInputRef"
        type="file"
        class="hidden"
        multiple
        @change="handleFileChange"
      />
    </div>

    <div v-if="showHint" class="mt-4 flex flex-col items-center gap-3 px-2">
      <p class="w-full text-left text-[15px] font-medium text-[#3d6cff]">
        {{ helperText }}
      </p>
      <p class="text-[14px] text-[#7b8aa2]">
        <span class="rounded bg-white px-2 py-1 text-[#6b7280]">Enter</span>
        发送
        <span class="rounded bg-white px-2 py-1 text-[#6b7280]">Shift + Enter</span>
        换行
      </p>
    </div>
  </div>
</template>
