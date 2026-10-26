import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui'
import type { IDeckRuleset } from '@/types/deckRuleset'

export type IDeckRulesetListRailProps = {
  rulesets: readonly IDeckRuleset[]
  selectedRulesetId: string | null
  isCreating: boolean
  isLoading: boolean
  isError: boolean
  onSelect: (rulesetId: string) => void
  onCreate: () => void
}

export function DeckRulesetListRail({
  rulesets,
  selectedRulesetId,
  isCreating,
  isLoading,
  isError,
  onSelect,
  onCreate,
}: IDeckRulesetListRailProps) {
  const { t } = useTranslation()

  return (
    <aside
      data-testid="admin-ruleset-rail"
      className="flex h-full min-h-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          {t('admin.rulesets.rail.title')}
        </h2>
        <AppButton type="button" variant="ghost" onClick={onCreate} data-testid="admin-ruleset-new">
          {t('admin.rulesets.rail.newRuleset')}
        </AppButton>
      </div>

      {isLoading ? (
        <p className="mt-3 text-xs text-[var(--text-secondary)]">{t('admin.rulesets.rail.loading')}</p>
      ) : null}

      {isError ? (
        <p className="mt-3 text-xs text-[var(--text-secondary)]">{t('admin.rulesets.rail.loadFailed')}</p>
      ) : null}

      {!isLoading && !isError && rulesets.length === 0 && !isCreating ? (
        <p className="mt-3 text-xs text-[var(--text-secondary)]">{t('admin.rulesets.rail.empty')}</p>
      ) : null}

      <ul className="themed-scrollbar mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {rulesets.map((ruleset) => (
          <li key={ruleset.id}>
            <button
              type="button"
              data-testid="admin-ruleset-item"
              data-ruleset-key={ruleset.key}
              data-selected={ruleset.id === selectedRulesetId ? 'true' : 'false'}
              data-active={ruleset.isActive ? 'true' : 'false'}
              onClick={() => onSelect(ruleset.id)}
              className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${
                ruleset.id === selectedRulesetId
                  ? 'border-[var(--button-primary-bg)] bg-[var(--surface-hover)]'
                  : 'border-[var(--border-subtle)] hover:bg-[var(--surface-hover)]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-[var(--text-primary)]">{ruleset.name}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${
                    ruleset.isActive
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-[var(--surface)] text-[var(--text-muted)]'
                  }`}
                >
                  {ruleset.isActive
                    ? t('admin.rulesets.rail.active')
                    : t('admin.rulesets.rail.inactive')}
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)]">
                {t('admin.rulesets.rail.cardCount', { count: ruleset.nonLeaderCardCount })}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
