<script setup lang="ts">
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Braces,
  Cable,
  CircleHelp,
  Component,
  Database,
  FileCode2,
  Radar,
  RotateCcw,
  Route,
  Search,
  SearchCode,
  Server,
  Sparkles,
  Workflow
} from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import {
  areaOptions,
  flowScenarios,
  functionDocs,
  layerOptions,
  type CodeMapArea,
  type CodeMapLayer,
  type FunctionDoc,
  type FunctionLink
} from './code-map.data'

type SidebarTab = 'flow' | 'functions'
type ResolvedRelation = FunctionLink & { target: FunctionDoc }

const activeArea = ref<CodeMapArea | 'all'>('all')
const activeLayer = ref<CodeMapLayer | 'all'>('all')
const activeScenarioId = ref(flowScenarios[0]?.id ?? '')
const sidebarTab = ref<SidebarTab>('flow')
const searchKeyword = ref('')
const selectedFunctionId = ref(flowScenarios[0]?.functionIds[0] ?? functionDocs[0]?.id ?? '')
const activeCommentIndex = ref(0)
const scenarioStepIndex = ref(0)
const showGuide = ref(true)

const functionDocMap = computed(() => new Map(functionDocs.map((item) => [item.id, item])))
const normalizedKeyword = computed(() => searchKeyword.value.trim().toLowerCase())

const areaLabelMap = new Map(
  areaOptions
    .filter((item): item is { value: CodeMapArea; label: string } => item.value !== 'all')
    .map((item) => [item.value, item.label] as const)
)

const layerLabelMap = new Map(
  layerOptions
    .filter((item): item is { value: CodeMapLayer; label: string } => item.value !== 'all')
    .map((item) => [item.value, item.label] as const)
)

const filteredFunctions = computed(() =>
  functionDocs.filter((item) => {
    const areaMatches = activeArea.value === 'all' || item.area === activeArea.value
    const layerMatches = activeLayer.value === 'all' || item.layer === activeLayer.value
    const keywordMatches =
      !normalizedKeyword.value ||
      [
        item.title,
        item.symbol,
        item.owner,
        item.file,
        item.summary,
        item.lookupHint,
        ...item.code,
        ...item.comments.map((comment) => `${comment.title} ${comment.detail}`)
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedKeyword.value)

    return areaMatches && layerMatches && keywordMatches
  })
)

const activeScenario = computed(
  () => flowScenarios.find((item) => item.id === activeScenarioId.value) ?? flowScenarios[0]
)

const activeScenarioFunctions = computed(() =>
  (activeScenario.value?.functionIds ?? [])
    .map((id) => functionDocMap.value.get(id))
    .filter((item): item is FunctionDoc => Boolean(item))
)

const activeStepFunction = computed(
  () => activeScenarioFunctions.value[scenarioStepIndex.value] ?? activeScenarioFunctions.value[0] ?? null
)

const selectedFunction = computed(
  () => functionDocMap.value.get(selectedFunctionId.value) ?? filteredFunctions.value[0] ?? functionDocs[0]
)

const selectedComment = computed(
  () => selectedFunction.value?.comments[activeCommentIndex.value] ?? selectedFunction.value?.comments[0]
)

const selectedCodeLines = computed(() => selectedFunction.value?.code ?? [])

const selectedFunctionFlowIndex = computed(
  () => activeScenarioFunctions.value.findIndex((item) => item.id === selectedFunction.value?.id)
)

const owningScenario = computed(
  () => flowScenarios.find((item) => item.functionIds.includes(selectedFunctionId.value)) ?? null
)

const relatedCallers = computed(() =>
  (selectedFunction.value?.callers ?? [])
    .map((item) => ({
      ...item,
      target: functionDocMap.value.get(item.id)
    }))
    .filter((item): item is ResolvedRelation => Boolean(item.target))
)

const relatedCallees = computed(() =>
  (selectedFunction.value?.callees ?? [])
    .map((item) => ({
      ...item,
      target: functionDocMap.value.get(item.id)
    }))
    .filter((item): item is ResolvedRelation => Boolean(item.target))
)

const stats = computed(() => ({
  functionCount: functionDocs.length,
  scenarioCount: flowScenarios.length,
  filteredCount: filteredFunctions.value.length
}))

const scenarioProgress = computed(() => {
  const total = activeScenarioFunctions.value.length
  if (!total) {
    return 0
  }

  return ((scenarioStepIndex.value + 1) / total) * 100
})

