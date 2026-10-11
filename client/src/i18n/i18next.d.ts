import 'i18next'
import type en from '@/i18n/en.json'

/**
 * Makes `t()` keys compile-time checked against the English resource bundle.
 * Adding copy means adding the key to `client/src/i18n/en.json` first.
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: {
      translation: typeof en
    }
  }
}
