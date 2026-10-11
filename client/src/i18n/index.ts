import i18n from 'i18next'
import type { TFunction } from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '@/i18n/en.json'

/**
 * Translation resources are bundled synchronously (no HTTP backend, no lazy
 * namespaces) and `initImmediate` is disabled so the very first render already
 * has English copy. This keeps server-rendered/test-asserted text stable.
 */
export const defaultNS = 'translation'

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
  },
  lng: 'en',
  fallbackLng: 'en',
  defaultNS,
  initAsync: false,
  interpolation: {
    // React already escapes interpolated values.
    escapeValue: false,
  },
  returnNull: false,
})

/**
 * Translate a runtime-composed key (option/enum maps) while keeping every other
 * `t()` call compile-time checked against `en.json`.
 */
export function translateKey(
  t: TFunction,
  key: string,
  options?: Record<string, unknown>,
): string {
  const looseTranslate = t as unknown as (
    translationKey: string,
    translationOptions?: Record<string, unknown>,
  ) => string

  return looseTranslate(key, options)
}

export default i18n
