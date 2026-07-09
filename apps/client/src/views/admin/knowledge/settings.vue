<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { RefreshCw, Save } from 'lucide-vue-next'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { useKnowledgeBases } from '@/composables/useKnowledgeBases'
import {
  findGlobalRuntimeSettingsAPI,
  updateGlobalRuntimeSettingsAPI
} from '@/servers/knowledge'
import {
  DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG,
  type KnowledgeBaseRuntimeConfig,
  type KnowledgeGlobalRuntimeSettings,
  type KnowledgeRuntimeConfigScope
} from 'share-type'

// 声明作用域切换选项，避免模板里散落字符串判断。
type ScopeOption = {
  value: KnowledgeRuntimeConfigScope
  label: string
  description: string
}

// 声明摘要卡片结构，统一全局/单库的展示字段。
type RuntimeScopeSummary = {
  name: string
  description: string
  documentCount: number
  updatedAt: string
}

const route = useRoute()
const { knowledgeBases, loadKnowledgeBases, updateKnowledgeBase } = useKnowledgeBases()

const scopeOptions: ScopeOption[] = [
  {
    value: 'global',
    label: '全局召回配置',
    description: '用于未指定 knowledgeBaseId 的全库检索与问答。'
  },
  {
    value: 'knowledge_base',
    label: '单知识库配置',
    description: '用于指定知识库的预览检索与聊天问答。'
  }
]

const selectedScope = ref<KnowledgeRuntimeConfigScope>(resolveInitialScope())
const selectedKnowledgeBaseId = ref('')
const saving = ref(false)
const loadingGlobalSettings = ref(false)
const globalRuntimeSettings = ref<KnowledgeGlobalRuntimeSettings | null>(null)

// 使用本地 reactive 表单承接编辑态，避免直接修改列表里的响应式知识库对象。
const form = reactive(createRuntimeConfigState())

const preferredKnowledgeBaseId = computed(() =>
  typeof route.query.kbId === 'string' ? route.query.kbId : ''
)
const isGlobalScope = computed(() => selectedScope.value === 'global')
const hasKnowledgeBases = computed(() => knowledgeBases.value.length > 0)
const selectedKnowledgeBase = computed(
  () => knowledgeBases.value.find((item) => item.id === selectedKnowledgeBaseId.value) ?? null
)
const selectedScopeLabel = computed(() =>
  isGlobalScope.value ? '全局召回配置' : '单知识库配置'
)
const scopeSubtitle = computed(() =>
  isGlobalScope.value
    ? '这组参数会作用于“全部知识库（默认）”的检索与问答链路。'
    : '这组参数只作用于当前选中的知识库。'
)
const canEditCurrentScope = computed(() => {
  if (isGlobalScope.value) {
    return Boolean(globalRuntimeSettings.value)
  }

  return Boolean(selectedKnowledgeBase.value)
})
const selectedKnowledgeBaseSummary = computed<RuntimeScopeSummary | null>(() => {
  if (isGlobalScope.value) {
    if (!globalRuntimeSettings.value) {
      return null
    }

    return {
      name: '全部知识库',
      description: '当请求未显式指定知识库时，系统会使用这一套全局运行参数。',
      documentCount: knowledgeBases.value.reduce((total, item) => total + item.documentCount, 0),
      updatedAt: formatDateTime(globalRuntimeSettings.value.updatedAt)
    }
  }

  if (!selectedKnowledgeBase.value) {
    return null
  }

  return {
    name: selectedKnowledgeBase.value.name,
    description: selectedKnowledgeBase.value.description?.trim() || '当前知识库暂无描述。',
    documentCount: selectedKnowledgeBase.value.documentCount,
    updatedAt: formatDateTime(selectedKnowledgeBase.value.updatedAt)
  }
})

