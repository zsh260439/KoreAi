<script setup lang="ts">
import {
  ArrowUp,
  BookOpen,
  Brain,
  Check,
  ChevronDown,
  Sparkles,
  Square,
} from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import type { WorkspacePromptCapabilities } from "share-type";

const ALL_KNOWLEDGE_BASES_VALUE = "__all__";

type PromptSubmitPayload = {
  message: string;
  capabilities: WorkspacePromptCapabilities;
  knowledgeBaseId?: string;
};

const props = withDefaults(
  defineProps<{
    capabilities?: WorkspacePromptCapabilities;
    disabled?: boolean;
    knowledgeBases?: {
      id: string;
      name: string;
    }[];
    selectedKnowledgeBaseId?: string;
    modelValue: string;
    streaming?: boolean;
  }>(),
  {
    capabilities: () => ({
      think: false,
      rewrite: true,
    }),
    disabled: false,
    knowledgeBases: () => [],
    selectedKnowledgeBaseId: "",
    streaming: false,
  },
);

const emit = defineEmits<{
  submit: [payload: PromptSubmitPayload];
  stop: [];
  "update:capabilities": [value: WorkspacePromptCapabilities];
  "update:selectedKnowledgeBaseId": [value: string];
  "update:modelValue": [value: string];
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const scopeMenuRef = ref<HTMLDivElement | null>(null);
const thinkEnabled = ref(false);
const rewriteEnabled = ref(true);
const scopeOpen = ref(false);

// 统一从本地状态导出能力开关，避免父子状态分叉
const promptCapabilities = computed<WorkspacePromptCapabilities>(() => ({
  think: thinkEnabled.value,
  rewrite: rewriteEnabled.value,
}));
const selectedKnowledgeBaseSelectValue = computed({
  get: () => props.selectedKnowledgeBaseId || ALL_KNOWLEDGE_BASES_VALUE,
  set: (value: string) => {
    emit(
      "update:selectedKnowledgeBaseId",
      value === ALL_KNOWLEDGE_BASES_VALUE ? "" : value,
    );
  },
});

const selectedScopeLabel = computed(() => {
  if (!props.selectedKnowledgeBaseId) {
    return "全库搜索";
  }

  return (
    props.knowledgeBases.find(
      (base) => base.id === props.selectedKnowledgeBaseId,
    )?.name ?? "全库搜索"
  );
});

const hasContent = computed(() => props.modelValue.trim().length > 0);

const currentPlaceholder = computed(() => {
  if (thinkEnabled.value) {
    return "请输入需要深度思考的问题";
  }

  return "输入问题，直接开始对话";
});

const resizeTextarea = async () => {
  await nextTick();

  if (!textareaRef.value) {
    return;
  }

  textareaRef.value.style.height = "0px";
  textareaRef.value.style.height = `${Math.min(Math.max(textareaRef.value.scrollHeight, 40), 128)}px`;
};

const updateValue = (event: Event) => {
  const target = event.target as HTMLTextAreaElement;
  emit("update:modelValue", target.value);
};

const toggleThinkMode = () => {
  thinkEnabled.value = !thinkEnabled.value;
};

const updateRewriteEnabled = (value: boolean) => {
  rewriteEnabled.value = value;
};

const selectKnowledgeScope = (value: string) => {
  selectedKnowledgeBaseSelectValue.value = value;
  scopeOpen.value = false;
};

const closeScopeOnOutsideClick = (event: PointerEvent) => {
  if (!scopeMenuRef.value?.contains(event.target as Node)) {
    scopeOpen.value = false;
  }
};

const focusComposer = async () => {
  await nextTick();

  if (!textareaRef.value) {
    return;
  }

  const length = textareaRef.value.value.length;
  textareaRef.value.focus();
  textareaRef.value.setSelectionRange(length, length);
};

const submit = () => {
  if (props.streaming) {
    emit("stop");
    return;
  }

  if (props.disabled || !hasContent.value) {
    return;
  }

  emit("submit", {
    message: props.modelValue.trim(),
    capabilities: promptCapabilities.value,
    knowledgeBaseId: props.selectedKnowledgeBaseId || undefined,
  });
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    submit();
  }
};

watch(() => props.modelValue, resizeTextarea, { immediate: true });

watch(
  () => props.capabilities,
  (value) => {
    thinkEnabled.value = Boolean(value?.think);
    rewriteEnabled.value = value?.rewrite !== false;
  },
  { immediate: true, deep: true },
);

watch(
  promptCapabilities,
  (value) => {
    emit("update:capabilities", value);
  },
  { immediate: true, deep: true },
);

onMounted(() => {
  void resizeTextarea();
  document.addEventListener("pointerdown", closeScopeOnOutsideClick);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", closeScopeOnOutsideClick);
});

defineExpose({
  focusComposer,
});
</script>

