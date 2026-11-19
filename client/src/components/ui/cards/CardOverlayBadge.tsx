import { twMerge } from 'tailwind-merge'
import { useTranslation } from 'react-i18next'
import type { ICardOverlayBadgeProps } from '@/components/ui/types'

const POSITION_CLASSES: Record<NonNullable<ICardOverlayBadgeProps['position']>, string> = {
  'top-left': 'top-0 left-0 rounded-br-md border-r border-b border-slate-500/65',
  'top-right': 'top-0 right-0 rounded-bl-md border-l border-b border-slate-500/65',
  'bottom-left': 'bottom-0 left-0 rounded-tr-md border-r border-t border-slate-500/65',
  'bottom-right': 'bottom-0 right-0 rounded-tl-md border-l border-t border-slate-500/65',
}

// Sizes are multiples of the game surface's unit so a badge keeps its share of a card that grew with the window;
// the literals reproduce today's 20/24/28px boxes at 1x.
const SIZE_CLASSES = {
  sm: 'h-[calc(20*var(--game-unit))] w-[calc(24*var(--game-unit))] text-[length:var(--game-font-sm)]',
  md: 'h-[calc(24*var(--game-unit))] w-[calc(24*var(--game-unit))] text-[length:var(--game-font-lg)]',
  lg: 'h-[calc(28*var(--game-unit))] w-[calc(28*var(--game-unit))] text-[length:var(--game-font-lg)]',
} as const;

export function CardOverlayBadge({ size = "md", position = 'bottom-right', className, testId, children }: ICardOverlayBadgeProps) {
  const { t } = useTranslation()

  return (
    <div
      aria-label={t('components.ui.cardOverlayBadge.ariaLabel')}
      data-testid={testId}
      className={twMerge(
        'card-overlay-badge pointer-events-none absolute z-10 flex items-center justify-center bg-slate-700/92 text-center font-extrabold leading-none',
        SIZE_CLASSES[size],
        POSITION_CLASSES[position],
        className,
      )}
    >
      {children}
    </div>
  )
}