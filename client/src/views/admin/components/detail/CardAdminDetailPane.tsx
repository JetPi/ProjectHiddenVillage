import { useTranslation } from 'react-i18next'
import { showAppInfoToast, showAppSuccessToast } from '@/components/feedback/appToastNotifications'
import { CardAdminCardArtSection } from './CardAdminCardArtSection'
import { CardAdminDeleteCardSection } from './CardAdminDeleteCardSection'
import { CardAdminEditorFooter } from './CardAdminEditorFooter'
import { CardAdminEffectEditorBody } from './CardAdminEffectEditorBody'
import { useCardAdminArtDraft } from '@/views/admin/model/useCardAdminArtDraft'
import { useCardAdminEffectEditorModel } from '@/views/admin/model/useCardAdminEffectEditorModel'
import { renderEmptySelectionState } from '@/views/admin/utils'
import type { ICardAdminDetailEditorProps, ICardAdminDetailPaneProps } from '@/views/admin/types/cardAdminDetailTypes'

export function CardAdminDetailPane({ selectedCard }: ICardAdminDetailPaneProps) {
  const { t } = useTranslation()

  return (
    <div className="mt-4 mb-16 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3">
      {selectedCard ? (
        <CardAdminDetailEditor key={selectedCard.id} selectedCard={selectedCard} />
      ) : (
        renderEmptySelectionState(t('admin.detail.emptySelection'))
      )}
    </div>
  )
}

/**
 * The update side of the card editor: the shared editing body driven by the patch submit, plus the art draft the
 * same save flushes. The create screen renders the same body with its own submit and its own identity fields.
 */
function CardAdminDetailEditor({ selectedCard }: ICardAdminDetailEditorProps) {
  const { t } = useTranslation()
  const editorModel = useCardAdminEffectEditorModel(selectedCard)
  const artModel = useCardAdminArtDraft(selectedCard)

  const isBusy = editorModel.isSaving || artModel.isCommitting

  const handleSave = async () => {
    const hasEffectChanges = editorModel.isDirty
    const hasArtChanges = artModel.isDirty

    if (!hasEffectChanges && !hasArtChanges) {
      showAppInfoToast(t('admin.toasts.noChanges'), {
        id: 'card-admin-save-status',
        position: 'top-right',
      })
      return
    }

    // The effects go first: that patch is what validates the card as a whole, and a rejected card must not leave
    // freshly uploaded art behind on the server. Only once the card itself saved does the staged art follow.
    if (hasEffectChanges) {
      const result = await editorModel.save()

      if (!result.ok) {
        showAppInfoToast(result.message ?? t('admin.toasts.saveFailed'), {
          id: 'card-admin-save-status',
          position: 'top-right',
        })
        return
      }
    }

    if (hasArtChanges) {
      const artResult = await artModel.commit()

      if (!artResult.ok) {
        showAppInfoToast(artResult.message ?? t('admin.art.failed'), {
          id: 'card-admin-save-status',
          position: 'top-right',
        })
        return
      }
    }

    showAppSuccessToast(t('admin.toasts.cardSaved'), {
      id: 'card-admin-save-status',
      position: 'top-right',
    })
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
        isDirty={editorModel.isDirty || artModel.isDirty}
        isSaving={isBusy}
        submitLabel={t('admin.detail.saveCard')}
        savingLabel={t('admin.detail.saving')}
        onSubmit={handleSave}
      />
    </>
  )
}
