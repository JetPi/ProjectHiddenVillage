import { Ban, CircleSlash, ShieldCheck, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { twMerge } from 'tailwind-merge'
import type { ICardStatusEffect, TCardStatusEffectKind } from '@/services/api/types/game'

type IStatusBadgeCopy = {
  Icon: LucideIcon
  labelKey:
    | 'game.zone.status.rush.label'
    | 'game.zone.status.cannotAttack.label'
    | 'game.zone.status.immuneToOpponentSupportEffects.label'
    | 'game.zone.status.effectsSuppressed.label'
  descriptionKey:
    | 'game.zone.status.rush.description'
    | 'game.zone.status.cannotAttack.description'
    | 'game.zone.status.immuneToOpponentSupportEffects.description'
    | 'game.zone.status.effectsSuppressed.description'
  chipClassName: string
  testId: string
}

const STATUS_BADGES: Record<TCardStatusEffectKind, IStatusBadgeCopy> = {
  Rush: {
    Icon: Zap,
    labelKey: 'game.zone.status.rush.label',
    descriptionKey: 'game.zone.status.rush.description',
    chipClassName: 'bg-sky-600/92',
    testId: 'card-status-rush',
  },
  CannotAttack: {
    Icon: Ban,
    labelKey: 'game.zone.status.cannotAttack.label',
    descriptionKey: 'game.zone.status.cannotAttack.description',
    chipClassName: 'bg-rose-700/92',
    testId: 'card-status-cannot-attack',
  },
  ImmuneToOpponentSupportEffects: {
    Icon: ShieldCheck,
    labelKey: 'game.zone.status.immuneToOpponentSupportEffects.label',
    descriptionKey: 'game.zone.status.immuneToOpponentSupportEffects.description',
    chipClassName: 'bg-emerald-700/92',
    testId: 'card-status-immune',
  },
  EffectsSuppressed: {
    Icon: CircleSlash,
    labelKey: 'game.zone.status.effectsSuppressed.label',
    descriptionKey: 'game.zone.status.effectsSuppressed.description',
    chipClassName: 'bg-violet-700/92',
    testId: 'card-status-effects-negated',
  },
}

/**
 * The server's restriction codes, mapped to the wording the tooltip shows. Both players read the same codes,
 * which is why the opponent's board can explain the badge even though it receives no card actions.
 */
const CANNOT_ATTACK_REASON_KEYS = {
  'BattleAction.RestrictedByEffect': 'game.zone.status.cannotAttackReason.restrictedByEffect',
  'BattleAction.SummonedThisTurn': 'game.zone.status.cannotAttackReason.summonedThisTurn',
  'BattleAction.CardRested': 'game.zone.status.cannotAttackReason.rested',
  'BattleAction.FirstTurn': 'game.zone.status.cannotAttackReason.firstTurn',
} as const

type TCannotAttackReasonCode = keyof typeof CANNOT_ATTACK_REASON_KEYS

function isCannotAttackReasonCode(code: string | null | undefined): code is TCannotAttackReasonCode {
  return typeof code === 'string' && code in CANNOT_ATTACK_REASON_KEYS
}

/** Stable reading order, independent of the order the server happened to append the statuses in. */
const STATUS_ORDER: TCardStatusEffectKind[] = [
  'Rush',
  'CannotAttack',
  'ImmuneToOpponentSupportEffects',
  'EffectsSuppressed',
]

// The tooltip is portalled to the body: the card is `overflow-hidden`, so anything positioned inside it would be
// clipped at the card edge, and the hover overlay sits at z-20 above the rail.
//
// Both numbers are *base* values at unit 1 and are scaled by the board's unit at hover time. A fixed 176px tooltip
// holding 30px type on a 4K board is unreadable, and the same applies to the chip glyph, which is sized by CSS below.
const BASE_TOOLTIP_WIDTH_PX = 176
const BASE_TOOLTIP_GAP_PX = 6
const BASE_TOOLTIP_FONT_PX = 10
const VIEWPORT_MARGIN_PX = 8

/** The board's resolved unit (`1px` outside the game view), so the tooltip scales with the card it belongs to. */
function resolveGameUnit(): number {
  if (typeof document === 'undefined') {
    return 1
  }

  const surface = document.querySelector('[data-game-surface]')
  if (!surface) {
    return 1
  }

  const unit = Number.parseFloat(getComputedStyle(surface).getPropertyValue('--game-unit'))

  return Number.isFinite(unit) && unit > 0 ? unit : 1
}

// A status appears and disappears on a state push, which reads as a pop when the chip is mounted and unmounted
// outright. Entering fades the chip up from a slightly smaller size and leaving fades it back down; both are short
// enough that the board never waits on them. When one status replaces another in the same push they are not
// simultaneous: the arrival waits for the departure to finish (see `admittedKey` below).
const CHIP_ENTER_TRANSITION = { duration: 0.18, ease: 'easeOut' } as const
const CHIP_EXIT_TRANSITION = { duration: 0.14, ease: 'easeIn' } as const
const CHIP_HIDDEN_STATE = { opacity: 0, scale: 0.7 } as const
const CHIP_VISIBLE_STATE = { opacity: 1, scale: 1 } as const

type IStatusChipProps = {
  kind: TCardStatusEffectKind
  label: string
  detail: string
  shouldReduceMotion: boolean
}

/**
 * One badge plus its own tooltip. The tooltip lives with the chip so it can never outlive it: a status that is
 * removed mid-hover takes its explanation with it while the exit animation plays.
 */
function StatusChip({ kind, label, detail, shouldReduceMotion }: IStatusChipProps) {
  const badge = STATUS_BADGES[kind]
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)

  const showTooltip = (element: HTMLElement): void => {
    // Read the layout position at hover time: the board animates, scrolls and re-lays out, so a rect captured at
    // render would drift away from the chip.
    setAnchorRect(element.getBoundingClientRect())
  }

  const tooltipStyle = (() => {
    if (anchorRect === null) {
      return null
    }

    const unit = resolveGameUnit()
    const tooltipWidth = BASE_TOOLTIP_WIDTH_PX * unit

    // The tooltip is portalled to the body, i.e. *outside* `[data-game-surface]`, so none of the board's custom
    // properties resolve here - `text-[length:var(--game-font-sm)]` silently fell back to the body's 16px. Its type,
    // padding, radius and gap are therefore computed from the measured unit and set inline.
    return {
      left: Math.max(
        VIEWPORT_MARGIN_PX,
        Math.min(
          anchorRect.left + anchorRect.width / 2 - tooltipWidth / 2,
          window.innerWidth - tooltipWidth - VIEWPORT_MARGIN_PX,
        ),
      ),
      top: anchorRect.top - BASE_TOOLTIP_GAP_PX * unit,
      width: tooltipWidth,
      fontSize: `${BASE_TOOLTIP_FONT_PX * unit}px`,
      lineHeight: 1.25,
      padding: `${4 * unit}px ${8 * unit}px`,
      borderRadius: `${8 * unit}px`,
    }
  })()

  return (
    <>
      <motion.span
        layout
        role="img"
        tabIndex={0}
        data-status-effect={kind}
        data-testid={badge.testId}
        aria-label={`${label}: ${detail}`}
        initial={shouldReduceMotion ? false : CHIP_HIDDEN_STATE}
        animate={CHIP_VISIBLE_STATE}
        exit={shouldReduceMotion ? undefined : { ...CHIP_HIDDEN_STATE, transition: CHIP_EXIT_TRANSITION }}
        transition={CHIP_ENTER_TRANSITION}
        onMouseEnter={(event) => {
          showTooltip(event.currentTarget)
        }}
        onMouseLeave={() => {
          setAnchorRect(null)
        }}
        onFocus={(event) => {
          showTooltip(event.currentTarget)
        }}
        onBlur={() => {
          setAnchorRect(null)
        }}
        className={twMerge(
          // The box scales with the unit, so the lucide glyph has to as well; a 9px icon inside a 48px chip is the
          // "icons are unreadable" report.
          'pointer-events-auto inline-flex h-[calc(16*var(--game-unit))] w-[calc(16*var(--game-unit))] items-center justify-center rounded-sm border border-white/40 text-white shadow-sm backdrop-blur-[1px] [&_svg]:h-[calc(9*var(--game-unit))] [&_svg]:w-[calc(9*var(--game-unit))]',
          'hover:border-white/80 hover:brightness-110 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-white',
          badge.chipClassName,
        )}
      >
        <badge.Icon size={9} strokeWidth={3} aria-hidden="true" />
      </motion.span>

      {tooltipStyle === null
        ? null
        : createPortal(
            <div
              role="tooltip"
              data-testid="card-status-tooltip"
              style={{
                position: 'fixed',
                left: `${tooltipStyle.left}px`,
                top: `${tooltipStyle.top}px`,
                width: `${tooltipStyle.width}px`,
                // Type, padding and radius come from `tooltipStyle` (see above): custom properties do not reach a
                // body portal.
                fontSize: tooltipStyle.fontSize,
                lineHeight: tooltipStyle.lineHeight,
                padding: tooltipStyle.padding,
                borderRadius: tooltipStyle.borderRadius,
                transform: 'translateY(-100%)',
              }}
              className="pointer-events-none z-[70] border border-white/25 bg-slate-950/95 text-white shadow-lg"
            >
              <span className="block font-extrabold uppercase tracking-[0.06em]">{label}</span>
              <span className="mt-0.5 block text-white/80">{detail}</span>
            </div>,
            document.body,
          )}
    </>
  )
}

