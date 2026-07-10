<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { RefreshCw, Save } from 'lucide-vue-next'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { useKnowledgeBases } from '@/composables/useKnowledgeBases'
import { findGlobalRuntimeConfigAPI, updateGlobalRuntimeConfigAPI } from '@/servers/knowledge'
import {
  DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG,
  type KnowledgeBaseRuntimeConfig,
  type KnowledgeGlobalRuntimeSettings
} from 'share-type'

type RuntimeScopeSummary = {
  scopeLabel: string
  targetLabel: string
  documentCount: number
  updatedAt: string
  description: string
}

type RuntimeFieldRule = {
  min: number
  max: number
  step?: number
  hint: string
}

const ALL_KNOWLEDGE_BASES_VALUE = '__all__'

// 这里直接对齐后端 normalize 的真实范围，避免前后端各说各话。
const runtimeFieldRules = {
  previewTopK: { min: 1, max: 50, hint: '范围 1 - 50，控制管理台检索预览返回数量' },
  workspaceTopK: { min: 1, max: 12, hint: '范围 1 - 12，控制问答默认参与回答与展示的 chunk 数' },
  candidateMultiplier: { min: 1, max: 12, hint: '范围 1 - 12，按 TopK 放大候选集' },
  minCandidateLimit: { min: 1, max: 200, hint: '范围 1 - 200，候选集最小保底数量' },
  maxCandidateLimit: { min: 1, max: 400, hint: '范围 1 - 400，候选集最大上限数量' },
  bm25Weight: { min: 0.2, max: 3, step: 0.1, hint: '范围 0.2 - 3.0，控制 BM25 融合权重' },
  vectorWeight: { min: 0.2, max: 3, step: 0.1, hint: '范围 0.2 - 3.0，控制向量召回融合权重' },
  queryAnalysisTemperature: {
    min: 0,
    max: 2,
    step: 0.1,
    hint: '范围 0.0 - 2.0，控制 Query Analysis 温度'
  },
  answerTemperature: {
    min: 0,
    max: 2,
    step: 0.1,
    hint: '范围 0.0 - 2.0，控制回答生成温度'
  }
} satisfies Record<string, RuntimeFieldRule>

const route = useRoute()
const { knowledgeBases, loadKnowledgeBases, updateKnowledgeBase } = useKnowledgeBases()
const globalRuntimeSettings = ref<KnowledgeGlobalRuntimeSettings | null>(null)

// 空字符串代表全库搜索，对应运行时不传 knowledgeBaseId。
const selectedKnowledgeBaseId = ref('')
const saving = ref(false)

// 表单只维护当前编辑态，避免直接改动列表里的响应式对象。
const form = reactive(createRuntimeConfigState())

const preferredKnowledgeBaseId = computed(() =>
  typeof route.query.kbId === 'string' ? route.query.kbId : ''
)
const selectedKnowledgeBaseSelectValue = computed({
  get: () => selectedKnowledgeBaseId.value || ALL_KNOWLEDGE_BASES_VALUE,
  set: (value: string) => {
    selectedKnowledgeBaseId.value = value === ALL_KNOWLEDGE_BASES_VALUE ? '' : value
  }
})
const isGlobalScope = computed(() => !selectedKnowledgeBaseId.value)
const selectedKnowledgeBase = computed(
  () => knowledgeBases.value.find((item) => item.id === selectedKnowledgeBaseId.value) ?? null
)
const canSave = computed(() => isGlobalScope.value || Boolean(selectedKnowledgeBase.value))
const selectedSummary = computed<RuntimeScopeSummary | null>(() => {
  if (isGlobalScope.value) {
    return {
      scopeLabel: '全库搜索',
      targetLabel: '全部知识库',
      documentCount: knowledgeBases.value.reduce((total, item) => total + item.documentCount, 0),
      updatedAt: formatDateTime(globalRuntimeSettings.value?.updatedAt),
      description:
        '这里维护全库搜索的默认运行参数。只有在聊天或检索中明确切到单库搜索时，才会改用单库自己的覆盖配置。'
    }
  }

  if (!selectedKnowledgeBase.value) {
    return null
  }

  return {
    scopeLabel: '单知识库配置',
    targetLabel: selectedKnowledgeBase.value.name,
    documentCount: selectedKnowledgeBase.value.documentCount,
    updatedAt: formatDateTime(selectedKnowledgeBase.value.updatedAt),
    description: selectedKnowledgeBase.value.description?.trim() || '当前知识库暂无描述。'
  }
})