const currentStepNumber = computed(() => {
  if (!activeScenarioFunctions.value.length) {
    return 0
  }

  return Math.min(scenarioStepIndex.value + 1, activeScenarioFunctions.value.length)
})

const getAreaLabel = (area: CodeMapArea) => areaLabelMap.get(area) ?? area
const getLayerLabel = (layer: CodeMapLayer) => layerLabelMap.get(layer) ?? layer

const getLayerIcon = (layer: CodeMapLayer) => {
  switch (layer) {
    case 'view':
      return Component
    case 'component':
      return Workflow
    case 'composable':
      return Radar
    case 'client-server':
      return Route
    case 'controller':
    case 'service':
      return Server
    case 'utility':
      return SearchCode
    case 'llm':
      return Cable
    case 'storage':
      return Database
    case 'shared-type':
      return Braces
  }
}

const selectScenario = (scenarioId: string) => {
  activeScenarioId.value = scenarioId
  sidebarTab.value = 'flow'
  scenarioStepIndex.value = 0

  const scenario = flowScenarios.find((item) => item.id === scenarioId)
  if (scenario?.functionIds[0]) {
    selectedFunctionId.value = scenario.functionIds[0]
  }
}

const goToScenarioStep = (nextIndex: number) => {
  const items = activeScenarioFunctions.value
  if (!items.length) {
    return
  }

  const safeIndex = Math.min(Math.max(nextIndex, 0), items.length - 1)
  scenarioStepIndex.value = safeIndex
  selectedFunctionId.value = items[safeIndex].id
  sidebarTab.value = 'flow'
}

const goToPreviousStep = () => {
  goToScenarioStep(scenarioStepIndex.value - 1)
}

const goToNextStep = () => {
  goToScenarioStep(scenarioStepIndex.value + 1)
}

const selectFunction = (functionId: string) => {
  selectedFunctionId.value = functionId
}

const selectComment = (index: number) => {
  activeCommentIndex.value = index
}

const openFunctionSearch = () => {
  sidebarTab.value = 'functions'
}

const jumpToOwningScenario = () => {
  const scenario = owningScenario.value
  if (!scenario) {
    return
  }

  activeScenarioId.value = scenario.id
  sidebarTab.value = 'flow'

  const nextIndex = scenario.functionIds.findIndex((item) => item === selectedFunctionId.value)
  scenarioStepIndex.value = nextIndex >= 0 ? nextIndex : 0
}

const selectGuideScenario = (scenarioId: string) => {
  selectScenario(scenarioId)
  showGuide.value = false
}

const resetMapView = () => {
  activeArea.value = 'all'
  activeLayer.value = 'all'
  searchKeyword.value = ''
  sidebarTab.value = 'flow'
  showGuide.value = true
  activeCommentIndex.value = 0

  const defaultScenario = flowScenarios[0]
  if (!defaultScenario) {
    return
  }

  activeScenarioId.value = defaultScenario.id
  scenarioStepIndex.value = 0
  selectedFunctionId.value = defaultScenario.functionIds[0] ?? functionDocs[0]?.id ?? ''
}

const isHighlightedLine = (lineNumber: number) => {
  if (!selectedComment.value) {
    return false
  }

  return lineNumber >= selectedComment.value.start && lineNumber <= selectedComment.value.end
}

watch(
  () => selectedFunctionId.value,
  (functionId) => {
    activeCommentIndex.value = 0

    const index = activeScenarioFunctions.value.findIndex((item) => item.id === functionId)
    if (index >= 0) {
      scenarioStepIndex.value = index
    }
  }
)

watch(
  () => filteredFunctions.value,
  (nextFunctions) => {
    if (!nextFunctions.length) {
      return
    }

    const stillVisible = nextFunctions.some((item) => item.id === selectedFunctionId.value)
    if (!stillVisible) {
      selectedFunctionId.value = nextFunctions[0].id
    }
  },
  { immediate: true }
)
</script>

