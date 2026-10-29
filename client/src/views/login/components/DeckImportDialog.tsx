import { useLayoutEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { AppButton, Panel } from '@/components/ui'
import { FormInput, FormLabel, FormTextarea } from '@/components/forms'
import type { IDeckListParseError, IDeckRulesetValidation } from '@/domain/deck/types'
import type { IDeckRuleset } from '@/types/deckRuleset'
import { DeckImportValidation } from './DeckImportValidation'

export type IDeckImportDialogProps = {
  isOpen: boolean
  payload: string
  onPayloadChange: (value: string) => void
  parseError: IDeckListParseError | null
  rulesets: IDeckRuleset[]
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
  /**
   * Set when the dialog is overwriting an existing deck instead of creating one. The import tab is the editor, so the
   * same parser, ruleset evaluation and card payload serve both - only the wording and the available actions differ.
   */
  editDeckName?: string | null
  /** True while the edited list carries a different leader, which is the one change that resets the deck's record. */
  leaderWillResetRecord?: boolean
}

const DEFAULT_IMPORT_WINDOW_STYLE = {
  '--main-import-window-height': '80vh',
} as CSSProperties

export function DeckImportDialog({
  isOpen,
  payload,
  onPayloadChange,
  parseError,
  rulesets,
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
  editDeckName = null,
  leaderWillResetRecord = false,
}: IDeckImportDialogProps) {
  const { t } = useTranslation()
  const isEditing = Boolean(editDeckName)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const mainWindowRef = useRef<HTMLDivElement | null>(null)
  const appliedWindowHeightRef = useRef(0)

  useLayoutEffect(() => {
    if (!isOpen) {
      return
    }

    const overlay = overlayRef.current
    const mainWindow = mainWindowRef.current
    if (!overlay || !mainWindow) {
      return
    }

    const applyWindowHeight = () => {
      const measured = Math.round(mainWindow.getBoundingClientRect().height)
      if (measured <= 0) {
        return
      }

      const available = window.innerHeight - 48
      const height = available > 0 ? Math.min(measured, available) : measured
      if (height === appliedWindowHeightRef.current) {
        return
      }

      appliedWindowHeightRef.current = height
      overlay.style.setProperty('--main-import-window-height', `${height}px`)
    }

    applyWindowHeight()

    const observer = new ResizeObserver(applyWindowHeight)
    observer.observe(mainWindow)
    window.addEventListener('resize', applyWindowHeight)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', applyWindowHeight)
      appliedWindowHeightRef.current = 0
    }
  }, [isOpen])

  if (!isOpen) {
    return null
  }


  const parseErrorText = parseError && parseError.code !== 'empty'
    ? parseError.code === 'nonPositiveQuantity'
      ? t('deckRules.parse.nonPositiveQuantity', { line: parseError.line })
      : t('deckRules.parse.invalidLine', {
          line: parseError.line,
          value: parseError.value ?? '',
        })
    : null

  return (
    <div
      ref={overlayRef}
      style={DEFAULT_IMPORT_WINDOW_STYLE}
      className="fixed inset-0 z-50 overflow-y-auto bg-black/40 px-4 py-6 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
      onClick={onClose}
    >
      <div className="flex min-h-full w-full flex-col items-center justify-center gap-3 xl:flex-row">
        <div
          ref={mainWindowRef}
          data-testid="import-deck-main-window"
          className="w-full min-w-0 max-w-2xl"
        >
          <Panel
            className="w-full p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 id="import-modal-title" className="text-lg font-semibold text-[var(--text-primary)]">
                {isEditing
                  ? t('auth.deckEdit.title', { name: editDeckName })
                  : t('auth.importModalTitle')}
              </h2>
            </div>
            <p className="mb-2 text-sm text-[var(--text-secondary)]">
              {isEditing ? t('auth.deckEdit.body') : t('auth.importModalBody')}
            </p>
            {isEditing && leaderWillResetRecord ? (
              <p
                role="status"
                data-testid="deck-edit-leader-warning"
                className="mb-2 rounded-lg bg-[var(--button-primary-bg)]/15 px-2 py-1.5 text-xs font-medium leading-5 text-[var(--button-primary-bg)]"
              >
                {t('auth.deckEdit.leaderWarning')}
              </p>
            ) : null}
            <FormTextarea
              id="deckImportPayload"
              value={payload}
              onChange={(event) => onPayloadChange(event.target.value)}
              placeholder={t('auth.importPlaceholder')}
              rows={10}
              className="py-2"
            />

            {parseErrorText ? (
              <p
                role="alert"
                data-testid="login-deck-parse-error"
                title={parseErrorText}
                className="mt-2 truncate text-xs font-medium leading-5 text-[var(--button-primary-bg)]"
              >
                {parseErrorText}
              </p>
            ) : null}

            {isAuthenticated ? (
              <div className="mt-3">
                <FormLabel className="mb-2" htmlFor="importDeckName">{t('auth.importDeckNameLabel')}</FormLabel>
                <FormInput
                  id="importDeckName"
                  data-testid="import-deck-name"
                  value={deckName}
                  onChange={(event) => onDeckNameChange(event.target.value)}
                  className="py-2"
                />
                {isEditing ? null : (
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                    {t('auth.importDeckNameHint', { name: defaultDeckName })}
                  </p>
                )}
              </div>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <AppButton type="button" variant="ghost" onClick={onClose}>
                {t('auth.close')}
              </AppButton>

              {/* "Use" is about a draft being good enough for the next game; an overwrite has nothing to use. */}
              {isEditing ? null : (
                <AppButton
                  type="button"
                  variant="ghost"
                  onClick={onUse}
                  disabled={!canUse}
                  data-testid="import-deck-use"
                >
                  {t('auth.importUse')}
                </AppButton>
              )}

              {isAuthenticated ? (
                <AppButton
                  type="button"
                  onClick={onSave}
                  disabled={!canUse || isSaving}
                  data-testid="import-deck-save"
                >
                  {isEditing
                    ? isSaving
                      ? t('auth.deckEdit.saving')
                      : t('auth.deckEdit.save')
                    : isSaving
                      ? t('auth.importSaving')
                      : t('auth.importSave')}
                </AppButton>
              ) : null}
            </div>
          </Panel>
        </div>

        <Panel
          data-testid="import-deck-validation-window"
          className="flex h-[var(--main-import-window-height)] w-full max-w-sm flex-col overflow-hidden p-4 max-xl:h-64"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              {t('auth.importValidationTitle')}
            </h3>
            {isChecking ? (
              <span
                data-testid="login-deck-checking"
                className="shrink-0 text-[10px] text-[var(--text-muted)]"
              >
                {t('deckRules.status.checking')}
              </span>
            ) : null}
          </div>
          <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
            <DeckImportValidation rulesets={rulesets} validation={validation} />
            {rulesets.length === 0 ? (
              <p className="text-[11px] text-[var(--text-secondary)]">
                {t('deckRules.status.noRulesets')}
              </p>
            ) : null}
          </div>
        </Panel>
      </div>
    </div>
  )
}
