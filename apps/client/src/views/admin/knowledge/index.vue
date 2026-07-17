<script setup lang="ts">
import { ElMessage } from "element-plus";
import {
  ArrowUpRight,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import { useKnowledgeBases } from "@/composables/knowledge/useKnowledgeBases";
import KnowledgeSettings from "./settings.vue";

const router = useRouter();
const {
  knowledgeBases,
  isLoading,
  loadKnowledgeBases,
  createKnowledgeBase,
  updateKnowledgeBase,
  removeKnowledgeBase,
} = useKnowledgeBases();

const searchInput = ref("");
const keyword = ref("");
const pageNo = ref(1);
const pageSize = 10;

const createDialogOpen = ref(false);
const createName = ref("");
const createDescription = ref("");

const renameDialogOpen = ref(false);
const renameTargetId = ref("");
const renameValue = ref("");
const renameDescription = ref("");

const deleteDialogOpen = ref(false);
const deleteTargetId = ref("");
const isSubmitting = ref(false);

const filteredKnowledgeBases = computed(() => {
  const normalized = keyword.value.trim().toLowerCase();
  const list = knowledgeBases.value.filter((item) => {
    if (!normalized) return true;
    const name = item.name.toLowerCase();
    const description = (item.description || "").toLowerCase();
    return name.includes(normalized) || description.includes(normalized);
  });

  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(pageNo.value, pages);
  const start = (current - 1) * pageSize;

  return {
    total,
    pages,
    current,
    records: list.slice(start, start + pageSize),
  };
});

const stats = computed(() => {
  const list = knowledgeBases.value;
  const totalDocuments = list.reduce(
    (sum, item) => sum + (item.documentCount ?? 0),
    0,
  );
  const activeKnowledgeBases = list.filter(
    (item) => (item.documentCount ?? 0) > 0,
  ).length;

  return [
    {
      label: "知识库",
      value: list.length,
      hint: "当前已接入",
    },
    {
      label: "文档数",
      value: totalDocuments,
      hint: "跨知识库累计",
    },
    {
      label: "活跃知识库",
      value: activeKnowledgeBases,
      hint: "已有文档内容",
    },
  ];
});

const canCreateKnowledgeBase = computed(
  () => createName.value.trim().length > 0,
);

const getCollectionName = (name: string) =>
  name.trim().toLowerCase().replace(/\s+/g, "_");

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  const seconds = String(parsed.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const handleSearch = () => {
  pageNo.value = 1;
  keyword.value = searchInput.value.trim();
};

const handleRefresh = async () => {
  pageNo.value = 1;
  await loadKnowledgeBases();
};

const openRename = (id: string, name: string, description?: string) => {
  renameTargetId.value = id;
  renameValue.value = name;
  renameDescription.value = description || "";
  renameDialogOpen.value = true;
};

const closeRename = () => {
  renameDialogOpen.value = false;
  renameTargetId.value = "";
  renameValue.value = "";
  renameDescription.value = "";
};

const submitRename = async () => {
  if (!renameTargetId.value || !renameValue.value.trim() || isSubmitting.value)
    return;

  isSubmitting.value = true;
  try {
    await updateKnowledgeBase(renameTargetId.value, {
      name: renameValue.value.trim(),
      description: renameDescription.value.trim(),
    });
    ElMessage.success("知识库已更新");
    closeRename();
  } finally {
    isSubmitting.value = false;
  }
};

const openDelete = (id: string) => {
  deleteTargetId.value = id;
  deleteDialogOpen.value = true;
};

const closeDelete = () => {
  deleteDialogOpen.value = false;
  deleteTargetId.value = "";
};

const submitDelete = async () => {
  if (!deleteTargetId.value || isSubmitting.value) return;

  isSubmitting.value = true;
  try {
    await removeKnowledgeBase(deleteTargetId.value);
    ElMessage.success("知识库已删除");
    closeDelete();
  } finally {
    isSubmitting.value = false;
  }
};

const closeCreate = () => {
  createDialogOpen.value = false;
  createName.value = "";
  createDescription.value = "";
};

const submitCreate = async () => {
  if (!canCreateKnowledgeBase.value || isSubmitting.value) return;

  isSubmitting.value = true;
  try {
    const created = await createKnowledgeBase({
      name: createName.value.trim(),
      description: createDescription.value.trim(),
    });
    ElMessage.success("知识库已创建");
    closeCreate();
    router.push(`/admin/knowledge/${created.id}`);
  } finally {
    isSubmitting.value = false;
  }
};

onMounted(async () => {
  await loadKnowledgeBases();
});
</script>

<template>
  <section class="knowledge-console">
    <header class="page-header">
      <div>
        <h1>知识库</h1>
        <span>文档、检索测试与运行配置</span>
      </div>
      <button
        class="primary-button"
        type="button"
        @click="createDialogOpen = true"
      >
        <Plus class="h-4 w-4" />新建知识库
      </button>
    </header>

    <div class="knowledge-scroll">
      <div class="knowledge-content">
        <section class="intro-line">
          <div>
            <h2>让资料成为可验证的回答依据</h2>
            <p>管理文档、检查入库结果，并在同一处调整检索的运行方式。</p>
          </div>
          <dl>
            <div v-for="item in stats" :key="item.label">
              <dt>{{ item.label }}</dt>
              <dd>{{ item.value }}</dd>
            </div>
          </dl>
        </section>

        <section class="knowledge-space">
          <header>
            <div>
              <h2>知识空间</h2>
              <span>{{ filteredKnowledgeBases.total }} 个知识库</span>
            </div>
            <div class="knowledge-tools">
              <label
                ><Search class="h-4 w-4" /><input
                  v-model="searchInput"
                  type="search"
                  placeholder="搜索知识库"
                  @keydown.enter="handleSearch"
              /></label>
              <button type="button" aria-label="搜索" @click="handleSearch">
                搜索
              </button>
              <button type="button" aria-label="刷新" @click="handleRefresh">
                <RefreshCw class="h-4 w-4" />
              </button>
            </div>
          </header>

          <div v-if="isLoading && !knowledgeBases.length" class="empty-line">
            正在加载知识库数据
          </div>
          <div
            v-else-if="!filteredKnowledgeBases.records.length"
            class="empty-line"
          >
            {{ keyword ? "没有匹配的知识库" : "还没有知识库" }}
          </div>
          <div v-else class="knowledge-list">
            <article
              v-for="item in filteredKnowledgeBases.records"
              :key="item.id"
              class="knowledge-row"
            >
              <button
                class="knowledge-row__main"
                type="button"
                @click="router.push(`/admin/knowledge/${item.id}`)"
              >
                <span class="library-mark">{{
                  item.name.slice(0, 2).toUpperCase()
                }}</span>
                <span
                  ><strong>{{ item.name }}</strong
                  ><small>{{ item.description || "暂无描述" }}</small></span
                >
              </button>
              <dl>
                <div>
                  <dt>文档</dt>
                  <dd class="dd-content">{{ item.documentCount ?? 0 }}</dd>
                </div>
                <div>
                  <dt>标识</dt>
                  <dd class="dd-content">{{ getCollectionName(item.name) }}</dd>
                </div>
                <div>
                  <dt>更新</dt>
                  <dd class="dd-content">{{ formatDateTime(item.updatedAt) }}</dd>
                </div>
              </dl>
              <div class="knowledge-row__actions">
                <button
                  type="button"
                  @click="openRename(item.id, item.name, item.description)"
                >
                  <Pencil class="h-4 w-4" />编辑
                </button>
                <button
                  type="button"
                  class="is-danger"
                  @click="openDelete(item.id)"
                >
                  <Trash2 class="h-4 w-4" />删除
                </button>
                <button
                  type="button"
                  @click="router.push(`/admin/knowledge/${item.id}`)"
                >
                  进入<ArrowUpRight class="h-4 w-4" />
                </button>
              </div>
            </article>
          </div>

          <footer class="list-footer">
            <span
              >第 {{ filteredKnowledgeBases.current }} /
              {{ filteredKnowledgeBases.pages }} 页</span
            >
            <div>
              <button
                type="button"
                :disabled="filteredKnowledgeBases.current <= 1"
                @click="pageNo = Math.max(1, pageNo - 1)"
              >
                上一页
              </button>
              <button
                type="button"
                :disabled="
                  filteredKnowledgeBases.current >= filteredKnowledgeBases.pages
                "
                @click="
                  pageNo = Math.min(filteredKnowledgeBases.pages, pageNo + 1)
                "
              >
                下一页
              </button>
            </div>
          </footer>
        </section>

        <KnowledgeSettings embedded />
      </div>
    </div>

    <el-dialog
      v-model="renameDialogOpen"
      title="编辑知识库"
      width="420px"
      destroy-on-close
    >
      <div class="space-y-3">
        <div>
          <div class="mb-2 text-sm font-medium text-slate-900">名称</div>
          <el-input v-model="renameValue" placeholder="请输入知识库名称" />
        </div>
        <div>
          <div class="mb-2 text-sm font-medium text-slate-900">描述</div>
          <el-input
            v-model="renameDescription"
            type="textarea"
            :rows="4"
            placeholder="请输入知识库描述"
          />
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <el-button @click="closeRename">取消</el-button>
          <el-button
            type="primary"
            :loading="isSubmitting"
            :disabled="!renameValue.trim()"
            @click="submitRename"
            >保存</el-button
          >
        </div>
      </template>
    </el-dialog>

    <el-dialog
      v-model="deleteDialogOpen"
      title="删除知识库"
      width="420px"
      destroy-on-close
    >
      <p class="text-sm leading-6 text-slate-500">
        删除后将同时移除该知识库下的文档和分块记录，这个操作不可恢复。
      </p>
      <template #footer>
        <div class="flex justify-end gap-3">
          <el-button @click="closeDelete">取消</el-button>
          <el-button type="danger" :loading="isSubmitting" @click="submitDelete">删除</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      v-model="createDialogOpen"
      title="新建知识库"
      width="620px"
      destroy-on-close
    >
      <div class="grid gap-4">
        <div>
          <div class="mb-2 text-sm font-medium text-slate-900">名称</div>
          <el-input v-model="createName" placeholder="例如：财务制度库" />
        </div>
        <div>
          <div class="mb-2 text-sm font-medium text-slate-900">描述</div>
          <el-input
            v-model="createDescription"
            type="textarea"
            :rows="6"
            placeholder="描述知识库用途与适用范围"
          />
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <el-button @click="closeCreate">取消</el-button>
          <el-button
            type="primary"
            :loading="isSubmitting"
            :disabled="!canCreateKnowledgeBase"
            @click="submitCreate"
            >创建</el-button
          >
        </div>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.knowledge-console {
  display: grid;
  gap: 18px;
}
.runtime-section {
  margin-top: 24px;
  border-top: 1px solid #d8d8d1;
  padding-top: 24px;
}
.runtime-section > header h2 {
  margin: 0;
  font-family: ui-serif, Georgia, "Songti SC", serif;
  font-size: 20px;
}
.runtime-section > header p {
  margin: 7px 0 20px;
  color: #777770;
  font-size: 13px;
}

.knowledge-search {
  display: flex;
  min-width: min(100%, 280px);
  flex: 1 1 280px;
  align-items: center;
  gap: 8px;
  border: 1px solid #d7dee7;
  border-radius: 10px;
  background: #ffffff;
  padding: 0 12px;
  color: #64748b;
}

.knowledge-search input {
  width: 100%;
  border: 0;
  background: transparent;
  padding: 11px 0;
  font-size: 14px;
  color: #0f172a;
  outline: none;
}

.stats-strip {
  display: grid;
  gap: 0;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  overflow: hidden;
  border: 1px solid #dbe4ee;
  border-radius: 14px;
  background: #ffffff;
}

.stats-item {
  display: grid;
  gap: 6px;
  padding: 18px 20px;
}

.stats-item + .stats-item {
  border-left: 1px solid #eef2f7;
}

.stats-item__head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.stats-item__icon {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 8px;
  background: #f3f6f9;
  color: #5b6b7f;
}

.stats-item__label {
  font-size: 13px;
  color: #64748b;
}

.stats-item__value {
  font-size: 24px;
  line-height: 1;
  font-weight: 700;
  color: #0f172a;
}

.stats-item__hint {
  font-size: 12px;
  color: #94a3b8;
}

.list-shell {
  overflow: hidden;
  border: 1px solid #dbe4ee;
  border-radius: 14px;
  background: #ffffff;
}

.list-shell__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  border-bottom: 1px solid #eef2f7;
  padding: 20px 24px 16px;
}

.list-shell__header h2 {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

.list-shell__header p {
  margin-top: 6px;
  font-size: 14px;
  color: #64748b;
}

.list-shell__summary {
  display: flex;
  gap: 18px;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
}

.knowledge-list {
  display: grid;
}

.knowledge-row {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(240px, 0.8fr) auto;
  gap: 22px;
  align-items: center;
  padding: 20px 24px;
}

.knowledge-row + .knowledge-row {
  border-top: 1px solid #eef2f7;
}

.knowledge-row__main {
  min-width: 0;
}

.knowledge-row__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: 0;
  padding: 0;
  font-size: 16px;
  font-weight: 600;
  color: #0f766e;
  text-align: left;
  cursor: pointer;
}

.knowledge-row__title:hover {
  color: #115e59;
}

.knowledge-row__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.knowledge-row__count {
  font-size: 13px;
  color: #64748b;
}

.knowledge-row__desc {
  margin-top: 12px;
  max-width: 60ch;
  font-size: 14px;
  line-height: 1.75;
  color: #475569;
}

.knowledge-row__desc--muted {
  color: #94a3b8;
}

.knowledge-row__facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 18px;
}

