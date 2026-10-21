import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui'

export type ICardAdminUnsavedChangesDialogProps = {
  cardName: string | null
  onKeepEditing: () => void
  onSave: () => void
  onDiscard: () => void
  isSaving?: boolean
}

export function CardAdminUnsavedChangesDialog({
  cardName,
  onKeepEditing,
  onSave,
  onDiscard,
  isSaving = false,
}: ICardAdminUnsavedChangesDialogProps) {
  const { t } = useTranslation()

  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !isSaving) {
          onKeepEditing()
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSaving) {
          onKeepEditing()
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-admin-unsaved-title"
        data-testid="admin-unsaved-changes"
        className="w-full max-w-lg rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4"
      >
        <h2
          id="card-admin-unsaved-title"
          className="text-lg font-bold text-[var(--text-primary)]"
        >
          {t('admin.detail.unsavedDialog.title')}
        </h2>

        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {cardName
            ? t('admin.detail.unsavedDialog.bodyWithName', { name: cardName })
            : t('admin.detail.unsavedDialog.bodyGeneric')}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <AppButton
            type="button"
            variant="ghost"
            autoFocus
            onClick={onKeepEditing}
            disabled={isSaving}
            className="px-3"
          >
            {t('admin.detail.unsavedDialog.keepEditing')}
          </AppButton>

          <AppButton
            type="button"
            variant="ghost"
            onClick={onDiscard}
            disabled={isSaving}
            className="px-3"
            data-testid="admin-unsaved-discard"
          >
            {t('admin.detail.unsavedDialog.discard')}
          </AppButton>

          <AppButton
            type="button"
            onClick={() => {
              void onSave()
            }}
            disabled={isSaving}
            className="px-3"
            data-testid="admin-unsaved-save"
          >
            {isSaving ? t('admin.detail.saving') : t('admin.detail.unsavedDialog.saveAndContinue')}
          </AppButton>
        </div>
      </div>
    </div>,
    document.body,
  )
}
