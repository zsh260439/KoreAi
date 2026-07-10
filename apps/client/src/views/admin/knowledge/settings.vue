<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { RefreshCw, Save } from 'lucide-vue-next'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { useKnowledgeBases } from '@/composables/useKnowledgeBases'
import { DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG, type KnowledgeBaseRuntimeConfig } from 'share-type'

type RuntimeScopeSummary = {
  scopeLabel: string
  targetLabel: string
  documentCount: number
  updatedAt: string
  description: string
}

const ALL_KNOWLEDGE_BASES_VALUE = '__all__'

const route = useRoute()
const { knowledgeBases, loadKnowledgeBases, updateKnowledgeBase } = useKnowledgeBases()

// 空字符串代表“全部知识库”，对应运行时不传 knowledgeBaseId。
const selectedKnowledgeBaseId = ref('')
const saving = ref(false)

// 表单只维护当前编辑态，避免直接修改知识库列表对象。
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
const canSave = computed(() => Boolean(selectedKnowledgeBase.value))
const selectedSummary = computed<RuntimeScopeSummary | null>(() => {
  if (isGlobalScope.value) {
    return {
      scopeLabel: '全库搜索',
      targetLabel: '全部知识库',
      documentCount: knowledgeBases.value.reduce((total, item) => total + item.documentCount, 0),
      updatedAt: '-',
      description: '这里展示的是系统默认参数。全库搜索不再单独保存一套后台配置。'
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

// 根据当前选择同步表单；选“全部知识库”时只展示默认值。
const syncFormFromSelection = () => {
  if (isGlobalScope.value) {
    applyRuntimeConfigToForm(DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG)
    return
  }

  applyRuntimeConfigToForm(selectedKnowledgeBase.value?.runtimeConfig)
}

// 恢复默认值时统一回到共享默认配置。
const handleReset = () => {
  applyRuntimeConfigToForm(DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG)
}

// 只有选中具体知识库时才允许保存，避免制造伪全局配置。
const handleSave = async () => {
  if (!selectedKnowledgeBase.value) {
    ElMessage.warning('全部知识库只展示默认参数，不支持单独保存')
    return
  }

  saving.value = true

  try {
    await updateKnowledgeBase(selectedKnowledgeBaseId.value, {
      runtimeConfig: buildRuntimeConfigPayload()
    })
    ElMessage.success('知识库参数已保存')
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
  if (!knowledgeBases.value.length) {
    await loadKnowledgeBases()
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

// 显式逐字段写回表单，避免 structuredClone 和响应式代理混用。
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
</script>

<template>
  <section class="settings-stage">
    <div class="settings-stage__canvas">
      <header class="settings-stage__header">
        <div>
          <p class="settings-stage__eyebrow">KNOWLEDGE RUNTIME</p>
          <h1 class="settings-stage__title">检索与问答参数</h1>
          <p class="settings-stage__subtitle">
            这里配置的是知识检索与问答链路的运行参数。选择“全部知识库”时，只表示全库搜索不传特定知识库。
          </p>
        </div>

        <div class="settings-stage__actions">
          <button type="button" class="settings-button settings-button--ghost" @click="handleReset">
            <RefreshCw class="h-4 w-4" />
            恢复默认值
          </button>
          <button type="button" class="settings-button settings-button--primary" :disabled="saving || !canSave" @click="handleSave">
            <Save class="h-4 w-4" />
            {{ saving ? '保存中' : '保存参数' }}
          </button>
        </div>
      </header>

      <div class="settings-shell">
        <section class="settings-card">
          <div class="settings-card__header">
            <div>
              <h2>作用域</h2>
              <p>这组参数只作用于当前 select 选中的目标。</p>
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
              <el-option label="全部知识库（全库搜索）" :value="ALL_KNOWLEDGE_BASES_VALUE" />
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
              <p>这组参数会直接影响检索候选集、融合排序、Query Analysis 和回答生成温度。</p>
            </div>
          </div>

          <div class="settings-notice-list">
            <p>1. BM25 与向量融合权重由这里显式控制，不再由 LLM rewrite 动态改权重。</p>
            <p>2. 即使 Query Analysis 参数已配置，运行时仍会尊重前端是否关闭 rewrite 开关。</p>
            <p>3. `workspaceTopK` 会影响聊天页面默认参与回答和展示的 chunk 数量。</p>
            <p>4. 选中“全部知识库”时，这里只展示默认值，不会生成额外的全局后台配置。</p>
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
              <label>Preview TopK</label>
              <input v-model.number="form.retrieval.previewTopK" type="number" min="1" max="50" />
            </div>
            <div class="settings-field">
              <label>Workspace TopK</label>
              <input v-model.number="form.retrieval.workspaceTopK" type="number" min="1" max="12" />
            </div>
            <div class="settings-field">
              <label>Candidate Multiplier</label>
              <input v-model.number="form.retrieval.candidateMultiplier" type="number" min="1" max="12" />
            </div>
            <div class="settings-field">
              <label>Min Candidate Limit</label>
              <input v-model.number="form.retrieval.minCandidateLimit" type="number" min="1" max="200" />
            </div>
            <div class="settings-field">
              <label>Max Candidate Limit</label>
              <input v-model.number="form.retrieval.maxCandidateLimit" type="number" min="1" max="400" />
            </div>
            <div class="settings-field settings-field--switch">
              <label>启用 Query Analysis</label>
              <el-switch v-model="form.retrieval.queryAnalysisEnabled" />
            </div>
            <div class="settings-field">
              <label>BM25 Weight</label>
              <input v-model.number="form.retrieval.bm25Weight" type="number" min="0.2" max="3" step="0.1" />
            </div>
            <div class="settings-field">
              <label>Vector Weight</label>
              <input v-model.number="form.retrieval.vectorWeight" type="number" min="0.2" max="3" step="0.1" />
            </div>
            <div class="settings-field">
              <label>Query Analysis Temperature</label>
              <input v-model.number="form.retrieval.queryAnalysisTemperature" type="number" min="0" max="2" step="0.1" />
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
              <label>Answer Temperature</label>
              <input v-model.number="form.answer.temperature" type="number" min="0" max="2" step="0.1" />
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

.settings-field label {
  font-size: 13px;
  font-weight: 700;
  color: #475569;
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
