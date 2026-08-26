import { AppButton } from '@/components/ui'
import { CardAdminSelect } from '@/views/admin/components/controls'
import { CardAdminRemoveButton } from '@/views/admin/components/controls'
import {
  FACE_STATE_LOCK_OPERATION_OPTIONS,
  FACE_STATE_TARGET_CATEGORY_OPTIONS,
  TARGET_RANGE_OPTIONS,
} from '@/views/admin/constants'
import type { ICardAdminFaceStateLocksPanelProps } from '@/views/admin/types/cardAdminEffectPanels'
import { createDefaultFaceStateLock } from '@/views/admin/utils'

export function CardAdminFaceStateLocksPanel({
  effect,
  effectIndex,
  updateEffectAt,
}: ICardAdminFaceStateLocksPanelProps) {
  return (
    <details className="rounded-lg border border-[var(--border-subtle)] border-l-4 border-l-violet-500/55 bg-[var(--surface-muted)] p-3">
      <summary className="flex cursor-pointer items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        Face State Locks
      </summary>

      <div className="mt-3 grid grid-cols-1 gap-3">

      <div className="flex justify-end">
        <AppButton
          type="button"
          variant="ghost"
          onClick={() =>
            updateEffectAt(effectIndex, (current) => ({
              ...current,
              faceStateLocks: [...current.faceStateLocks, createDefaultFaceStateLock()],
            }))}
        >
          Add Face State Lock
        </AppButton>
      </div>

      {effect.faceStateLocks.map((faceStateLock, faceStateLockIndex) => (
        <div key={`face-lock-${faceStateLockIndex}`} className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-violet-500/30 bg-[var(--surface)] p-3 sm:grid-cols-4">
          <CardAdminSelect
            value={faceStateLock.targetCategory}
            onChange={(event) =>
              updateEffectAt(effectIndex, (current) => ({
                ...current,
                faceStateLocks: current.faceStateLocks.map((row, index) =>
                  index === faceStateLockIndex ? { ...row, targetCategory: event.target.value } : row),
              }))}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            {FACE_STATE_TARGET_CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </CardAdminSelect>

          <CardAdminSelect
            value={faceStateLock.operation}
            onChange={(event) =>
              updateEffectAt(effectIndex, (current) => ({
                ...current,
                faceStateLocks: current.faceStateLocks.map((row, index) =>
                  index === faceStateLockIndex ? { ...row, operation: event.target.value } : row),
              }))}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            {FACE_STATE_LOCK_OPERATION_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </CardAdminSelect>

          <CardAdminSelect
            value={faceStateLock.targetRange}
            onChange={(event) =>
              updateEffectAt(effectIndex, (current) => ({
                ...current,
                faceStateLocks: current.faceStateLocks.map((row, index) =>
                  index === faceStateLockIndex ? { ...row, targetRange: event.target.value } : row),
              }))}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            {TARGET_RANGE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </CardAdminSelect>

          <CardAdminRemoveButton
            onClick={() =>
              updateEffectAt(effectIndex, (current) => ({
                ...current,
                faceStateLocks: current.faceStateLocks.filter((_, index) => index !== faceStateLockIndex),
              }))}
            className="inline-flex h-10 w-10 items-center justify-center self-stretch rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)]"
            ariaLabel="Remove Face State Lock"
          />
        </div>
      ))}
      </div>
    </details>
  )
}
