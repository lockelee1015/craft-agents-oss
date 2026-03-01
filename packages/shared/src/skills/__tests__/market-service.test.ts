import { afterEach, describe, expect, it } from 'bun:test'
import { clearMarketSkillDetailCache, getMarketSkillDetail, searchMarketSkills } from '../market-service.ts'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  clearMarketSkillDetailCache()
})

describe('market-service', () => {
  it('parses search API payload', async () => {
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({
        query: 'agent',
        searchType: 'fuzzy',
        skills: [
          { id: 'owner/repo/skill-a', source: 'owner/repo', skillId: 'skill-a', name: 'Skill A', installs: 1234 },
        ],
      }), { status: 200 })
    }) as unknown as typeof fetch

    const result = await searchMarketSkills('agent')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      id: 'owner/repo/skill-a',
      source: 'owner/repo',
      skillId: 'skill-a',
      name: 'Skill A',
      installs: 1234,
    })
  })

  it('returns detail with parsed repo and risk fields', async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('skills.sh/owner/repo/skill-a')) {
        return new Response(`
          <code>npx skills add https://github.com/owner/repo --skill skill-a</code>
          <span>Weekly Installs</span><div>1.2K</div>
          <span>GitHub Stars</span><div>3.4K</div>
          <span>First Seen</span><div>Jan 1, 2026</div>
          <div>Security Audits <span class="truncate">Socket</span><span>Warn</span></div>
        `, { status: 200 })
      }
      if (url.includes('raw.githubusercontent.com/owner/repo/HEAD/skills/skill-a/SKILL.md')) {
        return new Response(`---\nname: Skill A\nalwaysAllow:\n  - Bash\nrequiredSources:\n  - github\nglobs:\n  - '*.ts'\n---\n\nBody`, { status: 200 })
      }
      return new Response('not-found', { status: 404 })
    }) as unknown as typeof fetch

    const detail = await getMarketSkillDetail('owner/repo/skill-a')
    expect(detail.repoUrl).toBe('https://github.com/owner/repo')
    expect(detail.installs).toBe(1200)
    expect(detail.stars).toBe(3400)
    expect(detail.parsedRisk.alwaysAllow).toEqual(['Bash'])
    expect(detail.parsedRisk.requiredSources).toEqual(['github'])
    expect(detail.parsedRisk.globs).toEqual(['*.ts'])
  })

  it('falls back when markdown cannot be fetched', async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('skills.sh/owner/repo/skill-a')) {
        return new Response(`
          <code>npx skills add https://github.com/owner/repo --skill skill-a</code>
          "SKILL.md"
          "dangerouslySetInnerHTML":{"__html":"<h1>Skill A</h1><p>Preview Body</p>"}
        `, { status: 200 })
      }
      return new Response('not-found', { status: 404 })
    }) as unknown as typeof fetch

    const detail = await getMarketSkillDetail('owner/repo/skill-a')
    expect(detail.skillMarkdown).toContain('Preview Body')
    expect(detail.warnings.length).toBeGreaterThan(0)
  })

  it('caches detail by id to avoid duplicate remote fetches', async () => {
    let detailRequests = 0
    let markdownRequests = 0

    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('skills.sh/owner/repo/skill-a')) {
        detailRequests += 1
        return new Response(`
          <code>npx skills add https://github.com/owner/repo --skill skill-a</code>
          <span>Weekly Installs</span><div>99</div>
        `, { status: 200 })
      }
      if (url.includes('raw.githubusercontent.com/owner/repo/HEAD/skills/skill-a/SKILL.md')) {
        markdownRequests += 1
        return new Response(`---\nname: Skill A\n---\n\nBody`, { status: 200 })
      }
      return new Response('not-found', { status: 404 })
    }) as unknown as typeof fetch

    const first = await getMarketSkillDetail('owner/repo/skill-a')
    const second = await getMarketSkillDetail('owner/repo/skill-a')

    expect(first.id).toBe('owner/repo/skill-a')
    expect(second.id).toBe('owner/repo/skill-a')
    expect(detailRequests).toBe(1)
    expect(markdownRequests).toBe(1)
  })
})
