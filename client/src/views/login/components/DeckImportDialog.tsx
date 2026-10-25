import { useTranslation } from 'react-i18next'
import { AppButton, Panel } from '@/components/ui'
import { FormInput, FormLabel, FormTextarea } from '@/components/forms'
import type { IDeckListParseError, IDeckRulesetValidation } from '@/domain/deck/types'
import { DeckImportValidation } from './DeckImportValidation'

export type IDeckImportDialogProps = {
  isOpen: boolean
  payload: string
  onPayloadChange: (value: string) => void
  parseError: IDeckListParseError | null
  validation: IDeckRulesetValidation | null
  isChecking: boolean
  isAuthenticated: boolean
  deckName: string
  onDeckNameChange: (value: string) => void
  defaultDeckName: string
  canUse: boolean
  isSaving: boolean
  onClose: () => void
  onUse: () => void
  onSave: () => void
}

export function DeckImportDialog({
  isOpen,
  payload,
  onPayloadChange,
  parseError,
  validation,
  isChecking,
  isAuthenticated,
  deckName,
  onDeckNameChange,
  defaultDeckName,
  canUse,
  isSaving,
  onClose,
  onUse,
  onSave,
}: IDeckImportDialogProps) {
  const { t } = useTranslation()

  if (!isOpen) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
      onClick={onClose}
    >
      <Panel
        className="w-full max-w-2xl p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="import-modal-title" className="text-lg font-semibold text-[var(--text-primary)]">
            {t('auth.importModalTitle')}
          </h2>
        </div>
        <p className="mb-2 text-sm text-[var(--text-secondary)]">
          {t('auth.importModalBody')}
        </p>
        <FormTextarea
          id="deckImportPayload"
          value={payload}
          onChange={(event) => onPayloadChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              onClose()
            }
          }}
          placeholder={t('auth.importPlaceholder')}
          rows={10}
          className="py-2"
        />
        <DeckImportValidation
          parseError={parseError}
          validation={validation}
          isChecking={isChecking}
        />

        {isAuthenticated ? (
          <div className="mt-3">
            <FormLabel htmlFor="importDeckName">{t('auth.importDeckNameLabel')}</FormLabel>
            <FormInput
              id="importDeckName"
              data-testid="import-deck-name"
              value={deckName}
              placeholder={defaultDeckName}
              onChange={(event) => onDeckNameChange(event.target.value)}
              className="py-2"
            />
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              {t('auth.importDeckNameHint', { name: defaultDeckName })}
            </p>
          </div>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <AppButton type="button" variant="ghost" onClick={onClose}>
            {t('auth.close')}
          </AppButton>

          <AppButton
            type="button"
            variant="ghost"
            onClick={onUse}
            disabled={!canUse}
            data-testid="import-deck-use"
          >
            {t('auth.importUse')}
          </AppButton>

          {isAuthenticated ? (
            <AppButton
              type="button"
              onClick={onSave}
              disabled={!canUse || isSaving}
              data-testid="import-deck-save"
            >
              {isSaving ? t('auth.importSaving') : t('auth.importSave')}
            </AppButton>
          ) : null}
        </div>
      </Panel>
    </div>
  )
}