<template>
  <section class="code-map-page space-y-5">
    <AdminPageHeader
      title="函数地图"
      description="把流程、函数、代码和注释放在同一屏联动里。你可以先走流程，再点函数，再看右侧代码解释。"
    >
      <template #actions>
        <button
          type="button"
          class="header-action"
          :class="{ 'header-action--active': sidebarTab === 'flow' }"
          @click="sidebarTab = 'flow'"
        >
          流程导航
        </button>
        <button
          type="button"
          class="header-action"
          :class="{ 'header-action--active': sidebarTab === 'functions' }"
          @click="openFunctionSearch"
        >
          函数索引
        </button>
        <button type="button" class="header-action header-action--primary" @click="resetMapView">
          <RotateCcw class="size-4" />
          重置视图
        </button>
      </template>
    </AdminPageHeader>

    <section v-if="showGuide" class="guide-banner">
      <div class="guide-banner__main">
        <div class="guide-banner__eyebrow">
          <BookOpen class="size-4" />
          零基础导读
        </div>
        <h2 class="guide-banner__title">先选一条流程，再点一个函数，最后读右侧“逐段注释 + 代码高亮”。</h2>
        <p class="guide-banner__desc">
          这页不再把函数索引放在页面底部。流程导航和函数索引现在共用一个固定侧栏，首屏就能切换和定位。
        </p>
        <div class="guide-banner__tips">
          <span class="guide-tip">
            <CircleHelp class="size-4" />
            第一次看项目，先用“走流程”
          </span>
          <span class="guide-tip">
            <Search class="size-4" />
            已知函数名或文件名时，用“找函数”
          </span>
          <span class="guide-tip">
            <Sparkles class="size-4" />
            点击注释卡，会同步高亮对应代码行
          </span>
        </div>
      </div>

      <div class="guide-banner__actions">
        <button
          v-for="scenario in flowScenarios"
          :key="scenario.id"
          type="button"
          class="quick-start-card"
          @click="selectGuideScenario(scenario.id)"
        >
          <div class="quick-start-card__top">
            <Sparkles class="size-4" />
            <span>{{ scenario.title }}</span>
          </div>
          <p class="quick-start-card__text">{{ scenario.summary }}</p>
        </button>
      </div>

      <button type="button" class="guide-banner__close" @click="showGuide = false">收起导读</button>
    </section>

    <div class="metrics-grid">
      <article class="metric-card metric-card--primary">
        <p class="metric-card__label">函数总数</p>
        <div class="metric-card__value">{{ stats.functionCount }}</div>
        <p class="metric-card__meta">当前已整理的真实函数节点</p>
      </article>

      <article class="metric-card">
        <p class="metric-card__label">业务流程</p>
        <div class="metric-card__value">{{ stats.scenarioCount }}</div>
        <p class="metric-card__meta">按场景串起调用链，而不是只看文件树</p>
      </article>

      <article class="metric-card">
        <p class="metric-card__label">当前筛选</p>
        <div class="metric-card__value">{{ stats.filteredCount }}</div>
        <p class="metric-card__meta">搜索、模块和层级筛选后剩余的函数数</p>
      </article>
    </div>

    <div class="map-layout">
      <aside class="map-sidebar">
        <section class="panel panel--sidebar">
          <div class="panel__header">
            <div>
              <p class="panel__eyebrow">Explorer</p>
              <h2 class="panel__title">导航面板</h2>
              <p class="panel__desc">在这里切换“走流程”和“找函数”，不需要再把页面滑到底部。</p>
            </div>
          </div>

          <div class="sidebar-switch">
            <button
              type="button"
              class="sidebar-switch__button"
              :class="{ 'sidebar-switch__button--active': sidebarTab === 'flow' }"
              @click="sidebarTab = 'flow'"
            >
              走流程
            </button>
            <button
              type="button"
              class="sidebar-switch__button"
              :class="{ 'sidebar-switch__button--active': sidebarTab === 'functions' }"
              @click="sidebarTab = 'functions'"
            >
              找函数
            </button>
          </div>

          <div v-if="sidebarTab === 'flow'" class="sidebar-body">
            <div class="scenario-tabs">
              <button
                v-for="scenario in flowScenarios"
                :key="scenario.id"
                type="button"
                class="scenario-tab"
                :class="{ 'scenario-tab--active': scenario.id === activeScenarioId }"
                @click="selectScenario(scenario.id)"
              >
                {{ scenario.title }}
              </button>
            </div>

            <div v-if="activeScenario" class="scenario-summary">
              <h3 class="scenario-summary__title">{{ activeScenario.title }}</h3>
              <p class="scenario-summary__desc">{{ activeScenario.summary }}</p>
            </div>

            <div class="progress-card">
              <div class="progress-card__top">
                <span>当前步骤 {{ currentStepNumber }} / {{ activeScenarioFunctions.length }}</span>
                <span>{{ Math.round(scenarioProgress) }}%</span>
              </div>
              <div class="progress-card__track">
                <div class="progress-card__fill" :style="{ width: `${scenarioProgress}%` }" />
              </div>
              <div v-if="activeStepFunction" class="progress-card__focus">
                <p class="progress-card__focus-label">现在发生了什么</p>
                <p class="progress-card__focus-title">{{ activeStepFunction.title }}</p>
                <p class="progress-card__focus-text">{{ activeStepFunction.summary }}</p>
              </div>
            </div>

            <div class="flow-controls">
              <button
                type="button"
                class="flow-control"
                :disabled="scenarioStepIndex <= 0"
                @click="goToPreviousStep"
              >
                <ArrowLeft class="size-4" />
                上一步
              </button>
              <button type="button" class="flow-control" @click="goToScenarioStep(0)">
                从头开始
              </button>
              <button
                type="button"
                class="flow-control flow-control--primary"
                :disabled="scenarioStepIndex >= activeScenarioFunctions.length - 1"
                @click="goToNextStep"
              >
                下一步
                <ArrowRight class="size-4" />
              </button>
            </div>

            <div class="scenario-steps">
              <button
                v-for="(item, index) in activeScenarioFunctions"
                :key="item.id"
                type="button"
                class="step-card"
                :class="{ 'step-card--active': item.id === selectedFunctionId }"
                @click="goToScenarioStep(index)"
              >
                <span class="step-card__index">{{ index + 1 }}</span>
                <div class="step-card__body">
                  <div class="step-card__top">
                    <p class="step-card__symbol">{{ item.symbol }}</p>
                    <span v-if="item.id === selectedFunctionId" class="step-card__state">当前</span>
                  </div>
                  <p class="step-card__title">{{ item.title }}</p>
                  <p class="step-card__file">{{ item.owner }}</p>
                </div>
              </button>
            </div>
          </div>

          <div v-else class="sidebar-body">
            <div class="search-intro">
              <div class="search-intro__top">
                <Search class="size-4" />
                <span>函数索引</span>
                <span class="search-intro__count">{{ stats.filteredCount }}</span>
              </div>
              <p class="search-intro__text">适合你已经知道函数名、文件名或关键词时快速定位。</p>
            </div>

            <div class="filter-grid">
              <label class="filter-field filter-field--wide">
                <span class="filter-field__label">搜索关键词</span>
                <input
                  v-model="searchKeyword"
                  type="text"
                  class="filter-field__control"
                  placeholder="例如：sendMessage / workspace.service.ts / Token"
                />
              </label>

              <label class="filter-field">
                <span class="filter-field__label">模块</span>
                <select v-model="activeArea" class="filter-field__control">
                  <option
                    v-for="item in areaOptions"
                    :key="item.value"
                    :value="item.value"
                  >
                    {{ item.label }}
                  </option>
                </select>
              </label>

              <label class="filter-field">
                <span class="filter-field__label">层级</span>
                <select v-model="activeLayer" class="filter-field__control">
                  <option
                    v-for="item in layerOptions"
                    :key="item.value"
                    :value="item.value"
                  >
                    {{ item.label }}
                  </option>
                </select>
              </label>
            </div>

            <div class="function-list">
              <button
                v-for="item in filteredFunctions"
                :key="item.id"
                type="button"
                class="function-item"
                :class="{ 'function-item--active': item.id === selectedFunctionId }"
                @click="selectFunction(item.id)"
              >
                <component :is="getLayerIcon(item.layer)" class="function-item__icon" />
                <div class="function-item__body">
                  <p class="function-item__symbol">{{ item.symbol }}</p>
                  <p class="function-item__title">{{ item.title }}</p>
                  <p class="function-item__meta">{{ item.owner }} · {{ getLayerLabel(item.layer) }}</p>
                </div>
              </button>

              <div v-if="!filteredFunctions.length" class="empty-box">
                当前筛选条件下没有匹配到函数。
              </div>
            </div>
          </div>
        </section>
      </aside>

      <section class="map-content">
        <section v-if="selectedFunction" class="panel panel--detail">
          <div class="detail-head">
            <div class="detail-head__main">
              <div class="detail-head__meta">
                <span class="detail-badge detail-badge--area">
                  {{ getAreaLabel(selectedFunction.area) }}
                </span>
                <span class="detail-badge detail-badge--layer">
                  {{ getLayerLabel(selectedFunction.layer) }}
                </span>
              </div>
              <h2 class="detail-head__title">{{ selectedFunction.title }}</h2>
              <p class="detail-head__symbol">{{ selectedFunction.symbol }}</p>
            </div>

            <div class="detail-head__icon-wrap">
              <component :is="getLayerIcon(selectedFunction.layer)" class="detail-head__icon" />
            </div>
          </div>

          <p class="detail-summary">{{ selectedFunction.summary }}</p>

          <div class="detail-grid">
            <article class="info-card">
              <p class="info-card__label">所在文件</p>
              <code class="info-card__value">{{ selectedFunction.file }}</code>
            </article>

            <article class="info-card">
              <p class="info-card__label">所属模块</p>
              <p class="info-card__value info-card__value--plain">{{ selectedFunction.owner }}</p>
            </article>

            <article class="info-card">
              <p class="info-card__label">定位提示</p>
              <p class="info-card__value info-card__value--plain">{{ selectedFunction.lookupHint }}</p>
            </article>
          </div>

          <div class="status-callout">
            <template v-if="selectedFunctionFlowIndex >= 0">
              <div>
                <p class="status-callout__label">当前流程位置</p>
                <p class="status-callout__title">
                  第 {{ selectedFunctionFlowIndex + 1 }} 步 / 共 {{ activeScenarioFunctions.length }} 步
                </p>
              </div>
              <p class="status-callout__text">你现在看到的函数，已经挂在当前流程的步骤里了，可以直接继续点“下一步”。</p>
            </template>

            <template v-else-if="owningScenario">
              <div>
                <p class="status-callout__label">跨流程提示</p>
                <p class="status-callout__title">当前函数不在这条流程里</p>
              </div>
              <div class="status-callout__action">
                <p class="status-callout__text">它属于“{{ owningScenario.title }}”。</p>
                <button type="button" class="inline-action" @click="jumpToOwningScenario">
                  跳到所属流程
                </button>
              </div>
            </template>
          </div>

          <div class="relation-grid">
            <article class="relation-card">
              <div class="relation-card__header">
                <Route class="relation-card__icon" />
                <h3 class="relation-card__title">上游调用方</h3>
              </div>
              <div class="relation-card__body">
                <button
                  v-for="item in relatedCallers"
                  :key="`${selectedFunction.id}-caller-${item.id}`"
                  type="button"
                  class="relation-chip"
                  @click="selectFunction(item.id)"
                >
                  {{ item.target.symbol }}
                </button>
                <span v-if="!relatedCallers.length" class="relation-empty">当前地图里没有登记到上游调用方</span>
              </div>
            </article>

            <article class="relation-card">
              <div class="relation-card__header">
                <Workflow class="relation-card__icon" />
                <h3 class="relation-card__title">下游调用方</h3>
              </div>
              <div class="relation-card__body">
                <button
                  v-for="item in relatedCallees"
                  :key="`${selectedFunction.id}-callee-${item.id}`"
                  type="button"
                  class="relation-chip"
                  @click="selectFunction(item.id)"
                >
                  {{ item.target.symbol }}
                </button>
                <span v-if="!relatedCallees.length" class="relation-empty">当前地图里没有登记到下游函数</span>
              </div>
            </article>
          </div>

          <div class="annotation-layout">
            <section class="annotation-panel">
              <div class="annotation-panel__header">
                <FileCode2 class="annotation-panel__icon" />
                <h3 class="annotation-panel__title">逐段注释</h3>
              </div>

              <div class="annotation-list">
                <button
                  v-for="(item, index) in selectedFunction.comments"
                  :key="`${selectedFunction.id}-comment-${index}`"
                  type="button"
                  class="annotation-card"
                  :class="{ 'annotation-card--active': index === activeCommentIndex }"
                  @click="selectComment(index)"
                >
                  <div class="annotation-card__top">
                    <span class="annotation-card__range">L{{ item.start }}-L{{ item.end }}</span>
                    <span class="annotation-card__index">{{ index + 1 }}</span>
                  </div>
                  <h4 class="annotation-card__title">{{ item.title }}</h4>
                  <p class="annotation-card__detail">{{ item.detail }}</p>
                </button>
              </div>
            </section>

            <section class="code-panel">
              <div class="code-panel__header">
                <SearchCode class="code-panel__icon" />
                <h3 class="code-panel__title">函数代码可视化</h3>
              </div>

              <div v-if="selectedComment" class="code-focus">
                <div class="code-focus__top">
                  <span>当前阅读焦点</span>
                  <span>L{{ selectedComment.start }}-L{{ selectedComment.end }}</span>
                </div>
                <h4 class="code-focus__title">{{ selectedComment.title }}</h4>
                <p class="code-focus__detail">{{ selectedComment.detail }}</p>
              </div>

              <div class="code-viewer">
                <div
                  v-for="(line, index) in selectedCodeLines"
                  :key="`${selectedFunction.id}-line-${index + 1}`"
                  class="code-line"
                  :class="{ 'code-line--active': isHighlightedLine(index + 1) }"
                >
                  <span class="code-line__no">{{ index + 1 }}</span>
                  <code class="code-line__text">{{ line || ' ' }}</code>
                </div>
              </div>
            </section>
          </div>
        </section>
      </section>
    </div>
  </section>
