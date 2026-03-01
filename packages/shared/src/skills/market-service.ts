import matter from 'gray-matter'
import type { MarketSecurityAudit, MarketSkillDetail, MarketSkillSummary } from './market-types.ts'

interface SearchResponse {
  query: string
  searchType: string
  skills: Array<{
    id: string
    source: string
    skillId: string
    name: string
    installs: number
  }>
}

const SKILLS_BASE_URL = 'https://skills.sh'
const USER_AGENT = 'craft-agents-skills-market/1.0'
const DETAIL_CACHE_TTL_MS = 10 * 60 * 1000

interface DetailCacheEntry {
  value: MarketSkillDetail
  expiresAt: number
}

const detailCache = new Map<string, DetailCacheEntry>()
const detailInFlight = new Map<string, Promise<MarketSkillDetail>>()

function cloneDetail(detail: MarketSkillDetail): MarketSkillDetail {
  return {
    ...detail,
    warnings: [...detail.warnings],
    securityAudits: detail.securityAudits.map((audit) => ({ ...audit })),
    parsedRisk: {
      alwaysAllow: [...detail.parsedRisk.alwaysAllow],
      requiredSources: [...detail.parsedRisk.requiredSources],
      globs: [...detail.parsedRisk.globs],
    },
  }
}

function getCachedDetail(id: string): MarketSkillDetail | null {
  const cached = detailCache.get(id)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    detailCache.delete(id)
    return null
  }
  return cached.value
}

export function clearMarketSkillDetailCache(): void {
  detailCache.clear()
  detailInFlight.clear()
}

function normalizeStatus(raw: string): MarketSecurityAudit['status'] {
  const value = raw.trim().toLowerCase()
  if (value === 'pass' || value === 'warn' || value === 'fail') return value
  return 'unknown'
}

function htmlDecode(text: string): string {
  return text
    .replace(/&#x3C;/g, '<')
    .replace(/&#x3E;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
}

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractRepoUrlFromHtml(html: string): string | null {
  const cmdMatch = html.match(/npx skills add\s+(https:\/\/github\.com\/[\w.-]+\/[\w.-]+)/i)
  if (cmdMatch?.[1]) return cmdMatch[1]

  const hrefMatch = html.match(/href="(https:\/\/github\.com\/[\w.-]+\/[\w.-]+)"[^>]*title="[^"]+\/[^"]+"/i)
  return hrefMatch?.[1] ?? null
}

function extractMetricNumber(html: string, label: string): number | null {
  const regex = new RegExp(`${label}[\\s\\S]{0,220}?>([\\d.]+)\\s*([KMB])?<`, 'i')
  const match = html.match(regex)
  if (!match) return null

  const num = Number(match[1])
  if (!Number.isFinite(num)) return null
  const unit = match[2]?.toUpperCase()
  if (!unit) return num
  if (unit === 'K') return Math.round(num * 1_000)
  if (unit === 'M') return Math.round(num * 1_000_000)
  if (unit === 'B') return Math.round(num * 1_000_000_000)
  return num
}

function extractFirstSeen(html: string): string | null {
  const match = html.match(/First Seen<\/span>[\s\S]{0,120}?>([^<]+)</i)
  return match?.[1]?.trim() || null
}

function extractSecurityAudits(html: string): MarketSecurityAudit[] {
  const audits: MarketSecurityAudit[] = []
  const sectionMatch = html.match(/Security Audits[\s\S]{0,2200}<\/div><\/div>/i)
  if (!sectionMatch) return audits

  const entryRegex = /truncate">([^<]+)<\/span>[\s\S]{0,120}?>(Pass|Warn|Fail)<\/span>/gi
  for (const entry of sectionMatch[0].matchAll(entryRegex)) {
    const provider = entry[1]
    const status = entry[2]
    if (!provider || !status) continue
    audits.push({
      provider: provider.trim(),
      status: normalizeStatus(status),
    })
  }

  return audits
}

function parseRiskFromSkillMarkdown(markdown: string | null): MarketSkillDetail['parsedRisk'] {
  if (!markdown) {
    return { alwaysAllow: [], requiredSources: [], globs: [] }
  }

  try {
    const parsed = matter(markdown)
    const toStringArray = (value: unknown): string[] => {
      if (Array.isArray(value)) {
        return value.filter((v): v is string => typeof v === 'string').map(v => v.trim()).filter(Boolean)
      }
      if (typeof value === 'string') {
        return [value.trim()].filter(Boolean)
      }
      return []
    }

    return {
      alwaysAllow: toStringArray(parsed.data.alwaysAllow),
      requiredSources: toStringArray(parsed.data.requiredSources),
      globs: toStringArray(parsed.data.globs),
    }
  } catch {
    return { alwaysAllow: [], requiredSources: [], globs: [] }
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/json,text/plain',
      'User-Agent': USER_AGENT,
    },
  })

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`)
  }

  return response.text()
}

async function fetchRawSkillMarkdown(repoUrl: string, skillId: string): Promise<string | null> {
  const repoMatch = repoUrl.match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)$/)
  if (!repoMatch) return null

  const owner = repoMatch[1]
  const repo = repoMatch[2]

  const candidates = [
    `skills/${skillId}/SKILL.md`,
    `${skillId}/SKILL.md`,
    'SKILL.md',
  ]

  for (const relativePath of candidates) {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${relativePath}`
    try {
      const content = await fetchText(rawUrl)
      if (content.trim().length > 0) {
        return content
      }
    } catch {
      // Try next candidate path
    }
  }

  return null
}