// 根据当前选择同步表单，避免切换作用域后继续编辑旧值。
const syncFormFromSelection = () => {
  if (isGlobalScope.value) {
    applyRuntimeConfigToForm(globalRuntimeSettings.value?.runtimeConfig)
    return
  }

  applyRuntimeConfigToForm(selectedKnowledgeBase.value?.runtimeConfig)
}

// 恢复默认值时统一回到共享默认配置，避免前后端维护两套常量。
const handleReset = () => {
  applyRuntimeConfigToForm(DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG)
}

// 保存前先把输入值收敛到合法区间，避免 UI 输入越界后还要靠后端兜底。
const normalizeFormValues = () => {
  form.retrieval.previewTopK = normalizeInteger(
    form.retrieval.previewTopK,
    runtimeFieldRules.previewTopK
  )
  form.retrieval.workspaceTopK = normalizeInteger(
    form.retrieval.workspaceTopK,
    runtimeFieldRules.workspaceTopK
  )
  form.retrieval.candidateMultiplier = normalizeInteger(
    form.retrieval.candidateMultiplier,
    runtimeFieldRules.candidateMultiplier
  )
  form.retrieval.minCandidateLimit = normalizeInteger(
    form.retrieval.minCandidateLimit,
    runtimeFieldRules.minCandidateLimit
  )
  form.retrieval.maxCandidateLimit = normalizeInteger(
    form.retrieval.maxCandidateLimit,
    runtimeFieldRules.maxCandidateLimit
  )
  form.retrieval.bm25Weight = normalizeFloat(
    form.retrieval.bm25Weight,
    runtimeFieldRules.bm25Weight
  )
  form.retrieval.vectorWeight = normalizeFloat(
    form.retrieval.vectorWeight,
    runtimeFieldRules.vectorWeight
  )
  form.retrieval.queryAnalysisTemperature = normalizeFloat(
    form.retrieval.queryAnalysisTemperature,
    runtimeFieldRules.queryAnalysisTemperature
  )
  form.answer.temperature = normalizeFloat(
    form.answer.temperature,
    runtimeFieldRules.answerTemperature
  )

  // 候选集上下限必须保持有效关系，否则会出现最小值大于最大值的无效配置。
  form.retrieval.minCandidateLimit = Math.min(
    form.retrieval.minCandidateLimit,
    form.retrieval.maxCandidateLimit
  )
  form.retrieval.maxCandidateLimit = Math.max(
    form.retrieval.maxCandidateLimit,
    form.retrieval.minCandidateLimit
  )
}

// 作用域切换只更新表单，不自动保存，避免刷新进入页面就隐式提交。
const handleSave = async () => {
  saving.value = true
  normalizeFormValues()

  try {
    if (isGlobalScope.value) {
      globalRuntimeSettings.value = (
        await updateGlobalRuntimeConfigAPI(buildRuntimeConfigPayload())
      ).data
      ElMessage.success('全库默认参数已保存')
    } else if (selectedKnowledgeBase.value) {
      await updateKnowledgeBase(selectedKnowledgeBaseId.value, {
        runtimeConfig: buildRuntimeConfigPayload()
      })
      ElMessage.success('知识库参数已保存')
    }

    syncFormFromSelection()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存参数失败')
  } finally {
    saving.value = false
  }
}

watch(selectedKnowledgeBaseId, () => {
  syncFormFromSelection()
})

onMounted(async () => {
  try {
    const [knowledgeBaseResponse, globalRuntimeSettingsResponse] = await Promise.all([
      knowledgeBases.value.length ? Promise.resolve() : loadKnowledgeBases(),
      findGlobalRuntimeConfigAPI()
    ])

    void knowledgeBaseResponse
    globalRuntimeSettings.value = globalRuntimeSettingsResponse.data
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载参数失败')
    globalRuntimeSettings.value = {
      runtimeConfig: DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG,
      createdAt: null,
      updatedAt: null
    }
  }

  if (
    preferredKnowledgeBaseId.value &&
    knowledgeBases.value.some((item) => item.id === preferredKnowledgeBaseId.value)
  ) {
    selectedKnowledgeBaseId.value = preferredKnowledgeBaseId.value
  } else {
    selectedKnowledgeBaseId.value = ''
  }

  syncFormFromSelection()
})

