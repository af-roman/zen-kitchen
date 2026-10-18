const STORAGE_KEY = 'zen-kitchen-sync-meta'

export interface SyncMeta {
  /** Monotonic local revision; bumped on each local write batch. */
  localRevision: number
  /** Last cloud revision successfully pulled or pushed. */
  lastSyncedRevision: number
  /** ISO time of last successful sync. */
  lastSyncedAt: string | null
  /** Local writes since last sync. */
  dirty: boolean
  /** When local became dirty (ISO). */
  dirtyAt: string | null
  /** Stable id for this browser profile (conflict messages). */
  deviceId: string
}

function newDeviceId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function defaultMeta(): SyncMeta {
  return {
    localRevision: 0,
    lastSyncedRevision: 0,
    lastSyncedAt: null,
    dirty: false,
    dirtyAt: null,
    deviceId: newDeviceId(),
  }
}

export function readSyncMeta(): SyncMeta {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultMeta()
    const parsed = JSON.parse(raw) as Partial<SyncMeta>
    return {
      ...defaultMeta(),
      ...parsed,
      deviceId: parsed.deviceId || newDeviceId(),
    }
  } catch {
    return defaultMeta()
  }
}

export function writeSyncMeta(meta: SyncMeta) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(meta))
}

export function markLocalDirty() {
  const meta = readSyncMeta()
  const now = new Date().toISOString()
  writeSyncMeta({
    ...meta,
    localRevision: meta.localRevision + 1,
    dirty: true,
    dirtyAt: meta.dirtyAt ?? now,
  })
}

export function markSynced(revision: number) {
  writeSyncMeta({
    ...readSyncMeta(),
    localRevision: revision,
    lastSyncedRevision: revision,
    lastSyncedAt: new Date().toISOString(),
    dirty: false,
    dirtyAt: null,
  })
}

export function clearDirtyKeepingRevision() {
  const meta = readSyncMeta()
  writeSyncMeta({
    ...meta,
    dirty: false,
    dirtyAt: null,
  })
}
