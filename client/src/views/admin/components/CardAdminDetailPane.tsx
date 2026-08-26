import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AppButton } from '@/components/ui'
import { showAppInfoToast, showAppSuccessToast } from '@/components/feedback/appToastNotifications'
import { CardAdminSelectedCardSummary } from './CardAdminSelectedCardSummary'
import { CardAdminConditionsSection, CardAdminEffectsSection } from './detailSections'
import { useCardAdminEffectEditorModel } from '@/views/admin/model/useCardAdminEffectEditorModel'
import {
  createDefaultEffect,
  normalizeEffectId,
  renderEmptySelectionState,
} from '@/views/admin/utils'
import { fetchCardCatalogEffectConditionKeywords } from '@/services/api/cardCatalogApi'
import {
  CONDITION_OPTIONS,
  EFFECT_CONDITION_KEYWORD_OPTIONS_FALLBACK,
} from '@/views/admin/constants'
import type { ICardAdminDetailEditorProps, ICardAdminDetailPaneProps } from '@/views/admin/types/cardAdminDetailPane'
import type { ICardCatalogEffectRequest } from '@/services/api/types/cardCatalog'

export function CardAdminDetailPane({ selectedCard }: ICardAdminDetailPaneProps) {
  return (
    <div className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
      {selectedCard ? (
        <CardAdminDetailEditor key={selectedCard.id} selectedCard={selectedCard} />
      ) : (
        renderEmptySelectionState('Select a card from the left rail to prepare editing.')
      )}
    </div>
  )
}