.knowledge-row__facts dt {
  font-size: 12px;
  color: #94a3b8;
}

.knowledge-row__facts dd {
  margin-top: 6px;
  font-size: 14px;
  font-weight: 600;
  color: #334155;
}

.knowledge-row__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}
.knowledge-row > dl > div {
  min-width: 0; /* 关键：允许grid列被内容压缩 */
}
.row-action {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  gap: 8px;
  border: 1px solid #dbe4ee;
  border-radius: 10px;
  background: #ffffff;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 500;
  color: #334155;
  cursor: pointer;
}

.row-action:hover {
  border-color: #99f6e4;
  background: #f0fdfa;
  color: #0f766e;
}

.row-action--danger:hover {
  border-color: #fecaca;
  background: #fef2f2;
  color: #dc2626;
}

.collection-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 9999px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
}

.collection-badge--blue {
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #2563eb;
}

.collection-badge--sky {
  border: 1px solid #bae6fd;
  background: #f0f9ff;
  color: #0369a1;
}

.collection-badge--slate {
  border: 1px solid #dbe2ea;
  background: #f8fafc;
  color: #475569;
}

.empty-block {
  display: grid;
  place-items: center;
  gap: 10px;
  padding: 72px 24px;
  text-align: center;
  color: #64748b;
}

