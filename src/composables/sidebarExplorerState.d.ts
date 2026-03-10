import type { UiProjectGroup } from '../types/codex'

export function toServerTreeKey(serverId: string): string
export function isServerPanelVisible(collapsedServers: Record<string, boolean>, selectedServerId: string, serverId: string): boolean
export function isServerExpanded(collapsedServers: Record<string, boolean>, serverId: string): boolean
export function shouldShowProjectEmpty(isCollapsed: boolean, threadCount: number): boolean
export function upsertServerGroupsCache(cache: Record<string, UiProjectGroup[]>, serverId: string, groups: UiProjectGroup[]): Record<string, UiProjectGroup[]>
export function upsertServerLoadingCache(cache: Record<string, boolean>, serverId: string, isLoading: boolean): Record<string, boolean>
