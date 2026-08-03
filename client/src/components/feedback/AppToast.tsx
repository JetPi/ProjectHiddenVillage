import { CheckCircle2, Info, X } from 'lucide-react'
import { toast } from 'sonner'

type AppToastTone = 'success' | 'info'

type AppToastProps = {
  tone: AppToastTone
  message: string
  onClose: () => void
}

type AppToastOptions = {
  id?: string
  duration?: number
}

function toneIcon(tone: AppToastTone) {
  if (tone === 'success') {
    return <CheckCircle2 size={14} aria-hidden="true" />
  }

  return <Info size={14} aria-hidden="true" />
}

export function AppToast({ tone, message, onClose }: AppToastProps) {
  const badgeClassName =
    tone === 'success'
      ? 'bg-[var(--button-primary-bg)] text-[var(--button-primary-text)]'
      : 'bg-[var(--surface-hover)] text-[var(--text-primary)]'

  return (
    <div className="pointer-events-auto w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-3 shadow-[var(--panel-shadow)] backdrop-blur-sm">
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${badgeClassName}`}>
          {toneIcon(tone)}
        </span>
        <p className="flex-1 pt-0.5 text-sm leading-5 text-[var(--text-secondary)]">{message}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss notification"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-transparent text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  )
}

function showAppToast(tone: AppToastTone, message: string, options: AppToastOptions = {}) {
  return toast.custom(
    (id) => <AppToast tone={tone} message={message} onClose={() => toast.dismiss(id)} />,
    {
      id: options.id,
      duration: options.duration ?? 3200,
      position: 'bottom-right',
    },
  )
}

export function showAppSuccessToast(message: string, options?: AppToastOptions) {
  return showAppToast('success', message, options)
}

export function showAppInfoToast(message: string, options?: AppToastOptions) {
  return showAppToast('info', message, options)
}
