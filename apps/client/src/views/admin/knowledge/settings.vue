<script setup lang="ts">
import { ElMessage } from "element-plus";
import {
  ChevronDown,
  RefreshCw,
  Save,
  SlidersHorizontal,
} from "lucide-vue-next";
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";

import { useKnowledgeBases } from "@/composables/knowledge/useKnowledgeBases";
import {
  findGlobalRuntimeConfigAPI,
  updateGlobalRuntimeConfigAPI,
} from "@/servers/knowledge";
import {
  DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG,
  KNOWLEDGE_RUNTIME_CONFIG_LIMITS,
  type KnowledgeBaseRuntimeConfig,
  type KnowledgeGlobalRuntimeSettings,
  type KnowledgeQueryMapping,
} from "share-type";

withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false });

type RuntimeScopeSummary = {
  scopeLabel: string;
  targetLabel: string;
  documentCount: number;
  updatedAt: string;
  description: string;
};

type RuntimeFieldRule = {
  min: number;
  max: number;
  step?: number;
  hint: string;
};

const runtimeFieldRules = {
  previewTopK: {
    ...KNOWLEDGE_RUNTIME_CONFIG_LIMITS.previewTopK,
    hint: "管理端检索预览返回的 chunk 数。",
  },
  workspaceTopK: {
    ...KNOWLEDGE_RUNTIME_CONFIG_LIMITS.workspaceTopK,
    hint: "工作台问答默认注入并展示的 chunk 数。",
  },
  candidateMultiplier: {
    ...KNOWLEDGE_RUNTIME_CONFIG_LIMITS.candidateMultiplier,
    hint: "按 TopK 放大候选池。",
  },
  minCandidateLimit: {
    ...KNOWLEDGE_RUNTIME_CONFIG_LIMITS.minCandidateLimit,
    hint: "候选池最小数量。",
  },
  maxCandidateLimit: {
    ...KNOWLEDGE_RUNTIME_CONFIG_LIMITS.maxCandidateLimit,
    hint: "候选池最大数量。",
  },
  bm25Weight: {
    ...KNOWLEDGE_RUNTIME_CONFIG_LIMITS.bm25Weight,
    step: 0.1,
    hint: "控制 BM25 融合权重。",
  },
  vectorWeight: {
    ...KNOWLEDGE_RUNTIME_CONFIG_LIMITS.vectorWeight,
    step: 0.1,
    hint: "控制向量召回融合权重。",
  },
  queryAnalysisTemperature: {
    ...KNOWLEDGE_RUNTIME_CONFIG_LIMITS.queryAnalysisTemperature,
    step: 0.1,
    hint: "控制 Query Analysis 温度。",
  },
  answerTemperature: {
    ...KNOWLEDGE_RUNTIME_CONFIG_LIMITS.answerTemperature,
    step: 0.1,
    hint: "控制回答生成温度。",
  },
} satisfies Record<string, RuntimeFieldRule>;

const route = useRoute();
const { knowledgeBases, loadKnowledgeBases, updateKnowledgeBase } =
  useKnowledgeBases();
const globalRuntimeSettings = ref<KnowledgeGlobalRuntimeSettings | null>(null);

// 空字符串表示全库搜索，对应运行时不传 knowledgeBaseId。
const selectedKnowledgeBaseId = ref("");
const saving = ref(false);
const configOpen = ref(true);

const form = reactive(createRuntimeConfigState());

const preferredKnowledgeBaseId = computed(() =>
  typeof route.query.kbId === "string" ? route.query.kbId : "",
);
const isGlobalScope = computed(() => !selectedKnowledgeBaseId.value);
const selectedKnowledgeBase = computed(
  () =>
    knowledgeBases.value.find(
      (item) => item.id === selectedKnowledgeBaseId.value,
    ) ?? null,
);
const canSave = computed(
  () => isGlobalScope.value || Boolean(selectedKnowledgeBase.value),
);
const selectedSummary = computed<RuntimeScopeSummary | null>(() => {
  if (isGlobalScope.value) {
    return {
      scopeLabel: "全局默认",
      targetLabel: "全部知识库",
      documentCount: knowledgeBases.value.reduce(
        (total, item) => total + item.documentCount,
        0,
      ),
      updatedAt: formatDateTime(globalRuntimeSettings.value?.updatedAt),
      description: "全库检索的默认参数。",
    };
  }

  if (!selectedKnowledgeBase.value) {
    return null;
  }

  return {
    scopeLabel: "单库覆盖",
    targetLabel: selectedKnowledgeBase.value.name,
    documentCount: selectedKnowledgeBase.value.documentCount,
    updatedAt: formatDateTime(selectedKnowledgeBase.value.updatedAt),
    description:
      selectedKnowledgeBase.value.description?.trim() || "当前知识库暂无描述。",
  };
});

