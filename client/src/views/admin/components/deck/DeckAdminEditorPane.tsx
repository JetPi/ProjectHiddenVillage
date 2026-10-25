import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { AppButton } from '@/components/ui'
import { FormInput, FormLabel } from '@/components/forms'
import { MAX_DECK_NAME_LENGTH } from '@/views/admin/utils/deckDraftValidation'
import { DeckAdminSelectedCardRow } from './DeckAdminSelectedCardRow'
import { DeckAdminValidationList } from './DeckAdminValidationList'
import type { IDeckAdminEditorPaneProps } from './types'
import { LeaderCardIndicator } from './DeckAdminLeaderCard'

export function DeckAdminEditorPane({
  isNew,
  name,
  onNameChange,
  leaderCard,
  selectedCards,
  leaderCopies,
  nonLeaderCopies,
  validation,
  isCheckingCards,
  canSave,
  isDirty,
  isSaving,
  isLoading,
  isError,
  onAddCopy,
  onRemoveCopy,
  onClearCard,
  onClearLeader,
  onSave,
  onOpenImport,
  onOpenDelete,
}: IDeckAdminEditorPaneProps) {
  const { t } = useTranslation()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">
          {isNew ? t('admin.decks.editor.newTitle') : t('admin.decks.editor.editTitle')}
        </h2>

        <div className="flex items-center gap-2">
          <Link
            to="/admin/rulesets"
            data-testid="admin-deck-formats-link"
            className="text-xs text-[var(--text-secondary)] underline-offset-2 hover:underline"
          >
            {t('admin.decks.editor.formats')}
          </Link>

          <AppButton type="button" variant="ghost" onClick={onOpenImport} data-testid="admin-deck-import">
            {t('admin.decks.editor.import')}
          </AppButton>

          {!isNew ? (
            <AppButton
              type="button"
              variant="ghost"
              onClick={onOpenDelete}
              className="border-red-500/40 text-red-600 hover:bg-red-500/10"
              data-testid="admin-deck-delete"
            >
              {t('admin.decks.editor.delete')}
            </AppButton>
          ) : null}

          <AppButton
            type="button"
            onClick={onSave}
            disabled={!canSave}
            data-testid="admin-deck-save"
            data-save-state={isSaving ? 'saving' : canSave ? 'ready' : 'blocked'}
            className={isSaving ? 'disabled:cursor-wait disabled:opacity-100' : undefined}
            title={isSaving || canSave ? undefined : t('admin.decks.editor.saveDisabledHint')}
          >
            {isSaving ? t('admin.decks.editor.saving') : t('admin.decks.editor.save')}
          </AppButton>
        </div>
      </div>

      <div className="pt-1">
        <DeckAdminValidationList validation={validation} isCheckingCards={isCheckingCards} />
      </div>

      {isLoading ? (
        <p className="mt-4 text-sm text-[var(--text-secondary)]">{t('admin.decks.editor.loadingDeck')}</p>
      ) : null}

      {isError ? (
        <p className="mt-4 text-sm text-[var(--text-secondary)]">{t('admin.decks.editor.loadFailed')}</p>
      ) : null}

      {!isLoading && !isError ? (
        <div className="themed-scrollbar mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          <div>
            <FormLabel htmlFor="deck-admin-name">{t('admin.decks.editor.nameLabel')}</FormLabel>
            <FormInput
              id="deck-admin-name"
              data-testid="admin-deck-name"
              value={name}
              maxLength={MAX_DECK_NAME_LENGTH}
              placeholder={t('admin.decks.editor.namePlaceholder')}
              onChange={(event) => onNameChange(event.target.value)}
            />
          </div>

          <div data-testid="deck-admin-format-summary" className="flex flex-wrap gap-1.5">
            <span
              data-testid="deck-admin-leader-count"
              data-leader-legal={leaderCopies === 1 ? 'true' : 'false'}
              className={`rounded-full border px-2 py-0.5 text-[11px] ${
                leaderCopies === 1
                  ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                  : 'border-[var(--button-primary-bg)]/40 text-[var(--button-primary-bg)]'
              }`}
            >
              {t('admin.decks.editor.leaderCount', { count: leaderCopies, expected: 1 })}
            </span>

            {validation.evaluations.map((evaluation) => (
              <span
                key={evaluation.ruleset.key}
                data-testid="deck-admin-ruleset-count"
                data-ruleset-key={evaluation.ruleset.key}
                data-ruleset-legal={evaluation.isValid ? 'true' : 'false'}
                className={`rounded-full border px-2 py-0.5 text-[11px] ${
                  evaluation.isValid
                    ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                    : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
                }`}
              >
                {t('admin.decks.editor.rulesetCount', {
                  name: evaluation.ruleset.name,
                  count: evaluation.nonLeaderCopies,
                  expected: evaluation.ruleset.nonLeaderCardCount,
                })}
              </span>
            ))}
          </div>

          <LeaderCardIndicator
            nonLeaderCopies={nonLeaderCopies}
            t={t}
            onClearLeader={onClearLeader}
            leaderCard={leaderCard}
          />

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              {t('admin.decks.editor.cardsTitle')}
            </p>

            {selectedCards.length === 0 ? (
              <p className="mt-2 rounded-lg border border-dashed border-[var(--border-subtle)] px-3 py-6 text-center text-xs text-[var(--text-secondary)]">
                {t('admin.decks.editor.emptyCards')}
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5" data-testid="deck-admin-card-list">
                {selectedCards.map((card) => (
                  <DeckAdminSelectedCardRow
                    key={card.cardId}
                    card={card}
                    onAddCopy={onAddCopy}
                    onRemoveCopy={onRemoveCopy}
                    onClearCard={onClearCard}
                  />
                ))}
              </ul>
            )}
          </div>

          {validation.isValid && !isDirty ? (
            <p className="text-[11px] text-[var(--text-muted)]">{t('admin.decks.editor.noChanges')}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
