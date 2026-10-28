import { useLayoutEffect, useState } from 'react'
import {
  GAME_CHAT_PANEL_CLEARANCE_PX,
  GAME_CHAT_PANEL_GAP_PX,
  GAME_CHAT_PANEL_WIDTH_PX,
} from '@/views/game/utils/contants'

const GAME_BOARD_SELECTOR = '[data-game-board]'

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

  const panelLeft = window.innerWidth - GAME_CHAT_PANEL_GAP_PX - GAME_CHAT_PANEL_WIDTH_PX

  return boardRect.right + GAME_CHAT_PANEL_CLEARANCE_PX <= panelLeft
}

/**
 * Whether the docked chat strip would clear the board.
 *
 * The strip is fixed to the viewport's right edge while the board is centred, so the answer is geometric rather than
 * a breakpoint: on a viewport that cannot give the strip its own margin it would hang over the zones, and hiding it
 * behind the sidebar's button is the only honest option. Measured, and re-measured on a resize or a board resize.
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
