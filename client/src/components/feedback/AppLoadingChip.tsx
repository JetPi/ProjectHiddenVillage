import { useTranslation } from 'react-i18next'

export function AppLoadingChip() {
  const { t } = useTranslation()

  return (
    <div className="app-loader-chip">
      <span className="app-loader-dot" />
      <span>{t('components.feedback.loading')}</span>
    </div>
  )
}
