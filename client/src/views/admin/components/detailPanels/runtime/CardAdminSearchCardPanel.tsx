import { useTranslation } from 'react-i18next'
import { CardAdminChevronIcon, CardAdminToggleSwitch } from '@/views/admin/components/controls'
import type { ICardAdminSearchCardPanelProps } from '@/views/admin/types/cardAdminDetailTypes'

/**
 * "Search your deck for a card, [reveal it,] add it to your hand[, then shuffle]".
 *
 * The selection itself is prompted (the engine asks once the node runs, using the deck as the candidate
 * pool), so authoring only needs the destination move plus the two search behaviours. The move actions are
 * configured with the Move Card panel, which the effects section renders alongside this one.
 */
export function CardAdminSearchCardPanel({
  effect,
  effectIndex,
  updateEffectAt,
}: ICardAdminSearchCardPanelProps) {
  const { t } = useTranslation()

  return (
    <details className="group border-t border-[var(--border-subtle)] border-l-2 border-l-cyan-500/55 pl-3 pt-3">
      <summary className="flex cursor-pointer items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        <span>{t('admin.panels.searchCard.title')}</span>
        <CardAdminChevronIcon rotateOnOpen />
      </summary>

      <div className="mt-3 grid grid-cols-1 gap-3">
        <p className="text-[11px] leading-snug text-[var(--text-secondary)]">
          {t('admin.panels.searchCard.help')}
        </p>

        <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
          <CardAdminToggleSwitch
            checked={effect.searchRevealSelection ?? true}
            onChange={(checked) =>
              updateEffectAt(effectIndex, (current) => ({ ...current, searchRevealSelection: checked }))}
            ariaLabel={t('admin.panels.searchCard.revealSelection')}
          />
          {t('admin.panels.searchCard.revealSelection')}
        </label>

        <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
          <CardAdminToggleSwitch
            checked={effect.searchShuffleAfter ?? true}
            onChange={(checked) =>
              updateEffectAt(effectIndex, (current) => ({ ...current, searchShuffleAfter: checked }))}
            ariaLabel={t('admin.panels.searchCard.shuffleAfter')}
          />
          {t('admin.panels.searchCard.shuffleAfter')}
        </label>
      </div>
    </details>
  )
}
