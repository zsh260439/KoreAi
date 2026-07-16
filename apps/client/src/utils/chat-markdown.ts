import MarkdownIt from 'markdown-it'
import { createHighlighterCore, type HighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

const CHAT_CODE_THEME = 'ayu-light'
const COPY_LABEL = '\u590d\u5236'
const EXPAND_LABEL = '\u5c55\u5f00'
const COLLAPSE_LABEL = '\u6536\u8d77'
const FENCE_LANGUAGE_REGEX = /```([^\s`]+)?/g
const DISPLAY_LANGUAGE_MAP: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  sh: 'bash',
  yml: 'yaml',
  md: 'markdown'
}

const LANGUAGE_LOADERS = {
  bash: () => import('shiki/langs/bash.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  vue: () => import('shiki/langs/vue.mjs')
} as const

type SupportedLanguage = keyof typeof LANGUAGE_LOADERS

const LANGUAGE_ALIASES: Record<string, SupportedLanguage> = {
  bash: 'bash',
  css: 'css',
  html: 'html',
  java: 'java',
  javascript: 'javascript',
  js: 'javascript',
  json: 'json',
  markdown: 'markdown',
  md: 'markdown',
  py: 'python',
  python: 'python',
  sh: 'bash',
  sql: 'sql',
  ts: 'typescript',
  typescript: 'typescript',
  vue: 'vue'
}

let highlighterPromise: Promise<HighlighterCore> | null = null
let highlighter: HighlighterCore | null = null

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

function normalizeLanguage(language: string): SupportedLanguage | null {
  const normalized = getLanguageKey(language)
  return LANGUAGE_ALIASES[normalized] ?? null
}

function getLanguageLabel(language: string): string {
  const normalized = getLanguageKey(language)
  if (!normalized) {
    return 'text'
  }

  return DISPLAY_LANGUAGE_MAP[normalized] ?? normalized
}

function wrapCodeBlock(content: string, language: string): string {
  const rawLabel = getLanguageLabel(language)
  const label = escapeHtml(rawLabel)
  const copyLabel = escapeHtml(COPY_LABEL)
  const expandLabel = escapeHtml(EXPAND_LABEL)
  const collapseLabel = escapeHtml(COLLAPSE_LABEL)
  const collapseTitle = escapeHtml(`${COLLAPSE_LABEL} ${rawLabel}`)

  return [
    `<div class="message-code-shell" data-language="${label}" data-collapsed="false">`,
    '<div class="message-code-toolbar">',
    '<div class="message-code-toolbar__meta">',
    [
      '<button',
      'type="button"',
      'class="message-code-toolbar__toggle"',
      'data-toggle-code',
      `data-language="${label}"`,
      `data-expand-label="${expandLabel}"`,
      `data-collapse-label="${collapseLabel}"`,
      'data-collapsed="false"',
      'aria-expanded="true"',
      `aria-label="${collapseTitle}"`,
      `title="${collapseTitle}"`,
      '>'
    ].join(' '),
    `<span class="message-code-toolbar__language">${label}</span>`,
    '<span class="message-code-toolbar__chevron" aria-hidden="true"></span>',
    '</button>',
    '</div>',
    '<div class="message-code-toolbar__actions">',
    [
      '<button',
      'type="button"',
      'class="message-code-toolbar__copy"',
      'data-copy-code',
      `data-default-label="${copyLabel}"`,
      `aria-label="${copyLabel}"`,
      `title="${copyLabel}"`,
      '>'
    ].join(' '),
    copyLabel,
    '</button>',
    '</div>',
    '</div>',
    '<div class="message-code-content">',
    '<div class="message-code-content__inner">',
    content,
    '</div>',
    '</div>',
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
    highlighterPromise = createHighlighterCore({
      themes: [import('shiki/themes/ayu-light.mjs')],
      langs: [],
      engine: createJavaScriptRegexEngine()
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
    const registrations = await Promise.all(
      languagesToLoad.map((language) => LANGUAGE_LOADERS[language]())
    )
    await shiki.loadLanguage(...registrations.flatMap(({ default: language }) => language))
  }

  highlighter = shiki
  return markdown.render(content)
}

function extractFenceLanguages(content: string): SupportedLanguage[] {
  const languages = new Set<SupportedLanguage>()
  let match: RegExpExecArray | null

  while ((match = FENCE_LANGUAGE_REGEX.exec(content)) !== null) {
    const language = normalizeLanguage(match[1] ?? '')
    if (language) {
      languages.add(language)
    }
  }

  return [...languages]
}
