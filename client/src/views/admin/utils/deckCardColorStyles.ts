export type IDeckCardColorTone = 'red' | 'blue' | 'green' | 'neutral'

export type IDeckCardColorStyling = {
  tone: IDeckCardColorTone
  outlineClassName: string
  surfaceClassName: string
  hoverClassName: string
  mediaBorderClassName: string
  primaryTextClassName: string
  secondaryTextClassName: string
  selectedAccentClassName: string
}

const NEUTRAL_STYLING: IDeckCardColorStyling = {
  tone: 'neutral',
  outlineClassName: 'border-[var(--border-subtle)]',
  surfaceClassName: 'bg-transparent',
  hoverClassName: 'hover:bg-[var(--surface-hover)]',
  mediaBorderClassName: 'border-[var(--border-subtle)]',
  primaryTextClassName: 'text-[var(--text-primary)]',
  secondaryTextClassName: 'text-[var(--text-secondary)]',
  selectedAccentClassName: 'shadow-[inset_3px_0_0_0_var(--border-subtle)]',
}

const CARD_COLOR_STYLING: Readonly<Record<string, IDeckCardColorStyling>> = {
  red: {
    tone: 'red',
    outlineClassName: 'border-[var(--card-tone-red-border)]',
    surfaceClassName: 'bg-[var(--card-tone-red-bg)]',
    hoverClassName: 'hover:brightness-105',
    mediaBorderClassName: 'border-[var(--card-tone-red-border)]',
    primaryTextClassName: 'text-[var(--card-tone-red-text)]',
    secondaryTextClassName: 'text-[var(--card-tone-red-text-muted)]',
    selectedAccentClassName: 'shadow-[inset_3px_0_0_0_var(--card-tone-red-border)]',
  },
  blue: {
    tone: 'blue',
    outlineClassName: 'border-[var(--card-tone-blue-border)]',
    surfaceClassName: 'bg-[var(--card-tone-blue-bg)]',
    hoverClassName: 'hover:brightness-105',
    mediaBorderClassName: 'border-[var(--card-tone-blue-border)]',
    primaryTextClassName: 'text-[var(--card-tone-blue-text)]',
    secondaryTextClassName: 'text-[var(--card-tone-blue-text-muted)]',
    selectedAccentClassName: 'shadow-[inset_3px_0_0_0_var(--card-tone-blue-border)]',
  },
  green: {
    tone: 'green',
    outlineClassName: 'border-[var(--card-tone-green-border)]',
    surfaceClassName: 'bg-[var(--card-tone-green-bg)]',
    hoverClassName: 'hover:brightness-105',
    mediaBorderClassName: 'border-[var(--card-tone-green-border)]',
    primaryTextClassName: 'text-[var(--card-tone-green-text)]',
    secondaryTextClassName: 'text-[var(--card-tone-green-text-muted)]',
    selectedAccentClassName: 'shadow-[inset_3px_0_0_0_var(--card-tone-green-border)]',
  },
}

export function resolveDeckCardColorStyling(color: string | null | undefined): IDeckCardColorStyling {
  const normalizedColor = color?.trim().toLowerCase() ?? ''

  return CARD_COLOR_STYLING[normalizedColor] ?? NEUTRAL_STYLING
}
