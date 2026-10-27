import { FormInput } from '@/components/forms/FormInput'
import { FormSelect } from '@/components/forms/FormSelect'
import { FormTextarea } from '@/components/forms/FormTextarea'
import type { IAdaptiveFormFieldProps } from '@/components/forms/types'

export function AdaptiveFormField({
  id,
  value,
  onValueChange,
  config,
  className = '',
  ariaLabel,
}: IAdaptiveFormFieldProps) {
  if (config.type === 'input') {
    return (
      <FormInput
        {...config.props}
        id={id}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        aria-label={ariaLabel}
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
        ariaLabel={ariaLabel}
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
      aria-label={ariaLabel}
      className={className}
    />
  )
}
