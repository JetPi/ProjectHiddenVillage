import type {
  ComponentProps,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  PropsWithChildren,
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

export type IFormSelectOption = {
  value: string
  label: string
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
}

export type ISelectChoice = {
  value: string
  label: string
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
