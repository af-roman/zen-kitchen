/**
 * Personal helper: fetch a recipe page HTML for JSON-LD extraction in the PWA.
 * Deploy: supabase functions deploy recipe-fetch
 *
 * Body: { "url": "https://…" }
 * Returns: { html, finalUrl, status }
 */
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'POST required' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = (await req.json()) as { url?: string }
    const target = body.url?.trim()
    if (!target) {
      return new Response(JSON.stringify({ error: 'Missing url' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let parsed: URL
    try {
      parsed = new URL(target)
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid url' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return new Response(JSON.stringify({ error: 'Only http(s) URLs allowed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const upstream = await fetch(parsed.toString(), {
      headers: {
        'User-Agent': 'ZenKitchen/1.0 (personal recipe import)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })
    const html = await upstream.text()

    return new Response(
      JSON.stringify({
        ok: upstream.ok,
        status: upstream.status,
        finalUrl: upstream.url,
        html,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Fetch failed' }),
      {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
