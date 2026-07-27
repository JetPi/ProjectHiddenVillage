import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom'

function getErrorMessage(error: unknown) {
  if (isRouteErrorResponse(error)) {
    return error.data?.message || error.statusText || 'The requested page could not be loaded.'
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'An unexpected routing error occurred.'
}

function getErrorTitle(error: unknown) {
  if (isRouteErrorResponse(error)) {
    return `${error.status} ${error.statusText}`
  }

  return 'Something went wrong'
}

export function RouteErrorBoundary() {
  const error = useRouteError()
  const title = getErrorTitle(error)
  const message = getErrorMessage(error)

  return (
    <section className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_20%_20%,var(--app-bg-start)_0%,var(--app-bg-mid)_35%,var(--app-bg-deep)_65%,var(--app-bg-end)_100%)] px-4">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--border-subtle)] bg-[var(--popup-bg)] p-6 text-[var(--text-primary)] shadow-[var(--panel-shadow)]">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-accent)]">Route Error</p>
        <h1 className="mt-2 text-2xl font-black">{title}</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{message}</p>
        {import.meta.env.DEV && error instanceof Error && error.stack ? (
          <pre className="mt-4 overflow-auto rounded-lg bg-[var(--surface-muted)] p-3 text-xs text-[var(--text-secondary)]">
            {error.stack}
          </pre>
        ) : null}
        <div className="mt-5 flex gap-3">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--button-primary-bg)] px-4 py-2 text-sm font-semibold text-[var(--button-primary-text)] transition-colors duration-200 hover:bg-[var(--button-primary-hover)]"
          >
            Go To Home
          </Link>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-hover)] px-4 py-2 text-sm font-semibold transition-colors duration-200"
          >
            Reload Page
          </button>
        </div>
      </div>
    </section>
  )
}
