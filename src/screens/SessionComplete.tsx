import { Placeholder } from '@/components/ui/Placeholder'

export function SessionComplete() {
  return (
    <Placeholder
      phase={3}
      title="Session complete"
      blurb="A quiet payoff screen: coins earned, where the streak now stands, and one line from the cat."
      will={[
        'Coins earned, broken down into base, long-session bonus, and streak multiplier.',
        'Streak status, including whether today is now credited.',
        'One short reaction from the cat. No confetti, no fanfare (§8).',
      ]}
    />
  )
}
