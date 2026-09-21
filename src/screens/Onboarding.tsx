import { Placeholder } from '@/components/ui/Placeholder'

export function Onboarding() {
  return (
    <Placeholder
      phase={4}
      title="Name your cat"
      blurb="Shown once, on first login: name the cat, pick one of three coats generated from your seed, and set a daily study goal."
      will={[
        'Three candidate appearances derived from the account seed with different offsets — chosen, but still deterministic.',
        'Cat name and daily goal in minutes, written to `profiles`.',
        'IANA timezone captured here and stored, because streak rollover depends on it (§6.3).',
      ]}
    />
  )
}
