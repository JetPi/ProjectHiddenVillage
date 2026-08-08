import { useLayoutEffect, useRef } from 'react'

type IUseAlignedSplitOptions = {
  splitStartVar?: string
  splitEndVar?: string
  halfBandPercent?: number
}

export function useAlignedSplit(
  options: IUseAlignedSplitOptions = {},
) {
  const {
    splitStartVar = '--turn-split-start',
    splitEndVar = '--turn-split-end',
    halfBandPercent = 0.5,
  } = options

  const outerRef = useRef<HTMLDivElement | null>(null)
  const innerRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const outerEl = outerRef.current
    const innerEl = innerRef.current

    if (!outerEl || !innerEl) {
      return
    }

    const updateSplitAlignment = () => {
      const outerRect = outerEl.getBoundingClientRect()
      const innerRect = innerEl.getBoundingClientRect()

      if (outerRect.height <= 0) {
        return
      }

      const centerOffset = innerRect.top - outerRect.top + innerRect.height / 2
      const centerPct = Math.max(0, Math.min(100, (centerOffset / outerRect.height) * 100))

      outerEl.style.setProperty(splitStartVar, `${Math.max(0, centerPct - halfBandPercent)}%`)
      outerEl.style.setProperty(splitEndVar, `${Math.min(100, centerPct + halfBandPercent)}%`)
    }

    updateSplitAlignment()

    const resizeObserver = new ResizeObserver(() => {
      updateSplitAlignment()
    })

    resizeObserver.observe(outerEl)
    resizeObserver.observe(innerEl)

    return () => {
      resizeObserver.disconnect()
    }
  }, [halfBandPercent, splitEndVar, splitStartVar])

  return { outerRef, innerRef }
}
