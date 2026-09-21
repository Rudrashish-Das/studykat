import { Placeholder } from '@/components/ui/Placeholder'

export function Shop() {
  return (
    <Placeholder
      phase={5}
      title="Shop"
      blurb="Furniture, decor, toys, wallpaper, and flooring, by category, with prices and lock conditions."
      will={[
        'At least 40 catalog items, priced so the first is about two sessions away and the last takes weeks.',
        'Items locked behind streak and lifetime-hour milestones, with the condition shown plainly.',
        'Purchases go through the `purchase_item` RPC; the balance is refetched, never computed client-side.',
      ]}
    />
  )
}