.empty-block strong {
  font-size: 18px;
  color: #0f172a;
}

.empty-block p {
  max-width: 44ch;
  line-height: 1.75;
}

.empty-block--soft {
  background: linear-gradient(180deg, #ffffff, #f8fafc);
}

.list-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid #eef2f7;
  padding: 16px 24px;
  font-size: 14px;
  color: #64748b;
}

.list-footer__actions {
  display: flex;
  gap: 10px;
}

@media (max-width: 1240px) {
  .list-shell__header,
  .knowledge-row {
    display: grid;
    grid-template-columns: 1fr;
  }

  .knowledge-row__actions {
    justify-content: flex-start;
  }
}

@media (max-width: 960px) {
  .stats-strip {
    grid-template-columns: 1fr;
  }

  .stats-item + .stats-item {
    border-top: 1px solid #eef2f7;
    border-left: 0;
  }

  .list-shell__header,
  .knowledge-row,
  .list-footer {
    padding-left: 20px;
    padding-right: 20px;
  }
}

@media (max-width: 640px) {
  .knowledge-search {
    min-width: 100%;
  }

  .knowledge-row__facts,
  .list-footer {
    display: grid;
    grid-template-columns: 1fr;
  }

  .list-footer {
    align-items: flex-start;
    gap: 12px;
  }
}

