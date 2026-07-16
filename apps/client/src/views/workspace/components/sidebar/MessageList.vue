<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { WorkspaceConversationSummary } from 'share-type'
import ConversationListItem from './ConversationListItem.vue'

const props = defineProps<{
  conversations: WorkspaceConversationSummary[]
  activeConversationId?: string
  loading?: boolean
  getConversationTimeLabel: (value: string) => string
  isConversationStreaming: (conversationId: string) => boolean
}>()

defineEmits<{
  select: [conversationId: string]
  delete: [conversationId: string]
}>()

const PAGE_SIZE = 80
const visibleCount = ref(PAGE_SIZE)
const loadMoreRef = ref<HTMLDivElement>()
const visibleConversations = computed(() => props.conversations.slice(0, visibleCount.value))
let observer: IntersectionObserver | null = null

const observeLoadMore = async () => {
  await nextTick()
  observer?.disconnect()

  if (!loadMoreRef.value || visibleCount.value >= props.conversations.length) {
    return
  }

  observer = new IntersectionObserver(([entry]) => {
    if (entry?.isIntersecting) {
      visibleCount.value = Math.min(visibleCount.value + PAGE_SIZE, props.conversations.length)
    }
  })
  observer.observe(loadMoreRef.value)
}

watch(() => props.conversations.length, (length) => {
  visibleCount.value = Math.min(Math.max(visibleCount.value, PAGE_SIZE), length || PAGE_SIZE)
  void observeLoadMore()
})
watch(visibleCount, observeLoadMore)
onMounted(observeLoadMore)
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div class="space-y-2.5 pr-2">
    <template v-if="loading">
      <div
        v-for="item in 6"
        :key="item"
        class="h-[72px] rounded-[16px] border border-[#f3f4f6] bg-white"
      />
    </template>
    <template v-else-if="conversations.length">
      <ConversationListItem
        v-for="conversation in visibleConversations"
        :key="conversation.id"
        :conversation="conversation"
        :active="conversation.id === activeConversationId"
        :streaming="isConversationStreaming(conversation.id)"
        :time-label="getConversationTimeLabel(conversation.updatedAt)"
        @delete="$emit('delete', $event)"
        @select="$emit('select', $event)"
      />
      <div v-if="visibleCount < conversations.length" ref="loadMoreRef" class="h-px" />
    </template>
    <div
      v-else
      class="rounded-[16px] border border-dashed border-[#e5e7eb] bg-white p-4 text-sm text-[#9ca3af]"
    >
      暂无会话
    </div>
  </div>
</template>