const syncFormFromSelection = () => {
  if (isGlobalScope.value) {
    applyRuntimeConfigToForm(globalRuntimeSettings.value?.runtimeConfig);
    return;
  }

  applyRuntimeConfigToForm(selectedKnowledgeBase.value?.runtimeConfig);
};

const handleReset = () => {
  applyRuntimeConfigToForm(DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG);
};

const selectScope = (scope: "global" | "single") => {
  selectedKnowledgeBaseId.value =
    scope === "global"
      ? ""
      : selectedKnowledgeBaseId.value || knowledgeBases.value[0]?.id || "";
};

// 作用域切换只更新表单，不自动保存，避免刷新进入页面就隐式提交。
const handleSave = async () => {
  if (saving.value || !canSave.value) return;

  saving.value = true;

  try {
    const queryMappings = normalizeQueryMappingsForSave();
    if (isGlobalScope.value) {
      globalRuntimeSettings.value = (
        await updateGlobalRuntimeConfigAPI(buildRuntimeConfigPayload(queryMappings))
      ).data;
      ElMessage.success("全库默认参数已保存");
    } else if (selectedKnowledgeBase.value) {
      await updateKnowledgeBase(selectedKnowledgeBaseId.value, {
        runtimeConfig: buildRuntimeConfigPayload(queryMappings),
      });
      ElMessage.success("知识库参数已保存");
    }

    syncFormFromSelection();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存参数失败");
  } finally {
    saving.value = false;
  }
};

watch(selectedKnowledgeBaseId, () => {
  syncFormFromSelection();
});

