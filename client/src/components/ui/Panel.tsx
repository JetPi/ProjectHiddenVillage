import type { HTMLAttributes, PropsWithChildren } from 'react'

type PanelProps = PropsWithChildren<{
  className?: string
}> &
  HTMLAttributes<HTMLElement>

export function Panel({ className = '', children, ...sectionProps }: PanelProps) {
  return (
    <section
      {...sectionProps}
      className={`rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 shadow-[var(--panel-shadow)] backdrop-blur-sm transition-colors duration-300 ${className}`.trim()}
    >
      {children}
    </section>
  )
}
