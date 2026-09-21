import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, requireSupabase } from '@/lib/supabase/client'
import { authRedirectTo, isSupabaseConfigured } from '@/lib/env'

type AuthState = {
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

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<Omit<AuthState, 'clearRecovery'>>({
    loading: isSupabaseConfigured,
    session: null,
    user: null,
    recovery: false,
  })
  const clearRecovery = useCallback(() => {
    setState((prev) => (prev.recovery ? { ...prev, recovery: false } : prev))
  }, [])

  useEffect(() => {
    if (!supabase) return
    let cancelled = false

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setState((prev) => ({
        ...prev,
        loading: false,
        session: data.session,
        user: data.session?.user ?? null,
      }))
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      setState((prev) => ({
        loading: false,
        session,
        user: session?.user ?? null,
        recovery: event === 'PASSWORD_RECOVERY' ? true : prev.recovery,
        }))
      // Anything cached under the old identity is meaningless now.
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') {
        void queryClient.invalidateQueries()
      }
    })

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [queryClient])

  const value = useMemo<AuthState>(() => ({ ...state, clearRecovery }), [state, clearRecovery])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/* ------------------------------------------------------------------ actions */

export type AuthOutcome = { ok: true; needsEmailConfirmation?: boolean } | { ok: false; message: string }

export async function signInWithPassword(email: string, password: string): Promise<AuthOutcome> {
  const { error } = await requireSupabase().auth.signInWithPassword({ email, password })
  return error ? { ok: false, message: friendlyAuthError(error.message) } : { ok: true }
}

export async function signUpWithPassword(email: string, password: string): Promise<AuthOutcome> {
  const { data, error } = await requireSupabase().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: authRedirectTo() },
  })
  if (error) return { ok: false, message: friendlyAuthError(error.message) }
  // With email confirmation on, Supabase returns a user but no session.
  return { ok: true, needsEmailConfirmation: data.session === null }
}

export async function signInWithGoogle(): Promise<AuthOutcome> {
  const { error } = await requireSupabase().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: authRedirectTo() },
  })
  return error ? { ok: false, message: friendlyAuthError(error.message) } : { ok: true }
}

export async function sendPasswordReset(email: string): Promise<AuthOutcome> {
  const { error } = await requireSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: authRedirectTo(),
  })
  return error ? { ok: false, message: friendlyAuthError(error.message) } : { ok: true }
}

export async function updatePassword(password: string): Promise<AuthOutcome> {
  const { error } = await requireSupabase().auth.updateUser({ password })
  return error ? { ok: false, message: friendlyAuthError(error.message) } : { ok: true }
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut()
}

/**
 * Supabase surfaces raw GoTrue strings. Rewrite the handful users actually hit
 * into something that reads like a person wrote it, and never leak whether an
 * address is registered.
 */
export function friendlyAuthError(raw: string): string {
  const message = raw.toLowerCase()
  if (message.includes('invalid login credentials')) {
    return 'That email and password do not match. Check for a typo, or reset your password.'
  }
  if (message.includes('email not confirmed')) {
    return 'Confirm your email first — check your inbox for the link we sent.'
  }
  if (message.includes('user already registered') || message.includes('already been registered')) {
    return 'There is already an account with that email. Try logging in instead.'
  }
  if (message.includes('password should be at least')) {
    return 'Passwords need to be at least 8 characters.'
  }
  if (message.includes('rate limit') || message.includes('too many requests')) {
    return 'Too many attempts just now. Wait a minute and try again.'
  }
  if (message.includes('provider is not enabled')) {
    return 'Google sign-in is not switched on for this project yet (see SETUP.md §3).'
  }
  if (message.includes('failed to fetch') || message.includes('networkerror')) {
    return 'Could not reach the server. Check your connection and try again.'
  }
  return raw
}
