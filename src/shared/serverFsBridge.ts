import { spawn } from 'node:child_process'
import { readFile, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'

export const SERVER_FS_LIST_METHOD = 'codexui/fs/list'
export const SERVER_FS_TREE_METHOD = 'codexui/fs/tree'
export const SERVER_PROJECT_ROOT_SUGGESTION_METHOD = 'codexui/project-root-suggestion'
export const SERVER_COMPOSER_FILE_SEARCH_METHOD = 'codexui/composer-file-search'
export const SERVER_THREAD_REVIEW_CHANGES_METHOD = 'codexui/thread-review/changes'
export const SERVER_THREAD_REVIEW_FILE_METHOD = 'codexui/thread-review/file'
export const SERVER_THREAD_REVIEW_DOCUMENT_METHOD = 'codexui/thread-review/document'
export const SERVER_THREAD_REVIEW_WINDOW_METHOD = 'codexui/thread-review/window'

export type ServerFsDirectoryEntry = {
  name: string
  path: string
}

export type ServerFsDirectoryListing = {
  currentPath: string
  homePath: string
  parentPath: string | null
  entries: ServerFsDirectoryEntry[]
}

export type ServerFsTreeEntry = {
  name: string
  path: string
  kind: 'directory' | 'file'
  isText: boolean
  hasChildren: boolean
  depth: number
}

export type ServerFsTreeListing = {
  cwd: string
  path: string
  currentPath: string
  parentPath: string | null
  depth: number
  entries: ServerFsTreeEntry[]
}

export type ServerProjectRootSuggestion = {
  name: string
  path: string
}

export type ServerComposerFileSuggestion = {
  path: string
}

export type ServerThreadReviewChange = {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'untracked'
  additions: number
  deletions: number
}

export type ServerThreadReviewChanges = {
  cwd: string
  repoRoot: string | null
  branch: string
  isGitRepo: boolean
  files: ServerThreadReviewChange[]
}

export type ServerThreadReviewFile = {
  path: string
  status: ServerThreadReviewChange['status']
  diffText: string
  beforeText: string
  afterText: string
}

export type ServerThreadReviewFilePayload = {
  cwd: string
  repoRoot: string | null
  branch: string
  isGitRepo: boolean
  file: ServerThreadReviewFile | null
}

export type ServerThreadReviewDocument = {
  cwd: string
  path: string
  source: 'scope' | 'changes'
  mode: 'file' | 'change'
  repoRoot: string | null
  branch: string
  isGitRepo: boolean
  isText: boolean
  totalLines: number
  status: ServerThreadReviewChange['status'] | null
}

export type ServerThreadReviewWindow = {
  cwd: string
  path: string
  source: 'scope' | 'changes'
  mode: 'file' | 'change'
  startLine: number
  lineCount: number
  totalLines: number
  lines: string[]
}

type ServerFsListParams = {
  path?: string
}

type ServerFsTreeParams = {
  cwd?: string
  path?: string
}

type ServerProjectRootSuggestionParams = {
  basePath?: string
}

type ServerComposerFileSearchParams = {
  cwd?: string
  query?: string
  limit?: number
}

type ServerThreadReviewChangesParams = {
  cwd?: string
}

type ServerThreadReviewFileParams = {
  cwd?: string
  path?: string
}

type ServerThreadReviewDocumentParams = {
  cwd?: string
  path?: string
  source?: string
}

type ServerThreadReviewWindowParams = {
  cwd?: string
  path?: string
  source?: string
  startLine?: number
  lineCount?: number
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

const BINARY_FILE_EXTENSIONS = new Set([
  '.7z',
  '.a',
  '.avif',
  '.bin',
  '.bmp',
  '.class',
  '.dll',
  '.dylib',
  '.eot',
  '.exe',
  '.gif',
  '.gz',
  '.ico',
  '.jar',
  '.jpeg',
  '.jpg',
  '.mov',
  '.mp3',
  '.mp4',
  '.otf',
  '.pdf',
  '.png',
  '.so',
  '.tar',
  '.tgz',
  '.ttf',
  '.wav',
  '.webm',
  '.webp',
  '.woff',
  '.woff2',
  '.zip',
])

function normalizeFsTreePath(cwd: string, input: string): string {
  const root = isAbsolute(cwd) ? cwd : resolve(cwd)
  const value = input.trim()
  const target = value ? (isAbsolute(value) ? value : resolve(root, value)) : root
  const relativePath = relative(root, target)
  if (relativePath.startsWith('..')) {
    throw new Error('Path must stay inside cwd')
  }
  return target
}

function readTreeDepth(root: string, currentPath: string): number {
  const relativePath = relative(root, currentPath)
  if (!relativePath) return 0
  return relativePath.split(/[\\/]+/u).filter(Boolean).length
}

function isLikelyTextFile(path: string): boolean {
  const extension = extname(path).toLowerCase()
  if (!extension) return true
  return !BINARY_FILE_EXTENSIONS.has(extension)
}

async function directoryHasChildren(path: string): Promise<boolean> {
  try {
    const entries = await readdir(path, { withFileTypes: true })
    return entries.length > 0
  } catch {
    return false
  }
}

function scoreFileCandidate(path: string, query: string): number {
  if (!query) return 0
  const lowerPath = path.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const baseName = lowerPath.slice(lowerPath.lastIndexOf('/') + 1)
  if (baseName === lowerQuery) return 0
  if (baseName.startsWith(lowerQuery)) return 1
  if (baseName.includes(lowerQuery)) return 2
  if (lowerPath.includes(`/${lowerQuery}`)) return 3
  if (lowerPath.includes(lowerQuery)) return 4
  return 10
}

async function listFilesWithRipgrep(cwd: string): Promise<string[]> {
  return await new Promise<string[]>((resolvePromise, reject) => {
    const proc = spawn('rg', ['--files', '--hidden', '-g', '!.git', '-g', '!node_modules'], {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) {
        const rows = stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
        resolvePromise(rows)
        return
      }
      const details = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n')
      reject(new Error(details || 'rg --files failed'))
    })
  })
}

async function runProcess(cwd: string, command: string, args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolvePromise, reject) => {
    const proc = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      resolvePromise({ code, stdout, stderr })
    })
  })
}

