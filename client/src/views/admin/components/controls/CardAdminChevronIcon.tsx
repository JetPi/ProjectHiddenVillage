import { twMerge } from 'tailwind-merge'

type ICardAdminChevronIconProps = {
  className?: string
  expanded?: boolean
  rotateOnOpen?: boolean
}

export function CardAdminChevronIcon({ className, expanded, rotateOnOpen }: ICardAdminChevronIconProps) {
  const rotationClassName = expanded !== undefined
    ? expanded
      ? 'rotate-180'
      : ''
    : rotateOnOpen
      ? 'transition-transform duration-200 group-open:rotate-180'
      : ''

  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={twMerge('h-4 w-4', rotationClassName, className)}
    >
      <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}