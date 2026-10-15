/**
 * The single source of truth for board-animation tuning.
 *
 * Durations, easings, stagger windows and the destination-lookup clamps used to be declared separately in the
 * animation primitives, the GameView effect hooks and the game constants. They live here now so a value is
 * never defined twice with two different numbers (the migration that consolidated them is
 * `plans/board-animation-motion-migration.md`).
 *
 * Existing consumers import these directly, or through the re-exports in `views/game/utils/contants.ts`;
 * the flight layer, the director and the lunge read them from here.
 */

/** The board's one card-travel easing (a soft, decisive ease-out), as a CSS timing function. */
const STANDARD_MOVEMENT_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'

/**
 * The same curve as cubic-bezier control points, for Motion's `ease` prop. Motion cannot take the CSS
 * string form for a keyframe transition, and its `BezierDefinition` is exactly this four-number tuple.
 */
const BOARD_MOVEMENT_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

/** The board's rested-card tilt. Motion owns the rotation so it stays the sole writer of `transform`. */
const RESTED_CARD_TILT_DEG = 14
const RESTED_CARD_TILT_DURATION_MS = 300

/**
 * The attacker's hit beat when an attack resolves: a decaying left-right shake that settles back into the card's
 * slot. It was a single yoyo along the attacker→defender vector, which read as a stutter - one eased excursion
 * looks like it is about to go somewhere and then thinks better of it.
 *
 * The amplitude is a fraction of the card's own width, clamped so a small card still shows the shake and a wide
 * one cannot swing into its neighbours. The softness is the point: the swing distances decay by
 * `ATTACK_LUNGE_SHAKE_DECAY` and every swing carries its own eased segment (`ATTACK_LUNGE_SHAKE_EASING`), so the
 * card eases in and out of each side rather than snapping between them.
 */
const ATTACK_LUNGE_DURATION_MS = 700
const ATTACK_LUNGE_SHAKE_AMPLITUDE_RATIO = 0.22
const ATTACK_LUNGE_SHAKE_MAX_AMPLITUDE_PX = 26
const ATTACK_LUNGE_SHAKE_SWINGS = 4
const ATTACK_LUNGE_SHAKE_DECAY = 0.62
const ATTACK_LUNGE_SHAKE_EASING = 'ease-in-out'

/** How long to wait for a destination element to render before giving up on a flight. */
const DEFAULT_DYNAMIC_TARGET_TIMEOUT_MS = 700
const DEFAULT_DYNAMIC_TARGET_MAX_FRAMES = 12

/** Deck→hand draw and its reveal delay / completion padding tail. */
const DRAW_TO_HAND_STAGGER_MS = 70
const DRAW_TO_HAND_REVEAL_DELAY_MS = 140
const DECK_TO_HAND_FLY_DURATION_MS = 300
const DRAW_ANIMATION_COMPLETE_PADDING_MS = 100

/** Hand→pile discard. */
const HAND_TO_PILE_STAGGER_MS = 60
const HAND_TO_PILE_DURATION_MS = 340

/** A card face leaving a rendered zone for another (K.O., used support, bounce, discard). */
const CARD_TO_TRASH_FLY_DURATION_MS = 340
const CARD_TO_TRASH_STAGGER_MS = 90

/** Summons that travel from a pile rather than the hand. */
const REVEAL_SUMMON_FLIGHT_DURATION_MS = 360
const TRASH_RECALL_SUMMON_FLIGHT_DURATION_MS = 360

/** How long a reveal presentation stays on screen before the client acknowledges it. */
const REVEAL_PRESENTATION_MS = 2_000

export {
  STANDARD_MOVEMENT_EASING,
  BOARD_MOVEMENT_EASE,
  RESTED_CARD_TILT_DEG,
  RESTED_CARD_TILT_DURATION_MS,
  ATTACK_LUNGE_DURATION_MS,
  ATTACK_LUNGE_SHAKE_AMPLITUDE_RATIO,
  ATTACK_LUNGE_SHAKE_MAX_AMPLITUDE_PX,
  ATTACK_LUNGE_SHAKE_SWINGS,
  ATTACK_LUNGE_SHAKE_DECAY,
  ATTACK_LUNGE_SHAKE_EASING,
  DEFAULT_DYNAMIC_TARGET_TIMEOUT_MS,
  DEFAULT_DYNAMIC_TARGET_MAX_FRAMES,
  DRAW_TO_HAND_STAGGER_MS,
  DRAW_TO_HAND_REVEAL_DELAY_MS,
  DECK_TO_HAND_FLY_DURATION_MS,
  DRAW_ANIMATION_COMPLETE_PADDING_MS,
  HAND_TO_PILE_STAGGER_MS,
  HAND_TO_PILE_DURATION_MS,
  CARD_TO_TRASH_FLY_DURATION_MS,
  CARD_TO_TRASH_STAGGER_MS,
  REVEAL_SUMMON_FLIGHT_DURATION_MS,
  TRASH_RECALL_SUMMON_FLIGHT_DURATION_MS,
  REVEAL_PRESENTATION_MS,
}
