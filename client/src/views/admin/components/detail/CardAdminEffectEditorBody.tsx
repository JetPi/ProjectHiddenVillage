import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui'
import { fetchCardCatalogEffectConditionKeywords } from '@/services/api/cardCatalogApi'
import { CardAdminSelectedCardSummary } from './CardAdminSelectedCardSummary'
import { CardAdminConditionsSection, CardAdminEffectsSection } from '@/views/admin/components/detailSections'
import { createDefaultEffect, normalizeEffectId } from '@/views/admin/utils'
import { CARD_CONDITION_OPTIONS_FALLBACK } from '@/views/admin/constants'
import type { ICardAdminEffectEditorBodyProps } from '@/views/admin/types/cardAdminDetailTypes'
import type { ICardCatalogEffectRequest } from '@/services/api/types/cardCatalog'

/**
 * Everything the two card screens edit in common: the stat summary, the description/support text and the
 * conditions and effects sections. Submitting is deliberately not here - the update screen patches an existing
 * card while the create screen posts a new one - so this renders the same draft through the same validation.
 */
export function CardAdminEffectEditorBody({
  editorModel,
  card,
  identity,
  isBusy = false,
}: ICardAdminEffectEditorBodyProps) {
  const { t } = useTranslation()
  const [conditionToAdd, setConditionToAdd] = useState('')
  const [conditionKeywordOptions, setConditionKeywordOptions] = useState<string[]>(
    () => [...CARD_CONDITION_OPTIONS_FALLBACK],
  )
  const [collapsedEffects, setCollapsedEffects] = useState<Set<number>>(
    () => new Set(editorModel.draft.effects.map((_, index) => index)),
  )

  useEffect(() => {
    let isDisposed = false

    async function loadConditionKeywords() {
      try {
        const serverKeywords = await fetchCardCatalogEffectConditionKeywords()
        if (isDisposed) {
          return
        }

        const normalizedKeywords = serverKeywords
          .map((keyword) => keyword.trim())
          .filter((keyword) => keyword.length > 0)

        if (normalizedKeywords.length > 0) {
          setConditionKeywordOptions(Array.from(new Set(normalizedKeywords)))
        }
      } catch {
        // Keep the fallback keyword list when the metadata fetch fails.
      }
    }

    void loadConditionKeywords()

    return () => {
      isDisposed = true
    }
  }, [])

  const parsedEffects = editorModel.draft.effects
  const effectConditionKeywordOptions = useMemo(
    () =>
      conditionKeywordOptions.filter((keyword) => {
        const normalized = keyword.toLowerCase()
        return normalized === 'rush'
          || normalized.includes('not affected')
          || normalized.includes('immune')
      }),
    [conditionKeywordOptions],
  )
  const allConditionOptions = useMemo(
    () => Array.from(new Set([...conditionKeywordOptions, ...editorModel.draft.conditions])),
    [conditionKeywordOptions, editorModel.draft.conditions],
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

  const reorderEffect = (fromIndex: number, toIndex: number) => {
    if (
      fromIndex === toIndex
      || fromIndex < 0
      || toIndex < 0
      || fromIndex >= parsedEffects.length
      || toIndex >= parsedEffects.length
    ) {
      return
    }

    const nextEffects = [...parsedEffects]
    const [movedEffect] = nextEffects.splice(fromIndex, 1)
    nextEffects.splice(toIndex, 0, movedEffect)
    updateEffects(nextEffects)

    setCollapsedEffects((current) => {
      const next = new Set<number>()

      current.forEach((index) => {
        if (index === fromIndex) {
          next.add(toIndex)
          return
        }

        if (fromIndex < toIndex && index > fromIndex && index <= toIndex) {
          next.add(index - 1)
          return
        }

        if (fromIndex > toIndex && index >= toIndex && index < fromIndex) {
          next.add(index + 1)
          return
        }

        next.add(index)
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
            card={card}
            draft={editorModel.draft}
            identity={identity}
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
              {t('admin.detail.description')}
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
              {t('admin.detail.supportEffect')}
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
        reorderEffect={reorderEffect}
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
          disabled={!editorModel.isDirty || isBusy}
        >
          {t('admin.detail.reset')}
        </AppButton>
      </div>
    </div>
  )
}
