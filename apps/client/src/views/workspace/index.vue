<script setup lang="ts">
import { ArrowDown, Plus, Search } from "lucide-vue-next";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useKnowledgeBases } from "@/composables/knowledge/useKnowledgeBases";
import { useRetrievalRewritePreference } from "@/composables/knowledge/useRetrievalRewritePreference";
import { useAutoScroll } from "@/composables/workspace/useAutoScroll";
import { useConversationList } from "@/composables/workspace/useConversationList";
import { useWorkspaceChat } from "@/composables/workspace/useWorkspaceChat";
import type { EditableUserMessage } from "@/types/chat/models";
import type { WorkspacePromptCapabilities } from "share-type";
import ContentList from "@/features/workspace/components/content/ContentList.vue";
import WorkspaceWelcome from "@/features/workspace/components/content/WorkspaceWelcome.vue";
import WorkspacePromptBox from "@/features/workspace/components/input/WorkspacePromptBox.vue";
import MessageList from "@/features/workspace/components/sidebar/MessageList.vue";
import AppSidebar from "@/components/shell/AppSidebar.vue";

const route = useRoute();
const router = useRouter();
const conversationList = useConversationList();
const workspaceChat = useWorkspaceChat();
const { knowledgeBases, loadKnowledgeBases } = useKnowledgeBases();
const { rewriteEnabled, setRewriteEnabled } = useRetrievalRewritePreference();
const hasMore = conversationList.hasMore;

const composerValue = ref("");
const conversationSearch = ref("");
const sidebarCollapsed = ref(false);
const selectedKnowledgeBaseId = ref("");
const currentPromptCapabilities = ref<WorkspacePromptCapabilities>({
  think: false,
  rewrite: rewriteEnabled.value,
});
const promptBoxRef = ref<InstanceType<typeof WorkspacePromptBox> | null>(null);
const autoScroll = useAutoScroll();
const {
  stickToBottom,
  startForceStickToBottom,
  stopForceStickToBottom,
  updateStickToBottom,
  scrollMessagesToBottom,
} = autoScroll;
const activeConversation = conversationList.activeConversation;
const activeContentList = workspaceChat.activeContentList;
const hasContent = computed(() => activeContentList.value.length > 0);
const activeConversationId = conversationList.activeConversationId;
const conversationListLoading = conversationList.isLoading;
const initialConversationLoading = computed(
  () => conversationListLoading.value && conversationList.conversations.value.length === 0,
);
const conversationListError = conversationList.error;
const conversationDeleteError = ref("");
const filteredConversations = computed(() => {
  const query = conversationSearch.value.trim().toLocaleLowerCase();
  return query
    ? conversationList.conversations.value.filter((item) =>
        item.title.toLocaleLowerCase().includes(query),
      )
    : conversationList.conversations.value;
});
const messagesLoading = workspaceChat.isLoadingMessages;
const isStreaming = workspaceChat.isStreaming;
const regenerating = workspaceChat.regenerating;
const formatConversationTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  const sameMonth = date.getMonth() === now.getMonth();
  const sameDay = date.getDate() === now.getDate();

  if (sameYear && sameMonth && sameDay) {
    return "今天";
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) {
    return "昨天";
  }

  return date.toLocaleDateString(
    "zh-CN",
    sameYear
      ? {
          month: "2-digit",
          day: "numeric",
        }
      : {
          year: "numeric",
          month: "2-digit",
          day: "numeric",
        },
  );
};

const isConversationStreaming = (conversationId: string) =>
  workspaceChat.isConversationStreaming(conversationId);

watch(
  rewriteEnabled,
  (value) => {
    if (currentPromptCapabilities.value.rewrite === value) {
      return;
    }

    currentPromptCapabilities.value = {
      ...currentPromptCapabilities.value,
      rewrite: value,
    };
  },
  { immediate: true },
);

watch(
  () => currentPromptCapabilities.value.rewrite,
  (value) => {
    const normalizedValue = value !== false;
    if (rewriteEnabled.value === normalizedValue) {
      return;
    }

    setRewriteEnabled(normalizedValue);
  },
);

