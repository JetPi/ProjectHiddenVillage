import type { PropsWithChildren, ReactNode } from 'react'

export type IAppToastTone = 'success' | 'info'

export type IAppToastPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

export type IAppToastOptions = {
  id?: string
  duration?: number
  position?: IAppToastPosition
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
