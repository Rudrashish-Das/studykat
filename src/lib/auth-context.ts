import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

export interface AuthState {
  /** `true` until the initial session lookup settles. Guards must wait on it. */
  loading: boolean
  session: Session | null
  user: User | null
  /**
   * Set when the user arrives from a password-reset email. Supabase signs them
   * in with a recovery session, so without this flag they would land in the app
   * and never be asked for a new password.
   */
  recovery: boolean
  clearRecovery: () => void
}

/**
 * Shared by `auth.tsx` (the provider) and `useAuth.ts` (the hooks) — pulled
 * out on its own so neither file exports anything but its component or its
 * hooks, which is what React Fast Refresh needs to hot-reload either one.
 */
export const AuthContext = createContext<AuthState | null>(null)
