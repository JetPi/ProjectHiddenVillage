import { memo, useLayoutEffect, useRef, useState } from "react";
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
  resolveAttackLinkDashOffset,
  resolveAttackLinkGeometry,
  resolveAttackLinkHeadConfig,
  resolveAttackLinkPathData,
} from "@/views/game/utils/functions";

interface AttackLinkArrowProps {
  config: IAttackLinkRenderConfig;
}

const ATTACK_LINK_OVERLAY_Z_INDEX = 35
const ATTACK_LINK_HEAD_Z_INDEX = 36
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

function sampleAttackLinkLayout(
  config: IAttackLinkRenderConfig,
  board: HTMLElement,
): IAttackLinkLayoutSample | null {
  const sourceCard = document.getElementById(config.startId)
  const targetCard = document.getElementById(config.endId)
  if (!sourceCard || !targetCard) {
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

export const AttackLinkArrow = memo(function AttackLinkArrow({ config }: AttackLinkArrowProps) {
  const [sample, setSample] = useState<IAttackLinkLayoutSample | null>(null)
  const measuredSignature = useRef<string | null>(null)
  const configRef = useRef(config)

  useLayoutEffect(() => {
    configRef.current = config
  })

  useLayoutEffect(() => {
    let frame = 0
    let settleFrames = ATTACK_LINK_SETTLE_FRAMES
    let isStopped = false

    function run() {
      frame = 0
      if (isStopped) {
        return
      }

      const board = document.querySelector<HTMLElement>('[data-testid="game-board"]')
      const next = board ? sampleAttackLinkLayout(configRef.current, board) : null

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

    const schedule = () => {
      if (!isStopped && frame === 0) {
        frame = window.requestAnimationFrame(run)
      }
    }

    const resample = () => {
      settleFrames = ATTACK_LINK_SETTLE_FRAMES
      schedule()
    }

    schedule()
    window.addEventListener('resize', resample)

    return () => {
      isStopped = true
      window.removeEventListener('resize', resample)
      if (frame) {
        window.cancelAnimationFrame(frame)
      }
      frame = 0
    }
  }, [config])

  const cubic = sample?.cubic ?? null
  const head = sample?.head ?? null

  return (
    <div
      id="attack-link-overlay"
      data-testid="attack-link-overlay"
      aria-hidden="true"
      style={{
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
            strokeDashoffset={resolveAttackLinkDashOffset(cubic)}
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
            filter: ATTACK_ARROW_LINE_FILTER,
          }}
        >
          <g
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
})
