import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

export const useAutoScroll = (threshold = 32) => {
  const scrollRef = ref<HTMLDivElement>()
  const shouldStickToBottom = ref(true)
  let observer: MutationObserver | null = null
  let resizeObserver: ResizeObserver | null = null
  let followTimer: number | null = null

  //声明销毁滚动区域变更监听
  const stopObserveContainer = () => {
    observer?.disconnect()
    observer = null
    resizeObserver?.disconnect()
    resizeObserver = null
  }

  //声明停止流式期间的持续跟底任务
  const stopAutoFollow = () => {
    if (followTimer) {
      window.clearInterval(followTimer)
      followTimer = null
    }
  }

  //声明直接同步到底部滚动位置
  const syncScrollToBottom = () => {
    const container = scrollRef.value
    if (!container) {
      return
    }

    container.scrollTop = container.scrollHeight
    shouldStickToBottom.value = true
  }

  //声明监听滚动容器内部异步高度变化
  const observeContainer = (container?: HTMLDivElement) => {
    stopObserveContainer()

    if (!container) {
      return
    }

    //声明统一处理异步渲染后的跟底动作
    const syncFollowPosition = () => {
      if (!followTimer && !shouldStickToBottom.value) {
        return
      }

      requestAnimationFrame(() => {
        if (followTimer || shouldStickToBottom.value) {
          syncScrollToBottom()
        }
      })
    }

    observer = new MutationObserver(() => {
      syncFollowPosition()
    })

    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true
    })

    //声明监听消息内容真实高度变化
    const contentElement = container.firstElementChild
    if (contentElement) {
      resizeObserver = new ResizeObserver(() => {
        syncFollowPosition()
      })
      resizeObserver.observe(contentElement)
    }
  }

  const updateShouldStickToBottom = () => {
    const container = scrollRef.value
    if (!container) {
      shouldStickToBottom.value = true
      return
    }

    //声明流式跟随期间始终保持底部吸附
    if (followTimer) {
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
    //声明滚动到最底部
    syncScrollToBottom()
  }

  //声明开启流式期间的持续跟底任务
  const startAutoFollow = () => {
    if (followTimer) {
      return
    }

    syncScrollToBottom()
    followTimer = window.setInterval(() => {
      syncScrollToBottom()
    }, 32)
  }

  watch(scrollRef, (container) => {
    observeContainer(container)
  })

  onBeforeUnmount(() => {
    stopObserveContainer()
    stopAutoFollow()
  })

  return {
    scrollRef,
    shouldStickToBottom,
    startAutoFollow,
    stopAutoFollow,
    updateShouldStickToBottom,
    scrollToBottom
  }
}
