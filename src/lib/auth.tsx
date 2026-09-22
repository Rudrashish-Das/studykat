import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { isSupabaseConfigured } from '@/lib/env'
import { AuthContext, type AuthState } from './auth-context'

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
