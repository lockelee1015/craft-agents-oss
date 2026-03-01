import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { basename, join } from 'path'
import { spawn } from 'child_process'
import matter from 'gray-matter'
import type {
  ConflictResult,
  InstallMarketSkillResult,
  InstallScope,
  MarketInstallProgress,
  MarketInstallProgressStage,
  MarketSkillDetail,
} from './market-types.ts'
import { getWorkspaceSkillsPath } from '../workspaces/storage.ts'
import { GLOBAL_AGENT_SKILLS_DIR } from './storage.ts'
import { getMarketSkillDetail } from './market-service.ts'

interface InstallArgs {
  workspaceRoot: string
  scope: InstallScope
  marketSkillId: string
  overwrite?: boolean
  installId?: string
  onProgress?: (progress: MarketInstallProgress) => void
  marketDetailOverride?: MarketSkillDetail
}

interface InstallMetadata {
  marketSkillId: string
  source: string
  skillId: string
  repoUrl: string | null
  installedAt: string
}

function emitProgress(
  args: InstallArgs,
  stage: MarketInstallProgressStage,
  percent: number,
  message: string,
): void {
  if (!args.installId || !args.onProgress) return
  args.onProgress({
    installId: args.installId,
    stage,
    percent,
    message,
  })
}

function runCommand(command: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })

    let stderr = ''
    child.stderr.on('data', chunk => {
      stderr += chunk.toString('utf8')
    })

    child.on('error', (error) => {
      reject(error)
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(stderr.trim() || `${command} exited with code ${code}`))
    })
  })
}

function resolveScopePath(workspaceRoot: string, scope: InstallScope): string {
  if (scope === 'global') {
    return GLOBAL_AGENT_SKILLS_DIR
  }
  return getWorkspaceSkillsPath(workspaceRoot)
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function findSkillDirectory(repoRoot: string, skillId: string): Promise<string | null> {
  const directCandidates = [
    join(repoRoot, 'skills', skillId),
    join(repoRoot, skillId),
  ]

  for (const candidate of directCandidates) {
    if (existsSync(join(candidate, 'SKILL.md'))) {
      return candidate
    }
  }

  const queue = [repoRoot]
  while (queue.length > 0) {
    const current = queue.shift()!
    let entries: string[]

    try {
      const dirents = await readdir(current, { withFileTypes: true })
      entries = dirents.map(d => d.name)
      for (const dirent of dirents) {
        if (!dirent.isDirectory()) continue
        if (dirent.name === '.git' || dirent.name === 'node_modules') continue
        queue.push(join(current, dirent.name))
      }
    } catch {
      continue
    }

    if (entries.includes('SKILL.md')) {
      const skillFile = join(current, 'SKILL.md')
      try {
        const content = await readFile(skillFile, 'utf8')
        const parsed = matter(content)
        const dirName = basename(current)
        const metadataName = typeof parsed.data.name === 'string' ? parsed.data.name.trim() : ''
        if (dirName === skillId || metadataName === skillId) {
          return current
        }
      } catch {
        // ignore invalid skill candidates
      }
    }
  }

  return null
}

export async function checkMarketSkillConflict(
  workspaceRoot: string,
  scope: InstallScope,
  slug: string,
): Promise<ConflictResult> {
  const targetSkillsRoot = resolveScopePath(workspaceRoot, scope)
  const targetPath = join(targetSkillsRoot, slug)
  const exists = await pathExists(targetPath)

  if (!exists) {
    return { exists: false, targetPath }
  }

  let existingSkillName: string | undefined
  let existingSource: ConflictResult['existingSource'] | undefined
  try {
    const content = await readFile(join(targetPath, 'SKILL.md'), 'utf8')
    const parsed = matter(content)
    if (typeof parsed.data.name === 'string' && parsed.data.name.trim()) {
      existingSkillName = parsed.data.name.trim()
    }
    existingSource = scope === 'global' ? 'global' : 'workspace'
  } catch {
    existingSource = scope === 'global' ? 'global' : 'workspace'
  }

  return {
    exists: true,
    targetPath,
    existingSkillName,
    existingSource,
  }
}

export async function installMarketSkill(args: InstallArgs): Promise<InstallMarketSkillResult> {
  emitProgress(args, 'prepare', 5, 'Preparing installation')
  emitProgress(args, 'fetchDetail', 12, 'Loading market skill detail')

  const detail = args.marketDetailOverride ?? await getMarketSkillDetail(args.marketSkillId)
  if (!detail.repoUrl) {
    throw new Error('Cannot install: repository URL not available from market detail.')
  }

  const slug = detail.skillId
  const skillsRoot = resolveScopePath(args.workspaceRoot, args.scope)
  await mkdir(skillsRoot, { recursive: true })

  const targetPath = join(skillsRoot, slug)
  const exists = await pathExists(targetPath)

  if (exists && !args.overwrite) {
    throw new Error(`Skill '${slug}' already exists at ${targetPath}`)
  }

  const warnings: string[] = [...detail.warnings]
  const tempRoot = await mkdtemp(join(tmpdir(), 'craft-market-skill-'))
  const cloneDir = join(tempRoot, 'repo')

  let backupPath: string | undefined

  try {
    emitProgress(args, 'cloneRepo', 35, 'Cloning repository')
    await runCommand('git', ['clone', '--depth', '1', detail.repoUrl, cloneDir])

    emitProgress(args, 'locateSkill', 58, 'Locating skill directory')
    const sourceSkillDir = await findSkillDirectory(cloneDir, detail.skillId)
    if (!sourceSkillDir) {
      throw new Error(`Skill directory '${detail.skillId}' was not found in repository ${detail.repoUrl}`)
    }

    if (exists) {
      emitProgress(args, 'backupExisting', 72, 'Backing up existing skill')
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      backupPath = `${targetPath}.bak.${stamp}`
      await rename(targetPath, backupPath)
    }

    emitProgress(args, 'copyFiles', 86, 'Copying skill files')
    await cp(sourceSkillDir, targetPath, {
      recursive: true,
      force: true,
      errorOnExist: false,
    })

    const metadata: InstallMetadata = {
      marketSkillId: detail.id,
      source: detail.source,
      skillId: detail.skillId,
      repoUrl: detail.repoUrl,
      installedAt: new Date().toISOString(),
    }

    emitProgress(args, 'writeMetadata', 95, 'Writing market metadata')
    await writeFile(join(targetPath, '.craft-market.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')

    emitProgress(args, 'completed', 100, 'Installation completed')

    return {
      success: true,
      slug,
      installedPath: targetPath,
      backupPath,
      warnings,
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}
