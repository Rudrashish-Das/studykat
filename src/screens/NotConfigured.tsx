import { Card } from '@/components/ui/Card'

/**
 * A deploy with no Supabase credentials should explain itself rather than show
 * a white screen or a stack trace. This is what Phase 1's deploy shows until
 * the repository variables are set.
 */
export function NotConfigured() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-5 py-12">
      <Card className="animate-fade-up">
        <h1 className="text-2xl">Almost there</h1>
        <p className="mt-3 text-ink-soft">
          This copy of StudyCat has no Supabase project attached yet, so there is nothing to sign in
          to.
        </p>
        <ol className="mt-5 space-y-3 text-sm text-ink-soft">
          <li>
            <strong className="text-ink">1.</strong> Create a free Supabase project and run the
            migrations in <code className="rounded bg-cream-200 px-1.5 py-0.5">supabase/migrations/</code>.
          </li>
          <li>
            <strong className="text-ink">2.</strong> Set{' '}
            <code className="rounded bg-cream-200 px-1.5 py-0.5">VITE_SUPABASE_URL</code> and{' '}
            <code className="rounded bg-cream-200 px-1.5 py-0.5">VITE_SUPABASE_ANON_KEY</code> — in{' '}
            <code className="rounded bg-cream-200 px-1.5 py-0.5">.env.local</code> locally, or as
            repository variables for the deployed site.
          </li>
          <li>
            <strong className="text-ink">3.</strong> Rebuild. The values are baked in at build time.
          </li>
        </ol>
        <p className="mt-5 text-sm text-ink-faint">
          Full instructions are in <strong>SETUP.md</strong>.
        </p>
      </Card>
    </div>
  )
}