/* 生产页面沿用 Studio Demo 的线性阅读布局。 */
.knowledge-console {
  display: grid;
  min-width: 0;
  min-height: 0;
  height: 100%;
  grid-template-rows: auto 1fr;
  gap: 0;
  background: #fafaf7;
  color: #191918;
}

.page-header {
  display: flex;
  min-height: 70px;
  align-items: center;
  justify-content: space-between;
  padding: 0 25px;
  border-bottom: 1px solid #e8e8e2;
  background: rgb(250 250 247 / 94%);
}

.page-header > div {
  display: grid;
  gap: 3px;
}

.page-header h1 {
  margin: 0;
  font:
    600 16px ui-serif,
    Georgia,
    "Songti SC",
    serif;
}

.page-header span {
  color: #777770;
  font-size: 12px;
}

.primary-button {
  display: inline-flex;
  height: 36px;
  align-items: center;
  gap: 7px;
  border: 1px solid #5b5bf7;
  border-radius: 8px;
  background: #5b5bf7;
  padding: 0 11px;
  color: #fff;
  font-size: 13px;
}

.knowledge-scroll {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}

.knowledge-content {
  width: min(1080px, calc(100% - 64px));
  margin: auto;
  padding: 48px 0 90px;
}

.intro-line {
  display: grid;
  grid-template-columns: 1.25fr 1fr;
  gap: 70px;
  padding-bottom: 42px;
  border-bottom: 1px solid #e8e8e2;
}

.intro-line h2 {
  max-width: 520px;
  margin: 0 0 13px;
  font:
    500 32px/1.25 ui-serif,
    Georgia,
    "Songti SC",
    serif;
}

