import type { SupabaseClient } from '@supabase/supabase-js'

const PENDING_KEY = 'zk-auth-pending'
const CLAIM_KEY = 'zk-auth-claim'
const HANDOFF_PARAM = 'handoff'
const CLAIM_TTL_MS = 15 * 60 * 1000

export type PendingRedirect =
  | { id: string; code: string; flowId: string | null }
  | { id: string; accessToken: string; refreshToken: string }

export type AuthClaim = { id: string; email: string; at: number }

/** Shown when a magic link landed in this browser and the home screen app still needs it. */
export type AuthBridge =
  | { kind: 'published' }
  | { kind: 'paste'; code: string; needsSetup: boolean }
  | { kind: 'open-from-app' }

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    nav.standalone === true
  )
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/**
 * Pull a magic-link code out of the URL before the Supabase client exchanges it.
 * The home screen app and Safari do not share storage, so the code has to be
 * handed back to whichever copy started the sign-in.
 */
export function captureAuthRedirect(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  const id = url.searchParams.get(HANDOFF_PARAM)
  if (!id || !isUuid(id)) return

  const code = url.searchParams.get('code')
  const flowId = url.searchParams.get('sb_flow_id')
  if (code) {
    const pending: PendingRedirect = { id, code, flowId: flowId || null }
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))
    url.searchParams.delete('code')
    url.searchParams.delete(HANDOFF_PARAM)
    url.searchParams.delete('sb_flow_id')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    return
  }

  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const accessToken = hash.get('access_token')
  const refreshToken = hash.get('refresh_token')
  if (accessToken && refreshToken) {
    const pending: PendingRedirect = { id, accessToken, refreshToken }
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))
    url.searchParams.delete(HANDOFF_PARAM)
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }
}

export function readPendingRedirect(): PendingRedirect | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingRedirect
    if (!parsed || typeof parsed !== 'object' || !('id' in parsed) || !isUuid(parsed.id)) return null
    return parsed
  } catch {
    return null
  }
}

export function clearPendingRedirect() {
  sessionStorage.removeItem(PENDING_KEY)
}

export function readClaim(): AuthClaim | null {
  try {
    const raw = localStorage.getItem(CLAIM_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AuthClaim
    if (!parsed?.id || !isUuid(parsed.id) || !parsed.email) return null
    if (Date.now() - parsed.at > CLAIM_TTL_MS) {
      localStorage.removeItem(CLAIM_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeClaim(claim: AuthClaim) {
  localStorage.setItem(CLAIM_KEY, JSON.stringify(claim))
}

export function clearClaim() {
  localStorage.removeItem(CLAIM_KEY)
}

export function redirectToWithHandoff(id: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const path = base.endsWith('/') ? base : `${base}/`
  return `${window.location.origin}${path}?handoff=${id}`
}

export function pastePayload(pending: Extract<PendingRedirect, { code: string }>): string {
  return pending.flowId ? `${pending.code}|${pending.flowId}` : pending.code
}

function missingSetup(message: string) {
  return /auth_handoffs|claim_auth_handoff|PGRST202|PGRST205|42P01|does not exist|schema cache|404|not found/i.test(
    message,
  )
}

export async function publishPending(
  supabase: SupabaseClient,
  pending: PendingRedirect,
): Promise<'published' | 'missing' | 'failed'> {
  const { error } =
    'code' in pending
      ? await supabase.from('auth_handoffs').insert({
          id: pending.id,
          code: pending.code,
          flow_id: pending.flowId,
        })
      : await supabase.from('auth_handoffs').insert({
          id: pending.id,
          access_token: pending.accessToken,
          refresh_token: pending.refreshToken,
        })
  if (!error) return 'published'
  if (/duplicate key|23505/i.test(error.message)) return 'published'
  if (missingSetup(error.message)) return 'missing'
  return 'failed'
}

export type ClaimResult =
  | { status: 'empty' }
  | { status: 'missing' }
  | { status: 'unavailable' }
  | { status: 'session' }
  | { status: 'error'; message: string }

export async function claimHandoff(supabase: SupabaseClient, id: string): Promise<ClaimResult> {
  const { data, error } = await supabase.rpc('claim_auth_handoff', { handoff_id: id })
  if (error) {
    if (missingSetup(error.message)) return { status: 'missing' }
    return { status: 'unavailable' }
  }
  if (!data || typeof data !== 'object') return { status: 'empty' }
  const row = data as {
    code?: string | null
    flow_id?: string | null
    access_token?: string | null
    refresh_token?: string | null
  }
  if (row.code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
      row.code,
      row.flow_id ? { flowId: row.flow_id } : undefined,
    )
    if (exchangeError) return { status: 'error', message: exchangeError.message }
    return { status: 'session' }
  }
  if (row.access_token && row.refresh_token) {
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: row.access_token,
      refresh_token: row.refresh_token,
    })
    if (sessionError) return { status: 'error', message: sessionError.message }
    return { status: 'session' }
  }
  return { status: 'empty' }
}

export async function exchangePastedCode(
  supabase: SupabaseClient,
  raw: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const trimmed = raw.trim()
  const pipe = trimmed.indexOf('|')
  const code = pipe === -1 ? trimmed : trimmed.slice(0, pipe)
  const flowId = pipe === -1 ? '' : trimmed.slice(pipe + 1)
  if (!code) return { ok: false, message: 'Paste the code first.' }
  const { error } = await supabase.auth.exchangeCodeForSession(
    code,
    flowId ? { flowId } : undefined,
  )
  if (error) return { ok: false, message: error.message }
  return { ok: true }
}

export async function verifyEmailOtp(
  supabase: SupabaseClient,
  email: string,
  token: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  let last = 'That code was not accepted.'
  for (const type of ['email', 'magiclink'] as const) {
    const { error } = await supabase.auth.verifyOtp({ email, token, type })
    if (!error) return { ok: true }
    last = error.message
  }
  return { ok: false, message: last }
}
