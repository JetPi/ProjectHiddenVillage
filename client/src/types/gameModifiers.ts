/**
 * Host-only table rules the server accepts on a hosted game (see `GameModifierKeys` on the server). Contract values:
 * never localise them, map them to wording instead.
 */

/** The untimed table: the action clock never runs for this game. */
export const TIME_RELAXED_MODIFIER = 'time-relaxed'

/**
 * Every known modifier, with the i18n key that names it, so the host form, the share dialog and the board all word the
 * same rule the same way. A modifier the server knows and this client does not is skipped rather than rendered raw.
 */
export const matchModifierLabelKeys: Record<string, string> = {
  [TIME_RELAXED_MODIFIER]: 'game.matchModifier.timeRelaxed',
}
