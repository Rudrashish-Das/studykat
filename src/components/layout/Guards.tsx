import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/lib/useAuth'
import { useProfile } from '@/lib/queries/profile'
import { isSupabaseConfigured } from '@/lib/env'
import { paths } from '@/lib/paths'
import { FullScreenSpinner } from '@/components/ui/Spinner'
import { NotConfigured } from '@/screens/NotConfigured'

/** Signed-in only. Remembers where the user was headed. */
export function RequireAuth() {
  const { loading, session } = useAuth()
  const location = useLocation()

  if (!isSupabaseConfigured) return <NotConfigured />
  if (loading) return <FullScreenSpinner label="Finding your cat" />
  if (!session) {
    return <Navigate to={paths.login} replace state={{ from: location.pathname }} />
  }
  return <Outlet />
}

/**
 * Sits inside RequireAuth. Anyone who has not finished onboarding gets sent
 * there, and anyone who has is kept out of it.
 */
export function RequireOnboarded() {
  const { data: profile, isPending, isError } = useProfile()

  if (isPending) return <FullScreenSpinner label="Waking the cat" />
  // A missing profile row means the signup trigger has not caught up yet.
  if (isError || !profile) return <FullScreenSpinner label="Setting up your room" />
  if (!profile.onboarded_at) return <Navigate to={paths.onboarding} replace />
  return <Outlet />
}

export function RedirectIfOnboarded() {
  const { data: profile, isPending } = useProfile()
  if (isPending) return <FullScreenSpinner label="Waking the cat" />
  if (profile?.onboarded_at) return <Navigate to={paths.home} replace />
  return <Outlet />
}

/** Landing/auth screens bounce signed-in users straight to their room. */
export function RedirectIfSignedIn({ children }: { children: React.ReactNode }) {
  const { loading, session } = useAuth()
  if (loading) return <FullScreenSpinner label="Finding your cat" />
  if (session) return <Navigate to={paths.home} replace />
  return <>{children}</>
}
