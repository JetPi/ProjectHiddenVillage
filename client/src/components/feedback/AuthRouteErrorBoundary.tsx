import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { PageShell } from '../layout/PageShell'
import { Panel } from '../ui/Panel'

function getErrorTitle(error: unknown): string {
  if (isRouteErrorResponse(error)) {
    return `${error.status} ${error.statusText}`
  }

  return 'Authentication Error'
}

function getErrorMessage(error: unknown): string {
  if (isRouteErrorResponse(error)) {
    return error.data?.message || 'We could not load this authentication page.'
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return 'An unexpected authentication error occurred.'
}

export function AuthRouteErrorBoundary() {
  const error = useRouteError()

  return (
    <PageShell>
      <div className="flex min-h-[70vh] w-full items-center justify-center px-3 sm:px-4">
        <Panel className="w-full max-w-lg p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-accent)]">
            Auth Route Error
          </p>
          <h1 className="mt-2 text-xl font-bold text-[var(--text-primary)]">{getErrorTitle(error)}</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">{getErrorMessage(error)}</p>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--button-primary-bg)] px-4 py-2 text-sm font-semibold text-[var(--button-primary-text)] transition-colors duration-200 hover:bg-[var(--button-primary-hover)]"
            >
              Go To Login
            </Link>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors duration-200 hover:bg-[var(--surface-hover)]"
            >
              Reload
            </button>
          </div>
        </Panel>
      </div>
    </PageShell>
  )
}