<template>
  <div class="prompt-shell" :class="{ 'is-streaming': streaming }">
    <div class="prompt-input-row">
      <div class="prompt-textarea">
        <textarea
          ref="textareaRef"
          :value="modelValue"
          :disabled="disabled || streaming"
          :placeholder="currentPlaceholder"
          class="prompt-input"
          @input="updateValue"
          @keydown="handleKeydown"
        />
      </div>
    </div>

    <div class="prompt-footer">
      <div class="prompt-tools">
        <button
          type="button"
          class="prompt-tool"
          :class="{ 'is-on': thinkEnabled }"
          :disabled="disabled || streaming"
          @click="toggleThinkMode"
        >
          <Brain :size="17" />
          <span>深度思考</span>
        </button>

        <div ref="scopeMenuRef" class="prompt-scope">
          <button
            type="button"
            class="prompt-tool prompt-scope__trigger"
            :disabled="disabled || streaming"
            :aria-expanded="scopeOpen"
            aria-haspopup="listbox"
            aria-label="选择检索范围"
            @click.stop="scopeOpen = !scopeOpen"
          >
            <BookOpen :size="17" />
            <span class="book-open-back">{{ selectedScopeLabel }}</span>
            <ChevronDown :size="14" :class="{ 'is-open': scopeOpen }" />
          </button>
          <select
            v-model="selectedKnowledgeBaseSelectValue"
            :disabled="disabled || streaming"
            aria-label="检索知识库"
          >
            <option :value="ALL_KNOWLEDGE_BASES_VALUE">全库检索</option>
            <option
              v-for="base in knowledgeBases"
              :key="base.id"
              :value="base.id"
            >
              {{ base.name }}
            </option>
          </select>
          <div v-if="scopeOpen" class="prompt-scope__menu" role="listbox">
            <button
              type="button"
              role="option"
              :aria-selected="!selectedKnowledgeBaseId"
              @click="selectKnowledgeScope(ALL_KNOWLEDGE_BASES_VALUE)"
            >
              <span>
                <strong>全库搜索</strong>
                <small>搜索全部知识库</small>
              </span>
              <Check v-if="!selectedKnowledgeBaseId" :size="15" />
            </button>
            <button
              v-for="base in knowledgeBases"
              :key="base.id"
              type="button"
              role="option"
              :aria-selected="selectedKnowledgeBaseId === base.id"
              @click="selectKnowledgeScope(base.id)"
            >
              <span>
                <strong>{{ base.name }}</strong>
                <small>仅搜索此知识库</small>
              </span>
              <Check v-if="selectedKnowledgeBaseId === base.id" :size="15" />
            </button>
          </div>
        </div>

        <button
          type="button"
          class="prompt-tool"
          :class="{ 'is-on': rewriteEnabled }"
          :disabled="disabled || streaming"
          @click="updateRewriteEnabled(!rewriteEnabled)"
        >
          <Sparkles :size="16" />
          <span>查询改写</span>
        </button>
      </div>

      <button
        type="button"
        class="prompt-submit"
        :aria-label="streaming ? '停止生成' : '发送消息'"
        :disabled="!streaming && !hasContent"
        @click="submit"
      >
        <Square v-if="streaming" :size="15" />
        <ArrowUp v-else :size="18" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.prompt-shell {
  padding: 13px 15px 11px;
  border: 1px solid #d8d8d1;
  border-radius: 13px;
  background: #fff;
  box-shadow: 0 7px 8px rgba(30, 30, 25, 0.06);
}
.prompt-input-row {
  display: flex;
  align-items: flex-end;
}
.prompt-textarea {
  min-width: 0;
  flex: 1;
}
.prompt-input {
  display: block;
  width: 100%;
  min-height: 40px;
  resize: none;
  border: 0;
  background: transparent;
  padding: 4px 5px;
  color: #191918;
  font:
    15px/1.7 ui-serif,
    Georgia,
    "Songti SC",
    serif;
  outline: 0;
}
.prompt-input::placeholder {
  color: #9a9a93;
}
.prompt-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.prompt-tools {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
}
.prompt-tool {
  display: flex;
  height: 31px;
  align-items: center;
  gap: 7px;
  padding: 0 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #696963;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}
.prompt-tool:hover {
  background: #efefea;
  color: #191918;
}
.prompt-tool.is-on {
  background: #f0efff;
  color: #4d4dd1;
}
.prompt-tool:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.prompt-scope select {
  display: none;
}
.prompt-scope {
  position: relative;
}
.prompt-scope__trigger {
  max-width: 180px;
}
.prompt-scope__trigger svg:last-child {
  color: #999991;
  transition: transform 160ms ease-out;
}
.prompt-scope__trigger svg:last-child.is-open {
  transform: rotate(180deg);
}
.prompt-scope__menu {
  position: absolute;
  z-index: 20;
  right: 0;
  bottom: calc(100% + 9px);
  width: 224px;
  padding: 5px;
  border: 1px solid #d8d8d1;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 8px 18px rgba(25, 25, 24, 0.12);
}
.prompt-scope__menu button {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #30302c;
  text-align: left;
  cursor: pointer;
}
.prompt-scope__menu button:hover,
.prompt-scope__menu button[aria-selected="true"] {
  background: #f2f1ff;
  color: #4d4dd1;
}
.prompt-scope__menu button > span {
  display: grid;
  min-width: 0;
  gap: 3px;
}
.prompt-scope__menu strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
}
.prompt-scope__menu small {
  color: #8a8a83;
  font-size: 10px;
}
.prompt-scope__menu button[aria-selected="true"] small {
  color: #7777d9;
}
.prompt-submit {
  display: grid;
  width: 34px;
  height: 34px;
  flex: none;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: #e8e8e3;
  color: #777770;
  cursor: pointer;
}
.prompt-submit:not(:disabled):hover {
  background: #5b5bf7;
  color: #fff;
}
.prompt-submit:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
@media (max-width: 620px) {
  .prompt-tool span {
    display: none;
  }
  .prompt-scope__trigger {
    max-width: 118px;
  }
  .prompt-scope__menu {
    right: -36px;
  }
  .prompt-tools {
    gap: 1px;
  }
}
 .book-open-back {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
 }
</style>
