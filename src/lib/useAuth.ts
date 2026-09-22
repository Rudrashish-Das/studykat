import { useContext } from 'react'
import { AuthContext, type AuthState } from './auth-context'

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
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
