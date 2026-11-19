import { useLayoutEffect, useState } from 'react'
import {
  GAME_CHAT_PANEL_CLEARANCE_PX,
  GAME_CHAT_PANEL_GAP_PX,
  GAME_CHAT_PANEL_WIDTH_PX,
} from '@/views/game/utils/contants'

const GAME_BOARD_SELECTOR = '[data-game-board]'
const GAME_SURFACE_SELECTOR = '[data-game-surface]'

/**
 * The HUD panel's rendered width.
 *
 * `--game-hud-width` grows from 252px to 560px on large screens, so the constant is only the floor: measuring the
 * resolved custom property keeps this check honest when the panel is wider than the number it was written against.
 * The property is registered as `<length>` in `index.css`, which is what makes the computed value a plain pixel
 * length instead of an unresolved `clamp()` token stream.
 */
function readHudPanelWidthPx(): number {
  if (typeof document === 'undefined') {
    return GAME_CHAT_PANEL_WIDTH_PX
  }

  const surface = document.querySelector(GAME_SURFACE_SELECTOR)
  if (!surface) {
    return GAME_CHAT_PANEL_WIDTH_PX
  }

  const resolved = Number.parseFloat(getComputedStyle(surface).getPropertyValue('--game-hud-width'))

  return Number.isFinite(resolved) && resolved > 0 ? resolved : GAME_CHAT_PANEL_WIDTH_PX
}

function readHasRoom(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return true
  }

  const board = document.querySelector(GAME_BOARD_SELECTOR)
  if (!board) {
    return true
  }

  const boardRect = board.getBoundingClientRect()
  if (boardRect.width <= 0) {
    return true
  }

  const panelLeft = window.innerWidth - GAME_CHAT_PANEL_GAP_PX - readHudPanelWidthPx()

  return boardRect.right + GAME_CHAT_PANEL_CLEARANCE_PX <= panelLeft
}

/**
 * Whether the docked chat strip would clear the board.
 *
 * The strip is fixed to the viewport's right edge while the board is centred, so the answer is geometric rather than
 * a breakpoint: on a viewport that cannot give the strip its own margin it would hang over the zones, and hiding it
 * behind the sidebar's button is the only honest option. Measured, and re-measured on a resize or a board resize.
 *
 * Above 1600px the surface reserves `--game-hud-gutter` on its right, which makes this measurement a formality -
 * the gutter is sized from this same width - so the check stays in place as the guard for the smaller viewports
 * where no gutter exists.
 */
export function useHasRoomForChatColumn(): boolean {
  const [hasRoom, setHasRoom] = useState(readHasRoom)

  // Layout phase, not effect phase: the first measurement has to land before the browser paints, otherwise the
  // strip flashes over the board for a frame on a viewport that cannot hold it.
  useLayoutEffect(() => {
    const update = () => setHasRoom(readHasRoom())

    update()
    window.addEventListener('resize', update)

    const board = document.querySelector(GAME_BOARD_SELECTOR)
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null

    if (board && resizeObserver) {
      resizeObserver.observe(board)
    }

    return () => {
      window.removeEventListener('resize', update)
      resizeObserver?.disconnect()
    }
  }, [])

  return hasRoom
}
