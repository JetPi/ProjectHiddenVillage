import { useCallback } from 'react'
import { CARD_FLIGHT_LAYER_TESTID, setCardFlightLayerElement } from './cardFlightLayerMount'

/**
 * The one surface every card flight renders into.
 *
 * It is a single absolutely-positioned, `pointer-events: none` box at the board root: flights append an
 * overlay copy here instead of mutating the real card's `transform`/`z-index` or un-clipping its layout
 * ancestors, so nothing fights React's re-render and the board never reflows mid-animation.
 *
 * Positioning is inline on purpose: `.game-board-spill > *` in `index.css` forces `position: relative` on
 * every direct child of the board (unlayered CSS beats Tailwind's utilities layer), which would make this
 * layer a grid item and feed its size back into the board's grid.
 */

const CARD_FLIGHT_LAYER_Z_INDEX = 300

function CardFlightLayer() {
  const attachRef = useCallback((node: HTMLDivElement | null) => {
    setCardFlightLayerElement(node)
  }, [])

  return (
    <div
      ref={attachRef}
      data-testid={CARD_FLIGHT_LAYER_TESTID}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'visible',
        zIndex: CARD_FLIGHT_LAYER_Z_INDEX,
      }}
    />
  )
}

export { CardFlightLayer }