// 根据当前作用域同步表单，让切换全局/单库时能看到对应持久化配置。
const syncFormForCurrentScope = () => {
  if (isGlobalScope.value) {
    applyRuntimeConfigToForm(globalRuntimeSettings.value?.runtimeConfig)
    return
  }

  applyRuntimeConfigToForm(selectedKnowledgeBase.value?.runtimeConfig)
}

// 恢复默认值明确回到共享默认配置，便于人工校准召回参数基线。
const handleReset = () => {
  applyRuntimeConfigToForm(DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG)
}

// 保存时按作用域分流到全局表或知识库表，避免前端做额外语义兜底。
const handleSave = async () => {
  if (!canEditCurrentScope.value) {
    ElMessage.warning(isGlobalScope.value ? '全局配置尚未加载完成' : '请先选择一个知识库')
    return
  }

  saving.value = true

  try {
    if (isGlobalScope.value) {
      const response = await updateGlobalRuntimeSettingsAPI({
        runtimeConfig: buildRuntimeConfigPayload()
      })
      globalRuntimeSettings.value = response.data
      ElMessage.success('全局检索与问答参数已保存')
    } else {
      const updated = await updateKnowledgeBase(selectedKnowledgeBaseId.value, {
        runtimeConfig: buildRuntimeConfigPayload()
      })
      selectedKnowledgeBaseId.value = updated.id
      ElMessage.success('知识库检索与问答参数已保存')
    }

    syncFormForCurrentScope()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存参数失败')
  } finally {
    saving.value = false
  }
}

// 支持从文档页带着 kbId 跳转过来，减少重复选择知识库。
watch(
  preferredKnowledgeBaseId,
  (value) => {
    if (!value) {
      return
    }

    const matched = knowledgeBases.value.find((item) => item.id === value)
    if (matched) {
      selectedKnowledgeBaseId.value = matched.id
    }
  },
  { immediate: true }
)

watch([selectedScope, selectedKnowledgeBaseId], () => {
  syncFormForCurrentScope()
})

onMounted(async () => {
  loadingGlobalSettings.value = true

  try {
    const [globalSettingsResponse] = await Promise.all([
      findGlobalRuntimeSettingsAPI(),
      knowledgeBases.value.length ? Promise.resolve() : loadKnowledgeBases()
    ])

    globalRuntimeSettings.value = globalSettingsResponse.data
  } finally {
    loadingGlobalSettings.value = false
  }

  if (
    preferredKnowledgeBaseId.value &&
    knowledgeBases.value.some((item) => item.id === preferredKnowledgeBaseId.value)
  ) {
    selectedKnowledgeBaseId.value = preferredKnowledgeBaseId.value
  } else if (knowledgeBases.value[0]) {
    selectedKnowledgeBaseId.value = knowledgeBases.value[0].id
  }

  syncFormForCurrentScope()
})

// 根据路由查询初始化作用域，保证文档页与设置页之间能稳定跳转。
function resolveInitialScope(): KnowledgeRuntimeConfigScope {
  if (route.query.scope === 'knowledge_base') {
    return 'knowledge_base'
  }

  if (route.query.scope === 'global') {
    return 'global'
  }

  return typeof route.query.kbId === 'string' && route.query.kbId ? 'knowledge_base' : 'global'
}

// 统一时间格式，避免页面直接展示 ISO 字符串。
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

// 创建一份独立表单初始值，避免多个页面共享同一个默认对象引用。
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

// 显式逐字段写回表单，避免 structuredClone 与响应式代理对象混用带来的运行时错误。
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

