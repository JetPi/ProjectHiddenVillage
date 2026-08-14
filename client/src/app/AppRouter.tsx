import { useEffect, useState } from 'react'
import { RouterProvider } from 'react-router-dom'
import { BeatLoader } from 'react-spinners'
import { router } from './routes'
import { preloadFixedCards } from '../services/cardPreloadService'

export function AppRouter() {
  const [isInitialCurtainMounted, setIsInitialCurtainMounted] = useState(true)
  const [isInitialCurtainOpaque, setIsInitialCurtainOpaque] = useState(true)

  useEffect(() => {
    void preloadFixedCards()
  }, [])

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setIsInitialCurtainOpaque(false)
    })

    const timeoutId = window.setTimeout(() => {
      setIsInitialCurtainMounted(false)
    }, 260)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.clearTimeout(timeoutId)
    }
  }, [])

  return (
    <>
      <RouterProvider router={router} />
      {isInitialCurtainMounted ? (
        <div
          className={`pointer-events-none fixed inset-0 z-[130] grid place-items-center bg-[#05070c] text-white transition-opacity duration-200 ${
            isInitialCurtainOpaque ? 'opacity-100' : 'opacity-0'
          }`}
          aria-hidden="true"
        >
          <div className="flex items-center gap-2.5 rounded-xl border border-white/20 bg-slate-950/70 px-3 py-2 text-[14px] font-semibold tracking-[0.02em] shadow-lg">
            <BeatLoader size={7} margin={1} color="#fb923c" loading />
            <span>Loading...</span>
          </div>
        </div>
      ) : null}
    </>
  )
}
