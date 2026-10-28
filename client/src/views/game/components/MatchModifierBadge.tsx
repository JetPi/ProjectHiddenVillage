import { useTranslation } from 'react-i18next'
import { translateKey } from '@/i18n'
import { matchModifierLabelKeys } from '@/types/gameModifiers'

export type IMatchModifierBadgeProps = {
  /** The host-only rules the table runs with; absent or null for a plain table. */
  modifiers?: readonly string[] | null
}

/**
 * The modifiers a table was opened with ("time relaxed" today), for the players sitting at it.
 *
 * The format name and the join code keep the original vertical labels in the side rail - they are board chrome and
 * belong there. A modifier is newer information and needs to be readable, so it is a solid pill pinned to the
 * top-right of the viewport: an opaque background and a z-index above every board element (attack links reach
 * z-[240], so this sits at 300) keep it from disappearing behind the board. `pointer-events-none` keeps it from
 * swallowing a click on whatever it covers.
 */
export function MatchModifierBadge({ modifiers }: IMatchModifierBadgeProps) {
  const { t } = useTranslation()

  // An unknown modifier key is skipped: the server may know a rule before this client has wording for it.
  const modifierLabels = (modifiers ?? [])
    .map((modifier) => matchModifierLabelKeys[modifier])
    .filter((key): key is string => Boolean(key))
    .map((key) => translateKey(t, key))

  if (modifierLabels.length === 0) {
    return null
  }

  return (
    <div
      data-testid="game-match-modifier"
      className="pointer-events-none fixed right-2 top-2 z-[300] flex w-max max-w-[min(14rem,45vw)] flex-col items-end gap-1"
    >
      {modifierLabels.map((label) => (
        <span
          key={label}
          className="inline-flex max-w-full items-center truncate rounded-full border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-2.5 py-1 text-[9px] font-semibold uppercase leading-none tracking-[0.12em] text-[var(--text-primary)] shadow-lg ring-1 ring-black/25"
        >
          {label}
        </span>
      ))}
    </div>
  )
}
