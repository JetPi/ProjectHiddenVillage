import { CARD_ART_IMAGE_CLASS } from '@/components/ui/cards'
import {
  DRAW_TO_HAND_REVEAL_DELAY_MS,
  DRAW_TO_HAND_STAGGER_MS,
  HAND_TO_PILE_DURATION_MS,
  HAND_TO_PILE_STAGGER_MS,
  REVEAL_PRESENTATION_MS,
} from '@/views/game/animation/tuning'

const GAME_CARD_PRELOAD_POLL_INTERVAL_MS = 6_000

const ATTACK_ARROW_COLOR = 'rgba(251, 146, 60, 0.98)'
const ATTACK_ARROW_STROKE_WIDTH_PX = 4.5
const ATTACK_ARROW_HEAD_LENGTH_PX = 2.25 * ATTACK_ARROW_STROKE_WIDTH_PX
const ATTACK_LINK_DASH_LENGTH_PX = 12
const ATTACK_LINK_DASH_GAP_PX = 10
const ATTACK_ARROW_HEAD_PATH = 'M 0 0 L 1 0.5 L 0 1 L 0.25 0.5 z'
const ATTACK_ARROW_LINE_FILTER = 'drop-shadow(0 0 1px rgba(0, 0, 0, 0.9)) drop-shadow(0 0 5px rgba(0, 0, 0, 0.42))'

// The board's width ladder and the unit every fixed size on the board is derived from live in `index.css` under
// `[data-game-surface]`; this class is only the hook into it, so a 1050px laptop window and a 4K panel share one
// declaration instead of two ladders that can drift apart.
const GAMEBOARD_MAX_WIDTH_CLASS = 'max-w-[var(--gameboard-max-width)]'
const GAMEBOARD_COLUMNS_CLASS = 'lg:grid-cols-[1.1fr_1.7fr_1.1fr]'
const LEADER_CARD_FRAME_CLASS = 'relative h-full overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[length:var(--game-font-sm)]'
const LEADER_CARD_IMAGE_CLASS = CARD_ART_IMAGE_CLASS

// The right-hand HUD panels share one vertical budget.
//
// The support chain owns the top-right corner and the action log sits underneath it, so the log's top offset is
// derived from the chain's maximum height rather than guessed: if the two drifted apart, a long chain would either
// be clipped or start overlapping the log. Five single-line rows is the budget the chain is allowed to grow to
// before its list starts scrolling; rows with targets or negate notes are taller, which is why the cap is a pixel
// budget rather than a row count.
//
// The budget itself is expressed as custom properties in `index.css` (`--game-support-chain-*` and
// `--game-action-log-*`) so it grows with the board's unit. These strings are the handles the panels pass straight
// into inline styles; a raw `rem` number here would stop scaling while the panels around it grew.
const SUPPORT_CHAIN_VISIBLE_ROW_COUNT = 5
const SUPPORT_CHAIN_TOP_CSS = 'var(--game-support-chain-top)'
const SUPPORT_CHAIN_LIST_MAX_HEIGHT_CSS = 'var(--game-support-chain-list-max-height)'
const HUD_PANEL_WIDTH_CLASS = 'w-[var(--game-hud-width)] max-w-[46vw]'
const ACTION_LOG_COMPACT_TOP_CSS = 'var(--game-action-log-top)'
// Below this the compact log would be a sliver; it collapses to scrolling inside a floor instead.
const ACTION_LOG_COMPACT_MIN_HEIGHT_CSS = 'var(--game-action-log-min-height)'
const ACTION_LOG_COMPACT_BOTTOM_CSS = 'var(--game-action-log-bottom)'
// While the chat is docked the action log stops above it, so the two HUD panels never overlap.
const ACTION_LOG_COMPACT_BOTTOM_WITH_CHAT_CSS = 'var(--game-action-log-bottom-with-chat)'

// The chat is a strip in the bottom-right corner, about the height of the hand row, not a column.
//
// It only docks there while it would clear the board: the panel is fixed and the board is centred, so on a viewport
// that cannot give the strip its own margin the panel would hang over the zones. There it hides behind the
// sidebar's chat button instead. Above 1600px the surface reserves this width as a gutter, so the docked panel
// always has room; below it the measurement in `useHasRoomForChatColumn` decides, which is why the width is still
// expressed as a number here. The value mirrors the `--game-hud-width` floor.
const GAME_CHAT_PANEL_WIDTH_PX = 252
const GAME_CHAT_PANEL_GAP_PX = 8
const GAME_CHAT_PANEL_CLEARANCE_PX = 8
const GAME_CHAT_HEIGHT_CSS = 'var(--game-chat-height)'
const GAME_CHAT_BOTTOM_CSS = 'var(--game-chat-bottom)'

export {
  GAME_CARD_PRELOAD_POLL_INTERVAL_MS,
  GAMEBOARD_MAX_WIDTH_CLASS,
  GAMEBOARD_COLUMNS_CLASS,
  LEADER_CARD_FRAME_CLASS,
  LEADER_CARD_IMAGE_CLASS,
  SUPPORT_CHAIN_VISIBLE_ROW_COUNT,
  SUPPORT_CHAIN_TOP_CSS,
  SUPPORT_CHAIN_LIST_MAX_HEIGHT_CSS,
  HUD_PANEL_WIDTH_CLASS,
  ACTION_LOG_COMPACT_TOP_CSS,
  ACTION_LOG_COMPACT_MIN_HEIGHT_CSS,
  ACTION_LOG_COMPACT_BOTTOM_CSS,
  ACTION_LOG_COMPACT_BOTTOM_WITH_CHAT_CSS,
  GAME_CHAT_PANEL_WIDTH_PX,
  GAME_CHAT_PANEL_GAP_PX,
  GAME_CHAT_PANEL_CLEARANCE_PX,
  GAME_CHAT_HEIGHT_CSS,
  GAME_CHAT_BOTTOM_CSS,
  DRAW_TO_HAND_STAGGER_MS,
  DRAW_TO_HAND_REVEAL_DELAY_MS,
  HAND_TO_PILE_STAGGER_MS,
  HAND_TO_PILE_DURATION_MS,
  REVEAL_PRESENTATION_MS,
  ATTACK_ARROW_COLOR,
  ATTACK_ARROW_STROKE_WIDTH_PX,
  ATTACK_ARROW_HEAD_LENGTH_PX,
  ATTACK_ARROW_HEAD_PATH,
  ATTACK_LINK_DASH_LENGTH_PX,
  ATTACK_LINK_DASH_GAP_PX,
  ATTACK_ARROW_LINE_FILTER,
}