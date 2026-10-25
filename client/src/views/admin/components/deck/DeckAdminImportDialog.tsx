import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui'
import { FormLabel, FormTextarea } from '@/components/forms'
import { evaluateDeckRulesets } from '@/domain/deck/evaluateDeckRulesets'
import { normalizeDeckCardId, parseDeckList } from '@/domain/deck/parseDeckList'
import { useCardCatalogByIdsQuery } from '@/services/queries/cardQueries'
import { DeckAdminValidationList } from './DeckAdminValidationList'
import type { IDeckAdminImportDialogProps } from './types'

export function DeckAdminImportDialog({
  isOpen,
  rulesets,
  cardsById,
  onClose,
  onReplace,
}: IDeckAdminImportDialogProps) {
  const { t } = useTranslation()
  const [payload, setPayload] = useState('')

  const parsed = useMemo(() => parseDeckList(payload), [payload])
  const parsedCardIds = useMemo(
    () => (parsed.isValid ? parsed.cards.map((card) => card.cardId) : []),
    [parsed],
  )

  const metadataQuery = useCardCatalogByIdsQuery(parsedCardIds, {
    enabled: isOpen && parsedCardIds.length > 0,
  })

  const importedCardsById = useMemo(() => {
    const merged = new Map(cardsById)

    for (const card of metadataQuery.data ?? []) {
      merged.set(normalizeDeckCardId(card.id), card)
    }

    return merged
  }, [cardsById, metadataQuery.data])

  const evaluation = useMemo(() => {
    if (!parsed.isValid || rulesets.length === 0) {
      return null
    }

    return evaluateDeckRulesets({
      cards: parsed.cards,
      cardsById: importedCardsById,
      rulesets,
    })
  }, [parsed, rulesets, importedCardsById])

  const leaderCardId = useMemo(() => {
    if (!parsed.isValid) {
      return null
    }

    const leaderIds = parsed.cards
      .filter(
        (card) =>
          (importedCardsById.get(normalizeDeckCardId(card.cardId))?.type ?? '').trim().toLowerCase()
          === 'leader',
      )
      .map((card) => card.cardId)

    return leaderIds.at(-1) ?? null
  }, [parsed, importedCardsById])

  if (!isOpen || typeof document === 'undefined') {
    return null
  }

  const isChecking = parsed.isValid && metadataQuery.isFetching
  const canReplace = parsed.isValid && !isChecking && evaluation?.isLegalInAnyRuleset === true

  const parseErrorMessage = !parsed.isValid && parsed.error.code !== 'empty'
    ? parsed.error.code === 'nonPositiveQuantity'
      ? t('deckRules.parse.nonPositiveQuantity', { line: parsed.error.line })
      : t('deckRules.parse.invalidLine', {
          line: parsed.error.line,
          value: parsed.error.value ?? '',
        })
    : null

  const handleReplace = () => {
    if (!parsed.isValid || !canReplace) {
      return
    }

    onReplace(parsed.cards, leaderCardId)
    onClose()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onClose()
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="deck-admin-import-title"
        data-testid="admin-deck-import-dialog"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4"
      >
        <h2 id="deck-admin-import-title" className="text-lg font-bold text-[var(--text-primary)]">
          {t('admin.decks.import.title')}
        </h2>

        <p className="mt-2 text-sm text-[var(--text-secondary)]">{t('admin.decks.import.body')}</p>

        <div className="mt-3">
          <FormLabel htmlFor="deck-admin-import-payload">{t('admin.decks.import.label')}</FormLabel>
          <FormTextarea
            id="deck-admin-import-payload"
            data-testid="admin-deck-import-payload"
            value={payload}
            rows={8}
            placeholder={t('admin.decks.import.placeholder')}
            onChange={(event) => setPayload(event.target.value)}
          />
        </div>

        {parseErrorMessage ? (
          <p role="alert" className="mt-2 text-xs font-medium text-[var(--button-primary-bg)]">
            {parseErrorMessage}
          </p>
        ) : null}

        {parsed.isValid ? (
          <div className="mt-2 space-y-1">
            <p className="text-[11px] text-[var(--text-muted)]">
              {t('admin.decks.import.parsed', { count: parsed.cards.length })}
            </p>
            <DeckAdminValidationList
              validation={{
                nameViolations: [],
                evaluations: evaluation?.evaluations ?? [],
                isLegalInAnyRuleset: evaluation?.isLegalInAnyRuleset ?? false,
                isValid: evaluation?.isLegalInAnyRuleset ?? false,
              }}
              isCheckingCards={isChecking}
            />
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <AppButton type="button" variant="ghost" onClick={onClose}>
            {t('admin.decks.import.cancel')}
          </AppButton>

          <AppButton
            type="button"
            onClick={handleReplace}
            disabled={!canReplace}
            data-testid="admin-deck-import-confirm"
          >
            {t('admin.decks.import.confirm')}
          </AppButton>
        </div>
      </div>
    </div>,
    document.body,
  )
}
