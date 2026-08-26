import { AppButton } from '@/components/ui'
import { CountConstraintField } from '@/views/admin/components/controls'
import { CardAdminSelect } from '@/views/admin/components/controls'
import { CardAdminRemoveButton } from '@/views/admin/components/controls'
import {
  ATTRIBUTE_OPERATION_OPTIONS,
  ATTRIBUTE_TYPE_OPTIONS,
  TARGET_RANGE_OPTIONS,
  TARGET_TYPE_OPTIONS,
} from '@/views/admin/constants'
import type { ICardAdminAttributeModificationsPanelProps } from '@/views/admin/types/cardAdminEffectPanels'
import {
  createDefaultAttributeModification,
  resolveAttributeValueConstraintMode,
  resolveCountConstraintValue,
} from '@/views/admin/utils'

export function CardAdminAttributeModificationsPanel({
  effect,
  effectIndex,
  updateEffectAt,
}: ICardAdminAttributeModificationsPanelProps) {
  return (
    <details className="rounded-lg border border-[var(--border-subtle)] border-l-4 border-l-rose-500/50 bg-[var(--surface-muted)] p-3">
      <summary className="flex cursor-pointer items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        Attribute Modifications
      </summary>

      <div className="mt-3 grid grid-cols-1 gap-3">

      <div className="flex justify-end">
        <AppButton
          type="button"
          variant="ghost"
          onClick={() =>
            updateEffectAt(effectIndex, (current) => ({
              ...current,
              attributeModifications: [...current.attributeModifications, createDefaultAttributeModification()],
            }))}
        >
          Add Attribute Modification
        </AppButton>
      </div>

      {effect.attributeModifications.map((attributeModification, attributeIndex) => (
        <div key={`attribute-mod-${attributeIndex}`} className="space-y-3 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-rose-500/30 bg-[var(--surface)] p-3">
          <div className="flex justify-end">
            <CardAdminRemoveButton
              onClick={() =>
                updateEffectAt(effectIndex, (current) => ({
                  ...current,
                  attributeModifications: current.attributeModifications.filter((_, index) => index !== attributeIndex),
                }))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)]"
              ariaLabel="Remove Attribute Modification"
            />
          </div>

          <div className="grid grid-cols-1 gap-y-3 sm:grid-cols-4 sm:gap-x-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Target Type</label>
              <CardAdminSelect
                value={attributeModification.targetType}
                onChange={(event) =>
                  updateEffectAt(effectIndex, (current) => ({
                    ...current,
                    attributeModifications: current.attributeModifications.map((row, index) =>
                      index === attributeIndex ? { ...row, targetType: event.target.value } : row),
                  }))}
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
              >
                {TARGET_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </CardAdminSelect>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Target Range</label>
              <CardAdminSelect
                value={attributeModification.targetRange}
                onChange={(event) =>
                  updateEffectAt(effectIndex, (current) => ({
                    ...current,
                    attributeModifications: current.attributeModifications.map((row, index) =>
                      index === attributeIndex ? { ...row, targetRange: event.target.value } : row),
                  }))}
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
              >
                {TARGET_RANGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </CardAdminSelect>
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Affected Property</label>
              <CardAdminSelect
                value={attributeModification.attribute}
                onChange={(event) =>
                  updateEffectAt(effectIndex, (current) => ({
                    ...current,
                    attributeModifications: current.attributeModifications.map((row, index) =>
                      index === attributeIndex ? { ...row, attribute: event.target.value } : row),
                  }))}
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
              >
                {ATTRIBUTE_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </CardAdminSelect>
            </div>

            <CountConstraintField
              className="sm:col-span-4 grid grid-cols-1 gap-2 sm:grid-cols-4"
              selectClassName="w-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
              inputClassName="w-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
              modeLabel="Value Mode"
              valueLabel="Value"
              placeholder="Value"
              mode={resolveAttributeValueConstraintMode(
                attributeModification.minimumValue,
                attributeModification.maximumValue,
              )}
              value={resolveCountConstraintValue(
                resolveAttributeValueConstraintMode(
                  attributeModification.minimumValue,
                  attributeModification.maximumValue,
                ),
                attributeModification.value,
                attributeModification.minimumValue,
                attributeModification.maximumValue,
              )}
              trailingContent={(
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Operation</label>
                  <CardAdminSelect
                    value={attributeModification.operation}
                    onChange={(event) =>
                      updateEffectAt(effectIndex, (current) => ({
                        ...current,
                        attributeModifications: current.attributeModifications.map((row, index) =>
                          index === attributeIndex ? { ...row, operation: event.target.value } : row),
                      }))}
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                  >
                    {ATTRIBUTE_OPERATION_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </CardAdminSelect>
                </div>
              )}
              onModeChange={(selectedMode) =>
                updateEffectAt(effectIndex, (current) => ({
                  ...current,
                  attributeModifications: current.attributeModifications.map((row, index) => {
                    if (index !== attributeIndex) {
                      return row
                    }

                    if (selectedMode === 'Exact') {
                      return {
                        ...row,
                        minimumValue: null,
                        maximumValue: null,
                      }
                    }

                    const seedValue = row.minimumValue ?? row.maximumValue ?? row.value

                    return {
                      ...row,
                      minimumValue: selectedMode === 'Minimum' ? seedValue : null,
                      maximumValue: selectedMode === 'Maximum' ? seedValue : null,
                    }
                  }),
                }))}
              onValueChange={(parsedValue) =>
                updateEffectAt(effectIndex, (current) => ({
                  ...current,
                  attributeModifications: current.attributeModifications.map((row, index) => {
                    if (index !== attributeIndex) {
                      return row
                    }

                    const selectedMode = resolveAttributeValueConstraintMode(
                      row.minimumValue,
                      row.maximumValue,
                    )

                    if (selectedMode === 'Exact') {
                      return {
                        ...row,
                        value: parsedValue ?? 0,
                        minimumValue: null,
                        maximumValue: null,
                      }
                    }

                    return {
                      ...row,
                      minimumValue: selectedMode === 'Minimum' ? parsedValue : null,
                      maximumValue: selectedMode === 'Maximum' ? parsedValue : null,
                    }
                  }),
                }))}
            />
          </div>
        </div>
      ))}
      </div>
    </details>
  )
}
