import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import './index.css'
import { AppRouter } from './app/AppRouter'
import { ErrorBoundary } from './components/feedback/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppRouter />
      <Toaster position="bottom-right" richColors closeButton style={{ zIndex: 9999 }} />
    </ErrorBoundary>
  </StrictMode>,
)
