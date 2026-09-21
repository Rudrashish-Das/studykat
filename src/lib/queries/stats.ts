import { useQuery } from '@tanstack/react-query'
import { requireSupabase } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth'

export interface DailyTotal {
  day: string
  seconds: number
  sessions: number
  coins: number
}

export interface SubjectTotal {
  subject_id: string | null
  name: string
  color: string
  seconds: number
  sessions: number
}

/**
 * One row per local day, gaps included, bucketed in the user's own timezone by
 * the database — so the heatmap does not have to guess where a day starts.
 */
export function useDailyTotals(days = 365) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['daily-totals', user?.id ?? 'anonymous', days],
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<DailyTotal[]> => {
      const { data, error } = await requireSupabase().rpc('get_daily_totals', { p_days: days })
      if (error) throw error
      return (data ?? [])
    },
  })
}

export function useSubjectTotals() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['subject-totals', user?.id ?? 'anonymous'],
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SubjectTotal[]> => {
      const { data, error } = await requireSupabase().rpc('get_subject_totals')
      if (error) throw error
      return (data ?? [])
    },
  })
}
