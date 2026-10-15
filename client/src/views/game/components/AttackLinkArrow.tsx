import { useLayoutEffect, useRef, useState } from "react";
import type {
  IAttackLinkCubic,
  IAttackLinkHeadConfig,
  IAttackLinkRenderConfig,
  IBoardPoint,
} from "@/views/game/types";
import {
  ATTACK_ARROW_COLOR,
  ATTACK_ARROW_HEAD_PATH,
  ATTACK_ARROW_LINE_FILTER,
  ATTACK_ARROW_STROKE_WIDTH_PX,
  ATTACK_LINK_DASH_GAP_PX,
  ATTACK_LINK_DASH_LENGTH_PX,
} from "@/views/game/utils/contants";
import {
  resolveAttackLinkCubic,
  resolveAttackLinkGeometry,
  resolveAttackLinkHeadConfig,
  resolveAttackLinkPathData,
} from "@/views/game/utils/functions";

interface AttackLinkArrowProps {
  config: IAttackLinkRenderConfig;
}

// The board's Z ladder, outermost context (the arrow's overlay layer is a direct child of the board, and the
// board is no longer an isolation context - see `.game-board-spill` in `index.css`):
//   0   the board's own background and its dashed outer border
//   10  board chrome (the phase action row)
//   20  the board's two halves: piles, resources, support, battlefield
//   30  the hand rows, which hold the cards that fly over the board
//   35  this arrow - above every card, below every overlay
//   40  transient banners and prompt modals   ·   50-70 card preview / game over   ·   120 route transition
const ATTACK_LINK_OVERLAY_Z_INDEX = 35
const ATTACK_LINK_HEAD_Z_INDEX = 36
// The attacker's rested tilt is a Motion animation on the card's wrapper, so the anchors keep moving for a
// moment after the attack is declared. The geometry is therefore re-sampled over a short window instead of
// once. Samples are taken from an animation frame rather than synchronously in the effect: a setState inside a
// layout effect is a *nested* update, which is what used to drive React into "Maximum update depth exceeded".
const ATTACK_LINK_SETTLE_FRAMES = 30

type IAttackLinkLayoutSample = {
  cubic: IAttackLinkCubic
  head: IAttackLinkHeadConfig
  signature: string
}

function toBoardLocalPoint(point: IBoardPoint, boardRect: DOMRect): IBoardPoint {
  return { x: point.x - boardRect.left, y: point.y - boardRect.top }
}

function readAnchorSignature(element: HTMLElement): string {
  const rect = element.getBoundingClientRect()
  return `${rect.left.toFixed(1)},${rect.top.toFixed(1)},${rect.width.toFixed(1)},${rect.height.toFixed(1)}`
}

/**
 * One layout sample, taken entirely from the live DOM: the board box the overlay is positioned against and the
 * two anchor cards (so a resting card's tilt is already applied). The cubic and the head both come from our own
 * geometry - nothing is measured back out of a rendered path.
 */
function sampleAttackLinkLayout(config: IAttackLinkRenderConfig): IAttackLinkLayoutSample | null {
  const board = document.querySelector<HTMLElement>('[data-testid="game-board"]')
  const sourceCard = document.getElementById(config.startId)
  const targetCard = document.getElementById(config.endId)
  if (!board || !sourceCard || !targetCard) {
    return null
  }

  const boardRect = board.getBoundingClientRect()
  const sourceRect = sourceCard.getBoundingClientRect()
  const targetRect = targetCard.getBoundingClientRect()
  if (sourceRect.width <= 0 || sourceRect.height <= 0 || targetRect.width <= 0 || targetRect.height <= 0) {
    return null
  }

  const geometry = resolveAttackLinkGeometry(sourceCard, targetCard, board, config.options)
  const cubic = resolveAttackLinkCubic(geometry, sourceRect, targetRect)
  const localCubic: IAttackLinkCubic = {
    start: toBoardLocalPoint(cubic.start, boardRect),
    control1: toBoardLocalPoint(cubic.control1, boardRect),
    control2: toBoardLocalPoint(cubic.control2, boardRect),
    end: toBoardLocalPoint(cubic.end, boardRect),
  }
  const head = resolveAttackLinkHeadConfig(localCubic)
  const pathData = resolveAttackLinkPathData(localCubic)

  return {
    cubic: localCubic,
    head,
    signature: [readAnchorSignature(sourceCard), readAnchorSignature(targetCard), pathData].join('|'),
  }
}

export const AttackLinkArrow = ({ config }: AttackLinkArrowProps) => {
  const [sample, setSample] = useState<IAttackLinkLayoutSample | null>(null)
  const measuredSignature = useRef<string | null>(null)

  useLayoutEffect(() => {
    let frame = 0
    let settleFrames = ATTACK_LINK_SETTLE_FRAMES

    const run = () => {
      const next = sampleAttackLinkLayout(config)

      if (next && next.signature !== measuredSignature.current) {
        measuredSignature.current = next.signature
        setSample(next)
        settleFrames = ATTACK_LINK_SETTLE_FRAMES
      } else {
        settleFrames -= 1
      }

      if (settleFrames > 0) {
        frame = window.requestAnimationFrame(run)
      }
    }

    frame = window.requestAnimationFrame(run)

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame)
      }
    }
  })

  const cubic = sample?.cubic ?? null
  const head = sample?.head ?? null

  return (
    <div
      id="attack-link-overlay"
      data-testid="attack-link-overlay"
      aria-hidden="true"
      style={{
        // Must be inline: `.game-board-spill > *` in `index.css` forces `position: relative` on every direct
        // child of the board (unlayered CSS beats Tailwind's utilities layer), which would make this overlay an
        // in-flow grid item whose size feeds back into the board's grid.
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: ATTACK_LINK_OVERLAY_Z_INDEX,
      }}
    >
      {cubic ? (
        <svg
          aria-hidden="true"
          className="overflow-visible"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            overflow: 'visible',
            pointerEvents: 'none',
          }}
        >
          <path
            d={resolveAttackLinkPathData(cubic)}
            fill="none"
            stroke={ATTACK_ARROW_COLOR}
            strokeWidth={ATTACK_ARROW_STROKE_WIDTH_PX}
            strokeDasharray={`${ATTACK_LINK_DASH_LENGTH_PX} ${ATTACK_LINK_DASH_GAP_PX}`}
            strokeLinecap="butt"
            strokeLinejoin="miter"
            style={{ filter: ATTACK_ARROW_LINE_FILTER }}
          />
        </svg>
      ) : null}

      {head ? (
        <svg
          aria-hidden="true"
          data-testid="attack-link-head"
          width={head.sizePx}
          height={head.sizePx}
          className="overflow-visible"
          style={{
            position: 'absolute',
            left: head.x,
            top: head.y,
            width: head.sizePx,
            height: head.sizePx,
            zIndex: ATTACK_LINK_HEAD_Z_INDEX,
            pointerEvents: 'none',
            // The glow lives on the <svg> root, not on the inner <g>: a CSS filter on an SVG child is clipped by
            // its (tiny) filter region, so the drop shadows were cut off and the head looked flat next to the
            // glowing dashes.
            filter: ATTACK_ARROW_LINE_FILTER,
          }}
        >
          <g
            // `translate(0 -0.5)` first (SVG applies the rightmost transform first): the head path is a unit
            // shape whose *tip* vertex is (1, 0.5), not (1, 0), so without this the drawn head sits half a head
            // length to one side of the arrow's axis.
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
    </div>
  )
}