const handleConversationSelect = async (conversationId: string) => {
  if (conversationId === activeConversationId.value) {
    return;
  }

  conversationList.selectConversation(conversationId);
  startForceStickToBottom();
  composerValue.value = "";
  await router.push(`/workspace/${conversationId}`);
};

const handleConversationDelete = async (conversationId: string) => {
  if (!window.confirm("确认删除这个会话吗？")) {
    return;
  }

  const deletingActiveConversation =
    conversationId === activeConversationId.value;
  conversationDeleteError.value = "";

  try {
    await conversationList.deleteConversation(conversationId);
    workspaceChat.removeConversationMessages(conversationId);
  } catch (error) {
    conversationDeleteError.value =
      error instanceof Error ? error.message : "删除会话失败";
    return;
  }

  if (deletingActiveConversation) {
    composerValue.value = "";
    await router.push("/workspace");
  }
};

const handleCreateConversation = async () => {
  stopForceStickToBottom();
  const conversation = await conversationList.createConversation();
  composerValue.value = "";
  await router.push(`/workspace/${conversation.id}`);
};

const handleSend = async (payload: {
  message: string;
  capabilities: WorkspacePromptCapabilities;
  knowledgeBaseId?: string;
}) => {
  composerValue.value = "";
  const conversationId = await workspaceChat.sendMessage(
    payload.message,
    payload.capabilities,
    payload.knowledgeBaseId,
  );

  if (
    conversationId &&
    conversationId !==
      (typeof route.params.conversationId === "string"
        ? route.params.conversationId
        : "")
  ) {
    await router.push(`/workspace/${conversationId}`);
  }
};

const handleScrollToBottom = () => {
  void scrollMessagesToBottom(true);
};

watch(
  () => route.params.conversationId,
  async (conversationId) => {
    if (typeof conversationId === "string" && conversationId) {
      conversationList.selectConversation(conversationId);
      startForceStickToBottom();
      await workspaceChat.loadConversationMessages(conversationId);
      await scrollMessagesToBottom(true);
    }
  },
);

const handleRegenerate = () => {
  void workspaceChat.regenerateLastAnswer(
    selectedKnowledgeBaseId.value || undefined,
    currentPromptCapabilities.value,
  );
};

const handleWelcomePrompt = async (value: string) => {
  composerValue.value = value;
  await nextTick();
  promptBoxRef.value?.focusComposer();
};

const handleEditMessage = async (payload: EditableUserMessage) => {
  composerValue.value = payload.message.content;
  currentPromptCapabilities.value = payload.promptCapabilities;

  await nextTick();
  promptBoxRef.value?.focusComposer();
};

const handleMemoryClarification = async (payload: { query: string }) => {
  await handleSend({
    message: payload.query,
    capabilities: currentPromptCapabilities.value,
    knowledgeBaseId: selectedKnowledgeBaseId.value || undefined,
  });
};
const page = ref(1)
const limit = 20
const handleLoadMoreConversations = async () => {
  page.value += 1;

  await conversationList.loadConversationList(
    page.value,
    limit,
  );
};
onMounted(async () => {
  const conversationId =
    typeof route.params.conversationId === "string"
      ? route.params.conversationId
      : undefined;

  await Promise.all([
    conversationList.loadConversationList(page.value, limit),
    loadKnowledgeBases(),
  ]);

  if (conversationId) {
    conversationList.selectConversation(conversationId);
    startForceStickToBottom();
    await workspaceChat.loadConversationMessages(conversationId);
  }

  await scrollMessagesToBottom(true);
});
</script>

