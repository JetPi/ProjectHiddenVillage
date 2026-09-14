import { useLayoutEffect, useMemo, useRef, useState } from "react";
import Xarrow from "react-xarrows";
import type {
  IAttackLinkGeometry,
  IAttackLinkHeadConfig,
  IAttackLinkRenderConfig,
} from "@/views/game/types";
import {
  ATTACK_ARROW_COLOR,
  ATTACK_ARROW_HEAD_LENGTH_PX,
  ATTACK_ARROW_HEAD_PATH,
  ATTACK_ARROW_HEAD_SIZE_SCALE,
  ATTACK_ARROW_LINE_FILTER,
  ATTACK_ARROW_STROKE_WIDTH_PX,
} from "@/views/game/utils/contants";
import {
  buildFallbackAttackLinkGeometry,
  resolveAttackLinkGeometry,
} from "@/views/game/utils/functions";

interface AttackLinkArrowProps {
  config: IAttackLinkRenderConfig;
}

const ATTACK_LINK_OVERLAY_Z_INDEX = 50
const ATTACK_LINK_HEAD_Z_INDEX = 51
// Layout keeps moving without React re-rendering (the attacker rests on declaration, and that tilt is a
// CSS transition), so the geometry is re-sampled for a short window after each change instead of once.
const ATTACK_LINK_SETTLE_FRAMES = 30
// react-xarrows re-runs a layout effect (which setStates) for every prop whose *identity* changes, so the
// object props below must be referentially stable across our re-renders - inline literals here are what
// drove React into "Maximum update depth exceeded" while the geometry re-samples.
//
// The overlay container must also be absolutely positioned *inline*: `.game-board-spill > *` in
// `index.css` forces `position: relative` on every direct child of the board (unlayered CSS beats
// Tailwind's utilities layer), which makes the overlay a grid item - its size then feeds back into the
// board's grid, moving the very cards the arrow is measuring.
const ATTACK_LINK_OVERLAY_CONTAINER_PROPS = {
  id: 'attack-link-overlay',
  style: {
    position: 'absolute' as const,
    inset: 0,
    pointerEvents: 'none' as const,
  },
}
const ATTACK_LINK_DASHNESS = { strokeLen: 12, nonStrokeLen: 10 }
const ATTACK_LINK_ARROW_HEAD_PROPS = {
  stroke: 'rgba(0, 0, 0, 0.24)',
  strokeWidth: 0.16,
  strokeLinejoin: 'round' as const,
  paintOrder: 'stroke fill',
  style: { filter: ATTACK_ARROW_LINE_FILTER },
}
const ATTACK_LINK_TAIL_PROPS = {
  style: {
    pointerEvents: 'none' as const,
    strokeLinecap: 'butt' as const,
    strokeLinejoin: 'miter' as const,
    filter: ATTACK_ARROW_LINE_FILTER,
  },
}

// The head is derived from the dashed tail react-xarrows actually drew, so it can never drift away from
// the line or from the cards:
//   - its tip is the tail's end point, which also covers the dash pattern's final `nonStrokeLen` gap
//     (a head placed at the anchor reads as detached from the dashes);
//   - its rotation follows the tail's end direction (sampled over the last head length), so head and
//     dashes read as one continuous arrow instead of a kink at the joint.
// Coordinates are board-local, because the game board box is the head's offset parent.
function measureAttackLinkHead(): IAttackLinkHeadConfig | null {
  const path = document.querySelector<SVGPathElement>('#attack-link-overlay svg path[stroke]')
  const board = document.querySelector<HTMLElement>('[data-testid="game-board"]')
  const svg = path?.ownerSVGElement
  if (!path || !board || !svg) return null

  const total = path.getTotalLength()
  if (!(total > 0)) return null

  const headLengthPx = ATTACK_ARROW_HEAD_LENGTH_PX
  const tip = path.getPointAtLength(total)
  const behind = path.getPointAtLength(Math.max(0, total - Math.min(headLengthPx, total)))
  const directionX = tip.x - behind.x
  const directionY = tip.y - behind.y
  const directionLength = Math.hypot(directionX, directionY)
  if (directionLength < 0.001) return null

  const directionXUnit = directionX / directionLength
  const directionYUnit = directionY / directionLength
  const svgRect = svg.getBoundingClientRect()
  const boardRect = board.getBoundingClientRect()
  const baseX = svgRect.left + tip.x - directionXUnit * headLengthPx
  const baseY = svgRect.top + tip.y - directionYUnit * headLengthPx

  return {
    x: baseX - boardRect.left,
    y: baseY - boardRect.top,
    rotationDeg: (Math.atan2(directionYUnit, directionXUnit) * 180) / Math.PI,
    sizePx: headLengthPx,
  }
}


