import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { showAppInfoToast, showAppSuccessToast } from '@/components/feedback/appToastNotifications'
import { CardAdminCardArtSection } from './CardAdminCardArtSection'
import { CardAdminDeleteCardSection } from './CardAdminDeleteCardSection'
import { CardAdminEditorFooter } from './CardAdminEditorFooter'
import { CardAdminEffectEditorBody } from './CardAdminEffectEditorBody'
import { CardAdminUnsavedChangesDialog } from './CardAdminUnsavedChangesDialog'
import { useCardAdminArtDraft } from '@/views/admin/model/useCardAdminArtDraft'
import { useCardAdminEffectEditorModel } from '@/views/admin/model/useCardAdminEffectEditorModel'
import { renderEmptySelectionState } from '@/views/admin/utils'
import type { ICardAdminDetailEditorProps, ICardAdminDetailPaneProps } from '@/views/admin/types/cardAdminDetailTypes'

export function CardAdminDetailPane({
  selectedCard,
  isLoading,
  onUnsavedChangesChange,
  isExitPending,
  onExitResolved,
}: ICardAdminDetailPaneProps) {
  const { t } = useTranslation()

  useEffect(() => {
    if (!selectedCard) {
      onUnsavedChangesChange?.(false)
    }
  }, [selectedCard, onUnsavedChangesChange])

  return (
    <div className="mt-4 mb-16 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3">
      {selectedCard ? (
        <CardAdminDetailEditor
          key={selectedCard.id}
          selectedCard={selectedCard}
          onUnsavedChangesChange={onUnsavedChangesChange}
          isExitPending={isExitPending}
          onExitResolved={onExitResolved}
        />
      ) : isLoading ? (
        <p className="mt-3 text-sm text-[var(--text-secondary)]">{t('admin.detail.loadingCard')}</p>
      ) : (
        renderEmptySelectionState(t('admin.detail.emptySelection'))
      )}
    </div>
  )
}

function CardAdminDetailEditor({
  selectedCard,
  onUnsavedChangesChange,
  isExitPending,
  onExitResolved,
}: ICardAdminDetailEditorProps) {
  const { t } = useTranslation()
  const editorModel = useCardAdminEffectEditorModel(selectedCard)
  const artModel = useCardAdminArtDraft(selectedCard)

  const isBusy = editorModel.isSaving || artModel.isCommitting
  const hasUnsavedChanges = editorModel.isDirty || artModel.isDirty

  useEffect(() => {
    onUnsavedChangesChange?.(hasUnsavedChanges)
  }, [hasUnsavedChanges, onUnsavedChangesChange])

  const saveDraft = async (): Promise<boolean> => {
    const hasEffectChanges = editorModel.isDirty
    const hasArtChanges = artModel.isDirty

    if (hasEffectChanges) {
      const result = await editorModel.save()

      if (!result.ok) {
        showAppInfoToast(result.message ?? t('admin.toasts.saveFailed'), {
          id: 'card-admin-save-status',
          position: 'top-right',
        })
        return false
      }
    }

    if (hasArtChanges) {
      const artResult = await artModel.commit()

      if (!artResult.ok) {
        showAppInfoToast(artResult.message ?? t('admin.art.failed'), {
          id: 'card-admin-save-status',
          position: 'top-right',
        })
        return false
      }
    }

    showAppSuccessToast(t('admin.toasts.cardSaved'), {
      id: 'card-admin-save-status',
      position: 'top-right',
    })

    return true
  }

  const handleSave = async () => {
    if (!hasUnsavedChanges) {
      showAppInfoToast(t('admin.toasts.noChanges'), {
        id: 'card-admin-save-status',
        position: 'top-right',
      })
      return
    }

    await saveDraft()
  }

  return (
    <>
      <div className="mt-3">
        <CardAdminCardArtSection art={artModel} />
      </div>

      <CardAdminEffectEditorBody
        editorModel={editorModel}
        card={selectedCard}
        isBusy={isBusy}
      />

      <CardAdminDeleteCardSection card={selectedCard} />

      <CardAdminEditorFooter
        isDirty={hasUnsavedChanges}
        isSaving={isBusy}
        submitLabel={t('admin.detail.saveCard')}
        savingLabel={t('admin.detail.saving')}
        onSubmit={handleSave}
      />

      {isExitPending ? (
        <CardAdminUnsavedChangesDialog
          cardName={selectedCard.displayName}
          isSaving={isBusy}
          onKeepEditing={() => onExitResolved?.(false)}
          onSave={async () => {
            onExitResolved?.(await saveDraft())
          }}
          onDiscard={() => onExitResolved?.(true)}
        />
      ) : null}
    </>
  )
}
