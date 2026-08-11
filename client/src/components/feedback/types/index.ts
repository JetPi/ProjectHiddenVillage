import type { PropsWithChildren, ReactNode } from 'react'

export type IAppToastTone = 'success' | 'info'

export type IAppToastOptions = {
  id?: string
  duration?: number
}

export type IAppToastProps = {
  tone: IAppToastTone
  message: string
  onClose: () => void
}

export type IErrorBoundaryProps = PropsWithChildren<{
  fallback?: ReactNode
}>

export type IErrorBoundaryState = {
  hasError: boolean
  errorMessage: string
}
