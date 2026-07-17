<script setup lang="ts">
import { Eye, LoaderCircle, Save, X } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import {
  findProviderSettingsAPI,
  updateProviderSettingsAPI,
} from "@/servers/knowledge";
import type { KnowledgeProviderSettings } from "share-type";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ "update:open": [value: boolean] }>();

const settings = ref<KnowledgeProviderSettings | null>(null);
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const form = ref({
  llmBaseUrl: "",
  llmModel: "",
  ocrEnabled: false,
  ocrBaseUrl: "",
  ocrModel: "",
});
const visible = computed({
  get: () => props.open,
  set: (value: boolean) => emit("update:open", value),
});

const loadSettings = async () => {
  loading.value = true;
  error.value = "";

  try {
    const { data } = await findProviderSettingsAPI();
    settings.value = data;
    form.value = {
      llmBaseUrl: data.runtimeConfig.llm.baseUrl ?? "",
      llmModel: data.runtimeConfig.llm.model ?? "",
      ocrEnabled: data.runtimeConfig.ocr.enabled,
      ocrBaseUrl: data.runtimeConfig.ocr.baseUrl ?? "",
      ocrModel: data.runtimeConfig.ocr.model ?? "",
    };
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "设置加载失败";
  } finally {
    loading.value = false;
  }
};

const saveSettings = async () => {
  if (saving.value) return;

  saving.value = true;
  error.value = "";

  try {
    const { data } = await updateProviderSettingsAPI({
      ...form.value,
    });
    settings.value = data;
    visible.value = false;
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "设置保存失败";
  } finally {
    saving.value = false;
  }
};

watch(
  () => props.open,
  (open) => {
    if (open) {
      void loadSettings();
    }
  },
);
</script>

