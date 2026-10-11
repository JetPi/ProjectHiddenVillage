import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { PageShell } from '@/components/layout/PageShell'
import { Panel } from '@/components/ui/Panel'

function getErrorTitle(error: unknown, t: TFunction): string {
  if (isRouteErrorResponse(error)) {
    return `${error.status} ${error.statusText}`
  }

  return t('components.feedback.authRouteError.defaultTitle')
}

function getErrorMessage(error: unknown, t: TFunction): string {
  if (isRouteErrorResponse(error)) {
    return error.data?.message || t('components.feedback.authRouteError.defaultMessage')
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return t('components.feedback.authRouteError.unexpected')
}

export function AuthRouteErrorBoundary() {
  const { t } = useTranslation()
  const error = useRouteError()

  return (
    <PageShell>
      <div className="flex min-h-[70vh] w-full items-center justify-center px-3 sm:px-4">
        <Panel className="w-full max-w-lg p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-accent)]">
            {t('components.feedback.authRouteError.badge')}
          </p>
          <h1 className="mt-2 text-xl font-bold text-[var(--text-primary)]">{getErrorTitle(error, t)}</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">{getErrorMessage(error, t)}</p>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--button-primary-bg)] px-4 py-2 text-sm font-semibold text-[var(--button-primary-text)] transition-colors duration-200 hover:bg-[var(--button-primary-hover)]"
            >
              {t('components.feedback.authRouteError.goToLogin')}
            </Link>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors duration-200 hover:bg-[var(--surface-hover)]"
            >
              {t('components.feedback.authRouteError.reload')}
            </button>
          </div>
        </Panel>
      </div>
    </PageShell>
  )
}
