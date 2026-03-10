function createDirectoryNode(path, name) {
  return {
    key: path,
    path,
    name,
    kind: 'directory',
    file: null,
    children: [],
  }
}

function createFileNode(file, name) {
  return {
    key: file.path,
    path: file.path,
    name,
    kind: 'file',
    file,
    children: [],
  }
}

function sortNodes(nodes) {
  nodes.sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'directory' ? -1 : 1
    }
    return left.name.localeCompare(right.name)
  })
  for (const node of nodes) {
    if (node.kind === 'directory') {
      sortNodes(node.children)
    }
  }
  return nodes
}

export function buildThreadChangeTree(files) {
  const root = []
  const directoryMap = new Map()

  for (const file of files) {
    const segments = file.path.split('/').filter(Boolean)
    let current = root
    let currentPath = ''

    for (const [index, segment] of segments.entries()) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment
      const isLeaf = index === segments.length - 1
      if (isLeaf) {
        current.push(createFileNode(file, segment))
        continue
      }
      const existing = directoryMap.get(currentPath)
      if (existing) {
        current = existing.children
        continue
      }
      const directory = createDirectoryNode(currentPath, segment)
      directoryMap.set(currentPath, directory)
      current.push(directory)
      current = directory.children
    }
  }

  return sortNodes(root)
}

export function flattenThreadChangeTree(nodes, expanded = {}, depth = 0) {
  const rows = []
  for (const node of nodes) {
    rows.push({ ...node, depth })
    if (node.kind === 'directory' && expanded[node.path] === true) {
      rows.push(...flattenThreadChangeTree(node.children, expanded, depth + 1))
    }
  }
  return rows
}
