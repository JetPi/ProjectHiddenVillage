import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageShell } from '@/components/layout/PageShell'
import { Panel } from '@/components/ui'
import { showAppInfoToast, showAppSuccessToast } from '@/components/feedback/appToastNotifications'
import { useCardAdminViewStore } from '@/state/cardAdminViewStore'
import { CardAdminEditorFooter, CardAdminEffectEditorBody } from '@/views/admin/components/detail'
import { CardAdminIdentityPanel } from '@/views/admin/components/create'
import { useCardAdminCreateModel } from '@/views/admin/model/useCardAdminCreateModel'
import type { ICardCatalogEffectRequest } from '@/services/api/types/cardCatalog'

/** Mirrors how the server derives the displayed support cost: the first support effect that names a chakra cost. */
function resolveSupportCost(effects: ICardCatalogEffectRequest[]): number | null {
  const supportEffect = effects.find((effect) =>
    effect.effectType.trim().toLowerCase() === 'support' && typeof effect.chakraCost === 'number')

  return supportEffect?.chakraCost ?? null
}

export function CardAdminCreateView() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const model = useCardAdminCreateModel()

  const identity = model.identity
  const hasUnsavedWork = model.editorModel.isDirty
    || identity.cardId.length > 0
    || identity.displayName.length > 0
    || identity.name.length > 0
    || identity.originalId.length > 0
    || identity.attribute.length > 0
    || identity.traits.length > 0
    || identity.imageUrl.length > 0
    || identity.mainAlternate

  const handleSubmit = async () => {
    const result = await model.submit()
    if (!result.ok) {
      showAppInfoToast(result.message ?? t('admin.create.createFailed'), {
        id: 'card-admin-create-status',
        position: 'top-right',
      })
      return
    }

    // The catalogue is paged and sorted, so the only way to be sure the author sees what they just made is to
    // land on it by id.
    const createdCardId = identity.cardId.trim()
    useCardAdminViewStore.getState().setSearchText(createdCardId)
    useCardAdminViewStore.getState().selectCard(createdCardId)

    showAppSuccessToast(t('admin.create.created'), {
      id: 'card-admin-create-status',
      position: 'top-right',
    })
    navigate('/admin/cards')
  }

  return (
    <PageShell
      compact
      fullBleed
      edgeToEdge
      className="h-dvh overflow-hidden"
    >
      <div className="h-full w-full p-3">
        <Panel className="themed-scrollbar h-full min-h-0 overflow-y-auto">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-bold text-[var(--text-primary)]">{t('admin.create.title')}</h1>
            <Link to="/admin/cards" className="text-sm text-[var(--text-secondary)] underline-offset-2 hover:underline">
              {t('admin.view.backToCatalog')}
            </Link>
          </div>

          {model.identityError ? (
            <p className="mt-2 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
              {model.identityError}
            </p>
          ) : null}

          <CardAdminIdentityPanel
            draft={identity}
            onChange={model.setIdentityField}
            image={model.image}
            onUploadFile={model.uploadImage}
            onClearUpload={model.clearImage}
            disabled={model.isSubmitting}
          />

          <div className="mt-4 mb-16 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3">
            <CardAdminEffectEditorBody
              editorModel={model.editorModel}
              card={{
                id: identity.cardId,
                displayName: identity.displayName,
                supportCost: resolveSupportCost(model.editorModel.draft.effects),
              }}
              identity={model.summaryIdentity}
              isBusy={model.isSubmitting}
            />
          </div>

          <CardAdminEditorFooter
            isDirty={hasUnsavedWork}
            isSaving={model.isSubmitting}
            submitLabel={t('admin.create.submit')}
            savingLabel={t('admin.create.submitting')}
            onSubmit={handleSubmit}
          />
        </Panel>
      </div>
    </PageShell>
  )
}
