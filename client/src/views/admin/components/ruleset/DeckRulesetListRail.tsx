import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { twMerge } from 'tailwind-merge'
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
  /** Commits the order a drop produced. The rail is the only control that changes it. */
  onReorder: (fromIndex: number, toIndex: number) => void
}

/**
 * The list of formats. Rows are reordered by dragging their handle, mirroring the effect list on the card editor:
 * the handle carries the drag, the row is the drop target, and dropping names the new slot.
 */
export function DeckRulesetListRail({
  rulesets,
  selectedRulesetId,
  isCreating,
  isLoading,
  isError,
  onSelect,
  onCreate,
  onReorder,
}: IDeckRulesetListRailProps) {
  const { t } = useTranslation()
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragPreviewRef = useRef<HTMLDivElement | null>(null)

  const clearDragState = () => {
    setDraggedIndex(null)
    setDragOverIndex(null)
    dragPreviewRef.current?.remove()
    dragPreviewRef.current = null
  }

  const handleDragStart = (event: DragEvent<HTMLSpanElement>, index: number, label: string) => {
    setDraggedIndex(index)
    setDragOverIndex(null)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))

    const preview = document.createElement('div')
    preview.textContent = label
    preview.style.cssText = [
      'position: fixed',
      'top: -1000px',
      'left: -1000px',
      'max-width: 16rem',
      'padding: 6px 10px',
      'border: 1px solid var(--border-subtle)',
      'border-radius: 8px',
      'background: var(--surface)',
      'box-shadow: var(--panel-shadow)',
      'font-size: 11px',
      'color: var(--text-primary)',
      'white-space: nowrap',
      'overflow: hidden',
      'text-overflow: ellipsis',
    ].join(';')

    document.body.appendChild(preview)
    dragPreviewRef.current = preview
    event.dataTransfer.setDragImage(preview, 12, 14)
  }

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
        {rulesets.map((ruleset, index) => (
          <li
            key={ruleset.id}
            data-testid="admin-ruleset-row"
            className={twMerge(
              'rounded-lg transition-shadow',
              draggedIndex === index ? 'opacity-60' : '',
              dragOverIndex === index && draggedIndex !== index
                ? 'ring-2 ring-[var(--focus-ring)]/45'
                : '',
            )}
            onDragOver={(event) => {
              if (draggedIndex === null || draggedIndex === index) {
                return
              }

              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              setDragOverIndex(index)
            }}
            onDrop={(event) => {
              event.preventDefault()

              if (draggedIndex === null || draggedIndex === index) {
                clearDragState()
                return
              }

              onReorder(draggedIndex, index)
              clearDragState()
            }}
            onDragEnd={clearDragState}
          >
            <div className="flex items-stretch gap-1">
              <span
                draggable
                onDragStart={(event) => handleDragStart(event, index, ruleset.name)}
                className="inline-flex w-5 shrink-0 cursor-grab items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] active:cursor-grabbing"
                aria-hidden="true"
                title={t('admin.rulesets.rail.dragToReorder')}
                data-testid="admin-ruleset-drag-handle"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-3.5 w-3.5">
                  <circle cx="7" cy="6" r="1.2" />
                  <circle cx="13" cy="6" r="1.2" />
                  <circle cx="7" cy="10" r="1.2" />
                  <circle cx="13" cy="10" r="1.2" />
                  <circle cx="7" cy="14" r="1.2" />
                  <circle cx="13" cy="14" r="1.2" />
                </svg>
              </span>

              <button
                type="button"
                data-testid="admin-ruleset-item"
                data-ruleset-key={ruleset.key}
                data-selected={ruleset.id === selectedRulesetId ? 'true' : 'false'}
                data-active={ruleset.isActive ? 'true' : 'false'}
                onClick={() => onSelect(ruleset.id)}
                className={`min-w-0 flex-1 rounded-lg border px-2.5 py-2 text-left transition-colors ${
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
            </div>
          </li>
        ))}
      </ul>
    </aside>
  )
}
