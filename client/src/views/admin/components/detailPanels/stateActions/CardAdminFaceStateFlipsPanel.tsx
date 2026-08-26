import { AppButton } from '@/components/ui'
import {
  FACE_STATE_OPTIONS,
  FACE_STATE_TARGET_CATEGORY_OPTIONS,
  TARGET_RANGE_OPTIONS,
} from '@/views/admin/constants'
import type { ICardAdminFaceStateFlipsPanelProps } from '@/views/admin/types/cardAdminEffectPanels'
import { createDefaultSummonCardFlip } from '@/views/admin/utils'

export function CardAdminFaceStateFlipsPanel({
  effect,
  effectIndex,
  updateEffectAt,
}: ICardAdminFaceStateFlipsPanelProps) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-4 border-l-indigo-500/55 bg-[var(--surface-muted)] p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Face State Flips</p>

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
        <div key={`summon-flip-${summonFlipIndex}`} className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-indigo-500/30 bg-[var(--surface)] p-3 sm:grid-cols-4">
          <select
            value={summonCardFlip.targetCategory}
            onChange={(event) =>
              updateEffectAt(effectIndex, (current) => ({
                ...current,
                summonCardFlips: current.summonCardFlips.map((row, index) =>
                  index === summonFlipIndex ? { ...row, targetCategory: event.target.value } : row),
              }))}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            {FACE_STATE_TARGET_CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>

          <select
            value={summonCardFlip.targetRange}
            onChange={(event) =>
              updateEffectAt(effectIndex, (current) => ({
                ...current,
                summonCardFlips: current.summonCardFlips.map((row, index) =>
                  index === summonFlipIndex ? { ...row, targetRange: event.target.value } : row),
              }))}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            {TARGET_RANGE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>

          <select
            value={summonCardFlip.faceState}
            onChange={(event) =>
              updateEffectAt(effectIndex, (current) => ({
                ...current,
                summonCardFlips: current.summonCardFlips.map((row, index) =>
                  index === summonFlipIndex ? { ...row, faceState: event.target.value } : row),
              }))}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            {FACE_STATE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>

          <AppButton
            type="button"
            variant="ghost"
            onClick={() =>
              updateEffectAt(effectIndex, (current) => ({
                ...current,
                summonCardFlips: current.summonCardFlips.filter((_, index) => index !== summonFlipIndex),
              }))}
          >
            Remove
          </AppButton>
        </div>
      ))}
    </div>
  )
}
