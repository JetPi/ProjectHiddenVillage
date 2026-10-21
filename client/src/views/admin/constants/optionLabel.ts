import type { TFunction } from 'i18next'
import { translateKey } from '@/i18n'

export function optionLabel(
  t: TFunction,
  labelKeys: Readonly<Record<string, string>>,
  value: string,
): string {
  const key = labelKeys[value]
  return key ? translateKey(t, key) : value
}
