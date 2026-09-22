import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Notice } from '@/components/ui/Notice'
import { paths } from '@/lib/paths'
import { isSupabaseConfigured } from '@/lib/env'
import { NotConfigured } from '@/screens/NotConfigured'
import { useAuth } from '@/lib/useAuth'
import { sendPasswordReset, signInWithGoogle, signInWithPassword, signUpWithPassword, updatePassword } from '@/lib/auth-actions'

export type AuthMode = 'login' | 'register' | 'reset' | 'new-password'

const copy: Record<AuthMode, { title: string; blurb: string; submit: string }> = {
  login: { title: 'Welcome back', blurb: 'Your cat has been waiting.', submit: 'Log in' },
  register: {
    title: 'Make a cat',
    blurb: 'One account, one cat, generated from a seed that is yours alone.',
    submit: 'Create account',
  },
  reset: {
    title: 'Reset your password',
    blurb: 'Tell us your email and a link is on its way.',
    submit: 'Send reset link',
  },
  'new-password': {
    title: 'Pick a new password',
    blurb: 'Almost done — choose something you can remember.',
    submit: 'Save password',
  },
}

const MIN_PASSWORD = 8

export function Auth({ mode }: { mode: AuthMode }) {
  const navigate = useNavigate()
  const { clearRecovery } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<'confirm' | 'reset' | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})

  if (!isSupabaseConfigured) return <NotConfigured />

  const { title, blurb, submit } = copy[mode]
  const needsEmail = mode !== 'new-password'
  const needsPassword = mode !== 'reset'

  function validate(): boolean {
    const next: { email?: string; password?: string } = {}
    if (needsEmail && !/^\S+@\S+\.\S+$/.test(email)) {
      next.email = 'That does not look like an email address.'
    }
    if (needsPassword && password.length < MIN_PASSWORD) {
      next.password = `At least ${MIN_PASSWORD} characters.`
    }
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!validate()) return

    setBusy(true)
    try {
      if (mode === 'login') {
        const result = await signInWithPassword(email, password)
        if (!result.ok) {
          setError(result.message)
          return
        }
        navigate(paths.home, { replace: true })
      } else if (mode === 'register') {
        const result = await signUpWithPassword(email, password)
        if (!result.ok) {
          setError(result.message)
          return
        }
        if (result.needsEmailConfirmation) setSent('confirm')
        else navigate(paths.onboarding, { replace: true })
      } else if (mode === 'reset') {
        const result = await sendPasswordReset(email)
        if (!result.ok) {
          setError(result.message)
          return
        }
        setSent('reset')
      } else {
        const result = await updatePassword(password)
        if (!result.ok) {
          setError(result.message)
          return
        }
        clearRecovery()
        navigate(paths.home, { replace: true })
      }
    } finally {
      setBusy(false)
    }
  }

  async function onGoogle() {
    setError(null)
    setBusy(true)
    const result = await signInWithGoogle()
    // On success the browser is already navigating away, so only failure lands.
    if (!result.ok) {
      setError(result.message)
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <AuthFrame>
        <h1 className="text-2xl">Check your inbox</h1>
        <p className="mt-3 text-ink-soft">
          {sent === 'confirm' ? (
            <>
              We sent a confirmation link to <strong className="text-ink">{email}</strong>. Open it
              and your cat will be waiting.
            </>
          ) : (
            <>
              If there is an account for <strong className="text-ink">{email}</strong>, a reset link
              is on its way.
            </>
          )}
        </p>
        <Notice className="mt-5">
          Delivery can take a minute or two, and the link expires after an hour. Check spam before
          asking for another.
        </Notice>
        <p className="mt-6 text-center text-sm">
          <Link to={paths.login} className="font-bold text-wood-deep underline">
            Back to log in
          </Link>
        </p>
      </AuthFrame>
    )
  }

  return (
    <AuthFrame>
      <h1 className="text-2xl">{title}</h1>
      <p className="mt-2 text-sm text-ink-soft">{blurb}</p>

      <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
        {needsEmail && (
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email}
            required
          />
        )}
        {needsPassword && (
          <Field
            label={mode === 'new-password' ? 'New password' : 'Password'}
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
            hint={mode === 'login' ? undefined : `At least ${MIN_PASSWORD} characters.`}
            required
          />
        )}

        {error && <Notice tone="error">{error}</Notice>}

        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? 'One moment…' : submit}
        </Button>
      </form>

      {(mode === 'login' || mode === 'register') && (
        <>
          <div className="my-5 flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-ink-faint">
            <span className="h-px flex-1 bg-ink-line" />
            or
            <span className="h-px flex-1 bg-ink-line" />
          </div>
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={onGoogle}
            disabled={busy}
            type="button"
          >
            <GoogleMark />
            Continue with Google
          </Button>

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
        </>
      )}
    </AuthFrame>
  )
}

function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-5 py-12">
      <Link to={paths.landing} className="mb-8 self-start text-sm font-bold text-ink-soft">
        &larr; StudyKat
      </Link>
      <Card className="animate-fade-up">{children}</Card>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden className="h-[18px] w-[18px]">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}
