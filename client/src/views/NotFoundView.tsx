import { Link } from 'react-router-dom'
import { PageShell } from '@/components/layout/PageShell'
import { Panel } from '@/components/ui'

export function NotFoundView() {
  return (
    <PageShell>
      <div className="flex min-h-[70vh] w-full items-center justify-center px-3 sm:px-4">
        <Panel className="w-full max-w-lg p-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-accent)]">404</p>
          <h1 className="mt-2 text-2xl font-bold text-[var(--text-primary)]">Page Not Found</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            This page does not exist. Return to login to continue.
          </p>
          <div className="mt-5">
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--button-primary-bg)] px-4 py-2 text-sm font-semibold text-[var(--button-primary-text)] transition-colors duration-200 hover:bg-[var(--button-primary-hover)]"
            >
              Go To Login
            </Link>
          </div>
        </Panel>
      </div>
    </PageShell>
  )
}
