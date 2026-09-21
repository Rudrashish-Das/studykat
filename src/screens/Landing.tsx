import { ButtonLink } from '@/components/ui/Button'
import { paths } from '@/lib/paths'
import { LandingScene } from '@/components/LandingScene'

const beats = [
  {
    title: 'Start a timer',
    body: 'The clock runs on the server, so it survives a closed tab, a dead battery, or a refresh.',
  },
  {
    title: 'Earn coins for focus',
    body: 'One coin a minute, more for long sessions, more again as your streak grows.',
  },
  {
    title: 'Furnish the room',
    body: 'Spend them on furniture your cat actually uses. The room fills up as the weeks do.',
  },
] as const

export function Landing() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-center px-5 py-12">
      <header className="mb-10 flex items-center justify-between">
        <span className="select-none text-xl font-extrabold tracking-tight">
          Study<span className="text-wood-deep">Cat</span>
        </span>
        <ButtonLink to={paths.login} variant="ghost">
          Log in
        </ButtonLink>
      </header>

      <div className="grid items-center gap-10 sm:gap-14 md:grid-cols-2">
        <div className="animate-fade-up">
          <h1 className="text-4xl leading-[1.1] sm:text-5xl">
            Study a little.
            <br />
            Come home to a cat.
          </h1>
          <p className="mt-5 max-w-prose text-lg text-ink-soft">
            A quiet timer that pays you in coins for focused minutes, keeps your streak, and lets
            you spend it all decorating one small room for a cat that exists on no other account.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink to={paths.register} size="lg">
              Sign up
            </ButtonLink>
            <ButtonLink to={paths.login} size="lg" variant="secondary">
              Log in
            </ButtonLink>
          </div>

          <p className="mt-4 text-sm text-ink-faint">
            Free, no ads, no leaderboard. Just you and the cat.
          </p>
        </div>

        <LandingScene />
      </div>

      <ul className="mt-14 grid gap-5 sm:grid-cols-3">
        {beats.map((beat) => (
          <li key={beat.title} className="sc-surface p-5">
            <h2 className="text-base">{beat.title}</h2>
            <p className="mt-2 text-sm text-ink-soft">{beat.body}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
