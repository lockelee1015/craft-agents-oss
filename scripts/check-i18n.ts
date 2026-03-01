import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

type Issue = { file: string; text: string; kind: string }

const ROOT = process.cwd()
const I18N_CONTEXT_PATH = resolve(ROOT, 'apps/electron/src/renderer/context/I18nContext.tsx')
const RENDERER_ROOT = resolve(ROOT, 'apps/electron/src/renderer')
const BASELINE_PATH = resolve(ROOT, 'scripts/i18n-baseline.txt')

const EXCLUDED_PATH_SEGMENTS = new Set([
  '/playground/',
  '/__tests__/',
  '/tests/',
  '.test.',
  '.spec.',
])

function isExcluded(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/')
  for (const segment of EXCLUDED_PATH_SEGMENTS) {
    if (normalized.includes(segment)) return true
  }
  return false
}

function listFilesRecursively(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      files.push(...listFilesRecursively(fullPath))
      continue
    }
    if ((fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) && !isExcluded(fullPath)) {
      files.push(fullPath)
    }
  }
  return files
}

function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 0
  let inSingle = false
  let inDouble = false
  let inTemplate = false
  let escaped = false

  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = true
      continue
    }
    if (inSingle) {
      if (ch === '\'') inSingle = false
      continue
    }
    if (inDouble) {
      if (ch === '"') inDouble = false
      continue
    }
    if (inTemplate) {
      if (ch === '`') inTemplate = false
      continue
    }
    if (ch === '\'') {
      inSingle = true
      continue
    }
    if (ch === '"') {
      inDouble = true
      continue
    }
    if (ch === '`') {
      inTemplate = true
      continue
    }
    if (ch === '{') {
      depth += 1
      continue
    }
    if (ch === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

function extractObjectBody(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker)
  if (markerIndex < 0) return ''
  const openBraceIndex = source.indexOf('{', markerIndex)
  if (openBraceIndex < 0) return ''
  const closeBraceIndex = findMatchingBrace(source, openBraceIndex)
  if (closeBraceIndex < 0) return ''
  return source.slice(openBraceIndex + 1, closeBraceIndex)
}

function extractInnerObjectByKey(source: string, key: string): string {
  const keyMarker = `'${key}':`
  const keyIndex = source.indexOf(keyMarker)
  if (keyIndex < 0) return ''
  const openBraceIndex = source.indexOf('{', keyIndex)
  if (openBraceIndex < 0) return ''
  const closeBraceIndex = findMatchingBrace(source, openBraceIndex)
  if (closeBraceIndex < 0) return ''
  return source.slice(openBraceIndex + 1, closeBraceIndex)
}

function extractQuotedKeys(objectBody: string): Set<string> {
  const keys = new Set<string>()
  const keyRegex = /^\s*'((?:\\'|[^'])+)':\s*/gm
  for (const match of objectBody.matchAll(keyRegex)) {
    keys.add(match[1].replace(/\\'/g, '\''))
  }
  return keys
}

function collectTranslationKeys() {
  const source = readFileSync(I18N_CONTEXT_PATH, 'utf8')
  const messagesBody = extractObjectBody(source, 'const MESSAGES')
  const zhMessagesBody = extractInnerObjectByKey(messagesBody, 'zh-CN')
  const messageKeys = extractQuotedKeys(zhMessagesBody)

  const textBody = extractObjectBody(source, 'const TEXT_TRANSLATIONS')
  const zhTextBody = extractInnerObjectByKey(textBody, 'zh-CN')
  const textKeys = extractQuotedKeys(zhTextBody)

  return { messageKeys, textKeys }
}

function collectLiteralCalls(code: string, fnName: 't' | 'te'): string[] {
  const values: string[] = []
  const re = new RegExp(`\\b${fnName}\\(\\s*(['"])((?:\\\\.|(?!\\1).)*)\\1`, 'g')
  for (const match of code.matchAll(re)) {
    values.push(match[2].replace(/\\'/g, '\'').replace(/\\"/g, '"'))
  }
  return values
}

function collectHardcodedEnglish(code: string): string[] {
  const values = new Set<string>()

  const attrRegex = /(label|description|title|placeholder|emptyContent|aria-label)\s*=\s*"([^"]*[A-Za-z][^"]*)"/g
  for (const match of code.matchAll(attrRegex)) {
    values.add(match[2].trim())
  }

  const jsxTextRegex = /<[A-Za-z][^>]*>\s*([A-Za-z][^<>{\n]*[A-Za-z0-9.!?)])\s*<\/[A-Za-z][^>]*>/g
  for (const match of code.matchAll(jsxTextRegex)) {
    const text = match[1].trim()
    if (text.length > 0) values.add(text)
  }

  return [...values]
}

function toIssueLine(issue: Issue): string {
  return `${issue.kind}|${relative(ROOT, issue.file)}|${issue.text}`
}

function collectIssues(): Issue[] {
  const { messageKeys, textKeys } = collectTranslationKeys()
  const files = listFilesRecursively(RENDERER_ROOT)
  const issues: Issue[] = []

  for (const file of files) {
    const code = readFileSync(file, 'utf8')

    for (const key of collectLiteralCalls(code, 't')) {
      if (!messageKeys.has(key)) {
        issues.push({ file, text: key, kind: 'missing-message-key' })
      }
    }

    for (const text of collectLiteralCalls(code, 'te')) {
      if (!textKeys.has(text)) {
        issues.push({ file, text, kind: 'missing-text-translation' })
      }
    }

    for (const text of collectHardcodedEnglish(code)) {
      if (text.startsWith('http')) continue
      if (text.includes('craftagents://')) continue
      if (text.includes('.json')) continue
      if (text.includes('/')) continue
      issues.push({ file, text, kind: 'hardcoded-english' })
    }
  }

  const dedup = new Map<string, Issue>()
  for (const issue of issues) {
    dedup.set(toIssueLine(issue), issue)
  }
  return [...dedup.values()].sort((a, b) => toIssueLine(a).localeCompare(toIssueLine(b)))
}

function readBaseline(): Set<string> {
  if (!existsSync(BASELINE_PATH)) return new Set()
  return new Set(
    readFileSync(BASELINE_PATH, 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean),
  )
}

function main() {
  if (!existsSync(I18N_CONTEXT_PATH)) {
    console.error(`[i18n-check] Missing i18n context file: ${I18N_CONTEXT_PATH}`)
    process.exit(1)
  }

  const args = new Set(process.argv.slice(2))
  const updateBaseline = args.has('--update-baseline')
  const issues = collectIssues()
  const lines = issues.map(toIssueLine)

  if (updateBaseline) {
    writeFileSync(BASELINE_PATH, `${lines.join('\n')}\n`, 'utf8')
    console.log(`[i18n-check] Baseline updated: ${relative(ROOT, BASELINE_PATH)} (${lines.length} entries)`)
    return
  }

  const baseline = readBaseline()
  const newIssues = lines.filter(line => !baseline.has(line))

  if (newIssues.length === 0) {
    console.log(`[i18n-check] OK. scanned renderer, no new i18n issues vs baseline (${baseline.size} baseline entries).`)
    return
  }

  console.error(`[i18n-check] Found ${newIssues.length} new issue(s) vs baseline:`)
  for (const issue of newIssues) {
    const [kind, file, text] = issue.split('|')
    console.error(`- [${kind}] ${file}: "${text}"`)
  }
  console.error(`\nIf these are intentional, run: bun run i18n:baseline:update`)
  process.exit(1)
}

main()

