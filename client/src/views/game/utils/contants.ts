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

const GAMEBOARD_MAX_WIDTH_CLASS = 'max-w-[1050px]'
const GAMEBOARD_COLUMNS_CLASS = 'lg:grid-cols-[1.1fr_1.7fr_1.1fr]'
const LEADER_CARD_FRAME_CLASS = 'relative h-full overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[10px]'
const LEADER_CARD_IMAGE_CLASS = CARD_ART_IMAGE_CLASS

// The right-hand HUD panels share one vertical budget.
//
// The support chain owns the top-right corner and the action log sits underneath it, so the log's top offset is
// derived from the chain's maximum height rather than guessed: if the two drifted apart, a long chain would either
// be clipped or start overlapping the log. Five single-line rows is the budget the chain is allowed to grow to
// before its list starts scrolling; rows with targets or negate notes are taller, which is why the cap is a pixel
// budget rather than a row count.
const SUPPORT_CHAIN_VISIBLE_ROW_COUNT = 5
const SUPPORT_CHAIN_TOP_REM = 0.5
const SUPPORT_CHAIN_LIST_MAX_HEIGHT_REM = 8.5
// Heading, count badge, the LIFO note, the panel's own padding and the gaps between them.
const SUPPORT_CHAIN_CHROME_HEIGHT_REM = 3.5
const SUPPORT_CHAIN_PANEL_MAX_HEIGHT_REM = SUPPORT_CHAIN_LIST_MAX_HEIGHT_REM + SUPPORT_CHAIN_CHROME_HEIGHT_REM
const HUD_PANEL_WIDTH_CLASS = 'w-[252px] max-w-[46vw]'
const ACTION_LOG_COMPACT_TOP_REM = SUPPORT_CHAIN_TOP_REM + SUPPORT_CHAIN_PANEL_MAX_HEIGHT_REM + 0.5
// Below this the compact log would be a sliver; it collapses to scrolling inside a floor instead.
const ACTION_LOG_COMPACT_MIN_HEIGHT_REM = 7
const ACTION_LOG_COMPACT_BOTTOM_REM = 0.5

// The chat is a strip in the bottom-right corner, about the height of the hand row, not a column.
//
// It only docks there while it would clear the board: the panel is fixed and the board is centred, so on a viewport
// that cannot give the strip its own margin the panel would hang over the zones. There it hides behind the
// sidebar's chat button instead. While the chat is docked the action log stops above it, so the two HUD panels
// never overlap.
const GAME_CHAT_PANEL_WIDTH_PX = 252
const GAME_CHAT_PANEL_GAP_PX = 8
const GAME_CHAT_PANEL_CLEARANCE_PX = 8
const GAME_CHAT_PANEL_HEIGHT_REM = 9
const GAME_CHAT_COLUMN_GAP_REM = 0.5
const ACTION_LOG_COMPACT_BOTTOM_WITH_CHAT_REM = GAME_CHAT_PANEL_HEIGHT_REM + (2 * GAME_CHAT_COLUMN_GAP_REM)

export {
  GAME_CARD_PRELOAD_POLL_INTERVAL_MS,
  GAMEBOARD_MAX_WIDTH_CLASS,
  GAMEBOARD_COLUMNS_CLASS,
  LEADER_CARD_FRAME_CLASS,
  LEADER_CARD_IMAGE_CLASS,
  SUPPORT_CHAIN_VISIBLE_ROW_COUNT,
  SUPPORT_CHAIN_TOP_REM,
  SUPPORT_CHAIN_LIST_MAX_HEIGHT_REM,
  SUPPORT_CHAIN_PANEL_MAX_HEIGHT_REM,
  HUD_PANEL_WIDTH_CLASS,
  ACTION_LOG_COMPACT_TOP_REM,
  ACTION_LOG_COMPACT_MIN_HEIGHT_REM,
  ACTION_LOG_COMPACT_BOTTOM_REM,
  ACTION_LOG_COMPACT_BOTTOM_WITH_CHAT_REM,
  GAME_CHAT_PANEL_WIDTH_PX,
  GAME_CHAT_PANEL_GAP_PX,
  GAME_CHAT_PANEL_CLEARANCE_PX,
  GAME_CHAT_PANEL_HEIGHT_REM,
  GAME_CHAT_COLUMN_GAP_REM,
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