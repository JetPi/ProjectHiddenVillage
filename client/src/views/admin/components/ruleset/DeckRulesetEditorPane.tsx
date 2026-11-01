import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { translateKey } from '@/i18n'
import { AppButton } from '@/components/ui'
import { FormCheckboxField, FormInput, FormLabel } from '@/components/forms'
import { normalizeDeckCardId } from '@/domain/deck/parseDeckList'
import type { IDeckCardMetadata } from '@/domain/deck/types'
import type {
  IDeckRulesetCardPoolMode,
  IDeckRulesetCardRestrictionMatchType,
  IDeckRulesetSetCode,
} from '@/types/deckRuleset'
import type {
  IDeckRulesetDraft,
  IDeckRulesetValidationViolation,
} from '@/views/admin/types/deckRulesetAdminTypes'

const SELECT_CLASSNAME =
  'w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--field-bg)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--focus-ring)] focus:outline-none'

export type IDeckRulesetEditorPaneProps = {
  isCreating: boolean
  draft: IDeckRulesetDraft
  violations: IDeckRulesetValidationViolation[]
  cardsById: ReadonlyMap<string, IDeckCardMetadata>
  /** Set codes the catalogue holds, so a set rule can be picked instead of guessed. */
  setCodes: readonly IDeckRulesetSetCode[]
  canSave: boolean
  isDirty: boolean
  isSaving: boolean
  isDeleting: boolean
  onPatch: (patch: Partial<IDeckRulesetDraft>) => void
  onAddRestriction: (matchType: IDeckRulesetCardRestrictionMatchType, code: string) => void
  onUpdateRestrictionMaxCopies: (
    matchType: IDeckRulesetCardRestrictionMatchType,
    code: string,
    maxCopies: number,
  ) => void
  onRemoveRestriction: (matchType: IDeckRulesetCardRestrictionMatchType, code: string) => void
  onSave: () => void
  onDelete: () => void
}

