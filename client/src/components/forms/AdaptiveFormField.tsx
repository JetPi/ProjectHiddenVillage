import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { FormInput } from './FormInput'
import { FormSelect } from './FormSelect'
import { FormTextarea } from './FormTextarea'

type ISelectChoice = {
  value: string
  label: string
}

type IAdaptiveInputConfig = {
  type: 'input'
  props?: Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'value' | 'onChange'>
}

type IAdaptiveSelectConfig = {
  type: 'select'
  choices: readonly ISelectChoice[]
  props?: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'value' | 'onChange'>
}

type IAdaptiveTextareaConfig = {
  type: 'textarea'
  props?: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'value' | 'onChange'>
}

export type IAdaptiveFieldConfig = IAdaptiveInputConfig | IAdaptiveSelectConfig | IAdaptiveTextareaConfig

type IAdaptiveFormFieldProps = {
  id: string
  value: string
  onValueChange: (value: string) => void
  config: IAdaptiveFieldConfig
  className?: string
}

export function AdaptiveFormField({
  id,
  value,
  onValueChange,
  config,
  className = '',
}: IAdaptiveFormFieldProps) {
  if (config.type === 'input') {
    return (
      <FormInput
        {...config.props}
        id={id}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className={className}
      />
    )
  }

  if (config.type === 'select') {
    return (
      <FormSelect
        id={id}
        value={value}
        options={config.choices}
        onValueChange={onValueChange}
        name={config.props?.name}
        disabled={config.props?.disabled}
        className={className}
      />
    )
  }

  return (
    <FormTextarea
      {...config.props}
      id={id}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      className={className}
    />
  )
}
