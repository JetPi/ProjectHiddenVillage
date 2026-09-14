import { CARD_ART_IMAGE_CLASS } from '@/components/ui/cards'

const GAME_CARD_PRELOAD_POLL_INTERVAL_MS = 6_000
const DRAW_TO_HAND_STAGGER_MS = 70
const DRAW_TO_HAND_REVEAL_DELAY_MS = 220
const HAND_TO_PILE_STAGGER_MS = 60
const HAND_TO_PILE_DURATION_MS = 340

const ATTACK_ARROW_COLOR = 'rgba(251, 146, 60, 0.98)'
const ATTACK_ARROW_STROKE_WIDTH_PX = 4.5
const ATTACK_ARROW_HEAD_SIZE_SCALE = 2.25
// react-xarrows scales its unit head shape by headSize * strokeWidth.
const ATTACK_ARROW_HEAD_LENGTH_PX = ATTACK_ARROW_HEAD_SIZE_SCALE * ATTACK_ARROW_STROKE_WIDTH_PX
const ATTACK_ARROW_HEAD_PATH = 'M 0 0 L 1 0.5 L 0 1 L 0.25 0.5 z'
// Shared by the dashed tail and the custom arrowhead so both carry the same dark glow.
const ATTACK_ARROW_LINE_FILTER = 'drop-shadow(0 0 1px rgba(0, 0, 0, 0.9)) drop-shadow(0 0 5px rgba(0, 0, 0, 0.42))'

const GAMEBOARD_MAX_WIDTH_CLASS = 'max-w-[1050px]'
const GAMEBOARD_COLUMNS_CLASS = 'lg:grid-cols-[1.1fr_1.7fr_1.1fr]'
const LEADER_CARD_FRAME_CLASS = 'relative h-full overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[10px]'
const LEADER_CARD_IMAGE_CLASS = CARD_ART_IMAGE_CLASS

export {
  GAME_CARD_PRELOAD_POLL_INTERVAL_MS,
  GAMEBOARD_MAX_WIDTH_CLASS,
  GAMEBOARD_COLUMNS_CLASS,
  LEADER_CARD_FRAME_CLASS,
  LEADER_CARD_IMAGE_CLASS,
  DRAW_TO_HAND_STAGGER_MS,
  DRAW_TO_HAND_REVEAL_DELAY_MS,
  HAND_TO_PILE_STAGGER_MS,
  HAND_TO_PILE_DURATION_MS,
  ATTACK_ARROW_COLOR,
  ATTACK_ARROW_STROKE_WIDTH_PX,
  ATTACK_ARROW_HEAD_SIZE_SCALE,
  ATTACK_ARROW_HEAD_LENGTH_PX,
  ATTACK_ARROW_HEAD_PATH,
  ATTACK_ARROW_LINE_FILTER,
}