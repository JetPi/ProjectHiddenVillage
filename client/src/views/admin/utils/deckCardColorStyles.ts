/**
 * The card colour as a visual tone.
 *
 * Two surfaces use it: the deck editor marks the leader slot and every card row with the colour printed on the
 * card, and the catalogue tiles paint their background with it so a list reads by colour before the type/colour
 * line is read. The API returns readable names ("Red", "Blue", "Green", "N/A"); the tones are theme tokens
 * (declared for both the dark and light themes in `index.css`) rather than saturated palette colours, so a wall of
 * tiles stays calm while the text keeps its contrast on whichever background the theme provides.
 */
export type IDeckCardColorTone = 'red' | 'blue' | 'green' | 'neutral'

export type IDeckCardColorStyling = {
  tone: IDeckCardColorTone
  /**
   * The outline for a card's box (row, leader slot, thumbnail, deck rail item, catalogue tile). Only the outline
   * takes the card colour: the quantity controls keep fixed tones so their meaning never depends on the card.
   */
  outlineClassName: string
  /** The catalogue tile's background. Neutral cards keep the surface colour. */
  surfaceClassName: string
  /** Hover feedback that works on the tone's surface (a surface token would replace a coloured background). */
  hoverClassName: string
  /** The thumbnail's border, which has to stay visible against the tile's own colour. */
  mediaBorderClassName: string
  /** The card name on a tile. */
  primaryTextClassName: string
  /** The id/type/colour lines on a tile, which sit behind a slightly quieter tone than the name. */
  secondaryTextClassName: string
  /**
   * The selected state of a rail item: a thicker inner left edge in the same tone. It reads without adding a
   * second colour, which is what the primary-colour ring used to do (and clashed with the deck's own colour).
   */
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

/** Unknown colours (and a missing card) fall back to the neutral tone rather than guessing a colour. */
export function resolveDeckCardColorStyling(color: string | null | undefined): IDeckCardColorStyling {
  const normalizedColor = color?.trim().toLowerCase() ?? ''

  return CARD_COLOR_STYLING[normalizedColor] ?? NEUTRAL_STYLING
}
