import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { PageShell } from '@/components/layout/PageShell'
import { AppButton, Panel } from '@/components/ui'
import { FormField, FormInput, FormLabel } from '@/components/forms'
import { fetchCardCatalogByIds, updateCardCatalogFlags } from '@/services/api/cardCatalogApi'
import type { ICardCatalogItemResponse } from '@/types/cardCatalog'
import { getApiErrorMessage } from '@/views/utils/getApiErrorMessage'
import { showAppInfoToast, showAppSuccessToast } from '@/components/feedback/appToastNotifications'

type ILoadState = 'idle' | 'loading' | 'saving'

export function CardAdminView() {
  const [cardIdInput, setCardIdInput] = useState('')
  const [card, setCard] = useState<ICardCatalogItemResponse | null>(null)
  const [isBlocked, setIsBlocked] = useState(false)
  const [loadState, setLoadState] = useState<ILoadState>('idle')

  const normalizedCardId = useMemo(() => cardIdInput.trim(), [cardIdInput])

  async function handleLoad(event: FormEvent) {
    event.preventDefault()

    if (!normalizedCardId) {
      showAppInfoToast('Enter a card id to load.')
      return
    }

    setLoadState('loading')

    try {
      const result = await fetchCardCatalogByIds([normalizedCardId])
      if (result.length === 0) {
        setCard(null)
        showAppInfoToast(`Card '${normalizedCardId}' was not found.`)
        return
      }

      const loadedCard = result[0]
      setCard(loadedCard)
      setIsBlocked(loadedCard.cannotBeNormalSummoned)
      showAppSuccessToast(`Loaded ${loadedCard.displayName}.`)
    } catch (error) {
      showAppInfoToast(getApiErrorMessage(error, 'Unable to load card details.'))
    } finally {
      setLoadState('idle')
    }
  }

  async function handleToggle() {
    if (!card) {
      return
    }

    setLoadState('saving')

    try {
      const updated = await updateCardCatalogFlags(card.id, {
        cannotBeNormalSummoned: !isBlocked,
      })

      setCard(updated)
      setIsBlocked(updated.cannotBeNormalSummoned)
      showAppSuccessToast('Card summon restriction updated.')
    } catch (error) {
      showAppInfoToast(getApiErrorMessage(error, 'Unable to update summon restriction.'))
    } finally {
      setLoadState('idle')
    }
  }

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-2xl px-3">
        <Panel className="space-y-4 px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-bold text-[var(--text-primary)]">Card Admin</h1>
            <Link to="/" className="text-sm text-[var(--text-secondary)] underline-offset-2 hover:underline">
              Back to Login
            </Link>
          </div>

          <p className="text-sm text-[var(--text-secondary)]">
            Toggle whether a card can be summoned by normal summon effects.
          </p>

          <form onSubmit={handleLoad} className="space-y-3">
            <FormField>
              <FormLabel htmlFor="card-id-input">Card ID</FormLabel>
              <FormInput
                id="card-id-input"
                value={cardIdInput}
                onChange={(event) => setCardIdInput(event.target.value)}
                placeholder="Example: N-001"
                className="py-1.5"
              />
            </FormField>

            <AppButton type="submit" disabled={loadState !== 'idle'}>
              {loadState === 'loading' ? 'Loading...' : 'Load Card'}
            </AppButton>
          </form>

          {card ? (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
              <p className="text-sm font-semibold text-[var(--text-primary)]">{card.displayName}</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">{card.id}</p>

              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-sm text-[var(--text-primary)]">Cannot be summoned normally</p>
                <AppButton
                  type="button"
                  onClick={handleToggle}
                  disabled={loadState !== 'idle'}
                  variant="ghost"
                >
                  {loadState === 'saving'
                    ? 'Saving...'
                    : isBlocked
                      ? 'Enabled'
                      : 'Disabled'}
                </AppButton>
              </div>
            </div>
          ) : null}
        </Panel>
      </div>
    </PageShell>
  )
}
