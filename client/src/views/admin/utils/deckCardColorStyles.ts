/**
 * The card colour as an outline tone.
 *
 * The deck editor marks a card with the colour printed on it, so the leader slot and every card row can be read
 * at a glance without reading the type/colour line. The API returns readable names ("Red", "Blue", "Green",
 * "N/A"), and the tone is deliberately a class map rather than an inline style: the admin screens style
 * everything through Tailwind classes, and the theme's surface tokens keep the text readable in both themes.
 */
export type IDeckCardColorTone = 'red' | 'blue' | 'green' | 'neutral'

export type IDeckCardColorStyling = {
  tone: IDeckCardColorTone
  /**
   * The outline for a card's box (row, leader slot, thumbnail, deck rail item). Only the outline takes the card
   * colour: the quantity controls keep fixed tones so their meaning never depends on the card.
   */
  outlineClassName: string
}

const NEUTRAL_STYLING: IDeckCardColorStyling = {
  tone: 'neutral',
  outlineClassName: 'border-[var(--border-subtle)]',
}

const CARD_COLOR_STYLING: Readonly<Record<string, IDeckCardColorStyling>> = {
  red: {
    tone: 'red',
    outlineClassName: 'border-red-500/70',
  },
  blue: {
    tone: 'blue',
    outlineClassName: 'border-blue-500/70',
  },
  green: {
    tone: 'green',
    outlineClassName: 'border-emerald-500/70',
  },
}

/** Unknown colours (and a missing card) fall back to the neutral border rather than guessing a tone. */
export function resolveDeckCardColorStyling(color: string | null | undefined): IDeckCardColorStyling {
  const normalizedColor = color?.trim().toLowerCase() ?? ''

  return CARD_COLOR_STYLING[normalizedColor] ?? NEUTRAL_STYLING
}
