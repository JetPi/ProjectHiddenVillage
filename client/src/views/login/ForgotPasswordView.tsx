import { Link, useActionData, useNavigation } from 'react-router-dom'
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
import type { IForgotPasswordActionData } from '@/views/login/types/passwordReset'

/**
 * Recovery is started here and nowhere else: there is no signed-in change-password screen, so a player who wants a
 * new password (forgotten or not) uses this exact flow.
 */
export function ForgotPasswordView() {
  const { t } = useTranslation()
  const actionData = useActionData() as IForgotPasswordActionData | undefined
  const navigation = useNavigation()

  const isSubmitting = navigation.state === 'submitting'
  const wasRequested = actionData?.request?.ok === true

  return (
    <PageShell scrollable>
      <div className="flex min-h-[80vh] w-full items-center justify-center px-3 sm:px-4">
        <Panel className="w-full max-w-md p-5">
          <h1 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">
            {t('auth.forgotPassword.title')}
          </h1>

          {wasRequested ? (
            <div className="flex flex-col gap-4" data-testid="forgot-password-sent">
              <p className="text-sm leading-6 text-[var(--text-secondary)]">
                {t('auth.forgotPassword.sent')}
              </p>
              <Link
                to="/"
                className="inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors duration-200 hover:bg-[var(--surface-hover)]"
              >
                {t('auth.forgotPassword.backToLogin')}
              </Link>
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm leading-6 text-[var(--text-secondary)]">
                {t('auth.forgotPassword.description')}
              </p>

              <Form className="grid grid-cols-1 gap-2 space-y-0" method="post">
                <FormField className="space-y-0">
                  <FormLabel
                    htmlFor="forgotEmail"
                    className="mb-1 text-[11px] font-normal normal-case leading-none tracking-[0.08em] text-[var(--text-muted)]"
                  >
                    {t('auth.forgotPassword.email')}
                  </FormLabel>
                  <FormInput
                    id="forgotEmail"
                    name="email"
                    type="email"
                    placeholder={t('auth.forgotPassword.emailPlaceholder')}
                    className="py-1.5"
                    required
                  />
                </FormField>

                {actionData?.request?.ok === false && actionData.request.error ? (
                  <FormErrorText>{actionData.request.error}</FormErrorText>
                ) : null}

                <FormActions className="w-full justify-end gap-2 pt-0">
                  <Link
                    to="/"
                    className="inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors duration-200 hover:bg-[var(--surface-hover)]"
                  >
                    {t('auth.forgotPassword.backToLogin')}
                  </Link>
                  <AppButton type="submit" disabled={isSubmitting}>
                    {isSubmitting
                      ? t('auth.forgotPassword.submitting')
                      : t('auth.forgotPassword.submit')}
                  </AppButton>
                </FormActions>
              </Form>
            </>
          )}
        </Panel>
      </div>
    </PageShell>
  )
}
