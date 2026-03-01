export type InstallScope = 'workspace' | 'global'

export type MarketInstallProgressStage =
  | 'prepare'
  | 'fetchDetail'
  | 'cloneRepo'
  | 'locateSkill'
  | 'backupExisting'
  | 'copyFiles'
  | 'writeMetadata'
  | 'completed'
  | 'failed'

export interface MarketInstallProgress {
  installId: string
  stage: MarketInstallProgressStage
  percent: number
  message: string
  error?: string
}

export interface MarketSkillSummary {
  id: string
  source: string
  skillId: string
  name: string
  installs: number
}

export interface MarketSecurityAudit {
  provider: string
  status: 'pass' | 'warn' | 'fail' | 'unknown'
}

export interface MarketSkillDetail {
  id: string
  source: string
  skillId: string
  name: string
  repoUrl: string | null
  installs: number | null
  stars: number | null
  firstSeen: string | null
  skillMarkdown: string | null
  warnings: string[]
  securityAudits: MarketSecurityAudit[]
  parsedRisk: {
    alwaysAllow: string[]
    requiredSources: string[]
    globs: string[]
  }
}

export interface ConflictResult {
  exists: boolean
  targetPath: string
  existingSkillName?: string
  existingSource?: 'workspace' | 'global' | 'project'
}

export interface InstallMarketSkillInput {
  workspaceRoot: string
  scope: InstallScope
  marketSkillId: string
  overwrite?: boolean
  installId?: string
}

export interface InstallMarketSkillResult {
  success: boolean
  slug: string
  installedPath: string
  backupPath?: string
  warnings: string[]
}
