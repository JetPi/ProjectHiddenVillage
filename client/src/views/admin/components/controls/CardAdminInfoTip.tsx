import { twMerge } from 'tailwind-merge'

type CardAdminInfoTipTone = 'default' | 'warning'

type ICardAdminInfoTipProps = {
  /** Tooltip copy, usually a translated `*Help` string. */
  text: string
  /** Accessible name for the icon button; defaults to the tooltip copy. */
  label?: string
  tone?: CardAdminInfoTipTone
  className?: string
}

/**
 * A small "i" that holds a field's explanation until it is needed: the copy appears on hover and on keyboard
 * focus instead of taking permanent space under every input. Warnings reuse it with the amber tone so an
 * invalid configuration still shows as a visible dot while its reason stays tucked away.
 */
export function CardAdminInfoTip({ text, label, tone = 'default', className }: ICardAdminInfoTipProps) {
  const toneClassName = tone === 'warning'
    ? 'border-amber-600/70 text-amber-600'
    : 'border-[var(--text-muted)] text-[var(--text-muted)]'

  return (
    <span className={twMerge('group/info relative inline-flex shrink-0 items-center align-middle', className)}>
      <button
        type="button"
        aria-label={label ?? text}
        title={text}
        className={twMerge(
          'flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border bg-transparent p-0 text-[8px] font-bold leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text-accent)]',
          toneClassName,
        )}
      >
        i
      </button>

      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-40 mt-1 hidden w-64 max-w-[min(16rem,70vw)] whitespace-normal rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-2.5 py-2 text-left text-[11px] font-normal normal-case leading-snug tracking-normal text-[var(--text-primary)] shadow-xl group-hover/info:block group-focus-within/info:block"
      >
        {text}
      </span>
    </span>
  )
}
