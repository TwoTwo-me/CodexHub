function cloneGroups(groups) {
  return groups.map((group) => ({
    ...group,
    threads: group.threads.map((thread) => ({ ...thread })),
  }))
}

export function toServerTreeKey(serverId) {
  const value = typeof serverId === 'string' ? serverId.trim() : ''
  return value || '__default__'
}

export function isServerPanelVisible(collapsedServers, selectedServerId, serverId) {
  const key = toServerTreeKey(serverId)
  if (toServerTreeKey(selectedServerId) === key) return true
  return collapsedServers[key] === false
}

export function isServerExpanded(collapsedServers, serverId) {
  return collapsedServers[toServerTreeKey(serverId)] !== true
}

export function shouldShowProjectEmpty(isCollapsed, threadCount) {
  return isCollapsed !== true && Number(threadCount) === 0
}

export function upsertServerGroupsCache(cache, serverId, groups) {
  const key = toServerTreeKey(serverId)
  return {
    ...cache,
    [key]: cloneGroups(groups),
  }
}

export function upsertServerLoadingCache(cache, serverId, isLoading) {
  const key = toServerTreeKey(serverId)
  return {
    ...cache,
    [key]: isLoading === true,
  }
}
