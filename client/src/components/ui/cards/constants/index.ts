export type DescriptionKeywordColor = 'green' | 'yellow' | 'amber' | 'blue' | 'neutral' | 'black' | 'red'

export const CARD_ART_IMAGE_CLASS = 'block h-full w-full rounded-none object-contain [image-rendering:auto]'

export const DESCRIPTION_KEYWORDS_BY_COLOR: Record<DescriptionKeywordColor, string[]> = {
	green: ['summon'],
    yellow: ['once per turn'],
	amber: ['support', "when attacking", "during your opponent's attack", 'recovery'],
	blue: ['rush'],
	red: ['on summon', 'support activated', 'during your main', 'activate: main'],
	black: ['summon requirements'],
	neutral: [],
}

export const KEYWORD_DESCRIPTIONS = {
	rush: 'This card can attack on the turn in which it is played.',
}

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