</template>

<style scoped>
.code-map-page {
  --shell-bg: linear-gradient(180deg, #edf4ff 0%, #f6f8fc 36%, #f4f6fa 100%);
  --panel-border: rgba(213, 223, 237, 0.96);
  --panel-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  --text-main: #0f172a;
  --text-soft: #5b6577;
  --text-faint: #7b8798;
  --blue-strong: #1d4ed8;
  --blue-soft: #eef4ff;
  --green-soft: #ecfdf3;
  --amber-soft: #fff7ed;
}

.header-action {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #d7e1ef;
  border-radius: 999px;
  background: #fff;
  padding: 9px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #425267;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease;
}

.header-action:hover {
  transform: translateY(-1px);
}

.header-action--active {
  border-color: #0f172a;
  background: #0f172a;
  color: #fff;
}

.header-action--primary {
  border-color: #cfe0ff;
  background: linear-gradient(180deg, #eff5ff 0%, #deebff 100%);
  color: #173a63;
}

.guide-banner {
  position: relative;
  display: grid;
  gap: 18px;
  border: 1px solid var(--panel-border);
  border-radius: 30px;
  background:
    radial-gradient(circle at top right, rgba(37, 99, 235, 0.15), transparent 32%),
    linear-gradient(180deg, #fbfdff 0%, #f5f8fd 100%);
  padding: 24px;
  box-shadow: var(--panel-shadow);
}

.guide-banner__main {
  display: grid;
  gap: 12px;
}

.guide-banner__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #355781;
}

.guide-banner__title {
  font-size: 24px;
  line-height: 1.35;
  font-weight: 700;
  color: var(--text-main);
}

.guide-banner__desc {
  max-width: 920px;
  font-size: 14px;
  line-height: 1.85;
  color: var(--text-soft);
}

.guide-banner__tips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.guide-tip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  padding: 8px 12px;
  font-size: 13px;
  color: #45617f;
}

.guide-banner__actions {
  display: grid;
  gap: 12px;
}

.quick-start-card {
  border: 1px solid #d9e3f1;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.92);
  padding: 16px;
  text-align: left;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.quick-start-card:hover {
  transform: translateY(-1px);
  border-color: #bcd2f6;
  box-shadow: 0 12px 26px rgba(37, 99, 235, 0.08);
}

.quick-start-card__top {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
}

.quick-start-card__text {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.75;
  color: var(--text-soft);
}

.guide-banner__close {
  position: absolute;
  top: 16px;
  right: 16px;
  border: 0;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.06);
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 700;
  color: #45617f;
}

.metrics-grid {
  display: grid;
  gap: 14px;
}

.metric-card {
  border: 1px solid var(--panel-border);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.92);
  padding: 20px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.05);
}

