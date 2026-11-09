import { useTranslation } from 'react-i18next'
import { Lightbulb, LogIn, X } from 'lucide-react'
import { AppButton } from '@/components/ui'
import { FormErrorText, FormField, FormInput, FormLabel } from '@/components/forms'
import type { ILoginDisplayNameFieldProps } from '@/views/login/types/panels'

export function LoginDisplayNameField({
  displayName,
  onDisplayNameChange,
  showError,
  onlineViewers,
  onToggleTheme,
  isAuthenticated,
  onOpenSessionDialog,
  className = '',
}: ILoginDisplayNameFieldProps) {
  const { t } = useTranslation()

  return (
    <FormField className={className}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <FormLabel htmlFor="displayName" className="mb-0">{t('auth.displayName')}</FormLabel>
        <div className="flex items-center gap-2">
          {onlineViewers !== null ? (
            <p
              data-testid="online-players"
              className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]"
            >
              {t('auth.onlinePlayers', { count: onlineViewers })}
            </p>
          ) : null}
          <AppButton
            type="button"
            variant="ghost"
            onClick={onToggleTheme}
            aria-label={t('auth.toggleThemeAria')}
            className="h-9 w-9 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)] sm:h-6 sm:w-6"
          >
            <Lightbulb size={12} />
          </AppButton>
        </div>
      </div>
      <div className="relative">
        <FormInput
          id="displayName"
          value={displayName}
          onChange={(event) => onDisplayNameChange(event.target.value)}
          placeholder={t('auth.displayNamePlaceholder')}
          maxLength={24}
          className="py-1.5 pr-12"
          required
        />
        <button
          type="button"
          onClick={onOpenSessionDialog}
          aria-label={isAuthenticated ? t('auth.openLogoutModalAria') : t('auth.openLoginModalAria')}
          className="absolute right-0 top-0 bottom-0 inline-flex w-10 items-center justify-center rounded-r-xl border-l border-[var(--border-subtle)] bg-transparent text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
        >
          {isAuthenticated ? <X size={14} /> : <LogIn size={14} />}
        </button>
      </div>
      {showError ? <FormErrorText>{t('auth.displayNameRequired')}</FormErrorText> : null}
    </FormField>
  )
}