function readAnchorSignature(id: string): string {
  const element = document.getElementById(id)
  if (!element) return 'missing'

  const rect = element.getBoundingClientRect()
  return `${rect.left.toFixed(1)},${rect.top.toFixed(1)},${rect.width.toFixed(1)},${rect.height.toFixed(1)}`
}

type IAttackLinkLayoutSample = {
  geometry: IAttackLinkGeometry
  head: IAttackLinkHeadConfig | null
}

// One layout sample. Both halves come from the live DOM rather than from a render-time prediction:
//   - the anchors, so a resting card's tilt is already applied (react-xarrows anchors on the element's
//     bounding box, which a tilted card pushes out to its corner and keeps moving while it transitions);
//   - the head, from the tail react-xarrows drew for those anchors.
// The signature covers the anchor rects, the derived geometry and the head, so any layout change - even
// one with no React re-render - is detected and re-applied.
function sampleAttackLinkLayout(
  config: IAttackLinkRenderConfig,
  fallbackGeometry: IAttackLinkGeometry
) {
  const board = document.querySelector<HTMLElement>('[data-testid="game-board"]')
  const sourceCard = document.getElementById(config.startId)
  const targetCard = document.getElementById(config.endId)
  const geometry = board && sourceCard && targetCard
    ? resolveAttackLinkGeometry(sourceCard, targetCard, board, config.options)
    : fallbackGeometry
  const head = measureAttackLinkHead()
  const headSignature = head
    ? `${head.x.toFixed(1)}|${head.y.toFixed(1)}|${head.rotationDeg.toFixed(1)}`
    : 'none'
  const signature = [
    readAnchorSignature(config.startId),
    readAnchorSignature(config.endId),
    JSON.stringify(geometry.startAnchor),
    JSON.stringify(geometry.endAnchor),
    geometry.curveness,
    geometry.controlPointOffsets ? `${geometry.controlPointOffsets.cpx1}` : 'none',
    headSignature,
  ].join('|')

  return { geometry, head, signature }
}