.metric-card--primary {
  background: linear-gradient(135deg, #17406d 0%, #255fa9 100%);
  color: #fff;
}

.metric-card__label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.8;
}

.metric-card__value {
  margin-top: 10px;
  font-size: 38px;
  line-height: 1;
  font-weight: 700;
}

.metric-card__meta {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.7;
  opacity: 0.86;
}

.map-layout {
  display: grid;
  gap: 20px;
  align-items: start;
}

.map-sidebar {
  min-width: 0;
}

.panel {
  border: 1px solid var(--panel-border);
  border-radius: 30px;
  background: var(--shell-bg);
  padding: 24px;
  box-shadow: var(--panel-shadow);
}

.panel--sidebar {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel--detail {
  background:
    radial-gradient(circle at top right, rgba(59, 130, 246, 0.14), transparent 32%),
    linear-gradient(180deg, #f8fbff 0%, #f6f8fc 100%);
}

.panel__eyebrow {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #6b7c93;
}

.panel__title {
  margin-top: 8px;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-main);
}

.panel__desc {
  margin-top: 6px;
  font-size: 14px;
  line-height: 1.75;
  color: var(--text-soft);
}

.sidebar-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.sidebar-switch__button {
  border: 1px solid #d8e2f1;
  border-radius: 16px;
  background: #fff;
  padding: 12px 14px;
  font-size: 14px;
  font-weight: 700;
  color: #4a5d73;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    color 0.2s ease;
}

.sidebar-switch__button--active {
  border-color: #0f172a;
  background: #0f172a;
  color: #fff;
}

.sidebar-body {
  display: grid;
  gap: 14px;
  min-height: 0;
}

.scenario-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.scenario-tab {
  border: 1px solid #d8e2f1;
  border-radius: 999px;
  background: #fff;
  padding: 9px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #536276;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease;
}

.scenario-tab:hover {
  transform: translateY(-1px);
}

.scenario-tab--active {
  border-color: #173a63;
  background: #173a63;
  color: #fff;
}

.scenario-summary,
.progress-card,
.search-intro,
.status-callout {
  border: 1px solid #dce5f2;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.88);
  padding: 16px;
}

.scenario-summary__title,
.progress-card__focus-title,
.search-intro__top,
.status-callout__title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
}

