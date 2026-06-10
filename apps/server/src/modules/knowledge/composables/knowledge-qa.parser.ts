//声明流式消息文本提取器
export function extractStreamingMessageText(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .map((item) => {
      if (typeof item === 'string') {
        return item
      }

      if (!item || typeof item !== 'object') {
        return ''
      }

      const text = (item as { text?: unknown }).text
      if (typeof text === 'string') {
        return text
      }

      const reasoning = (item as { reasoning?: unknown }).reasoning
      return typeof reasoning === 'string' ? reasoning : ''
    })
    .join('')
}
