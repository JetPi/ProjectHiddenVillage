import type { PropsWithChildren } from 'react'

type PanelProps = PropsWithChildren<{
  className?: string
}>

export function Panel({ className = '', children }: PanelProps) {
  return (
    <section
      className={`rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 shadow-[var(--panel-shadow)] backdrop-blur-sm transition-colors duration-300 ${className}`.trim()}
    >
      {children}
    </section>
  )
}