onMounted(async () => {
  try {
    const [knowledgeBaseResponse, globalRuntimeSettingsResponse] =
      await Promise.all([
        knowledgeBases.value.length ? Promise.resolve() : loadKnowledgeBases(),
        findGlobalRuntimeConfigAPI(),
      ]);

    void knowledgeBaseResponse;
    globalRuntimeSettings.value = globalRuntimeSettingsResponse.data;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "鍔犺浇鍙傛暟澶辫触");
    globalRuntimeSettings.value = {
      runtimeConfig: DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG,
      createdAt: null,
      updatedAt: null,
    };
  }

  if (
    preferredKnowledgeBaseId.value &&
    knowledgeBases.value.some(
      (item) => item.id === preferredKnowledgeBaseId.value,
    )
  ) {
    selectedKnowledgeBaseId.value = preferredKnowledgeBaseId.value;
  } else {
    selectedKnowledgeBaseId.value = "";
  }

  syncFormFromSelection();
});

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  const seconds = String(parsed.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function createRuntimeConfigState(): KnowledgeBaseRuntimeConfig {
  return {
    retrieval: {
      previewTopK: DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.previewTopK,
      workspaceTopK:
        DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.workspaceTopK,
      candidateMultiplier:
        DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.candidateMultiplier,
      minCandidateLimit:
        DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.minCandidateLimit,
      maxCandidateLimit:
        DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.maxCandidateLimit,
      bm25Weight: DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.bm25Weight,
      vectorWeight:
        DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.vectorWeight,
      queryAnalysisEnabled:
        DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.queryAnalysisEnabled,
      queryAnalysisTemperature:
        DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval
          .queryAnalysisTemperature,
      queryMappings: [
        ...DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.queryMappings,
      ],
    },
    answer: {
      temperature: DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.answer.temperature,
    },
  };
}

// 显式逐字段写回表单，避免 structuredClone 和响应式代理混用导致异常。
function applyRuntimeConfigToForm(
  source?: KnowledgeBaseRuntimeConfig | null,
): void {
  const resolved = source ?? DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG;

  form.retrieval.previewTopK = resolved.retrieval.previewTopK;
  form.retrieval.workspaceTopK = resolved.retrieval.workspaceTopK;
  form.retrieval.candidateMultiplier = resolved.retrieval.candidateMultiplier;
  form.retrieval.minCandidateLimit = resolved.retrieval.minCandidateLimit;
  form.retrieval.maxCandidateLimit = resolved.retrieval.maxCandidateLimit;
  form.retrieval.bm25Weight = resolved.retrieval.bm25Weight;
  form.retrieval.vectorWeight = resolved.retrieval.vectorWeight;
  form.retrieval.queryAnalysisEnabled = resolved.retrieval.queryAnalysisEnabled;
  form.retrieval.queryAnalysisTemperature =
    resolved.retrieval.queryAnalysisTemperature;
  form.retrieval.queryMappings = [...resolved.retrieval.queryMappings];
  form.answer.temperature = resolved.answer.temperature;
}

function buildRuntimeConfigPayload(
  queryMappings: KnowledgeQueryMapping[],
): KnowledgeBaseRuntimeConfig {
  return {
    retrieval: {
      previewTopK: form.retrieval.previewTopK,
      workspaceTopK: form.retrieval.workspaceTopK,
      candidateMultiplier: form.retrieval.candidateMultiplier,
      minCandidateLimit: form.retrieval.minCandidateLimit,
      maxCandidateLimit: form.retrieval.maxCandidateLimit,
      bm25Weight: form.retrieval.bm25Weight,
      vectorWeight: form.retrieval.vectorWeight,
      queryAnalysisEnabled: form.retrieval.queryAnalysisEnabled,
      queryAnalysisTemperature: form.retrieval.queryAnalysisTemperature,
      queryMappings,
    },
    answer: {
      temperature: form.answer.temperature,
    },
  };
}

function normalizeQueryMappingsForSave(): KnowledgeQueryMapping[] {
  return form.retrieval.queryMappings
    .map((mapping) => ({
      trigger: mapping.trigger.trim(),
      terms: mapping.terms.map((term) => term.trim()).filter(Boolean),
    }))
    .filter((mapping) => mapping.trigger && mapping.terms.length > 0);
}

</script>

<template>
  <section class="settings-stage" :class="{ 'is-embedded': embedded }">
    <div class="settings-stage__canvas">
      <section v-if="embedded" class="runtime-settings">
        <button
          class="settings-heading"
          type="button"
          :aria-expanded="configOpen"
          @click="configOpen = !configOpen"
        >
          <span>
            <SlidersHorizontal class="h-4 w-4" />
            <span>
              <strong>{{ isGlobalScope ? '全局默认参数' : '单库覆盖参数' }}</strong>
              <small>{{ isGlobalScope ? '用于未指定知识库的全库搜索' : selectedKnowledgeBase?.name }}</small>
            </span>
          </span>
          <ChevronDown class="h-4 w-4" :class="{ 'is-open': configOpen }" />
        </button>

        <Transition name="disclosure">
          <div v-if="configOpen" class="runtime-body">
            <section class="runtime-scope">
              <header>
                <h3>作用范围</h3>
                <span>先选全局默认，或覆盖某一个知识库</span>
              </header>
              <div class="runtime-scope__options" role="group" aria-label="参数作用范围">
                <button type="button" :class="{ 'is-active': isGlobalScope }" :aria-pressed="isGlobalScope" @click="selectScope('global')">
                  全局默认
                </button>
                <button type="button" :class="{ 'is-active': !isGlobalScope }" :aria-pressed="!isGlobalScope" :disabled="!knowledgeBases.length" @click="selectScope('single')">
                  单库覆盖
                </button>
              </div>
              <el-select
                v-if="!isGlobalScope"
                v-model="selectedKnowledgeBaseId"
                class="runtime-scope__select"
                popper-class="knowledge-scope-select-popper"
                aria-label="选择覆盖知识库"
              >
                <el-option v-for="item in knowledgeBases" :key="item.id" :label="item.name" :value="item.id" />
              </el-select>
            </section>

            <section class="runtime-group">
              <h3>召回参数</h3>
              <label><span>回答片段数 <small>workspaceTopK</small></span><input v-model.number="form.retrieval.workspaceTopK" type="number" :min="runtimeFieldRules.workspaceTopK.min" :max="runtimeFieldRules.workspaceTopK.max" /></label>
              <label><span>预览片段数 <small>previewTopK</small></span><input v-model.number="form.retrieval.previewTopK" type="number" :min="runtimeFieldRules.previewTopK.min" :max="runtimeFieldRules.previewTopK.max" /></label>
              <label><span>候选倍数 <small>candidateMultiplier</small></span><input v-model.number="form.retrieval.candidateMultiplier" type="number" :min="runtimeFieldRules.candidateMultiplier.min" :max="runtimeFieldRules.candidateMultiplier.max" /></label>
              <label><span>候选下限 <small>minCandidateLimit</small></span><input v-model.number="form.retrieval.minCandidateLimit" type="number" :min="runtimeFieldRules.minCandidateLimit.min" :max="runtimeFieldRules.minCandidateLimit.max" /></label>
              <label><span>候选上限 <small>maxCandidateLimit</small></span><input v-model.number="form.retrieval.maxCandidateLimit" type="number" :min="runtimeFieldRules.maxCandidateLimit.min" :max="runtimeFieldRules.maxCandidateLimit.max" /></label>
            </section>

            <section class="runtime-group">
              <h3>排序与生成</h3>
              <label><span>启用 Query Analysis <small>queryAnalysisEnabled</small></span><el-switch v-model="form.retrieval.queryAnalysisEnabled" /></label>
              <label><span>BM25 权重 <small>bm25Weight</small></span><input v-model.number="form.retrieval.bm25Weight" type="number" :min="runtimeFieldRules.bm25Weight.min" :max="runtimeFieldRules.bm25Weight.max" :step="runtimeFieldRules.bm25Weight.step" /></label>
              <label><span>向量权重 <small>vectorWeight</small></span><input v-model.number="form.retrieval.vectorWeight" type="number" :min="runtimeFieldRules.vectorWeight.min" :max="runtimeFieldRules.vectorWeight.max" :step="runtimeFieldRules.vectorWeight.step" /></label>
              <label><span>分析温度 <small>queryAnalysisTemperature</small></span><input v-model.number="form.retrieval.queryAnalysisTemperature" type="number" :min="runtimeFieldRules.queryAnalysisTemperature.min" :max="runtimeFieldRules.queryAnalysisTemperature.max" :step="runtimeFieldRules.queryAnalysisTemperature.step" /></label>
              <label><span>回答温度 <small>temperature</small></span><input v-model.number="form.answer.temperature" type="number" :min="runtimeFieldRules.answerTemperature.min" :max="runtimeFieldRules.answerTemperature.max" :step="runtimeFieldRules.answerTemperature.step" /></label>
            </section>

            <footer class="runtime-footer">
              <span>{{ selectedSummary?.targetLabel }} · {{ selectedSummary?.updatedAt }}</span>
              <button type="button" class="runtime-reset" @click="handleReset"><RefreshCw class="h-4 w-4" />恢复默认</button>
              <button type="button" class="runtime-save" :disabled="saving || !canSave" @click="handleSave"><Save class="h-4 w-4" />{{ saving ? '保存中' : '保存配置' }}</button>
            </footer>
          </div>
        </Transition>
      </section>

      <header v-if="!embedded" class="settings-stage__header">
        <div>
          <p class="settings-stage__eyebrow">KNOWLEDGE RUNTIME</p>
          <h1 class="settings-stage__title">检索与问答参数</h1>
          <p class="settings-stage__subtitle">调整检索范围、候选数量与回答参数。</p>
        </div>

        <div class="settings-stage__actions">
          <button type="button" class="settings-button settings-button--ghost" @click="handleReset"><RefreshCw class="h-4 w-4" />恢复默认</button>
          <button type="button" class="settings-button settings-button--primary" :disabled="saving || !canSave" @click="handleSave"><Save class="h-4 w-4" />{{ saving ? '保存中' : '保存参数' }}</button>
        </div>
      </header>

      <div v-if="!embedded" class="settings-shell">
        <section class="settings-card">
          <div class="settings-card__header">
            <div>
              <h2>作用范围</h2>
              <p>先确认参数是保存到全局，还是只覆盖某一个知识库。</p>
            </div>
          </div>

          <div class="settings-scope-switch" role="group" aria-label="参数作用范围">
            <button type="button" :class="{ 'is-active': isGlobalScope }" :aria-pressed="isGlobalScope" @click="selectScope('global')">
              <strong>全局默认</strong>
              <span>全库检索时生效</span>
            </button>
            <button type="button" :class="{ 'is-active': !isGlobalScope }" :aria-pressed="!isGlobalScope" :disabled="!knowledgeBases.length" @click="selectScope('single')">
              <strong>单库覆盖</strong>
              <span>只影响选中的知识库</span>
            </button>
          </div>

          <div v-if="!isGlobalScope" class="settings-field settings-field--scope">
            <label for="knowledge-base-select">覆盖目标</label>
            <el-select id="knowledge-base-select" v-model="selectedKnowledgeBaseId" class="settings-select settings-select--compact" popper-class="knowledge-scope-select-popper">
              <el-option v-for="item in knowledgeBases" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
          </div>

          <div v-if="selectedSummary" class="settings-kb-summary">
            <div class="settings-kb-summary__item"><small>保存位置</small><strong>{{ selectedSummary.scopeLabel }}</strong></div>
            <div class="settings-kb-summary__item"><small>目标对象</small><strong>{{ selectedSummary.targetLabel }}</strong></div>
            <div class="settings-kb-summary__item"><small>文档数量</small><strong>{{ selectedSummary.documentCount }}</strong></div>
            <div class="settings-kb-summary__item"><small>最近更新</small><strong>{{ selectedSummary.updatedAt }}</strong></div>
            <p class="settings-kb-summary__description">{{ selectedSummary.description }}</p>
          </div>
        </section>

        <section class="settings-card settings-card--notice">
          <div class="settings-card__header">
            <div>
              <h2>作用说明</h2>
              <p>这组参数会直接影响候选池规模、融合排序、Query Analysis 和回答生成行为。</p>
            </div>
          </div>

          <div class="settings-notice-list">
            <p>1. BM25 与向量权重在这里显式配置，不再由 LLM rewrite 动态改写。</p>
            <p>2. Query Analysis 是否执行，仍然尊重前端开关和后端运行配置。</p>
            <p>3. <code>workspaceTopK</code> 会影响工作台默认参与回答和展示的 chunk 数量。</p>
            <p>4. 全局默认和单库覆盖现在有独立配置路径，避免误把单库参数写进全局。</p>
          </div>
        </section>

        <section class="settings-card">
          <div class="settings-card__header">
            <div>
              <h2>召回参数</h2>
              <p>控制预览、工作台、候选池规模、融合权重以及 Query Analysis 行为。</p>
            </div>
          </div>

          <div class="settings-grid">
            <div class="settings-field"><div class="settings-field__heading"><label>Preview TopK</label><span>{{ runtimeFieldRules.previewTopK.hint }}</span></div><input v-model.number="form.retrieval.previewTopK" type="number" :min="runtimeFieldRules.previewTopK.min" :max="runtimeFieldRules.previewTopK.max" /></div>
            <div class="settings-field"><div class="settings-field__heading"><label>Workspace TopK</label><span>{{ runtimeFieldRules.workspaceTopK.hint }}</span></div><input v-model.number="form.retrieval.workspaceTopK" type="number" :min="runtimeFieldRules.workspaceTopK.min" :max="runtimeFieldRules.workspaceTopK.max" /></div>
            <div class="settings-field"><div class="settings-field__heading"><label>Candidate Multiplier</label><span>{{ runtimeFieldRules.candidateMultiplier.hint }}</span></div><input v-model.number="form.retrieval.candidateMultiplier" type="number" :min="runtimeFieldRules.candidateMultiplier.min" :max="runtimeFieldRules.candidateMultiplier.max" /></div>
            <div class="settings-field"><div class="settings-field__heading"><label>Min Candidate Limit</label><span>{{ runtimeFieldRules.minCandidateLimit.hint }}</span></div><input v-model.number="form.retrieval.minCandidateLimit" type="number" :min="runtimeFieldRules.minCandidateLimit.min" :max="runtimeFieldRules.minCandidateLimit.max" /></div>
            <div class="settings-field"><div class="settings-field__heading"><label>Max Candidate Limit</label><span>{{ runtimeFieldRules.maxCandidateLimit.hint }}</span></div><input v-model.number="form.retrieval.maxCandidateLimit" type="number" :min="runtimeFieldRules.maxCandidateLimit.min" :max="runtimeFieldRules.maxCandidateLimit.max" /></div>
            <div class="settings-field settings-field--switch"><div class="settings-field__heading"><label>启用 Query Analysis</label><span>决定是否先让 LLM 做检索问题分析和改写</span></div><el-switch v-model="form.retrieval.queryAnalysisEnabled" /></div>
            <div class="settings-field"><div class="settings-field__heading"><label>BM25 Weight</label><span>{{ runtimeFieldRules.bm25Weight.hint }}</span></div><input v-model.number="form.retrieval.bm25Weight" type="number" :min="runtimeFieldRules.bm25Weight.min" :max="runtimeFieldRules.bm25Weight.max" :step="runtimeFieldRules.bm25Weight.step" /></div>
            <div class="settings-field"><div class="settings-field__heading"><label>Vector Weight</label><span>{{ runtimeFieldRules.vectorWeight.hint }}</span></div><input v-model.number="form.retrieval.vectorWeight" type="number" :min="runtimeFieldRules.vectorWeight.min" :max="runtimeFieldRules.vectorWeight.max" :step="runtimeFieldRules.vectorWeight.step" /></div>
            <div class="settings-field"><div class="settings-field__heading"><label>Query Analysis Temperature</label><span>{{ runtimeFieldRules.queryAnalysisTemperature.hint }}</span></div><input v-model.number="form.retrieval.queryAnalysisTemperature" type="number" :min="runtimeFieldRules.queryAnalysisTemperature.min" :max="runtimeFieldRules.queryAnalysisTemperature.max" :step="runtimeFieldRules.queryAnalysisTemperature.step" /></div>
          </div>
        </section>

        <section class="settings-card">
          <div class="settings-card__header">
            <div>
              <h2>回答参数</h2>
              <p>控制最终回答生成温度。</p>
            </div>
          </div>

          <div class="settings-grid settings-grid--compact">
            <div class="settings-field"><div class="settings-field__heading"><label>Answer Temperature</label><span>{{ runtimeFieldRules.answerTemperature.hint }}</span></div><input v-model.number="form.answer.temperature" type="number" :min="runtimeFieldRules.answerTemperature.min" :max="runtimeFieldRules.answerTemperature.max" :step="runtimeFieldRules.answerTemperature.step" /></div>
          </div>
        </section>
      </div>
    </div>
  </section>
</template>

<style scoped>
.settings-stage {
  padding: 8px 0 28px;
}
.settings-stage.is-embedded {
  padding: 0;
}
.is-embedded .settings-stage__canvas {
  max-width: none;
}
.is-embedded .settings-shell {
  gap: 0;
  border-top: 1px solid #e8e8e2;
}
.is-embedded .settings-card {
  border: 0;
  border-bottom: 1px solid #e8e8e2;
  border-radius: 0;
  background: transparent;
  padding: 22px 4px;
  box-shadow: none;
}
.is-embedded .settings-card--notice {
  display: none;
}
.is-embedded .settings-grid {
  gap: 12px 24px;
}
.is-embedded .settings-field input {
  border-color: #d8d8d1;
  border-radius: 7px;
}
.is-embedded .settings-button {
  border-radius: 8px;
}

.runtime-settings {
  border-top: 1px solid #d8d8d1;
  border-bottom: 1px solid #d8d8d1;
}

.settings-heading {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  border: 0;
  background: transparent;
  padding: 20px 4px;
  color: #191918;
  cursor: pointer;
}

.settings-heading > span {
  display: flex;
  align-items: center;
  gap: 12px;
}

.settings-heading > span > span {
  display: grid;
  gap: 4px;
  text-align: left;
}

.settings-heading strong {
  font:
    600 17px ui-serif,
    Georgia,
    "Songti SC",
    serif;
}

.settings-heading small {
  color: #777770;
  font-size: 11px;
}

.settings-heading > svg {
  transition: transform 200ms ease;
}

.settings-heading > svg.is-open {
  transform: rotate(180deg);
}

.runtime-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 28px 38px;
  padding: 10px 4px 25px;
}

