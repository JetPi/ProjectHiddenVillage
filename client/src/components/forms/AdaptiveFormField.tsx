import { FormInput } from './FormInput'
import { FormSelect } from './FormSelect'
import { FormTextarea } from './FormTextarea'
import type { IAdaptiveFormFieldProps } from './types'

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
