const GAME_CARD_PRELOAD_POLL_INTERVAL_MS = 6_000
const DRAW_TO_HAND_STAGGER_MS = 70
const DRAW_TO_HAND_REVEAL_DELAY_MS = 220
const HAND_TO_PILE_STAGGER_MS = 60
const HAND_TO_PILE_DURATION_MS = 340

const GAMEBOARD_MAX_WIDTH_CLASS = 'max-w-[1100px]'
const GAMEBOARD_COLUMNS_CLASS = 'lg:grid-cols-[1.1fr_1.7fr_1.1fr]'
const LEADER_CARD_FRAME_CLASS = 'relative h-full overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[10px]'
const LEADER_CARD_IMAGE_CLASS = 'h-[102%] w-[102%] -m-[1%] rounded-none object-contain [image-rendering:auto]'

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
}