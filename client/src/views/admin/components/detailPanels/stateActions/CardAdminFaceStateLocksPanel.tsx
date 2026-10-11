import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui'
import { CardAdminSelect } from '@/views/admin/components/controls'
import { CardAdminRemoveButton } from '@/views/admin/components/controls'
import {
  FACE_STATE_LOCK_OPERATION_LABEL_KEYS,
  FACE_STATE_LOCK_OPERATION_OPTIONS,
  FACE_STATE_TARGET_CATEGORY_LABEL_KEYS,
  FACE_STATE_TARGET_CATEGORY_OPTIONS,
  optionLabel,
  TARGET_RANGE_LABEL_KEYS,
  TARGET_RANGE_OPTIONS,
} from '@/views/admin/constants'
import type { ICardAdminFaceStateLocksPanelProps } from '@/views/admin/types/cardAdminEffectPanels'
import { createDefaultFaceStateLock } from '@/views/admin/utils'
import { CardAdminChevronIcon } from '@/views/admin/components/controls'

export function CardAdminFaceStateLocksPanel({
  effect,
  effectIndex,
  updateEffectAt,
}: ICardAdminFaceStateLocksPanelProps) {
  const { t } = useTranslation()

  return (
    <details className="group border-t border-[var(--border-subtle)] border-l-2 border-l-violet-500/55 pl-3 pt-3">
      <summary className="flex cursor-pointer items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        <span>{t('admin.panels.faceStateLocks.title')}</span>
        <CardAdminChevronIcon rotateOnOpen />
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
          {t('admin.panels.faceStateLocks.add')}
        </AppButton>
      </div>

      {effect.faceStateLocks.map((faceStateLock, faceStateLockIndex) => (
        <div key={`face-lock-${faceStateLockIndex}`} className="grid grid-cols-1 gap-3 border-l-2 border-l-violet-500/30 pl-3 sm:grid-cols-4">
          <CardAdminSelect
            value={faceStateLock.targetCategory}
            onValueChange={(value) =>
              updateEffectAt(effectIndex, (current) => ({
                ...current,
                faceStateLocks: current.faceStateLocks.map((row, index) =>
                  index === faceStateLockIndex ? { ...row, targetCategory: value } : row),
              }))}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            {FACE_STATE_TARGET_CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>{optionLabel(t, FACE_STATE_TARGET_CATEGORY_LABEL_KEYS, option)}</option>
            ))}
          </CardAdminSelect>

          <CardAdminSelect
            value={faceStateLock.operation}
            onValueChange={(value) =>
              updateEffectAt(effectIndex, (current) => ({
                ...current,
                faceStateLocks: current.faceStateLocks.map((row, index) =>
                  index === faceStateLockIndex ? { ...row, operation: value } : row),
              }))}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            {FACE_STATE_LOCK_OPERATION_OPTIONS.map((option) => (
              <option key={option} value={option}>{optionLabel(t, FACE_STATE_LOCK_OPERATION_LABEL_KEYS, option)}</option>
            ))}
          </CardAdminSelect>

          <CardAdminSelect
            value={faceStateLock.targetRange}
            onValueChange={(value) =>
              updateEffectAt(effectIndex, (current) => ({
                ...current,
                faceStateLocks: current.faceStateLocks.map((row, index) =>
                  index === faceStateLockIndex ? { ...row, targetRange: value } : row),
              }))}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            {TARGET_RANGE_OPTIONS.map((option) => (
              <option key={option} value={option}>{optionLabel(t, TARGET_RANGE_LABEL_KEYS, option)}</option>
            ))}
          </CardAdminSelect>

          <CardAdminRemoveButton
            onClick={() =>
              updateEffectAt(effectIndex, (current) => ({
                ...current,
                faceStateLocks: current.faceStateLocks.filter((_, index) => index !== faceStateLockIndex),
              }))}
            className="inline-flex h-10 w-10 items-center justify-center self-stretch rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)]"
            ariaLabel={t('admin.panels.faceStateLocks.remove')}
          />
        </div>
      ))}
      </div>
    </details>
  )
}