function formatDateTime(value?: string | null): string {
  if (!value) {
    return '-'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  const hours = String(parsed.getHours()).padStart(2, '0')
  const minutes = String(parsed.getMinutes()).padStart(2, '0')
  const seconds = String(parsed.getSeconds()).padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

function createRuntimeConfigState(): KnowledgeBaseRuntimeConfig {
  return {
    retrieval: {
      previewTopK: DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.previewTopK,
      workspaceTopK: DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.workspaceTopK,
      candidateMultiplier: DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.candidateMultiplier,
      minCandidateLimit: DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.minCandidateLimit,
      maxCandidateLimit: DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.maxCandidateLimit,
      bm25Weight: DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.bm25Weight,
      vectorWeight: DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.vectorWeight,
      queryAnalysisEnabled: DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.queryAnalysisEnabled,
      queryAnalysisTemperature: DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.queryAnalysisTemperature
    },
    answer: {
      temperature: DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.answer.temperature
    }
  }
}

// 显式逐字段写回表单，避免 structuredClone 和响应式代理混用导致异常。
function applyRuntimeConfigToForm(source?: KnowledgeBaseRuntimeConfig | null): void {
  const resolved = source ?? DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG

  form.retrieval.previewTopK = resolved.retrieval.previewTopK
  form.retrieval.workspaceTopK = resolved.retrieval.workspaceTopK
  form.retrieval.candidateMultiplier = resolved.retrieval.candidateMultiplier
  form.retrieval.minCandidateLimit = resolved.retrieval.minCandidateLimit
  form.retrieval.maxCandidateLimit = resolved.retrieval.maxCandidateLimit
  form.retrieval.bm25Weight = resolved.retrieval.bm25Weight
  form.retrieval.vectorWeight = resolved.retrieval.vectorWeight
  form.retrieval.queryAnalysisEnabled = resolved.retrieval.queryAnalysisEnabled
  form.retrieval.queryAnalysisTemperature = resolved.retrieval.queryAnalysisTemperature
  form.answer.temperature = resolved.answer.temperature
}

function buildRuntimeConfigPayload(): KnowledgeBaseRuntimeConfig {
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
      queryAnalysisTemperature: form.retrieval.queryAnalysisTemperature
    },
    answer: {
      temperature: form.answer.temperature
    }
  }
}

function normalizeInteger(value: number, rule: RuntimeFieldRule): number {
  return Math.min(Math.max(Math.round(value), rule.min), rule.max)
}

function normalizeFloat(value: number, rule: RuntimeFieldRule): number {
  return Math.min(Math.max(value, rule.min), rule.max)
}
</script>