type ICardStatusBadgeRailProps = {
  statusEffects?: ICardStatusEffect[]
  /**
   * Fallback reason for the cannot-attack badge, taken from the card's own disabled Battle option. Only the
   * owner of a card receives those actions, so this is a safety net for payloads whose status carries no reason.
   */
  cannotAttackReason?: string | null
  className?: string
}

/**
 * The status icons pinned to the bottom of a card, each explaining itself on hover or keyboard focus. The rail
 * stays mounted even when the card is clean: an empty rail has no size, and keeping it mounted is what lets the
 * last badge animate out instead of vanishing with its container.
 */
function CardStatusBadgeRail({
  statusEffects,
  cannotAttackReason = null,
  className,
}: ICardStatusBadgeRailProps) {
  const { t } = useTranslation()
  const shouldReduceMotion = useReducedMotion() === true

  const statusByKind = new Map((statusEffects ?? []).map((status) => [status.kind, status]))
  const desiredStatuses = STATUS_ORDER.flatMap((kind) => {
    const status = statusByKind.get(kind)
    return status ? [status] : []
  })
  const desiredKey = desiredStatuses.map((status) => status.kind).join('|')

  // The kinds the rail has admitted. A swap (the summon-turn lock turning into Rush on one state push) used to
  // mount the arriving chip while the leaving one was still fading, so the new badge popped up next to a
  // half-transparent one and then slid into its final slot when that one unmounted. Arrivals are held back until
  // `AnimatePresence` reports the departure finished, so `admittedKey` trails `desiredKey` during an exit.
  const [admittedKey, setAdmittedKey] = useState(desiredKey)

  useEffect(() => {
    if (admittedKey === desiredKey) {
      return
    }

    const desiredKinds = new Set(desiredKey.split('|').filter(Boolean))
    const isDeparting = admittedKey
      .split('|')
      .filter(Boolean)
      .some((kind) => !desiredKinds.has(kind))

    if (isDeparting) {
      // `onExitComplete` admits the arrival once the departing chip is really gone.
      return
    }

    // Arrivals only: nothing is animating out, so admit them on the next tick. The state update stays out of the
    // effect body (a synchronous setState there is what the hooks lint rule rejects).
    const timeoutId = window.setTimeout(() => {
      setAdmittedKey(desiredKey)
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [admittedKey, desiredKey])

  const admittedKinds = new Set(admittedKey.split('|').filter(Boolean))
  const visibleStatuses = desiredStatuses.filter((status) => admittedKinds.has(status.kind))

  const resolveDetail = (status: ICardStatusEffect): string => {
    if (status.kind !== 'CannotAttack') {
      return t(STATUS_BADGES[status.kind].descriptionKey)
    }

    if (isCannotAttackReasonCode(status.reasonCode)) {
      return t(CANNOT_ATTACK_REASON_KEYS[status.reasonCode])
    }

    return status.reason
      ?? cannotAttackReason
      ?? t(STATUS_BADGES.CannotAttack.descriptionKey)
  }

  return (
    <div
      role="group"
      aria-label={t('game.zone.status.railAria')}
      data-testid="card-status-badges"
      className={twMerge(
        'card-status-badges absolute z-30 flex items-center gap-[calc(2*var(--game-unit))]',
        className,
      )}
    >
      <AnimatePresence
        initial={false}
        onExitComplete={() => {
          // The departing chip has finished leaving, so a badge that arrived in the meantime can take its slot.
          setAdmittedKey(desiredKey)
        }}
      >
        {visibleStatuses.map((status) => (
          <StatusChip
            key={status.kind}
            kind={status.kind}
            label={t(STATUS_BADGES[status.kind].labelKey)}
            detail={resolveDetail(status)}
            shouldReduceMotion={shouldReduceMotion}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}

export { CardStatusBadgeRail }
export type { ICardStatusBadgeRailProps }