async function resolveGitState(cwd: string): Promise<{ cwd: string; repoRoot: string | null; branch: string }> {
  const root = await runProcess(cwd, 'git', ['rev-parse', '--show-toplevel'])
  if (root.code !== 0) {
    return { cwd, repoRoot: null, branch: '' }
  }

  const repoRoot = root.stdout.trim() || null
  if (!repoRoot) {
    return { cwd, repoRoot: null, branch: '' }
  }

  const branch = await runProcess(cwd, 'git', ['branch', '--show-current'])
  return {
    cwd,
    repoRoot,
    branch: branch.code === 0 ? branch.stdout.trim() : '',
  }
}

function normalizeReviewPath(repoRoot: string, input: string): string {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('Missing path')
  }
  const absolute = isAbsolute(trimmed) ? trimmed : resolve(repoRoot, trimmed)
  const relativePath = relative(repoRoot, absolute).split('\\').join('/')
  if (relativePath.startsWith('..') || relativePath.length === 0) {
    throw new Error('Path must stay inside the git repo')
  }
  return relativePath
}

function normalizeReviewStatus(code: string): ServerThreadReviewChange['status'] {
  if (code === '??') return 'untracked'
  if (code.includes('R')) return 'renamed'
  if (code.includes('C')) return 'copied'
  if (code.includes('D')) return 'deleted'
  if (code.includes('A')) return 'added'
  return 'modified'
}

function normalizeReviewSource(value: string | undefined): 'scope' | 'changes' {
  return value === 'changes' ? 'changes' : 'scope'
}

function splitReviewLines(text: string): string[] {
  if (!text) return []
  return text.replace(/\r\n?/gu, '\n').split('\n')
}

