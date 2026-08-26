import { AppButton } from '@/components/ui'
import { CardAdminSelect } from '@/views/admin/components/CardAdminSelect'
import {
  CHAKRA_OPERATION_OPTIONS,
  TARGET_RANGE_OPTIONS,
} from '@/views/admin/constants'
import type { ICardAdminChakraAdjustmentsPanelProps } from '@/views/admin/types/cardAdminEffectPanels'
import { createDefaultChakraAdjustment } from '@/views/admin/utils'

export function CardAdminChakraAdjustmentsPanel({
  effect,
  effectIndex,
  updateEffectAt,
}: ICardAdminChakraAdjustmentsPanelProps) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-4 border-l-lime-500/55 bg-[var(--surface-muted)] p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Chakra Adjustments</p>

      <div className="flex justify-end">
        <AppButton
          type="button"
          variant="ghost"
          onClick={() =>
            updateEffectAt(effectIndex, (current) => ({
              ...current,
              chakraAdjustments: [...current.chakraAdjustments, createDefaultChakraAdjustment()],
            }))}
        >
          Add Chakra Adjustment
        </AppButton>
      </div>

      {effect.chakraAdjustments.map((chakraAdjustment, chakraIndex) => (
        <div key={`chakra-adjustment-${chakraIndex}`} className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-lime-500/30 bg-[var(--surface)] p-3 sm:grid-cols-4">
          <CardAdminSelect
            value={chakraAdjustment.targetRange}
            onChange={(event) =>
              updateEffectAt(effectIndex, (current) => ({
                ...current,
                chakraAdjustments: current.chakraAdjustments.map((row, index) =>
                  index === chakraIndex ? { ...row, targetRange: event.target.value } : row),
              }))}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            {TARGET_RANGE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </CardAdminSelect>

          <CardAdminSelect
            value={chakraAdjustment.operation}
            onChange={(event) =>
              updateEffectAt(effectIndex, (current) => ({
                ...current,
                chakraAdjustments: current.chakraAdjustments.map((row, index) =>
                  index === chakraIndex ? { ...row, operation: event.target.value } : row),
              }))}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            {CHAKRA_OPERATION_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </CardAdminSelect>

          <input
            type="number"
            value={chakraAdjustment.amount}
            onChange={(event) =>
              updateEffectAt(effectIndex, (current) => ({
                ...current,
                chakraAdjustments: current.chakraAdjustments.map((row, index) =>
                  index === chakraIndex ? { ...row, amount: Number.parseInt(event.target.value || '0', 10) } : row),
              }))}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
          />

          <AppButton
            type="button"
            variant="ghost"
            onClick={() =>
              updateEffectAt(effectIndex, (current) => ({
                ...current,
                chakraAdjustments: current.chakraAdjustments.filter((_, index) => index !== chakraIndex),
              }))}
          >
            Remove
          </AppButton>
        </div>
      ))}
    </div>
  )
}
