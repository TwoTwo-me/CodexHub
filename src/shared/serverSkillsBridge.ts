import type { SkillSourceId } from './skillSources.js'

export const SERVER_SKILLS_INSTALL_METHOD = 'codexui/skills/install'
export const SERVER_SKILLS_UNINSTALL_METHOD = 'codexui/skills/uninstall'

export type BridgeSkillInstallPayload = {
  source: SkillSourceId
  skillId: string
  owner?: string
  name: string
}

export type BridgeSkillUninstallPayload = {
  source: SkillSourceId
  skillId: string
  path?: string
}
