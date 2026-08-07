import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import './index.css'
import { AppRouter } from './app/AppRouter'
import { ErrorBoundary } from './components/feedback/ErrorBoundary'
import { appQueryClient } from './services/queryClient'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={appQueryClient}>
      <ErrorBoundary>
        <AppRouter />
        <Toaster position="bottom-right" richColors closeButton style={{ zIndex: 9999 }} />
      </ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>,
)