<template>
  <main class="workspace-shell">
    <AppSidebar v-model:collapsed="sidebarCollapsed">
      <div class="workspace-sidebar-context">
        <button
          type="button"
          class="new-chat-button"
          @click="handleCreateConversation"
        >
          <Plus class="size-4" />
          <span>新建对话</span>
        </button>
        <label class="conversation-search">
          <Search :size="15" />
          <input
            v-model="conversationSearch"
            type="search"
            placeholder="筛选对话"
          />
        </label>
      </div>

      <div class="conversation-scroll">
        <MessageList
          :conversations="filteredConversations"
          :active-conversation-id="activeConversationId"
          :loading="initialConversationLoading"
          :has-more="hasMore"
          :get-conversation-time-label="formatConversationTime"
          :is-conversation-streaming="isConversationStreaming"
          @load-more-page="handleLoadMoreConversations"
          @delete="handleConversationDelete"
          @select="handleConversationSelect"
        />
        <p v-if="conversationDeleteError" class="conversation-delete-error">
          {{ conversationDeleteError }}
        </p>
      </div>
    </AppSidebar>

    <section class="workspace-main">
      <header class="workspace-header">
        <div class="workspace-header__title">
          <h1>
            {{ activeConversation?.title || "新对话" }}
          </h1>
          <span>
            {{
              hasContent ? `共 ${activeContentList.length} 条消息` : "对话界面"
            }}
          </span>
        </div>
      </header>

      <div class="message-stage">
          <div
            :ref="autoScroll.messagesRef"
            class="message-scroll"
            :class="{ 'message-scroll--welcome': !hasContent }"
            @scroll="updateStickToBottom"
          >
          <div
            :ref="autoScroll.contentRef"
            class="message-column"
            :class="{ 'message-column--welcome': !hasContent }"
          >
            <template v-if="initialConversationLoading || messagesLoading">
              <div class="conversation-loading" aria-label="正在加载对话">
                <span />
                <span />
                <span />
              </div>
            </template>

            <template v-else-if="conversationListError">
              <div class="conversation-error">
                <strong>对话加载失败</strong>
                <p>{{ conversationListError }}</p>
                <button
                  type="button"
                  @click="conversationList.loadConversationList(page, limit)"
                >
                  重试
                </button>
              </div>
            </template>

            <template v-else-if="hasContent">
              <ContentList
                :content-list="activeContentList"
                :regenerating="regenerating"
                @edit="handleEditMessage"
                @regenerate="handleRegenerate"
                @clarify-memory="handleMemoryClarification"
              />
            </template>

            <WorkspaceWelcome
              v-else
              :knowledge-bases="knowledgeBases"
              @prompt="handleWelcomePrompt"
            />
          </div>
        </div>
      </div>

      <footer class="composer-area">
        <Transition
          enter-active-class="transition duration-180 ease-out"
          leave-active-class="transition duration-150 ease-in"
          leave-from-class="-translate-y-1/2 opacity-100"
          leave-to-class="translate-y-2 opacity-0"
        >
          <div v-if="hasContent && !stickToBottom" class="scroll-bottom-wrap">
            <button
              type="button"
              aria-label="跳转到底部"
              class="scroll-bottom-button"
              @click="handleScrollToBottom"
            >
              <ArrowDown class="size-5" />
            </button>
          </div>
        </Transition>

        <div class="composer-wrap">
          <WorkspacePromptBox
            ref="promptBoxRef"
            v-model="composerValue"
            :capabilities="currentPromptCapabilities"
            v-model:selected-knowledge-base-id="selectedKnowledgeBaseId"
            :disabled="isStreaming"
            :knowledge-bases="knowledgeBases"
            :streaming="isStreaming"
            @update:capabilities="currentPromptCapabilities = $event"
            @submit="handleSend"
            @stop="workspaceChat.stopStreaming"
          />
        </div>
      </footer>
    </section>
  </main>
</template>

