export type ICardAdminToggleSwitchProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  ariaLabel: string
  disabled?: boolean
  className?: string
  trackClassName?: string
  thumbClassName?: string
}
