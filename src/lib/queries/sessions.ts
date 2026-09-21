import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { requireSupabase } from '@/lib/supabase/client'
import { useAuth, useUserId } from '@/lib/auth'
import { useTimerStore } from '@/lib/timer'
import type { StudySession, Subject, TodaySummary } from '@/lib/supabase/types'

export const keys = {
  activeSession: (u: string) => ['active-session', u] as const,
  today: (u: string) => ['today', u] as const,
  recent: (u: string) => ['recent-sessions', u] as const,
  subjects: (u: string) => ['subjects', u] as const,
}

/* ------------------------------------------------------------ the live one */

/**
 * The session currently running, if any. Read straight from the table (SELECT
 * is the one thing the client may do here), so reopening a closed tab picks the
 * timer back up exactly where it was.
 */
export function useActiveSession() {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.activeSession(user?.id ?? 'anonymous'),
    enabled: Boolean(user),
    // Cheap, and the source of truth for whether Focus mode should be showing.
    refetchOnWindowFocus: true,
    staleTime: 5_000,
    queryFn: async (): Promise<StudySession | null> => {
      const { data, error } = await requireSupabase()
        .from('study_sessions')
        .select('*')
        .eq('status', 'active')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return (data) ?? null
    },
  })
}

/* ------------------------------------------------------------- today's HUD */

export function useToday() {
  const { user } = useAuth()
  const setServerNow = useTimerStore((s) => s.setServerNow)

  return useQuery({
    queryKey: keys.today(user?.id ?? 'anonymous'),
    enabled: Boolean(user),
    staleTime: 30_000,
    queryFn: async (): Promise<TodaySummary & { server_now: string }> => {
      const { data, error } = await requireSupabase().rpc('get_today')
      if (error) throw error
      const summary = data
      // Anchor the timer to the database clock rather than this device's.
      setServerNow(summary.server_now)
      return summary
    },
  })
}

/* -------------------------------------------------------------- mutations */

function useSessionMutation<TArgs, TResult>(
  fn: (supabaseArgs: TArgs) => Promise<TResult>,
  options?: { invalidateToday?: boolean },
) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      const id = user?.id ?? 'anonymous'
      void queryClient.invalidateQueries({ queryKey: keys.activeSession(id) })
      if (options?.invalidateToday !== false) {
        void queryClient.invalidateQueries({ queryKey: keys.today(id) })
        void queryClient.invalidateQueries({ queryKey: keys.recent(id) })
      }
    },
  })
}

export function useStartSession() {
  return useSessionMutation(
    async ({ subjectId, label }: { subjectId?: string | null; label?: string | null }) => {
      const { data, error } = await requireSupabase().rpc('start_session', {
        p_subject_id: subjectId ?? null,
        p_label: label ?? null,
      })
      if (error) throw error
      return data
    },
  )
}

export function useEndSession() {
  return useSessionMutation(
    async ({ sessionId, clientSeconds }: { sessionId: string; clientSeconds: number }) => {
      const { data, error } = await requireSupabase().rpc('end_session', {
        p_session_id: sessionId,
        // Stored for auditing only. The server measures the real duration.
        p_client_seconds: Math.round(clientSeconds),
      })
      if (error) throw error
      return data
    },
  )
}

export function usePauseSession() {
  return useSessionMutation(async (sessionId: string) => {
    const { data, error } = await requireSupabase().rpc('pause_session', {
      p_session_id: sessionId,
    })
    if (error) throw error
    return data
  })
}

export function useResumeSession() {
  return useSessionMutation(async (sessionId: string) => {
    const { data, error } = await requireSupabase().rpc('resume_session', {
      p_session_id: sessionId,
    })
    if (error) throw error
    return data
  })
}

export function useAbandonSession() {
  return useSessionMutation(async (sessionId: string) => {
    const { data, error } = await requireSupabase().rpc('abandon_session', {
      p_session_id: sessionId,
    })
    if (error) throw error
    return data
  })
}

/* --------------------------------------------------------------- history */

export function useRecentSessions(limit = 20) {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...keys.recent(user?.id ?? 'anonymous'), limit],
    enabled: Boolean(user),
    queryFn: async (): Promise<StudySession[]> => {
      const { data, error } = await requireSupabase()
        .from('study_sessions')
        .select('*')
        .eq('status', 'completed')
        .order('ended_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? [])
    },
  })
}

/* -------------------------------------------------------------- subjects */

export function useSubjects() {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.subjects(user?.id ?? 'anonymous'),
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Subject[]> => {
      const { data, error } = await requireSupabase()
        .from('subjects')
        .select('*')
        .eq('archived', false)
        .order('name')
      if (error) throw error
      return (data ?? [])
    },
  })
}

export function useCreateSubject() {
  const { user } = useAuth()
  const requireUserId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (name: string): Promise<Subject> => {
      const { data, error } = await requireSupabase()
        .from('subjects')
        .insert({ user_id: requireUserId(), name: name.trim() })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.subjects(user?.id ?? 'anonymous') })
    },
  })
}
