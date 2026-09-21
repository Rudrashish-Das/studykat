import { ButtonLink } from '@/components/ui/Button'
import { paths } from '@/lib/paths'

export function NotFound() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-center px-5 py-12 text-center">
      <h1 className="text-3xl">Nothing here</h1>
      <p className="mt-3 text-ink-soft">The cat knocked this page off the table.</p>
      <ButtonLink to={paths.home} className="mt-7">
        Back to the room
      </ButtonLink>
    </div>
  )
}
