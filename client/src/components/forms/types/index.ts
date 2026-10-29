import type {
  ComponentProps,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  PropsWithChildren,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { Form as RouterForm } from 'react-router-dom'

export type IToggleOption<T extends string> = {
  value: T
  label: string
  disabled?: boolean
}

export type IOptionToggleProps<T extends string> = {
  value: T
  options: readonly IToggleOption<T>[]
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
  optionClassName?: string
} &
  Omit<HTMLAttributes<HTMLDivElement>, 'onChange'>

/**
 * A per-row action, e.g. the X that deletes a saved deck. It renders as its own button beside the option rather than
 * inside it: an interactive control nested in the option button would both be invalid markup and select the row on
 * the way to the action.
 */
export type IFormSelectAction = {
  label: string
  onActivate: () => void
  icon?: ReactNode
}

export type IFormSelectOption = {
  value: string
  label: string
  /** Rendered at the far right of the row and of the collapsed control, e.g. a queue-depth badge. */
  trailing?: ReactNode
  action?: IFormSelectAction
  disabled?: boolean
}

export type IFormSelectProps = {
  id: string
  value: string
  options: readonly IFormSelectOption[]
  onValueChange: (value: string) => void
  name?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Names the control for assistive tech when the form omits a visible label. */
  ariaLabel?: string
}

export type ISelectChoice = {
  value: string
  label: string
  trailing?: ReactNode
  action?: IFormSelectAction
}

export type IAdaptiveInputConfig = {
  type: 'input'
  props?: Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'value' | 'onChange'>
}

export type IAdaptiveSelectConfig = {
  type: 'select'
  choices: readonly ISelectChoice[]
  props?: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'value' | 'onChange'>
}

export type IAdaptiveTextareaConfig = {
  type: 'textarea'
  props?: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'value' | 'onChange'>
}

export type IAdaptiveFieldConfig = IAdaptiveInputConfig | IAdaptiveSelectConfig | IAdaptiveTextareaConfig

export type IAdaptiveFormFieldProps = {
  id: string
  value: string
  onValueChange: (value: string) => void
  config: IAdaptiveFieldConfig
  className?: string
  /** Names the control for assistive tech when the form omits a visible label. */
  ariaLabel?: string
}

export type IFormTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export type IFormLabelProps = PropsWithChildren<LabelHTMLAttributes<HTMLLabelElement>>

export type IFormInputProps = InputHTMLAttributes<HTMLInputElement>

export type IFormProps = PropsWithChildren<ComponentProps<typeof RouterForm>>

export type IFormHelperTextProps = PropsWithChildren<HTMLAttributes<HTMLParagraphElement>>

export type IFormFieldProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>>

export type IFormErrorTextProps = PropsWithChildren<HTMLAttributes<HTMLParagraphElement>>

export type IFormCheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

export type IFormCheckboxFieldProps = PropsWithChildren<{
  className?: string
  labelClassName?: string
  label: string
}> &
  IFormCheckboxProps

export type IFormActionsProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>>
