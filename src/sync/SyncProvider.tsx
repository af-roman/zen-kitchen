import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { User } from '@supabase/supabase-js'
import { appAlert, appConfirm } from '@/shared/dialog'
import {
  claimHandoff,
  clearClaim,
  clearPendingRedirect,
  exchangePastedCode,
  isIos,
  isStandaloneApp,
  pastePayload,
  publishPending,
  readClaim,
  readPendingRedirect,
  redirectToWithHandoff,
  verifyEmailOtp,
  writeClaim,
  type AuthBridge,
} from '@/sync/authHandoff'
import {
  forcePullCloud,
  forcePushLocal,
  runCloudSync,
  type SyncResult,
} from '@/sync/cloudSync'
import { installDirtyTracking, subscribeLocalDirty } from '@/sync/dirtyTracking'
import { getSupabase, isCloudSyncConfigured } from '@/sync/supabaseClient'
import { readSyncMeta } from '@/sync/syncMeta'

type SyncStatus =
  | 'disabled'
  | 'signed_out'
  | 'idle'
  | 'syncing'
  | 'conflict'
  | 'error'

type SyncContextValue = {
  configured: boolean
  status: SyncStatus
  user: User | null
  lastSyncedAt: string | null
  dirty: boolean
  lastError: string | null
  syncNow: () => Promise<void>
  signInWithMagicLink: (email: string) => Promise<{ ok: true } | { ok: false; message: string }>
  signInEmail: string | null
  verifySignInCode: (code: string) => Promise<{ ok: true } | { ok: false; message: string }>
  authBridge: AuthBridge | null
  dismissAuthBridge: () => void
  signOut: () => Promise<void>
}

const SyncContext = createContext<SyncContextValue | null>(null)