function extractSkillMarkdownFromHtml(html: string): string | null {
  const marker = '"SKILL.md"'
  const markerIndex = html.indexOf(marker)
  if (markerIndex === -1) return null

  const tail = html.slice(markerIndex)
  const htmlMatch = tail.match(/"dangerouslySetInnerHTML":\{"__html":"([\s\S]*?)"\}/)
  if (!htmlMatch?.[1]) return null

  const decoded = htmlDecode(htmlMatch[1])
  return stripTags(decoded)
}

export async function searchMarketSkills(query: string): Promise<MarketSkillSummary[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const url = `${SKILLS_BASE_URL}/api/search?q=${encodeURIComponent(trimmed)}`
  const raw = await fetchText(url)

  let data: SearchResponse
  try {
    data = JSON.parse(raw) as SearchResponse
  } catch {
    throw new Error('Invalid response from skills.sh search API')
  }

  if (!Array.isArray(data.skills)) {
    throw new Error('Invalid skills search payload')
  }

  return data.skills.map(skill => ({
    id: skill.id,
    source: skill.source,
    skillId: skill.skillId,
    name: skill.name,
    installs: Number.isFinite(skill.installs) ? skill.installs : 0,
  }))
}

export async function getMarketSkillDetail(id: string): Promise<MarketSkillDetail> {
  const normalizedId = id.trim().replace(/^\/+/, '')
  if (!normalizedId) {
    throw new Error('Skill id is required')
  }

  const cached = getCachedDetail(normalizedId)
  if (cached) {
    return cloneDetail(cached)
  }

  const inFlight = detailInFlight.get(normalizedId)
  if (inFlight) {
    return inFlight.then(cloneDetail)
  }

  const request = (async (): Promise<MarketSkillDetail> => {
    const segments = normalizedId.split('/').filter(Boolean)
    const skillId = segments.at(-1) ?? normalizedId
    const source = segments.slice(0, -1).join('/') || normalizedId

    const detailUrl = `${SKILLS_BASE_URL}/${normalizedId}?embedable=true`
    const html = await fetchText(detailUrl)

    const repoUrl = extractRepoUrlFromHtml(html)
    const installs = extractMetricNumber(html, 'Weekly Installs')
    const stars = extractMetricNumber(html, 'GitHub Stars')
    const firstSeen = extractFirstSeen(html)
    const securityAudits = extractSecurityAudits(html)

    const warnings: string[] = []
    if (!repoUrl) {
      warnings.push('Repository URL could not be parsed from skills.sh detail page.')
    }

    let skillMarkdown: string | null = null
    if (repoUrl) {
      skillMarkdown = await fetchRawSkillMarkdown(repoUrl, skillId)
    }

    if (!skillMarkdown) {
      warnings.push('SKILL.md preview is partial; using page preview fallback.')
      skillMarkdown = extractSkillMarkdownFromHtml(html)
    }

    const detail: MarketSkillDetail = {
      id: normalizedId,
      source,
      skillId,
      name: skillId,
      repoUrl,
      installs,
      stars,
      firstSeen,
      skillMarkdown,
      warnings,
      securityAudits,
      parsedRisk: parseRiskFromSkillMarkdown(skillMarkdown),
    }

    detailCache.set(normalizedId, {
      value: detail,
      expiresAt: Date.now() + DETAIL_CACHE_TTL_MS,
    })

    return detail
  })()

  detailInFlight.set(normalizedId, request)

  try {
    const detail = await request
    return cloneDetail(detail)
  } finally {
    detailInFlight.delete(normalizedId)
  }
}
