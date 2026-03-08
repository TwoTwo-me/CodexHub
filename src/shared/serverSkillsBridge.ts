export const SERVER_SKILLS_INSTALL_METHOD = 'codexui/skills/install'
export const SERVER_SKILLS_UNINSTALL_METHOD = 'codexui/skills/uninstall'

export type BridgeSkillInstallPayload = {
  owner: string
  name: string
}

export type BridgeSkillUninstallPayload = {
  name: string
}
