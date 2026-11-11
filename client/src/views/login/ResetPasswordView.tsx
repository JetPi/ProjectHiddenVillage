import { Link, useActionData, useNavigation, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageShell } from '@/components/layout/PageShell'
import { AppButton, Panel } from '@/components/ui'
import {
  Form,
  FormActions,
  FormErrorText,
  FormField,
  FormInput,
  FormLabel,
} from '@/components/forms'
import type { IResetPasswordActionData } from '@/views/login/types/passwordReset'

/**
 * The landing page for the mailed link. The token is read from the query string and posted back untouched; the page
 * never navigates before the form is submitted, and the document carries `no-referrer` so a later click cannot leak
 * the token through the Referer header.
 */
export function ResetPasswordView() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const actionData = useActionData() as IResetPasswordActionData | undefined
  const navigation = useNavigation()

  const token = (searchParams.get('token') ?? '').trim()
  const isSubmitting = navigation.state === 'submitting'

  return (
    <PageShell scrollable>
      <div className="flex min-h-[80vh] w-full items-center justify-center px-3 sm:px-4">
        <Panel className="w-full max-w-md p-5">
          <h1 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">
            {t('auth.resetPassword.title')}
          </h1>

          {token ? (
            <Form className="grid grid-cols-1 gap-2 space-y-0" method="post">
              <input type="hidden" name="token" value={token} />

              <p className="text-sm leading-6 text-[var(--text-secondary)]">
                {t('auth.resetPassword.description')}
              </p>

              <FormField className="space-y-0">
                <FormLabel
                  htmlFor="resetPassword"
                  className="mb-1 text-[11px] font-normal normal-case leading-none tracking-[0.08em] text-[var(--text-muted)]"
                >
                  {t('auth.resetPassword.password')}
                </FormLabel>
                <FormInput
                  id="resetPassword"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder={t('auth.resetPassword.passwordPlaceholder')}
                  className="py-1.5"
                  required
                />
              </FormField>

              <FormField className="space-y-0">
                <FormLabel
                  htmlFor="resetPasswordConfirm"
                  className="mb-1 text-[11px] font-normal normal-case leading-none tracking-[0.08em] text-[var(--text-muted)]"
                >
                  {t('auth.resetPassword.confirmPassword')}
                </FormLabel>
                <FormInput
                  id="resetPasswordConfirm"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder={t('auth.resetPassword.confirmPasswordPlaceholder')}
                  className="py-1.5"
                  required
                />
              </FormField>

              {actionData?.reset?.ok === false && actionData.reset.error ? (
                <FormErrorText>{actionData.reset.error}</FormErrorText>
              ) : null}

              <FormActions className="w-full justify-end gap-2 pt-0">
                <AppButton type="submit" disabled={isSubmitting}>
                  {isSubmitting
                    ? t('auth.resetPassword.submitting')
                    : t('auth.resetPassword.submit')}
                </AppButton>
              </FormActions>
            </Form>
          ) : (
            <div className="flex flex-col gap-4" data-testid="reset-password-missing-token">
              <p className="text-sm leading-6 text-[var(--text-secondary)]">
                {t('auth.resetPassword.missingToken')}
              </p>
              <Link
                to="/forgot-password"
                className="inline-flex items-center justify-center rounded-xl bg-[var(--button-primary-bg)] px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:opacity-90"
              >
                {t('auth.resetPassword.requestNewLink')}
              </Link>
            </div>
          )}
        </Panel>
      </div>
    </PageShell>
  )
}