.runtime-scope {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: minmax(180px, 1fr) auto minmax(220px, 300px);
  align-items: center;
  gap: 20px;
  padding-bottom: 18px;
  border-bottom: 1px solid #e8e8e2;
}

.runtime-scope header {
  display: grid;
  gap: 4px;
}

.runtime-scope h3,
.runtime-group h3 {
  margin: 0;
  color: #191918;
  font-size: 13px;
}

.runtime-scope header span {
  color: #777770;
  font-size: 11px;
}

.runtime-scope__options {
  display: flex;
  gap: 4px;
  padding: 3px;
  border: 1px solid #e8e8e2;
  border-radius: 8px;
}

.runtime-scope__options button {
  border: 0;
  border-radius: 6px;
  background: transparent;
  padding: 7px 10px;
  color: #777770;
  font-size: 12px;
}

.runtime-scope__options button.is-active {
  background: #f0efff;
  color: #4d4dd1;
}

.runtime-scope__options button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.runtime-scope__select {
  width: 100%;
}

.runtime-scope__select :deep(.el-select__wrapper) {
  min-height: 34px;
  border-radius: 6px;
  background: #fff;
  box-shadow: 0 0 0 1px #e8e8e2 inset;
}

.runtime-group label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 12px 0;
  border-top: 1px solid #e8e8e2;
}

