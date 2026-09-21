import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseConfig } from '@/lib/env'
import type { Database } from './database'

/**
 * `null` when the project has no Supabase credentials compiled in. Callers use
 * `requireSupabase()` at the point of use so the app can still render its
 * "not configured" state instead of crashing at module load.
 */
export const supabase: SupabaseClient<Database> | null = supabaseConfig
  ? createClient<Database>(supabaseConfig.url, supabaseConfig.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // PKCE returns `?code=...` on the path instead of putting tokens in the
        // URL fragment. That matters here: the fragment belongs to HashRouter,
        // and an implicit-flow `#access_token=...` would be parsed as a route.
        flowType: 'pkce',
      },
    })
  : null

export function requireSupabase(): SupabaseClient<Database> {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see SETUP.md).',
    )
  }
  return supabase
}

/**
 * Supabase strips its own auth params after `detectSessionInUrl` runs, but an
 * older implicit-flow link (or a provider error) can still land tokens in the
 * fragment, where HashRouter would try to route on them. Clear those before the
 * router mounts.
 */
export function scrubAuthFragment(): void {
  const hash = window.location.hash
  if (/(access_token|refresh_token|provider_token|error_description)=/.test(hash)) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/`)
  }
}
