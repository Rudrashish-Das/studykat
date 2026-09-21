import { Placeholder } from '@/components/ui/Placeholder'

export function Stats() {
  return (
    <Placeholder
      phase={6}
      title="Stats"
      blurb="The receipts: a calendar heatmap of study days, a weekly bar chart, per-subject totals, streak history, lifetime hours."
      will={[
        'Calendar heatmap computed in your stored timezone, not UTC.',
        'Weekly bars and per-subject totals.',
        'Streak history and lifetime hours.',
      ]}
    />
  )
}
