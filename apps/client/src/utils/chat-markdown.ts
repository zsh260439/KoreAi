import MarkdownIt from 'markdown-it'
import {
  bundledLanguages,
  getSingletonHighlighter,
  type BundledLanguage
} from 'shiki'

const CHAT_CODE_THEME = 'ayu-light'
const FENCE_LANGUAGE_REGEX = /```([^\s`]+)?/g
const DISPLAY_LANGUAGE_MAP: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  sh: 'bash',
  yml: 'yaml',
  md: 'markdown'
}

let highlighterPromise: ReturnType<typeof getSingletonHighlighter> | null = null
let highlighter: Awaited<ReturnType<typeof getSingletonHighlighter>> | null = null

const markdown = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true
})

markdown.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]
  return renderCodeBlock(token.content, token.info)
}

markdown.renderer.rules.code_block = (tokens, idx) =>
  renderCodeBlock(tokens[idx].content, '')

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function getLanguageKey(language: string): string {
  return language.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? ''
}

function normalizeLanguage(language: string): BundledLanguage | null {
  const normalized = getLanguageKey(language)
  if (!normalized || !(normalized in bundledLanguages)) {
    return null
  }

  return normalized as BundledLanguage
}

function getLanguageLabel(language: string): string {
  const normalized = getLanguageKey(language)
  if (!normalized) {
    return 'text'
  }

  return DISPLAY_LANGUAGE_MAP[normalized] ?? normalized
}

function wrapCodeBlock(content: string, language: string): string {
  const label = escapeHtml(getLanguageLabel(language))

  return [
    `<div class="message-code-shell" data-language="${label}">`,
    '<div class="message-code-toolbar">',
    '<div class="message-code-toolbar__meta">',
    `<span class="message-code-toolbar__language">${label}</span>`,
    '</div>',
    '<button type="button" class="message-code-toolbar__copy" data-copy-code data-default-label="复制">复制</button>',
    '</div>',
    content,
    '</div>'
  ].join('')
}

function renderPlainCodeBlock(code: string, language: string): string {
  const escapedCode = escapeHtml(code)

  return wrapCodeBlock(
    `<pre class="message-code-block"><code>${escapedCode}</code></pre>`,
    language
  )
}

function renderCodeBlock(code: string, language: string): string {
  if (!highlighter) {
    return renderPlainCodeBlock(code, language)
  }

  const normalizedLanguage = normalizeLanguage(language)
  if (!normalizedLanguage) {
    return renderPlainCodeBlock(code, language)
  }

  return wrapCodeBlock(
    highlighter.codeToHtml(code, {
      lang: normalizedLanguage,
      theme: CHAT_CODE_THEME
    }),
    language
  )
}

async function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = getSingletonHighlighter({
      themes: [CHAT_CODE_THEME]
    }).then((instance) => {
      highlighter = instance
      return instance
    })
  }

  return highlighterPromise
}

export async function renderMessageMarkdown(content: string): Promise<string> {
  if (!content.trim()) {
    return ''
  }

  const shiki = await getHighlighter()
  const loadedLanguages = new Set(shiki.getLoadedLanguages())
  const languagesToLoad = extractFenceLanguages(content).filter(
    (language) => !loadedLanguages.has(language)
  )

  if (languagesToLoad.length) {
    await Promise.all(languagesToLoad.map((language) => shiki.loadLanguage(language)))
  }

  highlighter = shiki
  return markdown.render(content)
}

function extractFenceLanguages(content: string): BundledLanguage[] {
  const languages = new Set<BundledLanguage>()
  let match: RegExpExecArray | null

  while ((match = FENCE_LANGUAGE_REGEX.exec(content)) !== null) {
    const language = normalizeLanguage(match[1] ?? '')
    if (language) {
      languages.add(language)
    }
  }

  return [...languages]
}
