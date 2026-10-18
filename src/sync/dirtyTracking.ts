import { db } from '@/db/database'
import { isApplyingBackup } from '@/db/backup'
import { markLocalDirty } from '@/sync/syncMeta'

const TABLE_NAMES = [
  'goals',
  'ingredients',
  'pantryItems',
  'recipes',
  'cookingSessions',
  'readyBatches',
  'servings',
  'restocks',
  'shoppingLists',
  'cookLog',
  'waste',
  'meta',
] as const

let installed = false
let debounceTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

function notifyDirty() {
  for (const fn of listeners) fn()
}

function onLocalWrite() {
  if (isApplyingBackup()) return
  markLocalDirty()
  notifyDirty()
}

/** Subscribe to local dirty-mark events (debounced UI refresh). */
export function subscribeLocalDirty(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Hook Dexie mutations so any kitchen write marks the snapshot dirty.
 * Safe to call once at app bootstrap.
 */
export function installDirtyTracking() {
  if (installed) return
  installed = true

  for (const name of TABLE_NAMES) {
    const table = db.table(name)
    // Defer so the write commits before a sync read.
    table.hook('creating', () => {
      scheduleDirtyMark()
    })
    table.hook('updating', () => {
      scheduleDirtyMark()
    })
    table.hook('deleting', () => {
      scheduleDirtyMark()
    })
  }
}

function scheduleDirtyMark() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    onLocalWrite()
  }, 50)
}