<style scoped>
.workspace-shell {
  display: flex;
  height: 100dvh;
  overflow: hidden;
  background: #fafaf7;
  color: #191918;
}
.workspace-sidebar-context {
  display: grid;
  gap: 10px;
  padding: 18px 13px 0;
}
.conversation-delete-error {
  margin: 8px 8px 0;
  color: #a23f3f;
  font-size: 12px;
}
.new-chat-button {
  display: flex;
  height: 44px;
  align-items: center;
  gap: 9px;
  padding: 0 12px;
  border: 1px solid #d8d8d1;
  border-radius: 9px;
  background: #fff;
  color: #191918;
  font:
    14px ui-serif,
    Georgia,
    "Songti SC",
    serif;
  cursor: pointer;
}
.new-chat-button:hover {
  background: #efefea;
}
.conversation-search {
  display: flex;
  height: 36px;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border-bottom: 1px solid #e8e8e2;
  color: #8a8a83;
}
.conversation-search input {
  min-width: 0;
  flex: 1;
  border: 0;
  background: transparent;
  outline: 0;
  color: #44443f;
  font-size: 12px;
}
.conversation-search input::placeholder {
  color: #aaa9a2;
}
.conversation-scroll {
  height: calc(100dvh - 363px);
  overflow-y: auto;
  padding: 17px 9px 0;
  overscroll-behavior: contain;
}
.workspace-main {
  position: relative;
  display: grid;
  min-width: 0;
  min-height: 0;
  flex: 1;
  grid-template-rows: 70px minmax(0, 1fr) auto;
  overflow: hidden;
  background:
    radial-gradient(
      circle at 55% 5%,
      rgba(91, 91, 247, 0.035),
      transparent 27%
    ),
    #fafaf7;
}
.workspace-header {
  display: flex;
  align-items: center;
  padding: 0 25px;
  border-bottom: 1px solid #e8e8e2;
  background: rgba(250, 250, 247, 0.94);
}
.workspace-header__title {
  display: grid;
  min-width: 0;
  gap: 3px;
}
.workspace-header h1 {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font:
    600 16px ui-serif,
    Georgia,
    "Songti SC",
    serif;
}
.workspace-header span {
  color: #777770;
  font-size: 12px;
}
.message-stage {
  position: relative;
  min-height: 0;
}
.message-scroll {
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.message-scroll--welcome {
  overflow: hidden;
}
.message-column {
  width: min(820px, calc(100% - 48px));
  margin: auto;
  padding: 44px 0 90px;
}
.message-column--welcome {
  padding-block: 0;
}
.conversation-loading {
  display: grid;
  width: 100%;
  gap: 12px;
  padding-top: 42px;
}
.conversation-loading span {
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(90deg, #efefea 25%, #f7f7f4 50%, #efefea 75%);
  background-size: 200% 100%;
  animation: conversation-loading 1.4s infinite;
}
.conversation-loading span:nth-child(2) {
  width: 84%;
}
.conversation-loading span:nth-child(3) {
  width: 62%;
}
.conversation-error {
  padding: 20px 0;
  border-top: 1px solid #e8e8e2;
  border-bottom: 1px solid #e8e8e2;
}
.conversation-error strong {
  font-family: ui-serif, Georgia, "Songti SC", serif;
}
.conversation-error p {
  color: #777770;
  font-size: 13px;
}
.conversation-error button {
  padding: 0;
  border: 0;
  background: transparent;
  color: #5b5bf7;
  cursor: pointer;
}
.composer-area {
  position: relative;
  padding: 20px 24px 18px;
  background: linear-gradient(transparent, #fafaf7 26%);
}
.composer-wrap {
  width: min(820px, calc(100% - 48px));
  margin: auto;
}
.scroll-bottom-wrap {
  position: absolute;
  top: -2rem;
  left: 50%;
  z-index: 30;
  display: flex;
  justify-content: center;
  pointer-events: none;
  transform: translate(-50%, -50%);
}
.scroll-bottom-button {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border: 1px solid #e5e7eb;
  border-radius: 50%;
  background: #fff;
  color: #111827;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
  pointer-events: auto;
  cursor: pointer;
  transition: background 180ms ease;
}
.scroll-bottom-button:hover {
  background: #fafafa;
}
@keyframes conversation-loading {
  to {
    background-position: -200% 0;
  }
}
@media (max-width: 800px) {
  .message-column,
  .composer-wrap {
    width: calc(100% - 28px);
  }
  .workspace-header {
    padding-inline: 15px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .conversation-loading span {
    animation: none;
  }
}
</style>
