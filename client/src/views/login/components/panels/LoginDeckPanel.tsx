import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui'
import { AdaptiveFormField, FormField, OptionToggle } from '@/components/forms'
import type { ILoginDeckPanelProps } from '@/views/login/types/panels'

export function LoginDeckPanel({
  deckOptionsMode,
  deckOptionsModeOptions,
  onDeckOptionsModeChange,
  deckOptionValue,
  deckFieldConfig,
  onDeckOptionChange,
  showStarterDeckRetry,
  onRetryStarterDecks,
  showGuestSavedDeckHint,
  onOpenImportDialog,
  hasImportError,
  summaryDeckName,
  summaryEvaluation,
  isCheckingSummary,
  summaryRecordLabel,
  className = '',
}: ILoginDeckPanelProps) {
  const { t } = useTranslation()

  return (
    <FormField className={className}>
      <OptionToggle
        ariaLabel={t('auth.deckOptionsModeAria')}
        value={deckOptionsMode}
        options={deckOptionsModeOptions}
        optionClassName="py-1"
        onChange={onDeckOptionsModeChange}
      />
      {showStarterDeckRetry ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onRetryStarterDecks}
            className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] opacity-[0.45] transition-opacity hover:opacity-75 sm:px-0.5 sm:py-0.5 sm:text-[8px]"
          >
            {t('auth.retry')}
          </button>
        </div>
      ) : null}
      {showGuestSavedDeckHint ? (
        <p className="text-[11px] leading-4 text-[var(--text-muted)]">
          {t('auth.deckChoice.guestSavedDecksHint')}
        </p>
      ) : null}
      {deckOptionsMode === 'import' ? (
        <>
          <AppButton
            type="button"
            variant="ghost"
            onClick={onOpenImportDialog}
            className="w-full justify-center py-1.5"
          >
            {t('auth.importDeckButton')}
          </AppButton>
          {hasImportError ? (
            <p
              role="alert"
              data-testid="login-deck-invalid-value"
              className="truncate text-xs font-medium leading-5 text-[var(--button-primary-bg)]"
            >
              {t('auth.invalidDeckValue')}
            </p>
          ) : null}
        </>
      ) : (
        <AdaptiveFormField
          id="deckOptions"
          value={deckOptionValue}
          onValueChange={onDeckOptionChange}
          config={deckFieldConfig}
          ariaLabel={t('auth.deckOptions')}
          className="py-1.5"
        />
      )}
      {summaryDeckName || summaryEvaluation ? (
        <div
          data-testid="login-deck-summary"
          data-legal={
            summaryEvaluation
              ? summaryEvaluation.isValid
                ? 'true'
                : 'false'
              : 'unknown'
          }
          className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-normal leading-5"
        >
          {summaryEvaluation && !isCheckingSummary ? (
            <span
              data-testid="login-deck-summary-pill"
              className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${
                summaryEvaluation.isValid
                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                  : 'bg-[var(--button-primary-bg)]/20 text-[var(--button-primary-bg)]'
              }`}
            >
              {summaryEvaluation.isValid
                ? t('auth.deckSummary.legalPill')
                : t('auth.deckSummary.illegalPill')}
            </span>
          ) : null}
          <span className="min-w-0 truncate text-[var(--text-secondary)]">{summaryDeckName}</span>
          {summaryRecordLabel ? (
            <span
              data-testid="login-deck-record"
              className="shrink-0 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]"
            >
              {summaryRecordLabel}
            </span>
          ) : null}
        </div>
      ) : null}
    </FormField>
  )
}
