import { Placeholder } from '@/components/ui/Placeholder'
import { ButtonLink } from '@/components/ui/Button'
import { paths } from '@/lib/paths'

export function Home() {
  return (
    <Placeholder
      phase={5}
      title="The room"
      blurb="The main screen: the isometric room fills the viewport with the cat in it, a compact HUD shows coins, streak, and today's minutes against your goal."
      will={[
        'A 10x10 isometric grid at 64x32 tiles, depth-sorted by (gx + gy) then layer then z-index.',
        'HUD: coins, streak flame that grows at 3 / 7 / 14 / 30 / 100 days, today vs goal.',
        'Start studying — the primary action on the screen (Phase 3).',
        'Day/night tint from local time, ~2 degrees of parallax toward the cursor.',
      ]}
    >
      <div className="mt-6 flex flex-wrap gap-3">
        <ButtonLink to={paths.focus} size="lg">
          Start studying
        </ButtonLink>
        <ButtonLink to={paths.room} variant="secondary" size="lg">
          Edit room
        </ButtonLink>
      </div>
    </Placeholder>
  )
}
