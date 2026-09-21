import { useMemo } from 'react'
import { generateAppearance, type CatAppearance } from './appearance'
import type { Profile } from '@/lib/supabase/types'

/**
 * The account's cat, memoised.
 *
 * Generating an appearance is cheap and pure, but it happens on nearly every
 * screen, so it is worth doing once per profile rather than per render — and
 * having one place to do it means one place that has to get the dependencies
 * right.
 */
export function useCatAppearance(profile: Profile | undefined | null): CatAppearance | null {
  return useMemo(
    () => (profile ? generateAppearance(profile.cat_seed, profile.cat_variant) : null),
    [profile],
  )
}
