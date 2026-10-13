/**
 * The imperative handle to the board's single flight layer.
 *
 * `CardFlightLayer` renders the layer element; the animation helpers (which run outside React's render
 * pass) need to reach that element to append overlay copies, so the mount point lives here in a plain
 * module rather than in the component file (which must export only components for fast refresh).
 */

const CARD_FLIGHT_LAYER_TESTID = 'card-flight-layer'

let flightLayerElement: HTMLDivElement | null = null

function setCardFlightLayerElement(element: HTMLDivElement | null): void {
  flightLayerElement = element
}

/**
 * The live flight layer, or a DOM fallback when the module ref is stale (a remount before the callback
 * ref has run again).
 */
function getCardFlightLayerElement(): HTMLDivElement | null {
  if (flightLayerElement?.isConnected) {
    return flightLayerElement
  }

  return document.querySelector<HTMLDivElement>(`[data-testid="${CARD_FLIGHT_LAYER_TESTID}"]`)
}

export { CARD_FLIGHT_LAYER_TESTID, setCardFlightLayerElement, getCardFlightLayerElement }