export function DeckRulesetEditorPane({
  isCreating,
  draft,
  violations,
  cardsById,
  setCodes,
  canSave,
  isDirty,
  isSaving,
  isDeleting,
  onPatch,
  onAddRestriction,
  onUpdateRestrictionMaxCopies,
  onRemoveRestriction,
  onSave,
  onDelete,
}: IDeckRulesetEditorPaneProps) {
  const { t } = useTranslation()
  const [restrictionMatchType, setRestrictionMatchType] =
    useState<IDeckRulesetCardRestrictionMatchType>('Card')
  const [restrictionCode, setRestrictionCode] = useState('')

  const handleAddRestriction = () => {
    onAddRestriction(restrictionMatchType, restrictionCode)
    setRestrictionCode('')
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">
            {isCreating ? t('admin.rulesets.editor.newTitle') : t('admin.rulesets.editor.editTitle')}
          </h1>
          <p className="text-xs text-[var(--text-secondary)]">{t('admin.rulesets.subtitle')}</p>
        </div>

        <div className="flex items-center gap-2">
          {!isCreating ? (
            <AppButton
              type="button"
              variant="ghost"
              onClick={onDelete}
              disabled={isDeleting}
              className="border-red-500/40 text-red-600 hover:bg-red-500/10"
              data-testid="admin-ruleset-delete"
            >
              {isDeleting ? t('admin.rulesets.delete.deleting') : t('admin.rulesets.delete.confirm')}
            </AppButton>
          ) : null}

          <AppButton
            type="button"
            onClick={onSave}
            disabled={!canSave}
            data-testid="admin-ruleset-save"
            data-save-state={isSaving ? 'saving' : canSave ? 'ready' : 'blocked'}
            title={canSave ? undefined : t('admin.rulesets.editor.saveDisabledHint')}
          >
            {isSaving
              ? isCreating
                ? t('admin.rulesets.editor.creating')
                : t('admin.rulesets.editor.saving')
              : isCreating
                ? t('admin.rulesets.editor.create')
                : t('admin.rulesets.editor.save')}
          </AppButton>
        </div>
      </div>

      {violations.length > 0 ? (
        <ul
          data-testid="admin-ruleset-validation"
          className="mt-2 space-y-0.5 rounded-lg border border-[var(--button-primary-bg)]/40 bg-[var(--surface-muted)] px-2.5 py-2"
        >
          {violations.map((violation, index) => (
            <li key={`${violation.messageKey}-${index}`} className="text-xs text-[var(--button-primary-bg)]">
              {translateKey(t, violation.messageKey, violation.params)}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="themed-scrollbar mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <FormLabel htmlFor="admin-ruleset-key">{t('admin.rulesets.editor.key')}</FormLabel>
            <FormInput
              id="admin-ruleset-key"
              data-testid="admin-ruleset-key"
              value={draft.key}
              disabled={!isCreating}
              placeholder={t('admin.rulesets.editor.keyPlaceholder')}
              onChange={(event) => onPatch({ key: event.target.value.toLowerCase() })}
            />
            {!isCreating ? (
              <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                {t('admin.rulesets.editor.keyLocked')}
              </p>
            ) : null}
          </div>

          <div>
            <FormLabel htmlFor="admin-ruleset-name">{t('admin.rulesets.editor.name')}</FormLabel>
            <FormInput
              id="admin-ruleset-name"
              data-testid="admin-ruleset-name"
              value={draft.name}
              maxLength={64}
              onChange={(event) => onPatch({ name: event.target.value })}
            />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <FormLabel htmlFor="admin-ruleset-leader-count">{t('admin.rulesets.editor.leaderCount')}</FormLabel>
            <FormInput
              id="admin-ruleset-leader-count"
              data-testid="admin-ruleset-leader-count"
              type="number"
              min={1}
              value={draft.leaderCount}
              onChange={(event) =>
                onPatch({ leaderCount: Number.parseInt(event.target.value, 10) || 0 })}
            />
          </div>

          <div>
            <FormLabel htmlFor="admin-ruleset-card-count">{t('admin.rulesets.editor.nonLeaderCardCount')}</FormLabel>
            <FormInput
              id="admin-ruleset-card-count"
              data-testid="admin-ruleset-card-count"
              type="number"
              min={1}
              value={draft.nonLeaderCardCount}
              onChange={(event) =>
                onPatch({ nonLeaderCardCount: Number.parseInt(event.target.value, 10) || 0 })}
            />
          </div>

          <div>
            <FormLabel htmlFor="admin-ruleset-max-copies">{t('admin.rulesets.editor.maxCopies')}</FormLabel>
            <FormInput
              id="admin-ruleset-max-copies"
              data-testid="admin-ruleset-max-copies"
              type="number"
              min={1}
              value={draft.maxCopiesPerNonLeaderCard}
              onChange={(event) =>
                onPatch({ maxCopiesPerNonLeaderCard: Number.parseInt(event.target.value, 10) || 0 })}
            />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <FormCheckboxField
            id="admin-ruleset-active"
            data-testid="admin-ruleset-active"
            label={t('admin.rulesets.editor.active')}
            checked={draft.isActive}
            onChange={(event) => onPatch({ isActive: event.target.checked })}
          />
          {/* Unchecked keeps the format playable through hosting and invites; it only removes it from the queue. */}
          <FormCheckboxField
            id="admin-ruleset-quick-match"
            data-testid="admin-ruleset-quick-match"
            label={t('admin.rulesets.editor.availableInQuickMatch')}
            checked={draft.availableInQuickMatch}
            onChange={(event) => onPatch({ availableInQuickMatch: event.target.checked })}
          />
          <p className="text-[10px] leading-4 text-[var(--text-muted)] sm:col-span-2">
            {t('admin.rulesets.editor.availableInQuickMatchHint')}
          </p>
          <FormCheckboxField
            id="admin-ruleset-color-match"
            data-testid="admin-ruleset-color-match"
            label={t('admin.rulesets.editor.requireColorMatch')}
            checked={draft.requireLeaderColorMatch}
            onChange={(event) => onPatch({ requireLeaderColorMatch: event.target.checked })}
          />
          <FormCheckboxField
            id="admin-ruleset-allow-chakra"
            data-testid="admin-ruleset-allow-chakra"
            label={t('admin.rulesets.editor.allowChakra')}
            checked={draft.allowChakraCards}
            onChange={(event) => onPatch({ allowChakraCards: event.target.checked })}
          />
          <FormCheckboxField
            id="admin-ruleset-allow-summon"
            data-testid="admin-ruleset-allow-summon"
            label={t('admin.rulesets.editor.allowSummon')}
            checked={draft.allowSummonCards}
            onChange={(event) => onPatch({ allowSummonCards: event.target.checked })}
          />
        </div>

        <div>
          <FormLabel htmlFor="admin-ruleset-sort-order">{t('admin.rulesets.editor.sortOrder')}</FormLabel>
          <FormInput
            id="admin-ruleset-sort-order"
            data-testid="admin-ruleset-sort-order"
            type="number"
            min={0}
            value={draft.sortOrder}
            className="max-w-32"
            onChange={(event) => onPatch({ sortOrder: Number.parseInt(event.target.value, 10) || 0 })}
          />
        </div>

        <section>
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            {t('admin.rulesets.editor.clockTitle')}
          </h2>
          <p className="text-[10px] text-[var(--text-muted)]">{t('admin.rulesets.editor.clockHint')}</p>

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <FormCheckboxField
              id="admin-ruleset-clock-enabled"
              data-testid="admin-ruleset-clock-enabled"
              label={t('admin.rulesets.editor.clockEnabled')}
              checked={draft.clockEnabled}
              onChange={(event) => onPatch({ clockEnabled: event.target.checked })}
            />

            <div>
              <FormLabel htmlFor="admin-ruleset-main-phase-seconds">
                {t('admin.rulesets.editor.mainPhaseSeconds')}
              </FormLabel>
              <FormInput
                id="admin-ruleset-main-phase-seconds"
                data-testid="admin-ruleset-main-phase-seconds"
                type="number"
                min={1}
                value={draft.mainPhaseSeconds}
                onChange={(event) =>
                  onPatch({ mainPhaseSeconds: Number.parseInt(event.target.value, 10) || 0 })}
              />
            </div>

            <div>
              <FormLabel htmlFor="admin-ruleset-other-phase-seconds">
                {t('admin.rulesets.editor.otherPhaseSeconds')}
              </FormLabel>
              <FormInput
                id="admin-ruleset-other-phase-seconds"
                data-testid="admin-ruleset-other-phase-seconds"
                type="number"
                min={1}
                value={draft.otherPhaseSeconds}
                onChange={(event) =>
                  onPatch({ otherPhaseSeconds: Number.parseInt(event.target.value, 10) || 0 })}
              />
            </div>

            <div>
              <FormLabel htmlFor="admin-ruleset-player-pool-seconds">
                {t('admin.rulesets.editor.playerPoolSeconds')}
              </FormLabel>
              <FormInput
                id="admin-ruleset-player-pool-seconds"
                data-testid="admin-ruleset-player-pool-seconds"
                type="number"
                min={1}
                value={draft.playerPoolSeconds}
                onChange={(event) =>
                  onPatch({ playerPoolSeconds: Number.parseInt(event.target.value, 10) || 0 })}
              />
            </div>

            <div>
              <FormLabel htmlFor="admin-ruleset-timeouts-before-forfeit">
                {t('admin.rulesets.editor.timeoutsBeforeForfeit')}
              </FormLabel>
              <FormInput
                id="admin-ruleset-timeouts-before-forfeit"
                data-testid="admin-ruleset-timeouts-before-forfeit"
                type="number"
                min={1}
                value={draft.timeoutsBeforeForfeit}
                onChange={(event) =>
                  onPatch({ timeoutsBeforeForfeit: Number.parseInt(event.target.value, 10) || 0 })}
              />
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            {t('admin.rulesets.editor.cardPoolTitle')}
          </h2>
          <p className="text-[10px] text-[var(--text-muted)]">{t('admin.rulesets.editor.cardPoolHint')}</p>

          <div className="mt-2">
            <FormLabel htmlFor="admin-ruleset-pool-mode">{t('admin.rulesets.editor.cardPoolMode')}</FormLabel>
            <select
              id="admin-ruleset-pool-mode"
              data-testid="admin-ruleset-pool-mode"
              className={SELECT_CLASSNAME}
              value={draft.cardPoolMode}
              onChange={(event) => onPatch({ cardPoolMode: event.target.value as IDeckRulesetCardPoolMode })}
            >
              <option value="Open">{t('admin.rulesets.editor.cardPoolModeOpen')}</option>
              <option value="AllowList">{t('admin.rulesets.editor.cardPoolModeAllowList')}</option>
            </select>
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              {draft.cardPoolMode === 'AllowList'
                ? t('admin.rulesets.editor.cardPoolModeAllowListHint')
                : t('admin.rulesets.editor.cardPoolModeOpenHint')}
            </p>
          </div>

          <h3 className="mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            {t('admin.rulesets.editor.restrictionsTitle')}
          </h3>
          <p className="text-[10px] text-[var(--text-muted)]">
            {t('admin.rulesets.editor.restrictionsHint')}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              aria-label={t('admin.rulesets.editor.restrictionMatchType')}
              data-testid="admin-ruleset-restriction-match-type"
              className={`${SELECT_CLASSNAME} max-w-36`}
              value={restrictionMatchType}
              onChange={(event) =>
                setRestrictionMatchType(event.target.value as IDeckRulesetCardRestrictionMatchType)}
            >
              <option value="Card">{t('admin.rulesets.editor.matchTypeCard')}</option>
              <option value="Set">{t('admin.rulesets.editor.matchTypeSet')}</option>
            </select>

            <FormInput
              data-testid="admin-ruleset-restriction-code"
              value={restrictionCode}
              list="admin-ruleset-set-codes"
              placeholder={restrictionMatchType === 'Set' ? 'SAMPLE' : 'SAMPLE-3'}
              className="max-w-48"
              onChange={(event) => setRestrictionCode(event.target.value)}
            />

            <datalist id="admin-ruleset-set-codes">
              {setCodes.map((setCode) => (
                <option key={setCode.code} value={setCode.code}>
                  {`${setCode.code} (${setCode.cardCount})`}
                </option>
              ))}
            </datalist>

            <AppButton
              type="button"
              variant="ghost"
              onClick={handleAddRestriction}
              disabled={restrictionCode.trim().length === 0}
              data-testid="admin-ruleset-restriction-add"
            >
              {t('admin.rulesets.editor.addRestriction')}
            </AppButton>
          </div>

          {draft.restrictions.length === 0 ? (
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              {t('admin.rulesets.editor.restrictionsEmpty')}
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {draft.restrictions.map((restriction) => {
                const isCardRule = restriction.matchType === 'Card'
                const metadata = isCardRule
                  ? cardsById.get(normalizeDeckCardId(restriction.code)) ?? null
                  : null
                const displayName = isCardRule
                  ? metadata?.displayName
                    ?? t('admin.rulesets.editor.restrictionUnknownCard', { code: restriction.code })
                  : t('admin.rulesets.editor.setRuleName', { code: restriction.code })
                const setCardCount = setCodes.find(
                  (setCode) => setCode.code.trim().toUpperCase() === restriction.code.trim().toUpperCase(),
                )?.cardCount

                return (
                  <li
                    key={`${restriction.matchType}:${restriction.code}`}
                    data-testid="admin-ruleset-restriction"
                    data-match-type={restriction.matchType}
                    data-code={restriction.code}
                    className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] px-2 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm text-[var(--text-primary)]">{displayName}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">
                        <span className="font-semibold uppercase tracking-[0.08em]">
                          {isCardRule
                            ? t('admin.rulesets.editor.matchTypeCard')
                            : t('admin.rulesets.editor.matchTypeSet')}
                        </span>
                        {` · ${restriction.code}`}
                        {isCardRule
                          ? metadata
                            ? null
                            : ` · ${t('admin.rulesets.editor.restrictionUnknownCardHint')}`
                          : setCardCount === undefined
                            ? null
                            : ` · ${t('admin.rulesets.editor.setRuleCardCount', { count: setCardCount })}`}
                      </p>
                    </div>

                    <FormInput
                      data-testid="admin-ruleset-restriction-max"
                      data-code={restriction.code}
                      type="number"
                      min={0}
                      max={99}
                      value={restriction.maxCopies}
                      className="max-w-20 px-2 py-1 text-xs"
                      onChange={(event) =>
                        onUpdateRestrictionMaxCopies(
                          restriction.matchType,
                          restriction.code,
                          Number.parseInt(event.target.value, 10) || 0,
                        )}
                    />

                    <button
                      type="button"
                      data-testid="admin-ruleset-restriction-remove"
                      onClick={() => onRemoveRestriction(restriction.matchType, restriction.code)}
                      aria-label={translateKey(t, 'admin.rulesets.editor.removeRestriction', {
                        name: displayName,
                      })}
                      className="rounded-md px-1.5 py-0.5 text-[11px] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                    >
                      {t('admin.decks.cards.clear')}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {!isDirty && !isCreating ? (
          <p className="text-[11px] text-[var(--text-muted)]">{t('admin.decks.editor.noChanges')}</p>
        ) : null}
      </div>
    </div>
  )
}
