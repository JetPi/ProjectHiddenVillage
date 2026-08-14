import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { router } from './routes'
import { preloadFixedCards } from '../services/cardPreloadService'

export function AppRouter() {
  useEffect(() => {
    void preloadFixedCards()
  }, [])

  return <RouterProvider router={router} />
}
