export type DescriptionKeywordColor = 'green' | 'amber' | 'blue' | 'neutral' | 'black' | 'red'

export const DESCRIPTION_KEYWORDS_BY_COLOR: Record<DescriptionKeywordColor, string[]> = {
	green: ['summon'],
	amber: ['support', "when attacking", "during your opponent's attack"],
	blue: ['rush'],
	red: ['on summon', 'support activated', 'during your main'],
	black: ['summon requirements'],
	neutral: [],
}

export const KEYWORD_DESCRIPTIONS = {
	rush: 'This card can attack on the turn in which it is played.',
}

export const DESCRIPTION_BOLD_PHRASES = ['Cannot be summoned normally.']

export const DESCRIPTION_KEYWORD_PILL_CLASS_BY_COLOR: Record<DescriptionKeywordColor, string> = {
	green: 'border-emerald-600 bg-emerald-600 text-white',
	amber: 'border-amber-600 bg-amber-600 text-white',
	red: 'border-red-800 bg-red-800 text-white',
	blue: 'border-sky-600 bg-sky-600 text-white',
	black: 'border-black bg-black text-white',
	neutral: 'border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)]',
}
