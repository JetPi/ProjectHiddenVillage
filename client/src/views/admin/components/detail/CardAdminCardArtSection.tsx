import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui'
import { CardAdminArtPicker } from './CardAdminArtPicker'
import type { ICardAdminArtDraftModel } from '@/views/admin/types/cardAdminDetailTypes'

export function CardAdminCardArtSection({ art }: { art: ICardAdminArtDraftModel }) {
  const { t } = useTranslation()

  const stagedMessage = art.pending
    ? art.pending.kind === 'file'
      ? t('admin.art.stagedFile', { name: art.pending.fileName })
      : art.pending.kind === 'url'
        ? t('admin.art.stagedUrl')
        : t('admin.art.stagedRemoval')
    : null

  return (
    <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-3">
      <CardAdminArtPicker
        previewSrc={art.previewSrc}
        error={art.error}
        statusMessage={stagedMessage}
        storedArt={art.storedArt}
        urlValue={art.urlValue}
        onUrlChange={art.setUrlValue}
        onSelectFile={art.selectFile}
        disabled={art.isCommitting}
      >
        <AppButton
          type="button"
          variant="ghost"
          onClick={art.stageRemoval}
          disabled={art.isCommitting || (art.storedArt === null && !art.isDirty)}
        >
          {t('admin.art.remove')}
        </AppButton>

        {art.isDirty ? (
          <AppButton type="button" variant="ghost" onClick={art.discard} disabled={art.isCommitting}>
            {t('admin.art.discard')}
          </AppButton>
        ) : null}
      </CardAdminArtPicker>
    </section>
  )
}
