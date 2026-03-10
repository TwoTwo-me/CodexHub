export const THREAD_DRAFTS_STORAGE_KEY = 'codex-web-local.thread-drafts.v1'

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function normalizeString(value) {
  return typeof value === 'string' ? value : ''
}

function normalizeFileAttachment(value) {
  const record = asRecord(value)
  if (!record) return null
  const label = normalizeString(record.label).trim()
  const path = normalizeString(record.path).trim()
  const fsPath = normalizeString(record.fsPath).trim()
  if (!label || !path || !fsPath) return null
  return { label, path, fsPath }
}

function normalizeReviewRef(value) {
  const record = asRecord(value)
  if (!record) return null
  const path = normalizeString(record.path).trim()
  const text = normalizeString(record.text).trim()
  const line = typeof record.line === 'number' && Number.isFinite(record.line)
    ? Math.max(1, Math.trunc(record.line))
    : null
  if (!path || !text || line === null) return null
  return { path, line, text }
}

export function createEmptyThreadDraft() {
  return {
    text: '',
    fileAttachments: [],
    reviewRefs: [],
  }
}

export function normalizeThreadDraft(value) {
  const record = asRecord(value)
  if (!record) return createEmptyThreadDraft()
  const fileAttachments = Array.isArray(record.fileAttachments)
    ? record.fileAttachments.map(normalizeFileAttachment).filter(Boolean)
    : []
  const reviewRefs = Array.isArray(record.reviewRefs)
    ? record.reviewRefs.map(normalizeReviewRef).filter(Boolean)
    : []
  return {
    text: normalizeString(record.text),
    fileAttachments,
    reviewRefs,
  }
}

export function toThreadDraftStorageKey(serverId, threadId) {
  const normalizedServerId = typeof serverId === 'string' && serverId.trim() ? serverId.trim() : '__default__'
  const normalizedThreadId = typeof threadId === 'string' && threadId.trim() ? threadId.trim() : '__new-thread__'
  return `${normalizedServerId}::${normalizedThreadId}`
}

export function replaceReviewRefsForPath(draft, path, refs) {
  const current = normalizeThreadDraft(draft)
  const normalizedPath = normalizeString(path).trim()
  const nextRefs = Array.isArray(refs) ? refs.map(normalizeReviewRef).filter(Boolean) : []
  return {
    ...current,
    reviewRefs: [
      ...current.reviewRefs.filter((row) => row.path !== normalizedPath),
      ...nextRefs,
    ],
  }
}

function loadThreadDraftMap(storage) {
  if (!storage) return {}
  try {
    const raw = storage.getItem(THREAD_DRAFTS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return asRecord(parsed) ?? {}
  } catch {
    return {}
  }
}

function saveThreadDraftMap(storage, value) {
  if (!storage) return
  storage.setItem(THREAD_DRAFTS_STORAGE_KEY, JSON.stringify(value))
}

export function readThreadDraft(storage, key) {
  const record = loadThreadDraftMap(storage)
  return normalizeThreadDraft(record[key])
}

export function writeThreadDraft(storage, key, draft) {
  const record = loadThreadDraftMap(storage)
  record[key] = normalizeThreadDraft(draft)
  saveThreadDraftMap(storage, record)
}

export function clearThreadDraft(storage, key) {
  const record = loadThreadDraftMap(storage)
  delete record[key]
  saveThreadDraftMap(storage, record)
}
