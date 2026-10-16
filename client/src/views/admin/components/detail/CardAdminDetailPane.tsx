import { useTranslation } from 'react-i18next'
import { showAppInfoToast, showAppSuccessToast } from '@/components/feedback/appToastNotifications'
import { CardAdminCardArtSection } from './CardAdminCardArtSection'
import { CardAdminEditorFooter } from './CardAdminEditorFooter'
import { CardAdminEffectEditorBody } from './CardAdminEffectEditorBody'
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
 * The update side of the card editor: the shared editing body driven by the patch submit. The create screen
 * renders the same body with its own submit and its own identity fields.
 */
function CardAdminDetailEditor({ selectedCard }: ICardAdminDetailEditorProps) {
  const { t } = useTranslation()
  const editorModel = useCardAdminEffectEditorModel(selectedCard)

  const handleSave = async () => {
    if (!editorModel.isDirty) {
      showAppInfoToast(t('admin.toasts.noChanges'), {
        id: 'card-admin-save-status',
        position: 'top-right',
      })
      return
    }

    const result = await editorModel.save()
    if (result.ok) {
      showAppSuccessToast(t('admin.toasts.cardSaved'), {
        id: 'card-admin-save-status',
        position: 'top-right',
      })
      return
    }

    showAppInfoToast(result.message ?? t('admin.toasts.saveFailed'), {
      id: 'card-admin-save-status',
      position: 'top-right',
    })
  }

  return (
    <>
      <div className="mt-3">
        <CardAdminCardArtSection card={selectedCard} />
      </div>

      <CardAdminEffectEditorBody
        editorModel={editorModel}
        card={selectedCard}
        isBusy={editorModel.isSaving}
      />

      <CardAdminEditorFooter
        isDirty={editorModel.isDirty}
        isSaving={editorModel.isSaving}
        submitLabel={t('admin.detail.saveCard')}
        savingLabel={t('admin.detail.saving')}
        onSubmit={handleSave}
      />
    </>
  )
}