.scenario-summary__desc,
.progress-card__focus-text,
.search-intro__text,
.status-callout__text {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-soft);
}

.progress-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  font-weight: 700;
  color: #45617f;
}

.progress-card__track {
  margin-top: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: #e8effa;
  height: 10px;
}

.progress-card__fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #1d4ed8 0%, #60a5fa 100%);
}

.progress-card__focus {
  margin-top: 14px;
}

.progress-card__focus-label,
.status-callout__label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6f8196;
}

.flow-controls {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.flow-control,
.inline-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid #d8e2f1;
  border-radius: 14px;
  background: #fff;
  padding: 11px 12px;
  font-size: 13px;
  font-weight: 700;
  color: #425267;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    color 0.2s ease;
}

.flow-control:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.flow-control--primary,
.inline-action {
  border-color: #cfe0ff;
  background: linear-gradient(180deg, #eff5ff 0%, #deebff 100%);
  color: #173a63;
}

.scenario-steps,
.function-list,
.annotation-list {
  display: grid;
  gap: 10px;
}

.step-card,
.function-item,
.annotation-card {
  border: 1px solid #dde6f2;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
  text-align: left;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.step-card:hover,
.function-item:hover,
.annotation-card:hover {
  transform: translateY(-1px);
}

.step-card {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 12px;
  padding: 14px;
}

.step-card--active,
.function-item--active,
.annotation-card--active {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.step-card__index {
  display: flex;
  height: 28px;
  width: 28px;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: #0f172a;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
}

.step-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.step-card__symbol,
.function-item__symbol {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
  word-break: break-word;
}

.step-card__title,
.function-item__title {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-soft);
}

.step-card__file,
.function-item__meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-faint);
}

