import { useEffect, useState } from 'react'
import { Outlet, useNavigation } from 'react-router-dom'
import { BeatLoader } from 'react-spinners'

const OVERLAY_FADE_OUT_MS = 180

export function RouteTransitionOverlay() {
  const navigation = useNavigation()
  const isNavigationBusy = navigation.state !== 'idle'
  const [isMounted, setIsMounted] = useState(false)
  const [isOpaque, setIsOpaque] = useState(false)

  useEffect(() => {
    if (isNavigationBusy) {
      setIsMounted(true)

      const frameId = window.requestAnimationFrame(() => {
        setIsOpaque(true)
      })

      return () => {
        window.cancelAnimationFrame(frameId)
      }
    }

    setIsOpaque(false)

    const timeoutId = window.setTimeout(() => {
      setIsMounted(false)
    }, OVERLAY_FADE_OUT_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [isNavigationBusy])

  return (
    <>
      <Outlet />
      {isMounted ? (
        <div
          className={`pointer-events-none fixed inset-0 z-[120] bg-black/35 backdrop-blur-[2px] transition-opacity duration-200 ${isOpaque ? 'opacity-100' : 'opacity-0'}`}
          aria-hidden="true"
        >
          <div className="grid h-full place-items-center">
            <div className="flex items-center gap-2.5 rounded-xl border border-white/20 bg-slate-950/70 px-3 py-2 text-[14px] font-semibold tracking-[0.02em] text-white shadow-lg">
              <BeatLoader size={7} margin={1} color="#fb923c" loading />
              <span>Loading...</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