.runtime-group label > span {
  display: grid;
  gap: 3px;
  color: #44443f;
  font-size: 12px;
}

.runtime-group small {
  color: #777770;
  font:
    10px ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
}

.runtime-group input {
  width: 80px;
  border: 1px solid #e8e8e2;
  border-radius: 6px;
  background: #fff;
  padding: 7px 8px;
  color: #191918;
  text-align: right;
  outline: 0;
}

.runtime-footer {
  display: flex;
  grid-column: 1 / -1;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 7px;
  border-top: 1px solid #e8e8e2;
}

.runtime-footer > span {
  margin-right: auto;
  color: #777770;
  font-size: 11px;
}

.runtime-footer button {
  display: inline-flex;
  height: 34px;
  align-items: center;
  gap: 7px;
  border-radius: 7px;
  padding: 0 10px;
  font-size: 12px;
}

.runtime-reset {
  border: 1px solid #d8d8d1;
  background: #fff;
  color: #55554f;
}

.runtime-save {
  border: 1px solid #5b5bf7;
  background: #5b5bf7;
  color: #fff;
}

.runtime-save:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.disclosure-enter-active,
.disclosure-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.disclosure-enter-from,
.disclosure-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.settings-stage__canvas {
  margin: 0 auto;
  max-width: 1240px;
}

