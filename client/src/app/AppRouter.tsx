import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { router } from '@/app/routes'
import { preloadFixedCards } from '@/services/cardPreloadService'

export function AppRouter() {
  useEffect(() => {
    void preloadFixedCards()
  }, [])

  return <RouterProvider router={router} />
}