<template>
  <Teleport to="body">
    <Transition name="provider-dialog">
      <div v-if="visible" class="provider-dialog" @click.self="visible = false">
        <section class="provider-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="provider-settings-title">
          <header class="provider-dialog__header">
            <div>
              <span>运行设置</span>
              <h2 id="provider-settings-title">模型与识别</h2>
            </div>
            <button type="button" aria-label="关闭设置" @click="visible = false">
              <X :size="19" />
            </button>
          </header>

          <div v-if="loading" class="provider-dialog__loading">
            <LoaderCircle :size="18" /> 正在读取本地配置
          </div>

          <form v-else class="provider-dialog__body" @submit.prevent="saveSettings">
            <section class="provider-section">
              <div class="provider-section__heading">
                <div>
                  <h3>LLM</h3>
                  <p>密钥仅从本地环境读取，不会显示或保存到页面。</p>
                </div>
                <span :class="settings?.llmApiKeyConfigured ? 'is-ready' : 'is-idle'">
                  {{ settings?.llmApiKeyConfigured ? "本地已配置" : "未配置密钥" }}
                </span>
              </div>
              <label>
                <span>服务地址</span>
                <input v-model.trim="form.llmBaseUrl" placeholder="使用本地环境默认地址" />
              </label>
              <label>
                <span>模型</span>
                <input v-model.trim="form.llmModel" placeholder="使用本地环境默认模型" />
              </label>
            </section>

            <section class="provider-section">
              <div class="provider-section__heading">
                <div>
                  <h3>OCR</h3>
                  <p>未启用时保留本地文本解析；仅对需要识别的图片页调用远程 OCR。</p>
                </div>
                <span :class="settings?.ocrApiKeyConfigured ? 'is-ready' : 'is-idle'">
                  {{ settings?.ocrApiKeyConfigured ? "本地已配置" : "本地解析" }}
                </span>
              </div>
              <label class="provider-switch">
                <input v-model="form.ocrEnabled" type="checkbox" />
                <span>启用远程 OCR</span>
              </label>
              <label>
                <span>服务地址</span>
                <input v-model.trim="form.ocrBaseUrl" :disabled="!form.ocrEnabled" placeholder="使用本地环境默认地址" />
              </label>
              <label>
                <span>模型</span>
                <input v-model.trim="form.ocrModel" :disabled="!form.ocrEnabled" placeholder="使用本地环境默认模型" />
              </label>
            </section>

            <p v-if="error" class="provider-dialog__error">{{ error }}</p>
            <footer class="provider-dialog__footer">
              <span><Eye :size="15" /> 密钥保持本地不可见</span>
              <button type="submit" :disabled="saving">
                <LoaderCircle v-if="saving" class="is-spinning" :size="16" />
                <Save v-else :size="16" />
                {{ saving ? "保存中" : "保存设置" }}
              </button>
            </footer>
          </form>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.provider-dialog {
  position: fixed;
  z-index: 100;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(25, 25, 24, 0.23);
}
.provider-dialog__panel {
  width: min(620px, 100%);
  overflow: hidden;
  border: 1px solid #dcdcd6;
  border-radius: 14px;
  background: #fafaf7;
  box-shadow: 0 24px 60px rgba(25, 25, 24, 0.2);
}
.provider-dialog__header,
.provider-dialog__footer,
.provider-section__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}
.provider-dialog__header {
  min-height: 82px;
  padding: 0 23px;
  border-bottom: 1px solid #e8e8e2;
}
.provider-dialog__header span,
.provider-section p,
.provider-dialog__footer > span {
  color: #85857e;
  font-size: 12px;
}
.provider-dialog h2,
.provider-section h3,
.provider-section p {
  margin: 0;
}
.provider-dialog h2 {
  margin-top: 3px;
  font: 600 21px ui-serif, Georgia, "Songti SC", serif;
}
.provider-dialog__header button {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #55554f;
  cursor: pointer;
}
.provider-dialog__header button:hover {
  background: #efefea;
}
.provider-dialog__body {
  padding: 0 23px;
}
.provider-section {
  padding: 21px 0;
  border-bottom: 1px solid #e8e8e2;
}
.provider-section__heading {
  align-items: flex-start;
  margin-bottom: 15px;
}
.provider-section h3 {
  font: 600 16px ui-serif, Georgia, "Songti SC", serif;
}
.provider-section p {
  max-width: 380px;
  margin-top: 5px;
  line-height: 1.55;
}
.provider-section__heading > span {
  flex: none;
  padding: 4px 7px;
  border-radius: 999px;
  font-size: 11px;
}
.is-ready {
  background: #edf7f0;
  color: #397557;
}
.is-idle {
  background: #efefea;
  color: #777770;
}
.provider-section label:not(.provider-switch) {
  display: grid;
  gap: 7px;
  margin-top: 12px;
  color: #65655f;
  font-size: 12px;
}
.provider-section input:not([type="checkbox"]) {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #dcdcd6;
  border-radius: 8px;
  background: #fff;
  padding: 9px 10px;
  color: #20201e;
  font: 13px ui-monospace, SFMono-Regular, Consolas, monospace;
  outline: none;
}
.provider-section input:focus {
  border-color: #7777e8;
  box-shadow: 0 0 0 3px rgba(91, 91, 247, 0.1);
}
.provider-section input:disabled {
  background: #f1f1ed;
  color: #a2a29b;
}
.provider-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #33332f;
  font-size: 13px;
  cursor: pointer;
}
.provider-switch input {
  accent-color: #5b5bf7;
}
.provider-dialog__footer {
  min-height: 70px;
}
.provider-dialog__footer > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.provider-dialog__footer button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 0;
  border-radius: 8px;
  background: #191918;
  padding: 9px 12px;
  color: #fff;
  cursor: pointer;
}
.provider-dialog__footer button:disabled {
  cursor: wait;
  opacity: 0.65;
}
.provider-dialog__error {
  margin: 16px 0 0;
  color: #b64747;
  font-size: 12px;
}
.provider-dialog__loading {
  display: flex;
  min-height: 260px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: #777770;
  font-size: 13px;
}
.is-spinning {
  animation: provider-spin 0.9s linear infinite;
}
.provider-dialog-enter-active,
.provider-dialog-leave-active {
  transition: opacity 180ms ease;
}
.provider-dialog-enter-active .provider-dialog__panel,
.provider-dialog-leave-active .provider-dialog__panel {
  transition: transform 180ms ease, opacity 180ms ease;
}
.provider-dialog-enter-from,
.provider-dialog-leave-to {
  opacity: 0;
}
.provider-dialog-enter-from .provider-dialog__panel,
.provider-dialog-leave-to .provider-dialog__panel {
  opacity: 0;
  transform: translateY(8px);
}
@keyframes provider-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .provider-dialog-enter-active,
  .provider-dialog-leave-active,
  .provider-dialog-enter-active .provider-dialog__panel,
  .provider-dialog-leave-active .provider-dialog__panel,
  .is-spinning {
    transition: none;
    animation: none;
  }
}
</style>
