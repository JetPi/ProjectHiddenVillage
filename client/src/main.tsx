import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import './index.css'
import '@/i18n'
import { AppRouter } from '@/app/AppRouter'
import { ErrorBoundary } from '@/components/feedback/ErrorBoundary'
import { AuthNoticeToaster } from '@/components/feedback/AuthNoticeToaster'
import { PresenceProvider } from '@/services/presence/PresenceProvider'
import { appQueryClient } from '@/services/queryClient'

const BOOT_LOADER_FADE_MS = 420

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={appQueryClient}>
      <ErrorBoundary>
        <PresenceProvider>
          <AppRouter />
        </PresenceProvider>
        {/* Above the router so a notice published by an action is shown no matter which route is mounted. */}
        <AuthNoticeToaster />
        <Toaster position="bottom-right" richColors closeButton style={{ zIndex: 9999 }} />
      </ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>,
)

const bootLoaderElement = document.getElementById('app-boot-loader')

if (bootLoaderElement) {
  window.requestAnimationFrame(() => {
    bootLoaderElement.classList.add('is-hidden')

    window.setTimeout(() => {
      bootLoaderElement.remove()
    }, BOOT_LOADER_FADE_MS)
  })
}