async function listGitChanges(cwd: string): Promise<ServerThreadReviewChanges> {
  const git = await resolveGitState(cwd)
  if (!git.repoRoot) {
    return {
      cwd,
      repoRoot: null,
      branch: '',
      isGitRepo: false,
      files: [],
    }
  }

  const result = await runProcess(cwd, 'git', ['status', '--porcelain=v1', '--untracked=all'])
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || 'git status failed')
  }

  const rows = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)

  const files = await Promise.all(rows.map(async (line) => {
    const code = line.slice(0, 2)
    const rawPath = line.slice(3).trim()
    const path = rawPath.includes(' -> ') ? rawPath.split(' -> ').at(-1)?.trim() ?? rawPath : rawPath
    const status = normalizeReviewStatus(code)
    const counts = await runProcess(cwd, 'git', ['diff', '--numstat', '--', path])
    const first = counts.stdout.trim().split(/\r?\n/)[0] ?? ''
    const [additionsRaw, deletionsRaw] = first.split(/\s+/u)
    const additions = Number.isFinite(Number(additionsRaw)) ? Number(additionsRaw) : status === 'untracked' ? 1 : 0
    const deletions = Number.isFinite(Number(deletionsRaw)) ? Number(deletionsRaw) : 0
    return { path, status, additions, deletions }
  }))

  return {
    cwd,
    repoRoot: git.repoRoot,
    branch: git.branch,
    isGitRepo: true,
    files,
  }
}

function buildUntrackedDiff(path: string, afterText: string): string {
  const lines = afterText.replace(/\r\n?/gu, '\n').split('\n')
  const additions = lines.map((line) => `+${line}`).join('\n')
  return [
    `diff --git a/${path} b/${path}`,
    'new file mode 100644',
    '--- /dev/null',
    `+++ b/${path}`,
    `@@ -0,0 +1,${String(lines.length)} @@`,
    additions,
  ].join('\n').trim()
}

async function readGitTrackedText(cwd: string, path: string): Promise<string> {
  const result = await runProcess(cwd, 'git', ['show', `HEAD:${path}`])
  if (result.code !== 0) return ''
  return result.stdout
}

async function readScopeReviewContent(cwd: string, rawPath: string): Promise<{
  cwd: string
  path: string
  repoRoot: string | null
  branch: string
  isGitRepo: boolean
  isText: boolean
  text: string
}> {
  const currentPath = normalizeFsTreePath(cwd, rawPath)
  const info = await stat(currentPath)
  if (!info.isFile()) {
    throw new Error('Path exists but is not a file')
  }
  const git = await resolveGitState(cwd)
  const isText = isLikelyTextFile(currentPath)
  return {
    cwd,
    path: currentPath,
    repoRoot: git.repoRoot,
    branch: git.branch,
    isGitRepo: !!git.repoRoot,
    isText,
    text: isText ? await readFile(currentPath, 'utf8') : '',
  }
}

async function readChangeReviewContent(cwd: string, rawPath: string): Promise<{
  cwd: string
  path: string
  repoRoot: string | null
  branch: string
  isGitRepo: boolean
  isText: boolean
  status: ServerThreadReviewChange['status'] | null
  diffText: string
}> {
  const payload = await readReviewFile({ cwd, path: rawPath })
  return {
    cwd: payload.cwd,
    path: payload.file?.path ?? rawPath,
    repoRoot: payload.repoRoot,
    branch: payload.branch,
    isGitRepo: payload.isGitRepo,
    isText: payload.file ? isLikelyTextFile(payload.file.path) : false,
    status: payload.file?.status ?? null,
    diffText: payload.file?.diffText ?? '',
  }
}

