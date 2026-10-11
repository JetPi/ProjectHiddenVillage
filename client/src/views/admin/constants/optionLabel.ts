import type { TFunction } from 'i18next'
import { translateKey } from '@/i18n'

/**
 * Resolve a server-bound option `value` to its displayed label without ever
 * touching the value itself. The value stays byte-identical (it is what gets
 * submitted / matched against the server enums); only the label is translated.
 */
export function optionLabel(
  t: TFunction,
  labelKeys: Readonly<Record<string, string>>,
  value: string,
): string {
  const key = labelKeys[value]
  return key ? translateKey(t, key) : value
}
