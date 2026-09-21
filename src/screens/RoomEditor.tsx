import { Placeholder } from '@/components/ui/Placeholder'

export function RoomEditor() {
  return (
    <Placeholder
      phase={5}
      title="Room editor"
      blurb="Place, move, rotate, and store the things you own on the isometric grid."
      will={[
        'Hover highlights the tile diamond, drag shows a ghost preview, invalid placement tints red.',
        'Collision is footprint overlap on the grid; rotation cycles the footprint.',
        'Arrow-key placement for keyboard users (§9). Optimistic UI, since layout edits are cheap to undo.',
      ]}
    />
  )
}