.step-card__state {
  border-radius: 999px;
  background: #eef4ff;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 700;
  color: #1d4ed8;
}

.search-intro__top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-intro__count {
  margin-left: auto;
  border-radius: 999px;
  background: #eef4ff;
  padding: 4px 9px;
  font-size: 12px;
  color: #1d4ed8;
}

.filter-grid {
  display: grid;
  gap: 12px;
}

.filter-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-field--wide {
  grid-column: 1 / -1;
}

.filter-field__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}

.filter-field__control {
  width: 100%;
  border: 1px solid #d7e1ef;
  border-radius: 15px;
  background: #fff;
  padding: 12px 14px;
  font-size: 14px;
  color: var(--text-main);
  outline: none;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.filter-field__control:focus {
  border-color: #7ca6e9;
  box-shadow: 0 0 0 4px rgba(124, 166, 233, 0.14);
}

.function-item {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 12px;
  padding: 12px;
}

.function-item__icon {
  height: 18px;
  width: 18px;
  margin-top: 3px;
  color: #355781;
}

.empty-box {
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.78);
  padding: 18px;
  text-align: center;
  color: var(--text-faint);
}

.detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.detail-head__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.detail-badge {
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 700;
}

.detail-badge--area {
  background: #173a63;
  color: #fff;
}

.detail-badge--layer {
  background: rgba(15, 23, 42, 0.08);
  color: #314355;
}

.detail-head__title {
  margin-top: 14px;
  font-size: 28px;
  line-height: 1.2;
  font-weight: 700;
  color: var(--text-main);
}

