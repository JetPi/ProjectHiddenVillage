export type DescriptionKeywordColor = 'green' | 'yellow' | 'amber' | 'blue' | 'neutral' | 'black' | 'red'

/**
 * The one aspect ratio every card surface uses. It matches `CARD_ART_ASPECT` exactly (600/831 === 200/277), so
 * a card frame never letterboxes or crops art that was authored at the reference size. The admin tile used to
 * use `5/7` (0.7143 against 0.7220), which shaved about 1 percent off the art and read as a warp.
 */
export const CARD_ART_ASPECT_CLASS = 'aspect-[600/831]'

/**
 * Fit policy, and the only one: card art *fills* its frame. `object-contain` is reserved for the full-art
 * preview panel (`CARD_ART_FIT_CLASS`), where cropping the art would hide the card the player is inspecting.
 * Mixing the two was why the same card looked framed differently on the board and in an overlay.
 */
export const CARD_ART_FILL_CLASS = 'object-cover'
export const CARD_ART_FIT_CLASS = 'object-contain'

export const CARD_ART_IMAGE_CLASS = 'block h-full w-full rounded-none object-cover'

/**
 * `sizes` for each card surface, in one place so a call site picks a role instead of guessing a box.
 *
 * These drive which ladder step the browser downloads: the numbers mirror the rendered card widths produced by
 * the board layout (a card is `row height x 0.722`, capped by `--resource-rail-max-width` and the board's
 * `max-w-[1050px]` columns), so a 1x screen stays on the small variants and a 3x screen climbs to the master.
 */
export const CARD_SIZES = {
  /** Leader card: tallest card on the board, drawn up to ~290 CSS px wide. */
  leader: '(min-width: 1024px) 290px, (min-width: 640px) 200px, 150px',
  /** Character-field card inside a battlefield row. */
  battlefieldCard: '(min-width: 1024px) 170px, 120px',
  /** One of the five support slots in a zone row. */
  supportSlot: '(min-width: 1024px) 92px, 64px',
  /** A card in a hand row. */
  handCard: '(min-width: 1024px) 120px, 84px',
  /** Deck reveal / trash top, capped by the 208px resource rail. */
  pileCard: '(min-width: 1024px) 208px, 150px',
  /** One tile in the prompt card chooser (five per row, inside a max-w-2xl panel). */
  promptTile: '(min-width: 640px) 124px, 92px',
  /** A row thumbnail in the trash/deck list overlay. */
  listRow: '56px',
  /** The slide-in card preview panel. */
  previewPanel: 'min(92vw, 22rem)',
  /** Admin catalogue tile: the hover art preview. */
  adminTile: '(min-width: 1024px) 320px, 100vw',
  /** Admin catalogue tile thumbnail and the art picker preview. */
  adminThumb: '160px',
  /** Default for a card that declares no surface of its own (matches the board variant). */
  boardFallback: '240px',
} as const

export const DESCRIPTION_KEYWORDS_BY_COLOR: Record<DescriptionKeywordColor, string[]> = {
	green: ['summon'],
    yellow: ['once per turn'],
	amber: ['support', "when attacking", "during your opponent's attack", 'recovery'],
	blue: ['rush'],
	red: ['on summon', 'support activated', 'during your main', 'activate: main'],
	black: ['summon requirements'],
	neutral: [],
}

export const KEYWORD_DESCRIPTION_KEYS = {
	rush: 'components.ui.keywords.rush',
} as const

export const KEYWORD_DESCRIPTION_VARIANTS = {
	rush: [
		'This card can attack on the turn in which it is played.',
		'This card can attack on the turn in which it is summoned.',
	],
}

export const DESCRIPTION_BOLD_PHRASES = ['Cannot be summoned normally.']

export const DESCRIPTION_KEYWORD_PILL_CLASS_BY_COLOR: Record<DescriptionKeywordColor, string> = {
	green: 'border-emerald-600 bg-emerald-600 text-white',
	yellow: 'border-yellow-400 bg-yellow-400 text-slate-900',
	amber: 'border-amber-600 bg-amber-600 text-white',
	red: 'border-red-800 bg-red-800 text-white',
	blue: 'border-sky-600 bg-sky-600 text-white',
	black: 'border-black bg-black text-white',
	neutral: 'border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)]',
}
