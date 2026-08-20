import { Link } from 'react-router-dom'
import { PageShell } from '@/components/layout/PageShell'
import { Panel } from '@/components/ui'

export function CardAdminView() {
  // NOTE(maintainers): Intentionally non-functional placeholder.
  // User asked to keep this route/file for future card-maintenance tooling,
  // but disable all live load/update behavior for now.

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-2xl px-3">
        <Panel className="space-y-4 px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-bold text-[var(--text-primary)]">Card Admin</h1>
            <Link to="/" className="text-sm text-[var(--text-secondary)] underline-offset-2 hover:underline">
              Back to Login
            </Link>
          </div>

          <p className="text-sm text-[var(--text-secondary)]">
            This page is intentionally disabled for now.
          </p>

          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Planned Future Use</p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Keep this route as a future admin surface for card updates (including summon restrictions),
              but do not enable live editing behavior yet.
            </p>
          </div>
        </Panel>
      </div>
    </PageShell>
  )
}
