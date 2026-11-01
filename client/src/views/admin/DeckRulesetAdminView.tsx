import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageShell } from '@/components/layout/PageShell'
import { showAppInfoToast, showAppSuccessToast } from '@/components/feedback/appToastNotifications'
import { normalizeDeckCardId } from '@/domain/deck/parseDeckList'
import type { IDeckCardMetadata } from '@/domain/deck/types'
import { useCardCatalogByIdsQuery } from '@/services/queries/cardQueries'
import { useDeckRulesetSetCodesQuery } from '@/services/queries/deckRulesetQueries'
import { DeckRulesetEditorPane, DeckRulesetListRail } from '@/views/admin/components'
import { useDeckRulesetAdminModel } from '@/views/admin/model/useDeckRulesetAdminModel'
import { getApiErrorMessage } from '@/views/utils/getApiErrorMessage'

const TOAST_ID = 'deck-ruleset-admin-status'

export function DeckRulesetAdminView() {
  const { t } = useTranslation()
  const model = useDeckRulesetAdminModel()

  // Only whole-card rules name a catalogue entry, so only they are worth resolving for display. Set rules cover
  // every card that carries the code, including placeholder cards nobody has opened yet.
  const restrictionCardIds = useMemo(
    () =>
      model.draft.restrictions
        .filter((restriction) => restriction.matchType === 'Card')
        .map((restriction) => restriction.code.trim())
        .filter((cardId) => cardId.length > 0),
    [model.draft.restrictions],
  )

  const restrictionCardsQuery = useCardCatalogByIdsQuery(restrictionCardIds)
  const setCodesQuery = useDeckRulesetSetCodesQuery()

  const cardsById = useMemo(() => {
    const byId = new Map<string, IDeckCardMetadata>()

    for (const card of restrictionCardsQuery.data ?? []) {
      byId.set(normalizeDeckCardId(card.id), card)
    }

    return byId
  }, [restrictionCardsQuery.data])

  const handleSave = async () => {
    const wasCreating = model.isCreating

    try {
      const savedRuleset = await model.save()

      showAppSuccessToast(
        wasCreating
          ? t('admin.rulesets.toasts.created', { name: savedRuleset.name })
          : t('admin.rulesets.toasts.updated', { name: savedRuleset.name }),
        { id: TOAST_ID, position: 'top-right' },
      )
    } catch (error) {
      showAppInfoToast(getApiErrorMessage(error, t('admin.rulesets.toasts.saveFailed')), {
        id: TOAST_ID,
        position: 'top-right',
      })
    }
  }

  const handleReorder = async (fromIndex: number, toIndex: number) => {
    try {
      await model.reorderRulesets(fromIndex, toIndex)
      showAppSuccessToast(t('admin.rulesets.toasts.reordered'), {
        id: TOAST_ID,
        position: 'top-right',
      })
    } catch (error) {
      showAppInfoToast(getApiErrorMessage(error, t('admin.rulesets.rail.reorderFailed')), {
        id: TOAST_ID,
        position: 'top-right',
      })
    }
  }

  const handleDelete = async () => {
    const rulesetName = model.selectedRuleset?.name ?? model.draft.name
    const confirmed = window.confirm(
      t('admin.rulesets.delete.title') + '\n\n' + t('admin.rulesets.delete.body', { name: rulesetName }),
    )

    if (!confirmed) {
      return
    }

    try {
      await model.remove()
      showAppSuccessToast(t('admin.rulesets.toasts.deleted'), {
        id: TOAST_ID,
        position: 'top-right',
      })
    } catch (error) {
      showAppInfoToast(getApiErrorMessage(error, t('admin.rulesets.toasts.deleteFailed')), {
        id: TOAST_ID,
        position: 'top-right',
      })
    }
  }

  return (
    <PageShell compact fullBleed edgeToEdge className="h-dvh overflow-hidden">
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-3 py-2">
          <div>
            <h1 className="text-sm font-semibold text-[var(--text-primary)]">{t('admin.rulesets.title')}</h1>
            <p className="text-[11px] text-[var(--text-secondary)]">{t('admin.rulesets.subtitle')}</p>
          </div>
          <Link
            to="/admin/decks"
            className="text-xs text-[var(--text-secondary)] underline-offset-2 hover:underline"
          >
            {t('admin.rulesets.backToDecks')}
          </Link>
        </header>

        <div className="grid min-h-0 flex-1 [grid-template-columns:minmax(15rem,19rem)_minmax(0,1fr)]">
          <DeckRulesetListRail
            rulesets={model.rulesets}
            selectedRulesetId={model.selectedRulesetId}
            isCreating={model.isCreating}
            isLoading={model.isLoading}
            isError={model.isError}
            onSelect={model.selectRuleset}
            onCreate={model.startCreate}
            onReorder={(fromIndex, toIndex) => {
              void handleReorder(fromIndex, toIndex)
            }}
          />

          <section className="h-full min-h-0 overflow-hidden">
            {model.isCreating || model.selectedRulesetId ? (
              <DeckRulesetEditorPane
                isCreating={model.isCreating}
                draft={model.draft}
                violations={model.violations}
                cardsById={cardsById}
                setCodes={setCodesQuery.data ?? []}
                canSave={model.canSave}
                isDirty={model.isDirty}
                isSaving={model.isSaving}
                isDeleting={model.isDeleting}
                onPatch={model.patchDraft}
                onAddRestriction={model.addRestriction}
                onUpdateRestrictionMaxCopies={model.updateRestrictionMaxCopies}
                onRemoveRestriction={model.removeRestriction}
                onSave={() => {
                  void handleSave()
                }}
                onDelete={() => {
                  void handleDelete()
                }}
              />
            ) : (
              <div className="grid h-full place-items-center p-6">
                <p className="text-sm text-[var(--text-secondary)]">
                  {t('admin.rulesets.editor.selectPrompt')}
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </PageShell>
  )
}
