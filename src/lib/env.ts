/**
 * Supabase config. Both values are public by design — they ship in the bundle,
 * and what protects the data is RLS plus SECURITY DEFINER functions, not
 * secrecy of the anon key.
 *
 * The app deliberately does not throw when they are missing: a freshly deployed
 * Pages site with no repository variables set should still render and explain
 * itself rather than showing a white screen.
 */
const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

const looksReal = url.startsWith('http') && !url.includes('your-project-ref') && anonKey.length > 20

export const supabaseConfig = looksReal ? { url, anonKey } : null
export const isSupabaseConfigured = supabaseConfig !== null

/**
 * Where an auth provider should send the browser back to. Must be the site
 * root, not a hash route: Supabase appends `?code=...` to the path, and the
 * allow-list in the dashboard is matched against the path.
 */
export function authRedirectTo(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`
}
