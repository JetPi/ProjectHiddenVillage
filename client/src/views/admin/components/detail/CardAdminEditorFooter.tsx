import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui'
import type { ICardAdminEditorFooterProps } from '@/views/admin/types/cardAdminDetailTypes'

/**
 * The unsaved-changes pill and the submit button, portalled to the body so they float over the pane on both card
 * screens. Only the labels and the submit differ between updating and creating.
 */
export function CardAdminEditorFooter({
  isDirty,
  isSaving,
  submitLabel,
  savingLabel,
  disabled,
  onSubmit,
}: ICardAdminEditorFooterProps) {
  const { t } = useTranslation()

  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {isDirty ? (
        <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
          {t('admin.detail.unsavedChanges')}
        </span>
      ) : null}

      <AppButton
        type="button"
        onClick={() => {
          void onSubmit()
        }}
        disabled={disabled ?? isSaving}
        className="shadow-lg"
      >
        {isSaving ? savingLabel : submitLabel}
      </AppButton>
    </div>,
    document.body,
  )
}