// 保存前重新组装普通对象，确保接口层拿到的是干净 payload。
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
            这里配置的是知识检索与问答链路的运行参数。全局配置用于全库搜索，单知识库配置用于指定知识库。
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
            :disabled="saving || loadingGlobalSettings"
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
              <h2>作用域</h2>
              <p>{{ scopeSubtitle }}</p>
            </div>
          </div>

          <div class="settings-scope-switch">
            <button
              v-for="option in scopeOptions"
              :key="option.value"
              type="button"
              class="settings-scope-chip"
              :class="{ 'settings-scope-chip--active': selectedScope === option.value }"
              @click="selectedScope = option.value"
            >
              <strong>{{ option.label }}</strong>
              <span>{{ option.description }}</span>
            </button>
          </div>

          <div v-if="selectedScope === 'knowledge_base' && hasKnowledgeBases" class="settings-field">
            <label for="knowledge-base-select">选择知识库</label>
            <select id="knowledge-base-select" v-model="selectedKnowledgeBaseId" class="settings-select">
              <option v-for="item in knowledgeBases" :key="item.id" :value="item.id">
                {{ item.name }}
              </option>
            </select>
          </div>

          <div v-else-if="selectedScope === 'knowledge_base'" class="settings-empty">
            当前还没有知识库，请先去“知识库管理”创建一个知识库。
          </div>

          <div v-if="selectedKnowledgeBaseSummary" class="settings-kb-summary">
            <div class="settings-kb-summary__item">
              <small>当前作用域</small>
              <strong>{{ selectedScopeLabel }}</strong>
            </div>
            <div class="settings-kb-summary__item">
              <small>目标对象</small>
              <strong>{{ selectedKnowledgeBaseSummary.name }}</strong>
            </div>
            <div class="settings-kb-summary__item">
              <small>文档数量</small>
              <strong>{{ selectedKnowledgeBaseSummary.documentCount }}</strong>
            </div>
            <div class="settings-kb-summary__item">
              <small>最近更新</small>
              <strong>{{ selectedKnowledgeBaseSummary.updatedAt }}</strong>
            </div>
            <div class="settings-kb-summary__description">
              <small>说明</small>
              <p>{{ selectedKnowledgeBaseSummary.description }}</p>
            </div>
          </div>
        </section>

        <template v-if="canEditCurrentScope">
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
                <input
                  v-model.number="form.retrieval.vectorWeight"
                  type="number"
                  min="0.2"
                  max="3"
                  step="0.1"
                />
              </div>
              <div class="settings-field">
                <label>Query Analysis Temperature</label>
                <input
                  v-model.number="form.retrieval.queryAnalysisTemperature"
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
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
                <label>Answer Temperature</label>
                <input v-model.number="form.answer.temperature" type="number" min="0" max="2" step="0.1" />
              </div>
            </div>
          </section>
        </template>

        <section v-else class="settings-card">
          <div class="settings-empty">
            {{ loadingGlobalSettings ? '正在加载全局配置...' : '当前作用域暂无可编辑对象。' }}
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

.settings-scope-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 18px;
}

.settings-scope-chip {
  display: grid;
  gap: 6px;
  border: 1px solid #dbe4ee;
  border-radius: 16px;
  background: #f8fafc;
  padding: 16px;
  text-align: left;
  cursor: pointer;
}

.settings-scope-chip strong {
  font-size: 15px;
  color: #0f172a;
}

.settings-scope-chip span {
  color: #64748b;
  line-height: 1.6;
}

.settings-scope-chip--active {
  border-color: #0f766e;
  background: rgba(240, 253, 250, 0.9);
  box-shadow: inset 0 0 0 1px rgba(15, 118, 110, 0.08);
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

.settings-field label {
  font-size: 13px;
  font-weight: 700;
  color: #475569;
}

.settings-field input,
.settings-select {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #fff;
  padding: 11px 12px;
  color: #0f172a;
  outline: none;
}

.settings-field input:focus,
.settings-select:focus {
  border-color: #0f766e;
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.12);
}

.settings-field--switch {
  align-content: end;
}

.settings-empty {
  color: #64748b;
  line-height: 1.7;
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

  .settings-scope-switch,
  .settings-grid,
  .settings-grid--compact,
  .settings-kb-summary {
    grid-template-columns: 1fr;
  }
}
</style>