<template>
  <section class="settings-stage">
    <div class="settings-stage__canvas">
      <header class="settings-stage__header">
        <div>
          <p class="settings-stage__eyebrow">KNOWLEDGE RUNTIME</p>
          <h1 class="settings-stage__title">检索与问答参数</h1>
          <p class="settings-stage__subtitle">
            这里配置知识检索与问答链路的运行参数。全库搜索使用全局默认配置；只有明确切到单库搜索时，才会使用该知识库自己的覆盖配置。
          </p>
        </div>

        <div class="settings-stage__actions">
          <button type="button" class="settings-button settings-button--ghost" @click="handleReset">
            <RefreshCw class="h-4 w-4" />
            恢复默认值
          </button>
          <button
            type="button"
            class="settings-button settings-button--primary"
            :disabled="saving || !canSave"
            @click="handleSave"
          >
            <Save class="h-4 w-4" />
            {{ saving ? '保存中' : '保存参数' }}
          </button>
        </div>
      </header>

      <div class="settings-shell">
        <section class="settings-card">
          <div class="settings-card__header">
            <div>
              <h2>作用范围</h2>
              <p>这组参数只作用于当前下拉框选中的目标。</p>
            </div>
          </div>

          <div class="settings-field settings-field--scope">
            <label for="knowledge-base-select">选择知识库</label>
            <el-select
              id="knowledge-base-select"
              v-model="selectedKnowledgeBaseSelectValue"
              class="settings-select settings-select--compact"
              popper-class="knowledge-scope-select-popper"
            >
              <el-option label="全库搜索（全部知识库）" :value="ALL_KNOWLEDGE_BASES_VALUE" />
              <el-option
                v-for="item in knowledgeBases"
                :key="item.id"
                :label="item.name"
                :value="item.id"
              />
            </el-select>
          </div>

          <div v-if="selectedSummary" class="settings-kb-summary">
            <div class="settings-kb-summary__item">
              <small>当前作用域</small>
              <strong>{{ selectedSummary.scopeLabel }}</strong>
            </div>
            <div class="settings-kb-summary__item">
              <small>目标对象</small>
              <strong>{{ selectedSummary.targetLabel }}</strong>
            </div>
            <div class="settings-kb-summary__item">
              <small>文档数量</small>
              <strong>{{ selectedSummary.documentCount }}</strong>
            </div>
            <div class="settings-kb-summary__item">
              <small>最近更新</small>
              <strong>{{ selectedSummary.updatedAt }}</strong>
            </div>
            <div class="settings-kb-summary__description">
              <small>说明</small>
              <p>{{ selectedSummary.description }}</p>
            </div>
          </div>
        </section>

        <section class="settings-card settings-card--notice">
          <div class="settings-card__header">
            <div>
              <h2>生效说明</h2>
              <p>这组参数会直接影响候选集规模、融合排序、Query Analysis 和回答生成行为。</p>
            </div>
          </div>

          <div class="settings-notice-list">
            <p>1. BM25 与向量权重在这里显式配置，不再由 LLM rewrite 动态改写融合权重。</p>
            <p>2. Query Analysis 是否执行，仍然会尊重前端当前是否开启 rewrite 开关。</p>
            <p>3. `workspaceTopK` 会影响聊天页面默认参与回答和展示的 chunk 数量。</p>
            <p>4. 全库搜索现在有独立的后台配置；单库配置只有在明确选择单库时才会覆盖它。</p>
          </div>
        </section>

        <section class="settings-card">
          <div class="settings-card__header">
            <div>
              <h2>召回参数</h2>
              <p>控制 preview、workspace、候选集规模、融合权重以及 Query Analysis 行为。</p>
            </div>
          </div>

          <div class="settings-grid">
            <div class="settings-field">
              <div class="settings-field__heading">
                <label>Preview TopK</label>
                <span>{{ runtimeFieldRules.previewTopK.hint }}</span>
              </div>
              <input
                v-model.number="form.retrieval.previewTopK"
                type="number"
                :min="runtimeFieldRules.previewTopK.min"
                :max="runtimeFieldRules.previewTopK.max"
                @blur="form.retrieval.previewTopK = normalizeInteger(form.retrieval.previewTopK, runtimeFieldRules.previewTopK)"
              />
            </div>
            <div class="settings-field">
              <div class="settings-field__heading">
                <label>Workspace TopK</label>
                <span>{{ runtimeFieldRules.workspaceTopK.hint }}</span>
              </div>
              <input
                v-model.number="form.retrieval.workspaceTopK"
                type="number"
                :min="runtimeFieldRules.workspaceTopK.min"
                :max="runtimeFieldRules.workspaceTopK.max"
                @blur="form.retrieval.workspaceTopK = normalizeInteger(form.retrieval.workspaceTopK, runtimeFieldRules.workspaceTopK)"
              />
            </div>
            <div class="settings-field">
              <div class="settings-field__heading">
                <label>Candidate Multiplier</label>
                <span>{{ runtimeFieldRules.candidateMultiplier.hint }}</span>
              </div>
              <input
                v-model.number="form.retrieval.candidateMultiplier"
                type="number"
                :min="runtimeFieldRules.candidateMultiplier.min"
                :max="runtimeFieldRules.candidateMultiplier.max"
                @blur="form.retrieval.candidateMultiplier = normalizeInteger(form.retrieval.candidateMultiplier, runtimeFieldRules.candidateMultiplier)"
              />
            </div>
            <div class="settings-field">
              <div class="settings-field__heading">
                <label>Min Candidate Limit</label>
                <span>{{ runtimeFieldRules.minCandidateLimit.hint }}</span>
              </div>
              <input
                v-model.number="form.retrieval.minCandidateLimit"
                type="number"
                :min="runtimeFieldRules.minCandidateLimit.min"
                :max="runtimeFieldRules.minCandidateLimit.max"
                @blur="form.retrieval.minCandidateLimit = normalizeInteger(form.retrieval.minCandidateLimit, runtimeFieldRules.minCandidateLimit)"
              />
            </div>
            <div class="settings-field">
              <div class="settings-field__heading">
                <label>Max Candidate Limit</label>
                <span>{{ runtimeFieldRules.maxCandidateLimit.hint }}</span>
              </div>
              <input
                v-model.number="form.retrieval.maxCandidateLimit"
                type="number"
                :min="runtimeFieldRules.maxCandidateLimit.min"
                :max="runtimeFieldRules.maxCandidateLimit.max"
                @blur="form.retrieval.maxCandidateLimit = normalizeInteger(form.retrieval.maxCandidateLimit, runtimeFieldRules.maxCandidateLimit)"
              />
            </div>
            <div class="settings-field settings-field--switch">
              <div class="settings-field__heading">
                <label>启用 Query Analysis</label>
                <span>决定是否让 LLM 先做检索问句分析与改写</span>
              </div>
              <el-switch v-model="form.retrieval.queryAnalysisEnabled" />
            </div>
            <div class="settings-field">
              <div class="settings-field__heading">
                <label>BM25 Weight</label>
                <span>{{ runtimeFieldRules.bm25Weight.hint }}</span>
              </div>
              <input
                v-model.number="form.retrieval.bm25Weight"
                type="number"
                :min="runtimeFieldRules.bm25Weight.min"
                :max="runtimeFieldRules.bm25Weight.max"
                :step="runtimeFieldRules.bm25Weight.step"
                @blur="form.retrieval.bm25Weight = normalizeFloat(form.retrieval.bm25Weight, runtimeFieldRules.bm25Weight)"
              />
            </div>
            <div class="settings-field">
              <div class="settings-field__heading">
                <label>Vector Weight</label>
                <span>{{ runtimeFieldRules.vectorWeight.hint }}</span>
              </div>
              <input
                v-model.number="form.retrieval.vectorWeight"
                type="number"
                :min="runtimeFieldRules.vectorWeight.min"
                :max="runtimeFieldRules.vectorWeight.max"
                :step="runtimeFieldRules.vectorWeight.step"
                @blur="form.retrieval.vectorWeight = normalizeFloat(form.retrieval.vectorWeight, runtimeFieldRules.vectorWeight)"
              />
            </div>
            <div class="settings-field">
              <div class="settings-field__heading">
                <label>Query Analysis Temperature</label>
                <span>{{ runtimeFieldRules.queryAnalysisTemperature.hint }}</span>
              </div>
              <input
                v-model.number="form.retrieval.queryAnalysisTemperature"
                type="number"
                :min="runtimeFieldRules.queryAnalysisTemperature.min"
                :max="runtimeFieldRules.queryAnalysisTemperature.max"
                :step="runtimeFieldRules.queryAnalysisTemperature.step"
                @blur="form.retrieval.queryAnalysisTemperature = normalizeFloat(form.retrieval.queryAnalysisTemperature, runtimeFieldRules.queryAnalysisTemperature)"
              />
            </div>
          </div>
        </section>

        <section class="settings-card">
          <div class="settings-card__header">
            <div>
              <h2>回答参数</h2>
              <p>控制问答模型的生成温度。</p>
            </div>
          </div>

          <div class="settings-grid settings-grid--compact">
            <div class="settings-field">
              <div class="settings-field__heading">
                <label>Answer Temperature</label>
                <span>{{ runtimeFieldRules.answerTemperature.hint }}</span>
              </div>
              <input
                v-model.number="form.answer.temperature"
                type="number"
                :min="runtimeFieldRules.answerTemperature.min"
                :max="runtimeFieldRules.answerTemperature.max"
                :step="runtimeFieldRules.answerTemperature.step"
                @blur="form.answer.temperature = normalizeFloat(form.answer.temperature, runtimeFieldRules.answerTemperature)"
              />
            </div>
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

.settings-field input {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #fff;
  padding: 11px 12px;
  color: #0f172a;
  outline: none;
}

.settings-field input:focus {
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
  box-shadow: 0 0 0 1px #0f766e inset, 0 0 0 3px rgba(15, 118, 110, 0.1);
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

.settings-kb-summary small,
.settings-kb-summary__description small {
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
}

.settings-kb-summary strong {
  font-size: 15px;
  color: #0f172a;
}

.settings-kb-summary__description {
  grid-column: 1 / -1;
}

.settings-kb-summary__description p {
  color: #334155;
  line-height: 1.7;
}

.settings-card--notice {
  border-color: #bfe7de;
  background: linear-gradient(180deg, rgba(240, 253, 250, 0.95), rgba(255, 255, 255, 0.92));
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
  .settings-kb-summary {
    grid-template-columns: 1fr;
  }
}
</style>
