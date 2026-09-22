import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { requireSupabase } from '@/lib/supabase/client'
import type { Profile } from '@/lib/supabase/types'
import { useAuth, useUserId } from '@/lib/auth'

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
      return data
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
  const requireUserId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (patch: ProfilePatch): Promise<Profile> => {
      const { data, error } = await requireSupabase()
        .from('profiles')
        .update(patch)
        .eq('id', requireUserId())
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(profileKey(profile.id), profile)
    },
  })
}
