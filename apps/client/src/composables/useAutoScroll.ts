import { nextTick, ref } from 'vue'

export const useAutoScroll = (threshold = 32) => {
  const scrollRef = ref<HTMLDivElement>()
  const shouldStickToBottom = ref(true)

  const updateShouldStickToBottom = () => {
    const container = scrollRef.value
    if (!container) {
      shouldStickToBottom.value = true
      return
    }

    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    shouldStickToBottom.value = distanceToBottom <= threshold
  }

  const scrollToBottom = async (force = false) => {
    await nextTick()

    const container = scrollRef.value
    if (!container) {
      return
    }
    // 如果当前滚动位置在底部，且不强制滚动，直接返回
    if (!force && !shouldStickToBottom.value) {
      return
    }
    // 滚动到最底部
    container.scrollTop = container.scrollHeight
    shouldStickToBottom.value = true
  }

  return {
    scrollRef,
    shouldStickToBottom,
    updateShouldStickToBottom,
    scrollToBottom
  }
}