export const AttackLinkArrow = ({ config }: AttackLinkArrowProps) => {
  const fallbackGeometry = useMemo(
    () => buildFallbackAttackLinkGeometry(config.options),
    [config.options]
  )
  const [sample, setSample] = useState<IAttackLinkLayoutSample | null>(null)
  const measuredSignature = useRef<string | null>(null)
  const headShape = useMemo(
    () => ({ svgElem: <path d={ATTACK_ARROW_HEAD_PATH} />, offsetForward: config.headOffsetForward }),
    [config.headOffsetForward]
  )

  useLayoutEffect(() => {
    let frame = 0
    let settleFrames = ATTACK_LINK_SETTLE_FRAMES

    const run = () => {
      const next = sampleAttackLinkLayout(config, fallbackGeometry)

      if (next.signature !== measuredSignature.current) {
        measuredSignature.current = next.signature
        // The head is never cleared once measured: dropping back to the library's head flips `showHead`,
        // which re-trims the tail path and would make the measurement flip-flop.
        setSample((current) => ({ geometry: next.geometry, head: next.head ?? current?.head ?? null }))
        settleFrames = ATTACK_LINK_SETTLE_FRAMES
      } else {
        settleFrames -= 1
      }

      if (settleFrames > 0) {
        frame = window.requestAnimationFrame(run)
      }
    }

    // Sampled from an animation frame rather than synchronously in the effect: a setState inside a layout
    // effect is a *nested* update, and each of those re-renders react-xarrows, whose own per-prop layout
    // effects setState as well - together enough to trip React's "Maximum update depth exceeded".
    frame = window.requestAnimationFrame(run)

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame)
      }
    }
  })

  const geometry = sample?.geometry ?? fallbackGeometry
  const head = sample?.head ?? null

  return (
    <>
      <Xarrow
        start={config.startId}
        end={config.endId}
        startAnchor={geometry.startAnchor}
        endAnchor={geometry.endAnchor}
        path={geometry.path}
        curveness={geometry.curveness}
        strokeWidth={ATTACK_ARROW_STROKE_WIDTH_PX}
        color={ATTACK_ARROW_COLOR}
        dashness={ATTACK_LINK_DASHNESS}
        headSize={ATTACK_ARROW_HEAD_SIZE_SCALE}
        // The head below is measured from the tail react-xarrows draws; the library's own head derives
        // its rotation from the anchor side (which can point away from the target), so it only stays as
        // the fallback for the frames before the tail can be measured.
        showHead={head === null}
        headShape={headShape}
        arrowHeadProps={ATTACK_LINK_ARROW_HEAD_PROPS}
        zIndex={ATTACK_LINK_OVERLAY_Z_INDEX}
        _extendSVGcanvas={16}
        divContainerProps={ATTACK_LINK_OVERLAY_CONTAINER_PROPS}
        passProps={ATTACK_LINK_TAIL_PROPS}
        _cpx1Offset={geometry.controlPointOffsets?.cpx1 ?? 0}
        _cpx2Offset={geometry.controlPointOffsets?.cpx2 ?? 0}
      />
      {head ? (
        <svg
          aria-hidden="true"
          data-testid="attack-link-head"
          width={head.sizePx}
          height={head.sizePx}
          className="overflow-visible"
          style={{
            // Must be inline: `.game-board-spill > *` forces `position: relative` on every direct child
            // of the board (unlayered CSS beats Tailwind's utilities layer), which would shift the head
            // out of place. Inline `absolute` keeps the board as the containing block, so the head lands
            // exactly on the tail's end.
            position: 'absolute',
            left: head.x,
            top: head.y,
            width: head.sizePx,
            height: head.sizePx,
            zIndex: ATTACK_LINK_HEAD_Z_INDEX,
            pointerEvents: 'none',
            // The glow lives on the <svg> root, not on the inner <g>: a CSS filter on an SVG child is
            // clipped by its (tiny) filter region, so the drop shadows were cut off and the head looked
            // flat next to the glowing dashes.
            filter: ATTACK_ARROW_LINE_FILTER,
          }}
        >
          <g
            // `translate(0 -0.5)` first (SVG applies the rightmost transform first): the head path is a
            // unit shape whose *tip* vertex is (1, 0.5), not (1, 0), so without this the drawn head sits
            // half a head length (~5px) to one side of the arrow's axis - i.e. just below the dashed tail
            // on a horizontal arrow, which reads as "the head is offset from the line".
            transform={`rotate(${head.rotationDeg}) scale(${head.sizePx}) translate(0 -0.5)`}
            fill={ATTACK_ARROW_COLOR}
            stroke="rgba(0, 0, 0, 0.24)"
            strokeWidth={0.16}
            strokeLinejoin="round"
            paintOrder="stroke fill"
          >
            <path d={ATTACK_ARROW_HEAD_PATH} />
          </g>
        </svg>
      ) : null}
    </>
  );
};