.settings-stage__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
}

.settings-stage__eyebrow {
  font-size: 12px;
  font-weight: 800;
  color: #0f766e;
}

.settings-stage__title {
  margin-top: 4px;
  font-size: 32px;
  font-weight: 800;
  color: #0f172a;
}

.settings-stage__subtitle {
  margin-top: 8px;
  max-width: 760px;
  color: #64748b;
  line-height: 1.7;
}

.settings-stage__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.settings-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 12px;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.settings-button--ghost {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
}

.settings-button--primary {
  border: 0;
  background: #0f766e;
  color: #fff;
}

.settings-button:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.settings-shell {
  display: grid;
  gap: 16px;
}

.settings-card {
  border: 1px solid #dbe4ee;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
  padding: 22px 24px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.04);
}

.settings-card__header h2 {
  font-size: 18px;
  font-weight: 800;
  color: #0f172a;
}

.settings-card__header p {
  margin-top: 6px;
  color: #64748b;
  line-height: 1.7;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 18px;
}

.settings-grid--compact {
  grid-template-columns: minmax(0, 280px);
}

.settings-field {
  display: grid;
  gap: 8px;
  margin-top: 18px;
}

.settings-field--scope {
  max-width: 300px;
}

.settings-scope-switch {
  display: flex;
  width: min(100%, 560px);
  gap: 8px;
  margin-top: 18px;
  padding: 4px;
  border: 1px solid #d8d8d1;
  border-radius: 10px;
  background: #f5f5f1;
}

