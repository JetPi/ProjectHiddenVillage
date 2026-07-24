import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react'

type ErrorBoundaryProps = PropsWithChildren<{
  fallback?: ReactNode
}>

type ErrorBoundaryState = {
  hasError: boolean
  errorMessage: string
}

const initialState: ErrorBoundaryState = {
  hasError: false,
  errorMessage: '',
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = initialState

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled UI error', error, errorInfo)
  }

  private handleReset = () => {
    this.setState(initialState)
  }

  render() {
    const { hasError, errorMessage } = this.state

    if (hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <section className="flex min-h-screen items-center justify-center bg-[var(--app-bg-end)] px-4">
          <div className="w-full max-w-lg rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-6 text-[var(--text-primary)] shadow-[var(--panel-shadow)] backdrop-blur-sm">
            <h1 className="text-2xl font-black">Something went wrong</h1>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              An unexpected UI error occurred. You can try reloading the page.
            </p>
            {import.meta.env.DEV && errorMessage ? (
              <pre className="mt-4 overflow-auto rounded-lg bg-[var(--surface-muted)] p-3 text-xs text-[var(--text-secondary)]">
                {errorMessage}
              </pre>
            ) : null}
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-hover)] px-4 py-2 text-sm font-semibold transition-colors duration-200"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--button-primary-bg)] px-4 py-2 text-sm font-semibold text-[var(--button-primary-text)] transition-colors duration-200 hover:bg-[var(--button-primary-hover)]"
              >
                Reload Page
              </button>
            </div>
          </div>
        </section>
      )
    }

    return this.props.children
  }
}
