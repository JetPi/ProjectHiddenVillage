import { AppButton } from '@/components/ui'
import { CardAdminSelect } from '@/views/admin/components/controls'
import { CardAdminRemoveButton } from '@/views/admin/components/controls'
import {
  FACE_STATE_OPTIONS,
  FACE_STATE_TARGET_CATEGORY_OPTIONS,
  TARGET_RANGE_OPTIONS,
} from '@/views/admin/constants'
import type { ICardAdminFaceStateFlipsPanelProps } from '@/views/admin/types/cardAdminEffectPanels'
import { createDefaultSummonCardFlip } from '@/views/admin/utils'
import { CardAdminChevronIcon } from '@/views/admin/components/controls'

export function CardAdminFaceStateFlipsPanel({
  effect,
  effectIndex,
  updateEffectAt,
}: ICardAdminFaceStateFlipsPanelProps) {
  return (
    <details className="group border-t border-[var(--border-subtle)] border-l-2 border-l-indigo-500/55 pl-3 pt-3">
      <summary className="flex cursor-pointer items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        <span>Face State Flips</span>
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
              summonCardFlips: [...current.summonCardFlips, createDefaultSummonCardFlip()],
            }))}
        >
          Add Face State Flip
        </AppButton>
      </div>

      {effect.summonCardFlips.map((summonCardFlip, summonFlipIndex) => (
        <div key={`summon-flip-${summonFlipIndex}`} className="grid grid-cols-1 gap-3 border-l-2 border-l-indigo-500/30 pl-3 sm:grid-cols-4">
          <CardAdminSelect
            value={summonCardFlip.targetCategory}
            onValueChange={(value) =>
              updateEffectAt(effectIndex, (current) => ({
                ...current,
                summonCardFlips: current.summonCardFlips.map((row, index) =>
                  index === summonFlipIndex ? { ...row, targetCategory: value } : row),
              }))}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            {FACE_STATE_TARGET_CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </CardAdminSelect>

          <CardAdminSelect
            value={summonCardFlip.targetRange}
            onValueChange={(value) =>
              updateEffectAt(effectIndex, (current) => ({
                ...current,
                summonCardFlips: current.summonCardFlips.map((row, index) =>
                  index === summonFlipIndex ? { ...row, targetRange: value } : row),
              }))}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            {TARGET_RANGE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </CardAdminSelect>

          <CardAdminSelect
            value={summonCardFlip.faceState}
            onValueChange={(value) =>
              updateEffectAt(effectIndex, (current) => ({
                ...current,
                summonCardFlips: current.summonCardFlips.map((row, index) =>
                  index === summonFlipIndex ? { ...row, faceState: value } : row),
              }))}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            {FACE_STATE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </CardAdminSelect>

          <CardAdminRemoveButton
            onClick={() =>
              updateEffectAt(effectIndex, (current) => ({
                ...current,
                summonCardFlips: current.summonCardFlips.filter((_, index) => index !== summonFlipIndex),
              }))}
            className="inline-flex h-10 w-10 items-center justify-center self-stretch rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)]"
            ariaLabel="Remove Face State Flip"
          />
        </div>
      ))}
      </div>
    </details>
  )
}