.settings-scope-switch button {
  display: grid;
  flex: 1;
  gap: 3px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  padding: 10px 12px;
  color: #6b7280;
  text-align: left;
  transition:
    background 180ms ease,
    color 180ms ease;
}

.settings-scope-switch button:hover:not(:disabled) {
  color: #334155;
}

.settings-scope-switch button.is-active {
  background: #fff;
  color: #0f172a;
  box-shadow: 0 1px 3px rgb(15 23 42 / 8%);
}

.settings-scope-switch button:focus-visible {
  outline: 2px solid #0f766e;
  outline-offset: 1px;
}

.settings-scope-switch button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.settings-scope-switch strong {
  font-size: 13px;
}

.settings-scope-switch span {
  font-size: 11px;
}

.settings-field__heading {
  display: grid;
  gap: 4px;
}

.settings-field label {
  font-size: 13px;
  font-weight: 700;
  color: #475569;
}

.settings-field__heading span {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.5;
}

.settings-field input,
.settings-field textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #fff;
  padding: 11px 12px;
  color: #0f172a;
  outline: none;
}

.settings-field textarea {
  resize: vertical;
  font:
    12px/1.65 ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
}

.settings-field--wide {
  grid-column: 1 / -1;
}

.query-mapping-list {
  display: grid;
  gap: 10px;
}

