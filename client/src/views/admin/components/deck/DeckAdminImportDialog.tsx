import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui'
import { FormLabel, FormTextarea } from '@/components/forms'
import { parseDeckImportPayload } from '@/views/admin/utils/deckImport'
import type { IDeckAdminImportDialogProps } from './types'

export function DeckAdminImportDialog({ isOpen, onClose, onImport }: IDeckAdminImportDialogProps) {
  const { t } = useTranslation()
  const [payload, setPayload] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (!isOpen || typeof document === 'undefined') {
    return null
  }

  const handleImport = () => {
    const parsed = parseDeckImportPayload(payload)

    if (!parsed.isValid) {
      const message = parsed.error.code === 'empty'
        ? t('auth.errors.deckEmpty')
        : parsed.error.code === 'nonPositiveQuantity'
          ? t('auth.errors.deckPositiveQuantity', { line: parsed.error.line })
          : t('auth.errors.deckInvalidLine', { line: parsed.error.line, value: parsed.error.value ?? '' })

      setErrorMessage(message)
      return
    }

    onImport(parsed.cards)
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
        className="w-full max-w-lg rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4"
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
            onChange={(event) => {
              setPayload(event.target.value)
              setErrorMessage(null)
            }}
          />
        </div>

        {errorMessage ? (
          <p role="alert" className="mt-2 text-xs font-medium text-[var(--button-primary-bg)]">
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <AppButton type="button" variant="ghost" onClick={onClose}>
            {t('admin.decks.import.cancel')}
          </AppButton>

          <AppButton type="button" onClick={handleImport} data-testid="admin-deck-import-confirm">
            {t('admin.decks.import.confirm')}
          </AppButton>
        </div>
      </div>
    </div>,
    document.body,
  )
}
