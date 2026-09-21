import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { paths } from '@/lib/paths'

type Mode = 'login' | 'register' | 'reset'

const copy: Record<Mode, { title: string; blurb: string; submit: string }> = {
  login: { title: 'Welcome back', blurb: 'Your cat has been waiting.', submit: 'Log in' },
  register: {
    title: 'Make a cat',
    blurb: 'One account, one cat, generated from a seed that is yours alone.',
    submit: 'Create account',
  },
  reset: {
    title: 'Reset your password',
    blurb: "We'll email you a link.",
    submit: 'Send reset link',
  },
}

/**
 * Phase 1: the shape only. The form is inert — Phase 2 wires it to Supabase
 * email/password auth, Google OAuth, and the verify-email flow.
 */
export function Auth({ mode }: { mode: Mode }) {
  const { title, blurb, submit } = copy[mode]

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-5 py-12">
      <Link to={paths.landing} className="mb-8 self-start text-sm font-bold text-ink-soft">
        &larr; StudyCat
      </Link>

      <Card className="animate-fade-up">
        <h1 className="text-2xl">{title}</h1>
        <p className="mt-2 text-sm text-ink-soft">{blurb}</p>

        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
          }}
        >
          <Field label="Email" type="email" autoComplete="email" />
          {mode !== 'reset' && (
            <Field
              label="Password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          )}
          <Button type="submit" size="lg" className="w-full" disabled>
            {submit}
          </Button>
        </form>

        {mode !== 'reset' && (
          <>
            <div className="my-5 flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-ink-faint">
              <span className="h-px flex-1 bg-ink-line" />
              or
              <span className="h-px flex-1 bg-ink-line" />
            </div>
            <Button variant="secondary" size="lg" className="w-full" disabled>
              Continue with Google
            </Button>
          </>
        )}

        <p className="mt-6 text-center text-sm text-ink-soft">
          {mode === 'login' ? (
            <>
              No account yet?{' '}
              <Link to={paths.register} className="font-bold text-wood-deep underline">
                Sign up
              </Link>
            </>
          ) : (
            <>
              Already have one?{' '}
              <Link to={paths.login} className="font-bold text-wood-deep underline">
                Log in
              </Link>
            </>
          )}
        </p>
        {mode === 'login' && (
          <p className="mt-2 text-center text-sm">
            <Link to={paths.reset} className="text-ink-faint underline">
              Forgot your password?
            </Link>
          </p>
        )}
      </Card>

      <p className="mt-6 text-center text-xs text-ink-faint">
        Phase 2 wires this up. The form is inert for now.
      </p>
    </div>
  )
}

function Field({
  label,
  type,
  autoComplete,
}: {
  label: string
  type: string
  autoComplete: string
}) {
  const id = `field-${label.toLowerCase()}`
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold">
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        disabled
        placeholder="—"
        className="w-full rounded-xl border border-ink-line bg-cream-50 px-4 py-2.5 text-ink placeholder:text-ink-faint disabled:opacity-60"
      />
    </div>
  )
}
