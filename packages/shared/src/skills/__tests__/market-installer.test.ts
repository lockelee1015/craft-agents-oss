import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { rm, readFile, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { execSync } from 'child_process'
import { checkMarketSkillConflict, installMarketSkill } from '../market-installer.ts'

let tempDir = ''
let workspaceRoot = ''
let repoRoot = ''

function createLocalSkillRepo(repoPath: string) {
  mkdirSync(join(repoPath, 'skills', 'skill-a', 'references'), { recursive: true })
  writeFileSync(join(repoPath, 'skills', 'skill-a', 'SKILL.md'), `---\nname: Skill A\ndescription: test\n---\n\nUse this skill`) 
  writeFileSync(join(repoPath, 'skills', 'skill-a', 'references', 'ref.md'), '# Reference')

  execSync('git init', { cwd: repoPath, stdio: 'ignore' })
  execSync('git add .', { cwd: repoPath, stdio: 'ignore' })
  execSync('git -c user.name=test -c user.email=test@example.com commit -m init', { cwd: repoPath, stdio: 'ignore' })
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'market-installer-test-'))
  workspaceRoot = join(tempDir, 'workspace')
  repoRoot = join(tempDir, 'repo')
  mkdirSync(join(workspaceRoot, 'skills'), { recursive: true })
  mkdirSync(repoRoot, { recursive: true })
  createLocalSkillRepo(repoRoot)
})

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
})

describe('market-installer', () => {
  it('installs full skill directory into workspace', async () => {
    const result = await installMarketSkill({
      workspaceRoot,
      scope: 'workspace',
      marketSkillId: 'owner/repo/skill-a',
      marketDetailOverride: {
        id: 'owner/repo/skill-a',
        source: 'owner/repo',
        skillId: 'skill-a',
        name: 'skill-a',
        repoUrl: repoRoot,
        installs: null,
        stars: null,
        firstSeen: null,
        skillMarkdown: null,
        warnings: [],
        securityAudits: [],
        parsedRisk: { alwaysAllow: [], requiredSources: [], globs: [] },
      },
    })

    const installedDir = join(workspaceRoot, 'skills', 'skill-a')
    expect(result.success).toBe(true)
    expect(existsSync(join(installedDir, 'SKILL.md'))).toBe(true)
    expect(existsSync(join(installedDir, 'references', 'ref.md'))).toBe(true)
    expect(existsSync(join(installedDir, '.craft-market.json'))).toBe(true)
  })

  it('detects conflicts and creates backup on overwrite', async () => {
    const targetDir = join(workspaceRoot, 'skills', 'skill-a')
    mkdirSync(targetDir, { recursive: true })
    writeFileSync(join(targetDir, 'SKILL.md'), `---\nname: Existing Skill\ndescription: existing\n---\n`) 

    const conflict = await checkMarketSkillConflict(workspaceRoot, 'workspace', 'skill-a')
    expect(conflict.exists).toBe(true)
    expect(conflict.existingSkillName).toBe('Existing Skill')

    const result = await installMarketSkill({
      workspaceRoot,
      scope: 'workspace',
      marketSkillId: 'owner/repo/skill-a',
      overwrite: true,
      marketDetailOverride: {
        id: 'owner/repo/skill-a',
        source: 'owner/repo',
        skillId: 'skill-a',
        name: 'skill-a',
        repoUrl: repoRoot,
        installs: null,
        stars: null,
        firstSeen: null,
        skillMarkdown: null,
        warnings: [],
        securityAudits: [],
        parsedRisk: { alwaysAllow: [], requiredSources: [], globs: [] },
      },
    })

    expect(result.backupPath).toBeDefined()
    expect(existsSync(result.backupPath!)).toBe(true)

    const files = readdirSync(join(workspaceRoot, 'skills', 'skill-a'))
    expect(files.includes('references')).toBe(true)
    await stat(join(workspaceRoot, 'skills', 'skill-a', 'SKILL.md'))
    await readFile(join(workspaceRoot, 'skills', 'skill-a', '.craft-market.json'), 'utf8')
  })
})