.detail-head__symbol {
  margin-top: 8px;
  font-size: 15px;
  font-weight: 600;
  color: #355781;
  word-break: break-word;
}

.detail-head__icon-wrap {
  display: flex;
  height: 60px;
  width: 60px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 20px;
  background: rgba(15, 23, 42, 0.06);
}

.detail-head__icon {
  height: 24px;
  width: 24px;
  color: #173a63;
}

.detail-summary {
  margin-top: 18px;
  font-size: 15px;
  line-height: 1.85;
  color: var(--text-soft);
}

.detail-grid,
.relation-grid,
.annotation-layout {
  margin-top: 20px;
  display: grid;
  gap: 14px;
}

.info-card,
.relation-card,
.annotation-panel,
.code-panel {
  border: 1px solid #dde6f2;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.9);
  padding: 18px;
}

.info-card__label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.info-card__value {
  margin-top: 10px;
  display: block;
  border-radius: 14px;
  background: #f4f7fb;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.75;
  color: #23324a;
  word-break: break-all;
}

.info-card__value--plain {
  background: transparent;
  padding: 0;
  font-size: 14px;
  color: var(--text-main);
  word-break: break-word;
}

.status-callout {
  margin-top: 20px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.status-callout__title {
  margin-top: 6px;
}

.status-callout__action {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.relation-card__header,
.annotation-panel__header,
.code-panel__header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.relation-card__icon,
.annotation-panel__icon,
.code-panel__icon {
  height: 18px;
  width: 18px;
  color: #244772;
}

.relation-card__title,
.annotation-panel__title,
.code-panel__title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-main);
}

.relation-card__body {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.relation-chip {
  border: 1px solid #d6e1ef;
  border-radius: 999px;
  background: #fff;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  color: #355781;
}

.relation-empty {
  font-size: 13px;
  color: var(--text-faint);
}

.annotation-card {
  padding: 14px;
}

.annotation-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.annotation-card__range {
  font-size: 12px;
  font-weight: 700;
  color: #355781;
}

.annotation-card__index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.1);
  font-size: 12px;
  font-weight: 700;
  color: #2563eb;
}

.annotation-card__title {
  margin-top: 8px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
}

.annotation-card__detail {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-soft);
}

.code-focus {
  margin-top: 14px;
  border-radius: 18px;
  background: var(--blue-soft);
  padding: 14px 16px;
}

.code-focus__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #4b6486;
}

.code-focus__title {
  margin-top: 8px;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
}

.code-focus__detail {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-soft);
}

.code-viewer {
  margin-top: 14px;
  overflow: auto;
  border-radius: 18px;
  background: #0f172a;
  padding: 14px 0;
}

.code-line {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 12px;
  padding: 0 16px;
  font-family:
    'SFMono-Regular',
    Consolas,
    'Liberation Mono',
    Menlo,
    monospace;
  font-size: 13px;
  line-height: 1.8;
  color: #dbe8ff;
}

.code-line--active {
  background: rgba(59, 130, 246, 0.16);
}

.code-line__no {
  user-select: none;
  color: #7f92af;
  text-align: right;
}

.code-line__text {
  white-space: pre-wrap;
  word-break: break-word;
}

@media (min-width: 860px) {
  .guide-banner__actions,
  .metrics-grid,
  .detail-grid,
  .relation-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .guide-banner {
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
    align-items: start;
  }

  .map-layout {
    grid-template-columns: 360px minmax(0, 1fr);
  }

  .map-sidebar {
    position: sticky;
    top: 16px;
  }

  .panel--sidebar {
    max-height: calc(100vh - 32px);
  }

  .sidebar-body {
    overflow: auto;
    padding-right: 4px;
  }
}

@media (min-width: 1180px) {
  .annotation-layout {
    grid-template-columns: 360px minmax(0, 1fr);
  }
}

@media (max-width: 859px) {
  .guide-banner__close {
    position: static;
    justify-self: start;
  }

  .flow-controls {
    grid-template-columns: 1fr;
  }

  .status-callout,
  .status-callout__action,
  .detail-head {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 640px) {
  .panel,
  .guide-banner,
  .metric-card {
    padding: 18px;
  }

  .guide-banner__title,
  .detail-head__title {
    font-size: 22px;
  }

  .header-action {
    width: 100%;
    justify-content: center;
  }

  .sidebar-switch {
    grid-template-columns: 1fr;
  }
}
</style>