function CardAdminDetailEditor({ selectedCard }: ICardAdminDetailEditorProps) {
  const editorModel = useCardAdminEffectEditorModel(selectedCard)
  const [conditionToAdd, setConditionToAdd] = useState('')
  const [effectConditionKeywordOptions, setEffectConditionKeywordOptions] = useState<string[]>(
    () => [...EFFECT_CONDITION_KEYWORD_OPTIONS_FALLBACK],
  )
  const [collapsedEffects, setCollapsedEffects] = useState<Set<number>>(
    () => new Set(selectedCard.effects.map((_, index) => index)),
  )

  useEffect(() => {
    let isDisposed = false

    async function loadEffectConditionKeywords() {
      try {
        const serverKeywords = await fetchCardCatalogEffectConditionKeywords()
        if (isDisposed) {
          return
        }

        const normalizedKeywords = serverKeywords
          .map((keyword) => keyword.trim())
          .filter((keyword) => keyword.length > 0)

        if (normalizedKeywords.length > 0) {
          setEffectConditionKeywordOptions(Array.from(new Set(normalizedKeywords)))
        }
      } catch {
        // Keep fallback list when metadata fetch fails.
      }
    }

    void loadEffectConditionKeywords()

    return () => {
      isDisposed = true
    }
  }, [])

  const isSaveDisabled = editorModel.isSaving
  const parsedEffects = editorModel.draft.effects
  const allConditionOptions = useMemo(
    () => Array.from(new Set([...CONDITION_OPTIONS, ...editorModel.draft.conditions])),
    [editorModel.draft.conditions],
  )
  const availableConditionOptions = useMemo(
    () => allConditionOptions.filter((condition) => !editorModel.draft.conditions.includes(condition)),
    [allConditionOptions, editorModel.draft.conditions],
  )
  const effectIdOptions = useMemo(
    () => Array.from(new Set(parsedEffects.map((effect) => normalizeEffectId(effect.id)).filter((id) => id.length > 0))),
    [parsedEffects],
  )
  const linkedEffectGroups = useMemo(() => {
    const effectIdSet = new Set(effectIdOptions)

    return parsedEffects.flatMap((effect) => {
      const sourceId = normalizeEffectId(effect.id)
      if (!sourceId) {
        return []
      }

      const onSuccessTarget = normalizeEffectId(effect.onSuccessEffectId)
      const onFailureTarget = normalizeEffectId(effect.onFailureEffectId)
      const nextGroup = {
        sourceId,
        onSuccessTarget: onSuccessTarget && effectIdSet.has(onSuccessTarget)
          ? onSuccessTarget
          : null,
        onFailureTarget: onFailureTarget && effectIdSet.has(onFailureTarget)
          ? onFailureTarget
          : null,
      }

      if (!nextGroup.onSuccessTarget && !nextGroup.onFailureTarget) {
        return []
      }

      return [nextGroup]
    })
  }, [effectIdOptions, parsedEffects])
  const updateEffects = (nextEffects: ICardCatalogEffectRequest[]) => {
    editorModel.setEffects(nextEffects)
  }

  const updateEffectAt = (effectIndex: number, updater: (effect: ICardCatalogEffectRequest) => ICardCatalogEffectRequest) => {
    const nextEffects = parsedEffects.map((effect, index) => (index === effectIndex ? updater(effect) : effect))
    updateEffects(nextEffects)
  }

  const removeEffectAt = (effectIndex: number) => {
    if (parsedEffects.length <= 1) {
      return
    }

    const nextEffects = parsedEffects.filter((_, index) => index !== effectIndex)
    updateEffects(nextEffects)

    setCollapsedEffects((current) => {
      const next = new Set<number>()
      current.forEach((index) => {
        if (index < effectIndex) {
          next.add(index)
          return
        }

        if (index > effectIndex) {
          next.add(index - 1)
        }
      })

      return next
    })
  }

  const addEffect = () => {
    const nextEffects = [createDefaultEffect(), ...parsedEffects]
    updateEffects(nextEffects)

    setCollapsedEffects((current) => {
      const next = new Set<number>()
      next.add(0)
      current.forEach((index) => {
        next.add(index + 1)
      })

      return next
    })
  }

  const toggleEffectCollapsedAt = (effectIndex: number) => {
    setCollapsedEffects((current) => {
      const next = new Set(current)
      if (next.has(effectIndex)) {
        next.delete(effectIndex)
      } else {
        next.add(effectIndex)
      }

      return next
    })
  }

  return (
    <div className="mt-3 space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-full">
          <CardAdminSelectedCardSummary
            card={selectedCard}
            draft={editorModel.draft}
            onTypeChange={editorModel.setType}
            onColorChange={editorModel.setColor}
            onPowerChange={editorModel.setPower}
            onDamageChange={editorModel.setDamage}
            onLifeChange={editorModel.setLife}
            onHealthChange={editorModel.setHealth}
          />
        </div>

        <div className="flex h-full flex-col gap-3">
          <div className="grid grid-cols-1 gap-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]" htmlFor="card-description">
              Description
            </label>
            <textarea
              id="card-description"
              value={editorModel.draft.description}
              onChange={(event) => editorModel.setDescription(event.target.value)}
              className="min-h-[96px] w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]" htmlFor="support-effect">
              Support Effect
            </label>
            <textarea
              id="support-effect"
              value={editorModel.draft.supportEffect}
              onChange={(event) => editorModel.setSupportEffect(event.target.value)}
              className="min-h-[96px] flex-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </div>
        </div>
      </div>

      <CardAdminConditionsSection
        editorModel={editorModel}
        conditionToAdd={conditionToAdd}
        setConditionToAdd={setConditionToAdd}
        availableConditionOptions={availableConditionOptions}
      />

      <CardAdminEffectsSection
        parsedEffects={parsedEffects}
        collapsedEffects={collapsedEffects}
        toggleEffectCollapsedAt={toggleEffectCollapsedAt}
        removeEffectAt={removeEffectAt}
        addEffect={addEffect}
        updateEffectAt={updateEffectAt}
        effectIdOptions={effectIdOptions}
        linkedEffectGroups={linkedEffectGroups}
        effectConditionKeywordOptions={effectConditionKeywordOptions}
        effectsError={editorModel.errors.effects}
        effectBranchErrors={editorModel.errors.effectBranches}
      />

      <div className="flex flex-wrap items-center gap-2">
        <AppButton
          type="button"
          variant="ghost"
          onClick={editorModel.reset}
          disabled={!editorModel.isDirty || editorModel.isSaving}
        >
          Reset
        </AppButton>
      </div>

      {typeof document !== 'undefined'
        ? createPortal(
          <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
            {editorModel.isDirty ? (
              <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                Unsaved Changes
              </span>
            ) : null}

            <AppButton
              type="button"
              onClick={async () => {
                if (!editorModel.isDirty) {
                  showAppInfoToast('No changes to save.', {
                    id: 'card-admin-save-status',
                    position: 'top-right',
                  })
                  return
                }

                const result = await editorModel.save()
                if (result.ok) {
                  showAppSuccessToast('Card saved successfully.', {
                    id: 'card-admin-save-status',
                    position: 'top-right',
                  })
                  return
                }

                showAppInfoToast(result.message ?? 'Failed to save card payload.', {
                  id: 'card-admin-save-status',
                  position: 'top-right',
                })
              }}
              disabled={isSaveDisabled}
              className="shadow-lg"
            >
              {editorModel.isSaving ? 'Saving...' : 'Save Card'}
            </AppButton>
          </div>,
          document.body,
        )
        : null}
    </div>
  )
}
