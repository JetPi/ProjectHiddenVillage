import { AppButton } from '@/components/ui'
import { CardAdminToggleSwitch } from '@/views/admin/components/CardAdminToggleSwitch'
import {
  MOVE_CARD_DECK_PLACEMENT_OPTIONS,
  MOVE_CARD_DESTINATION_RANGE_OPTIONS,
  MOVE_CARD_MULTI_ORDERING_OPTIONS,
  MOVE_CARD_OPERATION_OPTIONS,
  MOVE_CARD_ZONE_OPTIONS,
} from '@/views/admin/constants'
import type { ICardAdminMoveCardActionsPanelProps } from '@/views/admin/types/cardAdminEffectPanels'
import {
  createDefaultMoveCardAction,
  parseNullableInteger,
} from '@/views/admin/utils'

export function CardAdminMoveCardActionsPanel({
  effect,
  effectIndex,
  updateEffectAt,
}: ICardAdminMoveCardActionsPanelProps) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-4 border-l-cyan-500/55 bg-[var(--surface-muted)] p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Move Card Actions</p>

      <div className="flex justify-end">
        <AppButton
          type="button"
          variant="ghost"
          onClick={() =>
            updateEffectAt(effectIndex, (current) => ({
              ...current,
              moveCardActions: [...current.moveCardActions, createDefaultMoveCardAction()],
            }))}
        >
          Add Move Action
        </AppButton>
      </div>

      {effect.moveCardActions.map((moveCardAction, moveCardActionIndex) => {
        const isDrawAction = moveCardAction.operation === 'Draw'
        const isDeckDestination = moveCardAction.destinationZone === 'Deck'
        const isIndexPlacement = (moveCardAction.deckPlacement ?? 'Top') === 'Index'

        return (
          <div key={`move-card-action-${moveCardActionIndex}`} className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-cyan-500/30 bg-[var(--surface)] p-3 sm:grid-cols-4">
            <select
              value={moveCardAction.operation}
              onChange={(event) =>
                updateEffectAt(effectIndex, (current) => ({
                  ...current,
                  moveCardActions: current.moveCardActions.map((row, index) => {
                    if (index !== moveCardActionIndex) {
                      return row
                    }

                    const nextOperation = event.target.value
                    if (nextOperation === 'Draw') {
                      return {
                        ...row,
                        operation: nextOperation,
                        sourceZone: null,
                        destinationZone: null,
                        drawCount: row.drawCount ?? 1,
                        moveCount: null,
                        destinationIndex: null,
                        deckPlacement: null,
                        multiCardOrdering: null,
                        destinationPlayerRange: 'Self',
                        allowCrossPlayer: false,
                      }
                    }

                    return {
                      ...row,
                      operation: nextOperation,
                      sourceZone: row.sourceZone ?? 'Hand',
                      destinationZone: row.destinationZone ?? 'Deck',
                      drawCount: null,
                      moveCount: row.moveCount ?? 1,
                      destinationIndex: row.destinationIndex ?? 0,
                      deckPlacement: row.deckPlacement ?? 'Top',
                      multiCardOrdering: row.multiCardOrdering ?? 'Selected Order',
                      destinationPlayerRange: row.destinationPlayerRange || 'Self',
                    }
                  }),
                }))}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
            >
              {MOVE_CARD_OPERATION_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>

            {!isDrawAction ? (
              <select
                value={moveCardAction.sourceZone ?? 'Hand'}
                onChange={(event) =>
                  updateEffectAt(effectIndex, (current) => ({
                    ...current,
                    moveCardActions: current.moveCardActions.map((row, index) =>
                      index === moveCardActionIndex ? { ...row, sourceZone: event.target.value } : row),
                  }))}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
              >
                {MOVE_CARD_ZONE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            ) : (
              <input
                type="number"
                min={1}
                value={moveCardAction.drawCount ?? 1}
                onChange={(event) =>
                  updateEffectAt(effectIndex, (current) => ({
                    ...current,
                    moveCardActions: current.moveCardActions.map((row, index) =>
                      index === moveCardActionIndex
                        ? { ...row, drawCount: Number.parseInt(event.target.value || '1', 10) }
                        : row),
                  }))}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                placeholder="Draw count"
              />
            )}

            {!isDrawAction ? (
              <select
                value={moveCardAction.destinationZone ?? 'Deck'}
                onChange={(event) =>
                  updateEffectAt(effectIndex, (current) => ({
                    ...current,
                    moveCardActions: current.moveCardActions.map((row, index) =>
                      index === moveCardActionIndex
                        ? {
                            ...row,
                            destinationZone: event.target.value,
                            deckPlacement: event.target.value === 'Deck' ? (row.deckPlacement ?? 'Top') : null,
                            multiCardOrdering: event.target.value === 'Deck' ? (row.multiCardOrdering ?? 'Selected Order') : null,
                            destinationIndex:
                              event.target.value === 'Deck'
                                ? (row.destinationIndex ?? 0)
                                : row.destinationIndex,
                          }
                        : row),
                  }))}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
              >
                {MOVE_CARD_ZONE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            ) : (
              <select
                value={moveCardAction.destinationPlayerRange}
                onChange={(event) =>
                  updateEffectAt(effectIndex, (current) => ({
                    ...current,
                    moveCardActions: current.moveCardActions.map((row, index) =>
                      index === moveCardActionIndex
                        ? { ...row, destinationPlayerRange: event.target.value }
                        : row),
                  }))}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
              >
                {MOVE_CARD_DESTINATION_RANGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            )}

            <AppButton
              type="button"
              variant="ghost"
              onClick={() =>
                updateEffectAt(effectIndex, (current) => ({
                  ...current,
                  moveCardActions: current.moveCardActions.filter((_, index) => index !== moveCardActionIndex),
                }))}
            >
              Remove
            </AppButton>

            {!isDrawAction ? (
              <>
                {isDeckDestination ? (
                  <select
                    value={moveCardAction.deckPlacement ?? 'Top'}
                    onChange={(event) =>
                      updateEffectAt(effectIndex, (current) => ({
                        ...current,
                        moveCardActions: current.moveCardActions.map((row, index) => {
                          if (index !== moveCardActionIndex) {
                            return row
                          }

                          const nextPlacement = event.target.value
                          return {
                            ...row,
                            deckPlacement: nextPlacement,
                            destinationIndex:
                              nextPlacement === 'Index'
                                ? (row.destinationIndex ?? 0)
                                : row.destinationIndex,
                          }
                        }),
                      }))}
                    className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                  >
                    {MOVE_CARD_DECK_PLACEMENT_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                ) : null}

                {isDeckDestination ? (
                  <select
                    value={moveCardAction.multiCardOrdering ?? 'Selected Order'}
                    onChange={(event) =>
                      updateEffectAt(effectIndex, (current) => ({
                        ...current,
                        moveCardActions: current.moveCardActions.map((row, index) =>
                          index === moveCardActionIndex
                            ? { ...row, multiCardOrdering: event.target.value }
                            : row),
                      }))}
                    className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                  >
                    {MOVE_CARD_MULTI_ORDERING_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                ) : null}

                {isDeckDestination && isIndexPlacement ? (
                  <input
                    type="number"
                    min={0}
                    value={moveCardAction.destinationIndex ?? 0}
                    onChange={(event) =>
                      updateEffectAt(effectIndex, (current) => ({
                        ...current,
                        moveCardActions: current.moveCardActions.map((row, index) =>
                          index === moveCardActionIndex
                            ? { ...row, destinationIndex: parseNullableInteger(event.target.value) ?? 0 }
                            : row),
                      }))}
                    className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    placeholder="Destination index"
                  />
                ) : null}

                <input
                  type="number"
                  min={1}
                  value={moveCardAction.moveCount ?? 1}
                  onChange={(event) =>
                    updateEffectAt(effectIndex, (current) => ({
                      ...current,
                      moveCardActions: current.moveCardActions.map((row, index) =>
                        index === moveCardActionIndex
                          ? { ...row, moveCount: Number.parseInt(event.target.value || '1', 10) }
                          : row),
                    }))}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                  placeholder="Move count"
                />

                <select
                  value={moveCardAction.destinationPlayerRange}
                  onChange={(event) =>
                    updateEffectAt(effectIndex, (current) => ({
                      ...current,
                      moveCardActions: current.moveCardActions.map((row, index) =>
                        index === moveCardActionIndex
                          ? { ...row, destinationPlayerRange: event.target.value }
                          : row),
                    }))}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                >
                  {MOVE_CARD_DESTINATION_RANGE_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>

                <label className="inline-flex items-center gap-2 text-sm text-[var(--text-primary)] sm:col-span-4">
                  <CardAdminToggleSwitch
                    checked={moveCardAction.allowCrossPlayer}
                    onChange={(checked) =>
                      updateEffectAt(effectIndex, (current) => ({
                        ...current,
                        moveCardActions: current.moveCardActions.map((row, index) =>
                          index === moveCardActionIndex
                            ? { ...row, allowCrossPlayer: checked }
                            : row),
                      }))}
                    ariaLabel="Allow Cross Player Transfer"
                  />
                  Allow Cross Player Transfer
                </label>
              </>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
