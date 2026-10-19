import { getSupabase, isCloudSyncConfigured } from '@/sync/supabaseClient'

export type FetchedRecipePage = {
  html: string
  finalUrl: string
  via: 'dev-proxy' | 'supabase' | 'paste'
}

async function tryDevProxy(url: string): Promise<FetchedRecipePage | null> {
  try {
    const res = await fetch(`/api/recipe-fetch?url=${encodeURIComponent(url)}`)
    if (res.status === 404) return null
    const ct = res.headers.get('content-type') ?? ''
    // GitHub Pages SPA fallback often returns index.html with 200.
    if (!ct.includes('application/json')) return null
    const data = (await res.json()) as {
      ok?: boolean
      html?: string
      finalUrl?: string
      error?: string
    }
    if (!data.html) {
      if (data.error) throw new Error(data.error)
      return null
    }
    return {
      html: data.html,
      finalUrl: data.finalUrl || url,
      via: 'dev-proxy',
    }
  } catch (e) {
    // Proxy missing / non-JSON response — fall through to other strategies.
    if (e instanceof SyntaxError || e instanceof TypeError) return null
    throw e
  }
}

async function trySupabaseFunction(url: string): Promise<FetchedRecipePage | null> {
  if (!isCloudSyncConfigured()) return null
  const sb = getSupabase()
  if (!sb) return null
  const { data, error } = await sb.functions.invoke('recipe-fetch', {
    body: { url },
  })
  if (error) {
    // Function not deployed / not found — treat as unavailable.
    const msg = error.message || String(error)
    if (/not found|404|FunctionsRelayError|Failed to send/i.test(msg)) return null
    throw new Error(msg)
  }
  const payload = data as { html?: string; finalUrl?: string; error?: string } | null
  if (!payload?.html) {
    if (payload?.error) throw new Error(payload.error)
    return null
  }
  return {
    html: payload.html,
    finalUrl: payload.finalUrl || url,
    via: 'supabase',
  }
}

/**
 * Fetch a recipe page HTML via local Vite proxy (dev) or Supabase Edge Function (prod).
 * Throws a user-facing error if neither path works — caller can offer paste-HTML.
 */
export async function fetchRecipePageHtml(url: string): Promise<FetchedRecipePage> {
  const trimmed = url.trim()
  if (!trimmed) throw new Error('Paste a recipe URL first.')
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('Invalid URL.')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are allowed.')
  }

  const viaProxy = await tryDevProxy(trimmed)
  if (viaProxy) return viaProxy

  const viaSb = await trySupabaseFunction(trimmed)
  if (viaSb) return viaSb

  throw new Error(
    'Cannot fetch that URL from this device (CORS / no proxy). Paste the page HTML below, or run the app with npm run dev (local proxy), or deploy the recipe-fetch Supabase function.',
  )
}
