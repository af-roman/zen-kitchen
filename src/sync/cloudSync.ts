import {
  exportKitchenBackup,
  importKitchenBackup,
  parseKitchenBackup,
  type KitchenBackup,
} from '@/db/backup'
import { getSupabase, isCloudSyncConfigured } from '@/sync/supabaseClient'
import { markSynced, readSyncMeta } from '@/sync/syncMeta'

export type CloudSnapshotRow = {
  user_id: string
  revision: number
  updated_at: string
  payload: KitchenBackup
  device_id: string | null
}

export type SyncResult =
  | { status: 'idle'; message: string }
  | { status: 'ok'; action: 'pull' | 'push' | 'noop'; revision: number }
  | { status: 'conflict'; cloud: CloudSnapshotRow; localRevision: number; dirtyAt: string | null }
  | { status: 'error'; message: string }
  | { status: 'signed_out' }
  | { status: 'not_configured' }

export async function fetchCloudSnapshot(): Promise<CloudSnapshotRow | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('kitchen_snapshots')
    .select('user_id, revision, updated_at, payload, device_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    user_id: data.user_id as string,
    revision: Number(data.revision),
    updated_at: data.updated_at as string,
    payload: parseKitchenBackup(data.payload),
    device_id: (data.device_id as string | null) ?? null,
  }
}

async function pushSnapshot(revision: number, payload: KitchenBackup): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Cloud sync is not configured')
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in to sync')

  const meta = readSyncMeta()
  const { error } = await supabase.from('kitchen_snapshots').upsert(
    {
      user_id: user.id,
      revision,
      updated_at: new Date().toISOString(),
      payload,
      device_id: meta.deviceId,
    },
    { onConflict: 'user_id' },
  )
  if (error) throw new Error(error.message)
}

export async function pullCloudSnapshot(row: CloudSnapshotRow): Promise<void> {
  await importKitchenBackup(row.payload)
  markSynced(row.revision)
}

export async function pushLocalSnapshot(): Promise<number> {
  const meta = readSyncMeta()
  const cloud = await fetchCloudSnapshot()
  const revision = Math.max(meta.localRevision, (cloud?.revision ?? 0) + 1, 1)
  const payload = await exportKitchenBackup()
  await pushSnapshot(revision, payload)
  markSynced(revision)
  return revision
}

/**
 * Last-write-wins sync for a single user across devices.
 * - Local dirty + cloud ahead of lastSynced → conflict (caller chooses)
 * - Local dirty + cloud not ahead → push
 * - Local clean + cloud ahead → pull
 * - Else noop
 */
export async function runCloudSync(options?: {
  /** When true, push local over cloud on conflict. */
  resolveConflict?: 'local' | 'cloud'
}): Promise<SyncResult> {
  if (!isCloudSyncConfigured()) {
    return { status: 'not_configured' }
  }
  const supabase = getSupabase()
  if (!supabase) return { status: 'not_configured' }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { status: 'signed_out' }

    const meta = readSyncMeta()
    const cloud = await fetchCloudSnapshot()

    if (meta.dirty) {
      if (cloud && cloud.revision > meta.lastSyncedRevision && options?.resolveConflict !== 'local') {
        if (options?.resolveConflict === 'cloud') {
          await pullCloudSnapshot(cloud)
          return { status: 'ok', action: 'pull', revision: cloud.revision }
        }
        return {
          status: 'conflict',
          cloud,
          localRevision: meta.localRevision,
          dirtyAt: meta.dirtyAt,
        }
      }
      const revision = await pushLocalSnapshot()
      return { status: 'ok', action: 'push', revision }
    }

    if (cloud && cloud.revision > meta.lastSyncedRevision) {
      await pullCloudSnapshot(cloud)
      return { status: 'ok', action: 'pull', revision: cloud.revision }
    }

    if (!cloud) {
      const revision = await pushLocalSnapshot()
      return { status: 'ok', action: 'push', revision }
    }

    return { status: 'ok', action: 'noop', revision: meta.lastSyncedRevision }
  } catch (e) {
    return {
      status: 'error',
      message: e instanceof Error ? e.message : 'Sync failed',
    }
  }
}

export async function forcePushLocal(): Promise<SyncResult> {
  return runCloudSync({ resolveConflict: 'local' })
}

export async function forcePullCloud(): Promise<SyncResult> {
  return runCloudSync({ resolveConflict: 'cloud' })
}
