import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui'
import { CardAdminArtPicker } from './CardAdminArtPicker'
import { useCardAdminArtEditorModel } from '@/views/admin/model/useCardAdminArtEditorModel'
import type { ICardCatalogItemResponse } from '@/types/cardCatalog'

/**
 * Replacing the art of a card that already exists. It applies immediately rather than riding on the editor's
 * save, because art is not part of the effects patch: applying it bumps the card's version, which is what makes
 * every client drop the previous image.
 */
export function CardAdminCardArtSection({ card }: { card: ICardCatalogItemResponse }) {
  const { t } = useTranslation()
  const art = useCardAdminArtEditorModel(card)

  return (
    <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-3">
      <CardAdminArtPicker
        previewSrc={art.previewSrc}
        isUploading={art.isUploading}
        error={art.error}
        statusMessage={art.statusMessage}
        urlValue={art.urlValue}
        onUrlChange={art.setUrlValue}
        onSelectFile={art.applyFile}
        disabled={art.isBusy}
      >
        <AppButton
          type="button"
          onClick={art.applyUrl}
          disabled={!art.canApplyUrl}
        >
          {art.isBusy ? t('admin.art.applying') : t('admin.art.apply')}
        </AppButton>

        <AppButton
          type="button"
          variant="ghost"
          onClick={art.removeArt}
          disabled={art.isBusy || card.image.trim().length === 0}
        >
          {t('admin.art.remove')}
        </AppButton>
      </CardAdminArtPicker>
    </section>
  )
}
