import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui'
import { FormLabel, FormTextarea } from '@/components/forms'
import { parseEffectsImportPayload } from '@/views/admin/model/cardAdminEffectTransfer'
import type { ICardAdminEffectsImportDialogProps } from '@/views/admin/types/cardAdminDetailTypes'

export function CardAdminEffectsImportDialog({
  isOpen,
  currentCardId,
  onClose,
  onImport,
}: ICardAdminEffectsImportDialogProps) {
  const { t } = useTranslation()
  const [payload, setPayload] = useState('')

  const parsed = useMemo(() => parseEffectsImportPayload(payload), [payload])

  if (!isOpen || typeof document === 'undefined') {
    return null
  }

  const hasPayload = payload.trim().length > 0
  const sourceCard = parsed.ok ? parsed.sourceCard : null
  const normalizedCurrentCardId = currentCardId?.trim() ?? ''
  const sourceIsDifferentCard = !!sourceCard?.id
    && normalizedCurrentCardId.length > 0
    && sourceCard.id !== normalizedCurrentCardId

  const handleImport = () => {
    if (!parsed.ok) {
      return
    }

    onImport(parsed)
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
        aria-labelledby="card-effects-import-title"
        data-testid="admin-effects-import-dialog"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4"
      >
        <h2 id="card-effects-import-title" className="text-lg font-bold text-[var(--text-primary)]">
          {t('admin.transfer.dialogTitle')}
        </h2>

        <p className="mt-2 text-sm text-[var(--text-secondary)]">{t('admin.transfer.dialogBody')}</p>

        <div className="mt-3">
          <FormLabel htmlFor="card-effects-import-payload">{t('admin.transfer.label')}</FormLabel>
          <FormTextarea
            id="card-effects-import-payload"
            data-testid="admin-effects-import-payload"
            value={payload}
            rows={10}
            placeholder={t('admin.transfer.placeholder')}
            onChange={(event) => setPayload(event.target.value)}
          />
        </div>

        {hasPayload && !parsed.ok ? (
          <p
            role="alert"
            data-testid="admin-effects-import-error"
            className="mt-2 whitespace-pre-line text-xs font-medium text-red-500"
          >
            {parsed.message}
          </p>
        ) : null}

        {parsed.ok ? (
          <div className="mt-2 space-y-1" data-testid="admin-effects-import-summary">
            <p className="text-[11px] text-[var(--text-muted)]">
              {t('admin.transfer.summary', {
                effects: parsed.effects.length,
                conditions: parsed.conditions.length,
              })}
            </p>

            {sourceCard ? (
              <p className="text-[11px] text-[var(--text-muted)]">
                {t('admin.transfer.sourceCard', {
                  name: sourceCard.displayName ?? '-',
                  id: sourceCard.id ?? '-',
                })}
              </p>
            ) : null}

            {sourceIsDifferentCard ? (
              <p className="text-[11px] text-[var(--text-muted)]">{t('admin.transfer.sourceCardUnknown')}</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <AppButton type="button" variant="ghost" onClick={onClose}>
            {t('admin.transfer.cancel')}
          </AppButton>

          <AppButton
            type="button"
            data-testid="admin-effects-import-confirm"
            onClick={handleImport}
            disabled={!parsed.ok}
          >
            {t('admin.transfer.confirm')}
          </AppButton>
        </div>
      </div>
    </div>,
    document.body,
  )
}
