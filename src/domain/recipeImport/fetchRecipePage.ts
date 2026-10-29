import { getSupabase, isCloudSyncConfigured } from '@/sync/supabaseClient'

export type FetchedRecipePage = {
  html: string
  finalUrl: string
  via: 'dev-proxy' | 'supabase' | 'reader' | 'paste'
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
      // Upstream blocks or the proxy is down. Try the next fetch path.
      if (data.error && /Missing url|Invalid url|Only http/i.test(data.error)) {
        throw new Error(data.error)
      }
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

async function functionErrorDetail(error: { message?: string; context?: unknown }): Promise<string> {
  let detail = error.message ?? ''
  const ctx = error.context
  if (
    ctx &&
    typeof ctx === 'object' &&
    'clone' in ctx &&
    typeof (ctx as Response).clone === 'function'
  ) {
    try {
      const body = (await (ctx as Response).clone().json()) as {
        message?: string
        code?: string
        error?: string
      }
      detail = `${detail} ${body.message ?? ''} ${body.code ?? ''} ${body.error ?? ''}`
    } catch {
      // Body was not JSON.
    }
  }
  return detail
}

async function trySupabaseFunction(url: string): Promise<FetchedRecipePage | null> {
  if (!isCloudSyncConfigured()) return null
  const sb = getSupabase()
  if (!sb) return null
  const { data, error } = await sb.functions.invoke('recipe-fetch', {
    body: { url },
  })
  if (error) {
    const detail = await functionErrorDetail(error)
    if (/Invalid url|Missing url|Only http/i.test(detail)) throw new Error(detail.trim())
    // Not deployed, or the publishable key was rejected. Try the reader proxy.
    return null
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

/** Public reader that returns the page HTML with CORS headers. Used when recipe-fetch is not deployed. */
async function tryReaderProxy(url: string): Promise<FetchedRecipePage | null> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        Accept: 'text/html',
        'X-Return-Format': 'html',
      },
      referrerPolicy: 'no-referrer',
      credentials: 'omit',
    })
    if (!res.ok) return null
    const html = await res.text()
    if (!html.includes('<')) return null
    return { html, finalUrl: url, via: 'reader' }
  } catch {
    return null
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

  const viaReader = await tryReaderProxy(trimmed)
  if (viaReader) return viaReader

  throw new Error('Could not fetch that page. Paste the page HTML below.')
}
