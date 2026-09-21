import { Placeholder } from '@/components/ui/Placeholder'

export function Settings() {
  return (
    <Placeholder
      phase={2}
      title="Settings"
      blurb="Cat name, daily goal, timezone, sound, and the account itself."
      will={[
        'Cat name and daily goal (writes to `profiles`).',
        'Timezone — changing it changes which day a session lands in.',
        'Sound on/off, cached in localStorage since it is only a UI preference.',
        'Log out, and delete account.',
      ]}
    />
  )
}
