import i18n from 'i18next'
import type { TFunction } from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '@/i18n/en.json'

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
    escapeValue: false,
  },
  returnNull: false,
})

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

// i18next binds its resources once, at init. A hot update of `en.json` would otherwise replace the module without
// re-initialising the instance, so the components picked up the new copy while the keys still rendered raw until a
// manual reload. Accepting the update as a reload is what makes a text edit land in `npm run dev`.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload()
  })
}

export default i18n
