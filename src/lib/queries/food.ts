import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { requireSupabase } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth'
import { keys as sessionKeys } from './sessions'
import type { CatFood } from '@/lib/supabase/types'

export const foodKeys = {
  foods: ['cat-foods'] as const,
}

/** The treat menu. Like the catalog, it changes only when we ship. */
export function useCatFoods() {
  return useQuery({
    queryKey: foodKeys.foods,
    staleTime: 60 * 60_000,
    queryFn: async (): Promise<CatFood[]> => {
      const { data, error } = await requireSupabase()
        .from('cat_foods')
        .select('*')
        .order('sort_order')
      if (error) throw error
      return data ?? []
    },
  })
}

/** Buys one serving and hands it straight to the cat. The server sets the price. */
export function useFeedCat() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (food: CatFood) => {
      const { data, error } = await requireSupabase().rpc('feed_cat', { p_food_id: food.id })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.today(user?.id ?? 'anonymous') })
    },
  })
}