async function readReviewFile(params: unknown): Promise<ServerThreadReviewFilePayload> {
  const payload = asRecord(params) as ServerThreadReviewFileParams | null
  const rawCwd = typeof payload?.cwd === 'string' ? payload.cwd.trim() : ''
  const rawPath = typeof payload?.path === 'string' ? payload.path.trim() : ''
  if (!rawCwd) {
    throw new Error('Missing cwd')
  }
  if (!rawPath) {
    throw new Error('Missing path')
  }

  const cwd = isAbsolute(rawCwd) ? rawCwd : resolve(rawCwd)
  const git = await resolveGitState(cwd)
  if (!git.repoRoot) {
    return {
      cwd,
      repoRoot: null,
      branch: '',
      isGitRepo: false,
      file: null,
    }
  }

  const path = normalizeReviewPath(git.repoRoot, rawPath)
  const changes = await listGitChanges(cwd)
  const current = changes.files.find((item) => item.path === path) ?? {
    path,
    status: 'modified' as const,
    additions: 0,
    deletions: 0,
  }

  const absolutePath = resolve(git.repoRoot, path)
  const afterText = current.status === 'deleted'
    ? ''
    : await readFile(absolutePath, 'utf8').catch(() => '')
  const beforeText = current.status === 'untracked' ? '' : await readGitTrackedText(cwd, path)
  const diff = await runProcess(cwd, 'git', ['diff', '--no-ext-diff', '--unified=3', '--', path])
  const diffText = diff.stdout.trim() || (current.status === 'untracked' ? buildUntrackedDiff(path, afterText) : '')

  return {
    cwd,
    repoRoot: git.repoRoot,
    branch: git.branch,
    isGitRepo: true,
    file: {
      path,
      status: current.status,
      diffText,
      beforeText,
      afterText,
    },
  }
}

async function readReviewDocument(params: unknown): Promise<ServerThreadReviewDocument> {
  const payload = asRecord(params) as ServerThreadReviewDocumentParams | null
  const rawCwd = typeof payload?.cwd === 'string' ? payload.cwd.trim() : ''
  const rawPath = typeof payload?.path === 'string' ? payload.path.trim() : ''
  const source = normalizeReviewSource(typeof payload?.source === 'string' ? payload.source.trim() : '')
  if (!rawCwd) {
    throw new Error('Missing cwd')
  }
  if (!rawPath) {
    throw new Error('Missing path')
  }

  const cwd = isAbsolute(rawCwd) ? rawCwd : resolve(rawCwd)
  if (source === 'changes') {
    const review = await readChangeReviewContent(cwd, rawPath)
    const lines = splitReviewLines(review.diffText)
    return {
      cwd: review.cwd,
      path: review.path,
      source,
      mode: 'change',
      repoRoot: review.repoRoot,
      branch: review.branch,
      isGitRepo: review.isGitRepo,
      isText: review.isText,
      totalLines: lines.length,
      status: review.status,
    }
  }

  const file = await readScopeReviewContent(cwd, rawPath)
  const lines = splitReviewLines(file.text)
  return {
    cwd: file.cwd,
    path: file.path,
    source,
    mode: 'file',
    repoRoot: file.repoRoot,
    branch: file.branch,
    isGitRepo: file.isGitRepo,
    isText: file.isText,
    totalLines: lines.length,
    status: null,
  }
}

async function readReviewWindow(params: unknown): Promise<ServerThreadReviewWindow> {
  const payload = asRecord(params) as ServerThreadReviewWindowParams | null
  const rawCwd = typeof payload?.cwd === 'string' ? payload.cwd.trim() : ''
  const rawPath = typeof payload?.path === 'string' ? payload.path.trim() : ''
  const source = normalizeReviewSource(typeof payload?.source === 'string' ? payload.source.trim() : '')
  if (!rawCwd) {
    throw new Error('Missing cwd')
  }
  if (!rawPath) {
    throw new Error('Missing path')
  }

  const startLine = typeof payload?.startLine === 'number' && Number.isFinite(payload.startLine)
    ? Math.max(0, Math.floor(payload.startLine))
    : 0
  const lineCount = typeof payload?.lineCount === 'number' && Number.isFinite(payload.lineCount)
    ? Math.max(1, Math.min(400, Math.floor(payload.lineCount)))
    : 80
  const cwd = isAbsolute(rawCwd) ? rawCwd : resolve(rawCwd)

  if (source === 'changes') {
    const review = await readChangeReviewContent(cwd, rawPath)
    const lines = review.isText ? splitReviewLines(review.diffText) : []
    return {
      cwd: review.cwd,
      path: review.path,
      source,
      mode: 'change',
      startLine,
      lineCount,
      totalLines: lines.length,
      lines: lines.slice(startLine, startLine + lineCount),
    }
  }

  const file = await readScopeReviewContent(cwd, rawPath)
  const lines = file.isText ? splitReviewLines(file.text) : []
  return {
    cwd: file.cwd,
    path: file.path,
    source,
    mode: 'file',
    startLine,
    lineCount,
    totalLines: lines.length,
    lines: lines.slice(startLine, startLine + lineCount),
  }
}

