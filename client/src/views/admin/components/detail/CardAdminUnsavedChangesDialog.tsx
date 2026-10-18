import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui'

export type ICardAdminUnsavedChangesDialogProps = {
  /** The card whose draft is in question, when the screen knows which card that is. */
  cardName: string | null
  /** Stay: nothing is saved and nothing moves. */
  onKeepEditing: () => void
  /** Save first, then leave. The caller resolves the exit with what the save answered. */
  onSave: () => void
  /** Leave without saving. */
  onDiscard: () => void
  isSaving?: boolean
}

/**
 * The guard in front of every way out of a card that has unsaved changes, offering the three honest answers:
 * stay, save and then leave, or leave and lose it. Staying is the default and the focused button.
 *
 * The editor pane is keyed by card id, which is what makes this necessary: selecting another card, navigating to
 * the create screen or reloading the tab all unmount the draft with no other trace of it.
 */
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
      // The focused button lives inside this backdrop, so a key press reaches this handler.
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
        // Wider than the other confirmations on purpose: the three answers have to sit side by side, one column
        // each, rather than wrapping into a ragged two-row block.
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
          {/* Tighter side padding than a lone button uses, so the longest label still fits its third of the row
              on one line instead of wrapping inside the column. */}
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
