import { Link, useActionData, useNavigation } from 'react-router-dom'
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
import type { ISignUpActionData } from '@/views/login/types/routeHandlers'

export function SignInView() {
  const actionData = useActionData() as ISignUpActionData | undefined
  const navigation = useNavigation()

  const isSubmitting = navigation.state === 'submitting'

  return (
    <PageShell>
      <div className="flex min-h-[80vh] w-full items-center justify-center px-3 sm:px-4">
        <Panel className="w-full max-w-md p-5">
          <h1 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Sign In</h1>

          <Form className="grid grid-cols-1 gap-2 space-y-0" method="post">
            <FormField className="space-y-0">
              <FormLabel htmlFor="signinEmail" className="mb-1 text-[11px] font-normal normal-case leading-none tracking-[0.08em] text-[var(--text-muted)]">
                Email
              </FormLabel>
              <FormInput
                id="signinEmail"
                name="email"
                type="email"
                defaultValue={actionData?.signUp?.values?.email ?? ''}
                placeholder="you@example.com"
                className="py-1.5"
                required
              />
            </FormField>

            <FormField className="space-y-0">
              <FormLabel htmlFor="signinUsername" className="mb-1 text-[11px] font-normal normal-case leading-none tracking-[0.08em] text-[var(--text-muted)]">
                Username
              </FormLabel>
              <FormInput
                id="signinUsername"
                name="username"
                type="text"
                defaultValue={actionData?.signUp?.values?.username ?? ''}
                placeholder="Enter username"
                className="py-1.5"
                required
              />
            </FormField>

            <FormField className="space-y-0">
              <FormLabel htmlFor="signinPassword" className="mb-1 text-[11px] font-normal normal-case leading-none tracking-[0.08em] text-[var(--text-muted)]">
                Password
              </FormLabel>
              <FormInput
                id="signinPassword"
                name="password"
                type="password"
                placeholder="Enter password"
                className="py-1.5"
                required
              />
            </FormField>

            {actionData?.signUp?.ok === false && actionData.signUp.error ? (
              <FormErrorText>{actionData.signUp.error}</FormErrorText>
            ) : null}

            <FormActions className="w-full justify-end gap-2 pt-0">
              <Link
                to="/"
                className="inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors duration-200 hover:bg-[var(--surface-hover)]"
              >
                Back
              </Link>
              <AppButton type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating Account...' : 'Sign In'}
              </AppButton>
            </FormActions>
          </Form>
        </Panel>
      </div>
    </PageShell>
  )
}