.intro-line p {
  max-width: 560px;
  margin: 0;
  color: #44443f;
  line-height: 1.7;
}

.intro-line dl {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin: 0;
}

.intro-line dl > div {
  padding-left: 20px;
  border-left: 1px solid #e8e8e2;
}

.intro-line dt {
  color: #777770;
  font-size: 12px;
}

.intro-line dd {
  margin: 10px 0 0;
  font:
    600 26px ui-serif,
    Georgia,
    serif;
}

.knowledge-space {
  padding: 37px 0;
}

.knowledge-space > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 15px;
}

.knowledge-space > header > div:first-child {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.knowledge-space h2 {
  margin: 0;
  font:
    600 17px ui-serif,
    Georgia,
    "Songti SC",
    serif;
}

.knowledge-space header span {
  color: #777770;
  font-size: 11px;
}

.knowledge-tools {
  display: flex;
  align-items: center;
  gap: 7px;
}

.knowledge-tools label {
  display: flex;
  height: 35px;
  align-items: center;
  gap: 7px;
  padding: 0 9px;
  border-bottom: 1px solid #d8d8d1;
  color: #777770;
}

.knowledge-tools input {
  width: 170px;
  border: 0;
  outline: 0;
  background: transparent;
  color: #191918;
}

.knowledge-tools > button,
.list-footer button,
.knowledge-row__actions button {
  display: inline-flex;
  height: 34px;
  align-items: center;
  gap: 6px;
  border: 1px solid #d8d8d1;
  border-radius: 7px;
  background: #fff;
  padding: 0 10px;
  color: #55554f;
  font-size: 12px;
}

.knowledge-list {
  display: block;
}

.knowledge-row {
  display: grid;
  grid-template-columns: minmax(260px, 1.3fr) 1fr auto;
  align-items: center;
  gap: 35px;
  padding: 22px 4px;
  border-top: 1px solid #e8e8e2;
}

.knowledge-row:last-child {
  border-bottom: 1px solid #e8e8e2;
}

.knowledge-row__main {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 15px;
  border: 0;
  background: transparent;
  padding: 0;
  text-align: left;
}

.library-mark {
  display: grid;
  width: 42px;
  height: 42px;
  flex: none;
  place-items: center;
  border: 1px solid #e8e8e2;
  border-radius: 9px;
  background: #fff;
  color: #5b5bf7;
  font-size: 12px;
  font-weight: 700;
}

.knowledge-row__main > span:last-child {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.knowledge-row__main strong {
  overflow: hidden;
  color: #191918;
  font:
    600 16px ui-serif,
    Georgia,
    "Songti SC",
    serif;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-row__main small {
  overflow: hidden;
  color: #777770;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-row > dl {
  display: grid;
  grid-template-columns: 0.65fr 1fr 1.4fr;
  gap: 18px;
  margin: 0;
}

.knowledge-row dt {
  color: #777770;
  font-size: 10px;
}

.knowledge-row dd {
  overflow: hidden;
  margin: 5px 0 0;
  color: #44443f;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-row__actions {
  display: flex;
  flex-wrap: nowrap;
  justify-content: flex-end;
  gap: 6px;
}

.knowledge-row__actions button:hover,
.knowledge-tools > button:hover,
.list-footer button:hover:not(:disabled) {
  border-color: #5b5bf7;
  color: #4d4dd1;
}

.knowledge-row__actions button.is-danger:hover {
  border-color: #d88b8b;
  color: #b42318;
}

.empty-line {
  padding: 56px 4px;
  border-top: 1px solid #e8e8e2;
  border-bottom: 1px solid #e8e8e2;
  color: #777770;
  text-align: center;
}

.list-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 0;
  padding: 14px 4px 0;
  color: #777770;
  font-size: 11px;
}

.list-footer > div {
  display: flex;
  gap: 6px;
}

.list-footer button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

@media (max-width: 1000px) {
  .knowledge-row {
    grid-template-columns: 1fr auto;
  }

  .knowledge-row > dl {
    display: none;
  }
}

@media (max-width: 760px) {
  .page-header {
    padding-inline: 15px;
  }

  .knowledge-content {
    width: calc(100% - 28px);
  }

  .intro-line {
    grid-template-columns: 1fr;
    gap: 24px;
  }

  .knowledge-space > header {
    align-items: flex-start;
    flex-direction: column;
  }

  .knowledge-tools,
  .knowledge-tools label {
    width: 100%;
  }

  .knowledge-tools input {
    width: 100%;
  }

  .knowledge-row {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .knowledge-row__actions {
    justify-content: flex-start;
  }
}
</style>
