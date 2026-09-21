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
import { supabase } from '@/lib/supabase/client'
import { isSupabaseConfigured } from '@/lib/env'

interface AuthState {
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

/**
 * The signed-in user's id, for code paths that cannot run without one. Throws
 * rather than asserting, so a mutation fired during sign-out fails with a
 * sentence instead of "cannot read properties of undefined".
 */
export function useUserId(): () => string {
  const { user } = useAuth()
  return () => {
    if (!user) throw new Error('You are not signed in.')
    return user.id
  }
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
