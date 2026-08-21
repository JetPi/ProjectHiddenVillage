import { CardAdminSelectedCardSummary } from './CardAdminSelectedCardSummary'
import type { ICardAdminDetailPaneProps } from '@/views/admin/types/cardAdminDetailPane'

function renderEmptySelectionState(message: string) {
  return (
    <div className="mt-3 space-y-3">
      <p className="text-sm text-[var(--text-secondary)]">{message}</p>
      <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface)] p-3 text-xs text-[var(--text-secondary)]">
        This right-side panel is the main editor body where effect-edit controls will be added next.
      </div>
    </div>
  )
}

export function CardAdminDetailPane({ selectedCard }: ICardAdminDetailPaneProps) {
  return (
    <div className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
      <p className="text-sm font-semibold text-[var(--text-primary)]">Effect Editor Workspace</p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">
        Card details preview shown here while effect editor controls are being implemented.
      </p>

      {selectedCard ? (
        <CardAdminSelectedCardSummary card={selectedCard} />
      ) : (
        renderEmptySelectionState('Select a card from the left rail to prepare editing.')
      )}
    </div>
  )
}
