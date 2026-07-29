import type { SubmitEvent } from 'react'
import { Link } from 'react-router-dom'
import { PageShell } from '../../components/layout/PageShell'
import { Panel } from '../../components/ui/Panel'
import { AppButton } from '../../components/ui/AppButton'
import {
  Form,
  FormActions,
  FormField,
  FormInput,
  FormLabel,
} from '../../components/forms'

export function SignInView() {
  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
  }

  return (
    <PageShell>
      <div className="flex min-h-[80vh] w-full items-center justify-center px-3 sm:px-4">
        <Panel className="w-full max-w-md p-5">
          <h1 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Sign In</h1>

          <Form className="grid grid-cols-1 gap-2 space-y-0" onSubmit={handleSubmit}>
            <FormField className="space-y-0">
              <FormLabel htmlFor="signinEmail" className="mb-1 text-[11px] font-normal normal-case leading-none tracking-[0.08em] text-[var(--text-muted)]">
                Email
              </FormLabel>
              <FormInput
                id="signinEmail"
                type="email"
                placeholder="you@example.com"
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
                type="password"
                placeholder="Enter password"
                className="py-1.5"
                required
              />
            </FormField>

            <FormActions className="w-full justify-end gap-2 pt-0">
              <Link
                to="/"
                className="inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors duration-200 hover:bg-[var(--surface-hover)]"
              >
                Back
              </Link>
              <AppButton type="submit">Sign In</AppButton>
            </FormActions>
          </Form>
        </Panel>
      </div>
    </PageShell>
  )
}