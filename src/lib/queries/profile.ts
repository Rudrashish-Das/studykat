import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { requireSupabase } from '@/lib/supabase/client'
import type { Profile } from '@/lib/supabase/types'
import { useAuth } from '@/lib/auth'

export const profileKey = (userId: string) => ['profile', userId] as const

export function useProfile() {
  const { user } = useAuth()
  const userId = user?.id

  return useQuery({
    queryKey: profileKey(userId ?? 'anonymous'),
    enabled: Boolean(userId),
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await requireSupabase()
        .from('profiles')
        .select('*')
        .eq('id', userId!)
        .single()
      if (error) throw error
      return data as Profile
    },
  })
}

export type ProfilePatch = Partial<
  Pick<
    Profile,
    'cat_name' | 'cat_variant' | 'daily_goal_minutes' | 'timezone' | 'display_name' | 'onboarded_at'
  >
>

export function useUpdateProfile() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (patch: ProfilePatch): Promise<Profile> => {
      const { data, error } = await requireSupabase()
        .from('profiles')
        .update(patch)
        .eq('id', user!.id)
        .select()
        .single()
      if (error) throw error
      return data as Profile
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(profileKey(profile.id), profile)
    },
  })
}

/** The browser's best guess, used only as the default at onboarding. */
export function guessTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}