function statusFromResult(result: SyncResult): SyncStatus {
  switch (result.status) {
    case 'not_configured':
      return 'disabled'
    case 'signed_out':
      return 'signed_out'
    case 'conflict':
      return 'conflict'
    case 'error':
      return 'error'
    case 'ok':
    case 'idle':
      return 'idle'
  }
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const configured = isCloudSyncConfigured()
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<SyncStatus>(configured ? 'signed_out' : 'disabled')
  const [lastError, setLastError] = useState<string | null>(null)
  const [signInEmail, setSignInEmail] = useState<string | null>(() => readClaim()?.email ?? null)
  const [authBridge, setAuthBridge] = useState<AuthBridge | null>(null)
  const [metaTick, setMetaTick] = useState(0)
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncingRef = useRef(false)
  const meta = readSyncMeta()

  const refreshMeta = useCallback(() => setMetaTick((n) => n + 1), [])

  const applyResult = useCallback(
    async (result: SyncResult): Promise<void> => {
      setLastError(result.status === 'error' ? result.message : null)
      setStatus(statusFromResult(result))
      refreshMeta()

      if (result.status === 'ok' && result.action === 'pull') {
        await appAlert('Kitchen updated from the cloud. Reloading…', { title: 'Synced' })
        window.location.reload()
        return
      }

      if (result.status === 'conflict') {
        const useCloud = await appConfirm(
          `This device and the cloud both changed the kitchen.\n\nCloud updated: ${new Date(result.cloud.updated_at).toLocaleString()}${result.cloud.device_id ? ` (device ${result.cloud.device_id.slice(0, 8)}…)` : ''}\nLocal changes since: ${result.dirtyAt ? new Date(result.dirtyAt).toLocaleString() : 'recently'}\n\nUse cloud copy? (Cancel keeps this device and uploads it.)`,
          { title: 'Sync conflict', confirmLabel: 'Use cloud', cancelLabel: 'Keep this device' },
        )
        if (useCloud) {
          setStatus('syncing')
          await applyResult(await forcePullCloud())
        } else {
          setStatus('syncing')
          await applyResult(await forcePushLocal())
        }
      }
    },
    [refreshMeta],
  )

  const syncNow = useCallback(async () => {
    if (!configured || syncingRef.current) return
    const supabase = getSupabase()
    if (!supabase) return
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) {
      setStatus('signed_out')
      return
    }
    syncingRef.current = true
    setStatus('syncing')
    try {
      const result = await runCloudSync()
      await applyResult(result)
    } finally {
      syncingRef.current = false
    }
  }, [configured, applyResult])

  useEffect(() => {
    installDirtyTracking()
    return subscribeLocalDirty(() => {
      refreshMeta()
      if (pushTimer.current) clearTimeout(pushTimer.current)
      pushTimer.current = setTimeout(() => {
        pushTimer.current = null
        void syncNow()
      }, 2000)
    })
  }, [refreshMeta, syncNow])

  useEffect(() => {
    if (!configured) return
    const supabase = getSupabase()
    if (!supabase) return

    let cancelled = false
    const pending = readPendingRedirect()
    const claim = readClaim()
    void (async () => {
      if (!pending || cancelled) return
      const sameBrowser = Boolean(claim && claim.id === pending.id && 'code' in pending)
      if (sameBrowser && 'code' in pending) {
        clearPendingRedirect()
        const { error } = await supabase.auth.exchangeCodeForSession(
          pending.code,
          pending.flowId ? { flowId: pending.flowId } : undefined,
        )
        if (cancelled) return
        if (error) setLastError(error.message)
        else {
          clearClaim()
          setSignInEmail(null)
          if (isIos() && !isStandaloneApp()) setAuthBridge({ kind: 'open-from-app' })
        }
        return
      }
      const result = await publishPending(supabase, pending)
      if (cancelled) return
      if (result === 'published') {
        clearPendingRedirect()
        setAuthBridge({ kind: 'published' })
        return
      }
      if ('code' in pending) {
        setAuthBridge({
          kind: 'paste',
          code: pastePayload(pending),
          needsSetup: result === 'missing',
        })
      }
    })()

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setUser(data.session?.user ?? null)
      setStatus(data.session ? 'idle' : 'signed_out')
      if (data.session) {
        clearClaim()
        setSignInEmail(null)
        void syncNow()
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setStatus(session ? 'idle' : 'signed_out')
      if (session) {
        clearClaim()
        setSignInEmail(null)
        void syncNow()
      }
    })

    const onVis = () => {
      if (document.visibilityState === 'visible') void syncNow()
    }
    const onOnline = () => {
      void syncNow()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', onOnline)

    return () => {
      cancelled = true
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('online', onOnline)
      if (pushTimer.current) clearTimeout(pushTimer.current)
    }
  }, [configured, syncNow])

  const signInWithMagicLink = useCallback(async (email: string) => {
    const supabase = getSupabase()
    if (!supabase) return { ok: false as const, message: 'Cloud sync is not configured' }
    const trimmed = email.trim()
    const id = crypto.randomUUID()
    writeClaim({ id, email: trimmed, at: Date.now() })
    setSignInEmail(trimmed)
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: redirectToWithHandoff(id) },
    })
    if (error) {
      clearClaim()
      setSignInEmail(null)
      return { ok: false as const, message: error.message }
    }
    return { ok: true as const }
  }, [])

  const verifySignInCode = useCallback(async (code: string) => {
    const supabase = getSupabase()
    if (!supabase) return { ok: false as const, message: 'Cloud sync is not configured' }
    const trimmed = code.trim()
    const email = readClaim()?.email ?? signInEmail ?? ''
    const result = /^\d{6,10}$/.test(trimmed)
      ? await verifyEmailOtp(supabase, email, trimmed)
      : await exchangePastedCode(supabase, trimmed)
    if (result.ok) {
      clearClaim()
      clearPendingRedirect()
      setSignInEmail(null)
      setAuthBridge(null)
    }
    return result
  }, [signInEmail])

  const dismissAuthBridge = useCallback(() => {
    setAuthBridge(null)
    clearPendingRedirect()
  }, [])

  useEffect(() => {
    if (!configured || user) return
    if (!readClaim()) return
    let stopped = false
    const tick = async () => {
      if (stopped) return
      const claim = readClaim()
      const supabase = getSupabase()
      if (!claim || !supabase) return
      const result = await claimHandoff(supabase, claim.id)
      if (stopped) return
      if (result.status === 'session') {
        clearClaim()
        setSignInEmail(null)
        setAuthBridge(null)
      } else if (result.status === 'error') {
        clearClaim()
        setSignInEmail(null)
        setLastError(result.message)
      }
    }
    void tick()
    const timer = window.setInterval(() => void tick(), 2000)
    const onVis = () => {
      if (document.visibilityState === 'visible') void tick()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stopped = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [configured, user])

  const signOut = useCallback(async () => {
    const supabase = getSupabase()
    if (!supabase) return
    await supabase.auth.signOut()
    setUser(null)
    setStatus('signed_out')
  }, [])

  const value: SyncContextValue = {
    configured,
    status,
    user,
    lastSyncedAt: meta.lastSyncedAt,
    dirty: meta.dirty,
    lastError,
    syncNow,
    signInWithMagicLink,
    signInEmail,
    verifySignInCode,
    authBridge,
    dismissAuthBridge,
    signOut,
  }

  void metaTick

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useCloudSync() {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useCloudSync must be used within SyncProvider')
  return ctx
}
