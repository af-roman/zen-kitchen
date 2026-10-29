import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { captureAuthRedirect } from '@/sync/authHandoff'

captureAuthRedirect()

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publishableKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)

export function isCloudSyncConfigured(): boolean {
  return Boolean(url?.trim() && publishableKey?.trim())
}

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (!isCloudSyncConfigured()) return null
  if (!client) {
    client = createClient(url!.trim(), publishableKey!.trim(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}