export function isServerFsBridgeMethod(method: string): boolean {
  return method === SERVER_FS_LIST_METHOD
    || method === SERVER_FS_TREE_METHOD
    || method === SERVER_PROJECT_ROOT_SUGGESTION_METHOD
    || method === SERVER_COMPOSER_FILE_SEARCH_METHOD
    || method === SERVER_THREAD_REVIEW_CHANGES_METHOD
    || method === SERVER_THREAD_REVIEW_FILE_METHOD
    || method === SERVER_THREAD_REVIEW_DOCUMENT_METHOD
    || method === SERVER_THREAD_REVIEW_WINDOW_METHOD
}

export async function executeServerFsBridgeMethod(method: string, params: unknown): Promise<unknown> {
  if (method === SERVER_FS_LIST_METHOD) {
    return await listServerDirectories(params)
  }
  if (method === SERVER_FS_TREE_METHOD) {
    return await listServerTree(params)
  }
  if (method === SERVER_PROJECT_ROOT_SUGGESTION_METHOD) {
    return await suggestServerProjectRoot(params)
  }
  if (method === SERVER_COMPOSER_FILE_SEARCH_METHOD) {
    return await searchServerComposerFiles(params)
  }
  if (method === SERVER_THREAD_REVIEW_CHANGES_METHOD) {
    return await listServerThreadReviewChanges(params)
  }
  if (method === SERVER_THREAD_REVIEW_FILE_METHOD) {
    return await readReviewFile(params)
  }
  if (method === SERVER_THREAD_REVIEW_DOCUMENT_METHOD) {
    return await readReviewDocument(params)
  }
  if (method === SERVER_THREAD_REVIEW_WINDOW_METHOD) {
    return await readReviewWindow(params)
  }
  throw new Error(`Unsupported server fs bridge method "${method}"`)
}

export async function listServerDirectories(params: unknown): Promise<ServerFsDirectoryListing> {
  const payload = asRecord(params) as ServerFsListParams | null
  const homePath = homedir()
  const rawPath = typeof payload?.path === 'string' ? payload.path.trim() : ''
  const currentPath = rawPath.length > 0 ? (isAbsolute(rawPath) ? rawPath : resolve(rawPath)) : homePath

  try {
    const info = await stat(currentPath)
    if (!info.isDirectory()) {
      throw new Error('Path exists but is not a directory')
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Path exists but is not a directory') {
      throw error
    }
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (code === 'ENOENT') {
      throw new Error('Directory does not exist')
    }
    throw new Error('Failed to access directory')
  }

  try {
    const parentCandidate = dirname(currentPath)
    const entries = (await readdir(currentPath, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ name: entry.name, path: join(currentPath, entry.name) }))
      .sort((left, right) => left.name.localeCompare(right.name))

    return {
      currentPath,
      homePath,
      parentPath: parentCandidate === currentPath ? null : parentCandidate,
      entries,
    }
  } catch {
    throw new Error('Failed to read directory')
  }
}

