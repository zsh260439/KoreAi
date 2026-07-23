const COMPACT_IDENTIFIER_PATTERN = /^[a-z]{2,12}\d{2,4}$/i

export function expandStructuredIdentifierAliases(values: string[]): string[] {
  return uniqueStrings(values.flatMap((value) => [value, ...buildCompactIdentifierAliases(value)]))
}

export function isCompactStructuredIdentifier(value: string): boolean {
  return COMPACT_IDENTIFIER_PATTERN.test(value.trim())
}

function buildCompactIdentifierAliases(value: string): string[] {
  const normalized = value.trim()
  if (!COMPACT_IDENTIFIER_PATTERN.test(normalized)) {
    return []
  }

  const match = normalized.match(/^([a-z]+)(\d{2,4})$/i)
  if (!match) {
    return []
  }

  const [, letters, digits] = match
  const aliases = [`${letters}-${digits}`]

  // 紧凑编号常见于用户省略分隔符，按前缀/基序号补几个通用候选。
  for (let splitIndex = 2; splitIndex <= 4; splitIndex += 1) {
    if (letters.length - splitIndex < 2) {
      continue
    }

    aliases.push(`${letters.slice(0, splitIndex)}-${letters.slice(splitIndex)}-${digits}`)
  }

  return aliases
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const normalized = value.trim()
    if (!normalized) {
      continue
    }

    const key = normalized.toLowerCase()
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(normalized)
  }

  return result
}


