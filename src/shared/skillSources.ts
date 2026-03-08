export const SKILL_SOURCE_IDS = ['openai', 'community'] as const
export type SkillSourceId = (typeof SKILL_SOURCE_IDS)[number]

export const DEFAULT_SKILL_SOURCE: SkillSourceId = 'community'
export const INSTALLED_SKILL_DIR_PREFIX = 'codexui-skill--'
export const INSTALLED_SKILL_METADATA_FILE = '.codexui-skill.json'

export type InstalledSkillMetadata = {
  source: SkillSourceId
  skillId: string
  owner: string
  name: string
  displayName?: string
  url: string
}

export function isSkillSourceId(value: unknown): value is SkillSourceId {
  return value === 'openai' || value === 'community'
}

export function normalizeSkillSourceId(value: unknown, fallback: SkillSourceId = DEFAULT_SKILL_SOURCE): SkillSourceId {
  return isSkillSourceId(value) ? value : fallback
}

export function getSkillSourceLabel(source: SkillSourceId): string {
  return source === 'openai' ? 'OpenAI Skills' : 'Skills Hub'
}

export function buildCommunitySkillId(owner: string, name: string): string {
  return `${owner}/${name}`
}

export function parseCommunitySkillId(skillId: string): { owner: string; name: string } | null {
  const [owner, name, ...rest] = skillId.split('/')
  if (!owner || !name || rest.length > 0) return null
  return { owner, name }
}

export function buildOpenAiSkillId(group: string, name: string): string {
  return `${group}/${name}`
}

export function parseOpenAiSkillId(skillId: string): { group: string; name: string } | null {
  const [group, name, ...rest] = skillId.split('/')
  if (!group || !name || rest.length > 0) return null
  return { group, name }
}

export function encodeInstalledSkillDirName(source: SkillSourceId, skillId: string): string {
  return `${INSTALLED_SKILL_DIR_PREFIX}${source}--${encodeURIComponent(skillId)}`
}

export function decodeInstalledSkillDirName(dirName: string): { source: SkillSourceId; skillId: string } | null {
  if (!dirName.startsWith(INSTALLED_SKILL_DIR_PREFIX)) return null
  const remainder = dirName.slice(INSTALLED_SKILL_DIR_PREFIX.length)
  const separatorIndex = remainder.indexOf('--')
  if (separatorIndex <= 0) return null
  const source = remainder.slice(0, separatorIndex)
  const encodedSkillId = remainder.slice(separatorIndex + 2)
  if (!isSkillSourceId(source) || !encodedSkillId) return null
  try {
    return {
      source,
      skillId: decodeURIComponent(encodedSkillId),
    }
  } catch {
    return null
  }
}


export function resolveSkillCloneSpec(source: SkillSourceId, skillId: string): {
  repoUrl: string
  sparsePath: string
  sourceDirSegments: string[]
} | null {
  if (source === 'community') {
    const parsed = parseCommunitySkillId(skillId)
    if (!parsed) return null
    return {
      repoUrl: 'https://github.com/openclaw/skills.git',
      sparsePath: `skills/${parsed.owner}/${parsed.name}`,
      sourceDirSegments: ['skills', parsed.owner, parsed.name],
    }
  }

  const parsed = parseOpenAiSkillId(skillId)
  if (!parsed) return null
  return {
    repoUrl: 'https://github.com/openai/skills.git',
    sparsePath: `skills/${parsed.group}/${parsed.name}`,
    sourceDirSegments: ['skills', parsed.group, parsed.name],
  }
}