export async function listServerTree(params: unknown): Promise<ServerFsTreeListing> {
  const payload = asRecord(params) as ServerFsTreeParams | null
  const rawCwd = typeof payload?.cwd === 'string' ? payload.cwd.trim() : ''
  if (!rawCwd) {
    throw new Error('Missing cwd')
  }

  const cwd = isAbsolute(rawCwd) ? rawCwd : resolve(rawCwd)
  const currentPath = normalizeFsTreePath(cwd, typeof payload?.path === 'string' ? payload.path : '')

  try {
    const info = await stat(currentPath)
    if (!info.isDirectory()) {
      throw new Error('Path exists but is not a directory')
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Path exists but is not a directory') {
      throw error
    }
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (code === 'ENOENT') {
      throw new Error('Directory does not exist')
    }
    throw new Error('Failed to access directory')
  }

  const depth = readTreeDepth(cwd, currentPath)
  const parentCandidate = dirname(currentPath)
  const parentPath = currentPath === cwd ? null : normalizeFsTreePath(cwd, parentCandidate)
  const entries = await readdir(currentPath, { withFileTypes: true })
  const rows = await Promise.all(entries.map(async (entry) => {
    const path = join(currentPath, entry.name)
    const isDirectory = entry.isDirectory()
    return {
      name: entry.name,
      path,
      kind: isDirectory ? 'directory' : 'file',
      isText: isDirectory ? false : isLikelyTextFile(path),
      hasChildren: isDirectory ? await directoryHasChildren(path) : false,
      depth: depth + 1,
    } satisfies ServerFsTreeEntry
  }))

  rows.sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'directory' ? -1 : 1
    }
    return left.name.localeCompare(right.name)
  })

  return {
    cwd,
    path: currentPath,
    currentPath,
    parentPath,
    depth,
    entries: rows,
  }
}

export async function suggestServerProjectRoot(params: unknown): Promise<ServerProjectRootSuggestion> {
  const payload = asRecord(params) as ServerProjectRootSuggestionParams | null
  const basePath = typeof payload?.basePath === 'string' ? payload.basePath.trim() : ''
  if (!basePath) {
    throw new Error('Missing basePath')
  }

  const normalizedBasePath = isAbsolute(basePath) ? basePath : resolve(basePath)
  try {
    const info = await stat(normalizedBasePath)
    if (!info.isDirectory()) {
      throw new Error('basePath is not a directory')
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'basePath is not a directory') {
      throw error
    }
    throw new Error('basePath does not exist')
  }

  let index = 1
  while (index < 100000) {
    const candidateName = `New Project (${String(index)})`
    const candidatePath = join(normalizedBasePath, candidateName)
    try {
      await stat(candidatePath)
      index += 1
      continue
    } catch {
      return {
        name: candidateName,
        path: candidatePath,
      }
    }
  }

  throw new Error('Failed to compute project name suggestion')
}

export async function searchServerComposerFiles(params: unknown): Promise<ServerComposerFileSuggestion[]> {
  const payload = asRecord(params) as ServerComposerFileSearchParams | null
  const rawCwd = typeof payload?.cwd === 'string' ? payload.cwd.trim() : ''
  const query = typeof payload?.query === 'string' ? payload.query.trim() : ''
  const limitRaw = typeof payload?.limit === 'number' ? payload.limit : 20
  const limit = Math.max(1, Math.min(100, Math.floor(limitRaw)))
  if (!rawCwd) {
    throw new Error('Missing cwd')
  }

  const cwd = isAbsolute(rawCwd) ? rawCwd : resolve(rawCwd)
  try {
    const info = await stat(cwd)
    if (!info.isDirectory()) {
      throw new Error('cwd is not a directory')
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'cwd is not a directory') {
      throw error
    }
    throw new Error('cwd does not exist')
  }

  const files = await listFilesWithRipgrep(cwd)
  return files
    .map((path) => ({ path, score: scoreFileCandidate(path, query) }))
    .filter((row) => query.length === 0 || row.score < 10)
    .sort((left, right) => (left.score - right.score) || left.path.localeCompare(right.path))
    .slice(0, limit)
    .map((row) => ({ path: row.path }))
}

export async function listServerThreadReviewChanges(params: unknown): Promise<ServerThreadReviewChanges> {
  const payload = asRecord(params) as ServerThreadReviewChangesParams | null
  const rawCwd = typeof payload?.cwd === 'string' ? payload.cwd.trim() : ''
  if (!rawCwd) {
    throw new Error('Missing cwd')
  }

  const cwd = isAbsolute(rawCwd) ? rawCwd : resolve(rawCwd)
  try {
    const info = await stat(cwd)
    if (!info.isDirectory()) {
      throw new Error('cwd is not a directory')
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'cwd is not a directory') {
      throw error
    }
    throw new Error('cwd does not exist')
  }

  return await listGitChanges(cwd)
}
