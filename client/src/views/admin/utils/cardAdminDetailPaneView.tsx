import i18n from '@/i18n'

export function renderEmptySelectionState(message: string) {
  return (
    <div className="mt-3 space-y-3">
      <p className="text-sm text-[var(--text-secondary)]">{message}</p>
      <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface)] p-3 text-xs text-[var(--text-secondary)]">
        {i18n.t('admin.detail.emptySelectionHint')}
      </div>
    </div>
  )
}
