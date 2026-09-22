import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { requireSupabase } from '@/lib/supabase/client'
import { useAuth, useUserId } from '@/lib/useAuth'
import { keys as sessionKeys } from './sessions'
import type { CatalogItem, InventoryRow, RoomLayoutRow } from '@/lib/supabase/types'
import type { PlacedItem } from '@/components/room/Room'

export const roomKeys = {
  catalog: ['catalog'] as const,
  inventory: (u: string) => ['inventory', u] as const,
  layout: (u: string) => ['room-layout', u] as const,
}

/** The catalog is a public price list and changes only when we ship. */
export function useCatalog() {
  return useQuery({
    queryKey: roomKeys.catalog,
    staleTime: 60 * 60_000,
    queryFn: async (): Promise<CatalogItem[]> => {
      const { data, error } = await requireSupabase()
        .from('catalog_items')
        .select('*')
        .order('category')
        .order('sort_order')
      if (error) throw error
      return (data ?? [])
    },
  })
}

export function useInventory() {
  const { user } = useAuth()
  return useQuery({
    queryKey: roomKeys.inventory(user?.id ?? 'anonymous'),
    enabled: Boolean(user),
    queryFn: async (): Promise<InventoryRow[]> => {
      const { data, error } = await requireSupabase().from('inventory').select('*')
      if (error) throw error
      return (data ?? [])
    },
  })
}

export function useRoomLayout() {
  const { user } = useAuth()
  return useQuery({
    queryKey: roomKeys.layout(user?.id ?? 'anonymous'),
    enabled: Boolean(user),
    queryFn: async (): Promise<RoomLayoutRow[]> => {
      const { data, error } = await requireSupabase().from('room_layout').select('*')
      if (error) throw error
      return (data ?? [])
    },
  })
}

/** Layout rows joined to their catalog entries — what the renderer wants. */
export function usePlacedItems(): { placed: PlacedItem[]; isPending: boolean } {
  const catalog = useCatalog()
  const layout = useRoomLayout()

  // Kept stable between renders: the cat's routine and the room's depth sort
  // both key off this array.
  const placed = useMemo(() => {
    const byId = new Map((catalog.data ?? []).map((item) => [item.id, item]))
    return (layout.data ?? [])
      .map((row) => {
        const item = byId.get(row.item_id)
        return item ? { ...row, item } : null
      })
      .filter((x): x is PlacedItem => x !== null)
  }, [catalog.data, layout.data])

  return { placed, isPending: catalog.isPending || layout.isPending }
}

/* ------------------------------------------------------------- purchases */

export function usePurchase() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (itemId: string) => {
      const { data, error } = await requireSupabase().rpc('purchase_item', { p_item_id: itemId })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      const id = user?.id ?? 'anonymous'
      // The client never computes a new balance — it refetches. §6.4.
      void queryClient.invalidateQueries({ queryKey: roomKeys.inventory(id) })
      void queryClient.invalidateQueries({ queryKey: sessionKeys.today(id) })
    },
  })
}

/* ------------------------------------------- layout edits (optimistic UI) */

/**
 * Arranging furniture creates no value, so this is the one place the client
 * writes directly — and the one place optimistic UI is worth it (§9). A failed
 * write rolls the cache back to the server's version.
 */
export function usePlaceItem() {
  const { user } = useAuth()
  const requireUserId = useUserId()
  const queryClient = useQueryClient()
  const key = roomKeys.layout(user?.id ?? 'anonymous')

  return useMutation({
    mutationFn: async (input: {
      itemId: string
      gx: number
      gy: number
      rotation?: number
    }): Promise<RoomLayoutRow> => {
      const { data, error } = await requireSupabase()
        .from('room_layout')
        .insert({
          user_id: requireUserId(),
          item_id: input.itemId,
          grid_x: input.gx,
          grid_y: input.gy,
          rotation: input.rotation ?? 0,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: key }),
  })
}

export function useMoveItem() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const key = roomKeys.layout(user?.id ?? 'anonymous')

  return useMutation({
    mutationFn: async (input: { id: string; gx: number; gy: number; rotation: number }) => {
      const { error } = await requireSupabase()
        .from('room_layout')
        .update({ grid_x: input.gx, grid_y: input.gy, rotation: input.rotation })
        .eq('id', input.id)
      if (error) throw error
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<RoomLayoutRow[]>(key)
      queryClient.setQueryData<RoomLayoutRow[]>(key, (rows) =>
        (rows ?? []).map((row) =>
          row.id === input.id
            ? { ...row, grid_x: input.gx, grid_y: input.gy, rotation: input.rotation }
            : row,
        ),
      )
      return { previous }
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous)
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  })
}

export function useStoreItem() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const key = roomKeys.layout(user?.id ?? 'anonymous')

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await requireSupabase().from('room_layout').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<RoomLayoutRow[]>(key)
      queryClient.setQueryData<RoomLayoutRow[]>(key, (rows) =>
        (rows ?? []).filter((row) => row.id !== id),
      )
      return { previous }
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous)
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  })
}

/* ------------------------------------------------------------- unlocking */

export interface UnlockContext {
  currentStreak: number
  longestStreak: number
  lifetimeSeconds: number
  lifetimeCoins: number
}

/** Mirrors the check inside `purchase_item`, for showing the lock in the shop. */
export function isUnlocked(item: CatalogItem, context: UnlockContext): boolean {
  const rule = item.unlock_rule
  if (!rule) return true
  switch (rule.kind) {
    case 'streak':
      return Math.max(context.currentStreak, context.longestStreak) >= rule.days
    case 'lifetime_hours':
      return context.lifetimeSeconds >= rule.hours * 3600
    case 'lifetime_coins':
      return context.lifetimeCoins >= rule.coins
    default:
      return true
  }
}

export function describeUnlock(item: CatalogItem): string | null {
  const rule = item.unlock_rule
  if (!rule) return null
  switch (rule.kind) {
    case 'streak':
      return `Unlocks at a ${rule.days}-day streak`
    case 'lifetime_hours':
      return `Unlocks after ${rule.hours} hours studied`
    case 'lifetime_coins':
      return `Unlocks after earning ${rule.coins.toLocaleString()} coins`
    default:
      return null
  }
}
