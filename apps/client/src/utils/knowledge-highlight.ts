export interface HighlightPart {
  text: string
  matched: boolean
}

interface HighlightRange {
  start: number
  end: number
}

function removeSearchWhitespace(value: string): string {
  return value.replace(/\s+/g, '')
}

function findAllTextRanges(content: string, query: string): HighlightRange[] {
  const normalizedContent = content.toLowerCase()
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) return []

  const ranges: HighlightRange[] = []
  let cursor = 0

  while (cursor < normalizedContent.length) {
    const index = normalizedContent.indexOf(normalizedQuery, cursor)
    if (index === -1) break

    ranges.push({
      start: index,
      end: index + normalizedQuery.length
    })

    cursor = index + normalizedQuery.length
  }

  return ranges
}

function findCompactRanges(content: string, query: string): HighlightRange[] {
  const compactQuery = removeSearchWhitespace(query.trim()).toLowerCase()
  if (!compactQuery) return []

  const compactChars: string[] = []
  const originalIndexes: number[] = []

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]
    if (/\s/.test(char)) continue

    compactChars.push(char.toLowerCase())
    originalIndexes.push(index)
  }

  const compactContent = compactChars.join('')
  const ranges: HighlightRange[] = []
  let cursor = 0

  while (cursor < compactContent.length) {
    const index = compactContent.indexOf(compactQuery, cursor)
    if (index === -1) break

    const start = originalIndexes[index]
    const end = originalIndexes[index + compactQuery.length - 1] + 1

    ranges.push({ start, end })
    cursor = index + compactQuery.length
  }

  return ranges
}

function mergeRanges(ranges: HighlightRange[]): HighlightRange[] {
  if (!ranges.length) return []

  const sorted = [...ranges].sort((left, right) => left.start - right.start)
  const merged: HighlightRange[] = [sorted[0]]

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index]
    const last = merged[merged.length - 1]

    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end)
      continue
    }

    merged.push({ ...current })
  }

  return merged
}

function findHighlightRanges(content: string, query: string): HighlightRange[] {
  const exactRanges = findAllTextRanges(content, query)
  if (exactRanges.length) {
    return exactRanges
  }

  return mergeRanges(findCompactRanges(content, query))
}

function splitPartsByRanges(content: string, ranges: HighlightRange[]): HighlightPart[] {
  if (!ranges.length) {
    return [{ text: content, matched: false }]
  }

  const parts: HighlightPart[] = []
  let cursor = 0

  for (const range of ranges) {
    if (range.start > cursor) {
      parts.push({
        text: content.slice(cursor, range.start),
        matched: false
      })
    }

    parts.push({
      text: content.slice(range.start, range.end),
      matched: true
    })

    cursor = range.end
  }

  if (cursor < content.length) {
    parts.push({
      text: content.slice(cursor),
      matched: false
    })
  }

  return parts.filter((item) => item.text.length > 0)
}

function buildPreviewWindow(content: string, range: HighlightRange, maxLength: number) {
  if (content.length <= maxLength) {
    return {
      start: 0,
      end: content.length
    }
  }

  const matchLength = range.end - range.start
  const sidePadding = Math.max(24, Math.floor((maxLength - matchLength) / 2))
  let start = Math.max(0, range.start - sidePadding)
  let end = Math.min(content.length, range.end + sidePadding)

  if (end - start < maxLength) {
    const remaining = maxLength - (end - start)
    start = Math.max(0, start - remaining)
    end = Math.min(content.length, end + remaining)
  }

  return { start, end }
}

export function getKnowledgeHighlightParts(content: string, query: string): HighlightPart[] {
  return splitPartsByRanges(content, findHighlightRanges(content, query))
}

export function getKnowledgePreviewHighlightParts(
  content: string,
  query: string,
  maxLength = 180
): HighlightPart[] {
  const ranges = findHighlightRanges(content, query)
  if (!ranges.length) {
    const preview = content.length > maxLength ? `${content.slice(0, maxLength)}...` : content
    return [{ text: preview, matched: false }]
  }

  const windowRange = buildPreviewWindow(content, ranges[0], maxLength)
  const preview = content.slice(windowRange.start, windowRange.end)
  const previewRanges = ranges
    .filter((range) => range.end > windowRange.start && range.start < windowRange.end)
    .map((range) => ({
      start: Math.max(range.start, windowRange.start) - windowRange.start,
      end: Math.min(range.end, windowRange.end) - windowRange.start
    }))

  const parts = splitPartsByRanges(preview, previewRanges)

  if (windowRange.start > 0) {
    parts.unshift({ text: '...', matched: false })
  }

  if (windowRange.end < content.length) {
    parts.push({ text: '...', matched: false })
  }

  return parts
}