.query-mapping-row {
  display: grid;
  grid-template-columns: minmax(150px, 0.7fr) minmax(220px, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.query-mapping-row__remove,
.query-mapping-add {
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #fff;
  padding: 10px 12px;
  color: #475569;
  font-size: 12px;
  cursor: pointer;
}

.query-mapping-row__remove:hover,
.query-mapping-add:hover {
  border-color: #0f766e;
  color: #0f766e;
}

.query-mapping-add {
  justify-self: start;
}

.settings-field input:focus,
.settings-field textarea:focus {
  border-color: #0f766e;
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.12);
}

.settings-select--compact {
  width: 100%;
  min-width: 0;
}

.settings-select--compact :deep(.el-select__wrapper) {
  min-height: 34px;
  border-radius: 999px;
  background: #f8fafc;
  box-shadow: 0 0 0 1px #dbe4ee inset;
}

.settings-select--compact :deep(.el-select__wrapper.is-hovering),
.settings-select--compact :deep(.el-select__wrapper.is-focused) {
  box-shadow:
    0 0 0 1px #0f766e inset,
    0 0 0 3px rgba(15, 118, 110, 0.1);
}

.settings-select--compact :deep(.el-select__selected-item) {
  color: #0f172a;
  font-size: 13px;
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

.settings-field--switch {
  align-content: end;
}

.settings-kb-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid #e2e8f0;
}

.settings-kb-summary__item,
.settings-kb-summary__description {
  display: grid;
  gap: 6px;
}

.settings-kb-summary small {
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
}

.settings-kb-summary__description {
  grid-column: 1 / -1;
  margin: 0;
  color: #64748b;
  font-size: 12px;
}

.settings-kb-summary strong {
  font-size: 15px;
  color: #0f172a;
}

.settings-card--notice {
  border-color: #bfe7de;
  background: linear-gradient(
    180deg,
    rgba(240, 253, 250, 0.95),
    rgba(255, 255, 255, 0.92)
  );
}

.settings-notice-list {
  display: grid;
  gap: 8px;
  margin-top: 16px;
  color: #0f172a;
  line-height: 1.7;
}

@media (max-width: 1024px) {
  .settings-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .settings-kb-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .settings-stage__header {
    flex-direction: column;
  }

  .settings-grid,
  .settings-grid--compact,
  .settings-kb-summary,
  .query-mapping-row {
    grid-template-columns: 1fr;
  }

  .settings-scope-switch {
    flex-direction: column;
  }

  .runtime-body,
  .runtime-scope {
    grid-template-columns: 1fr;
  }

  .runtime-scope__options {
    width: fit-content;
  }

  .runtime-footer {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .runtime-footer > span {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .settings-heading > svg,
  .disclosure-enter-active,
  .disclosure-leave-active {
    transition: none;
  }
}
</style>

