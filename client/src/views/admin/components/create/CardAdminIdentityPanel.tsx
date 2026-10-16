import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui'
import { CardAdminArtPicker } from '@/views/admin/components/detail'
import type { ICardAdminIdentityPanelProps } from '@/views/admin/types/cardAdminCreateTypes'

const INPUT_CLASS =
  'mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text-primary)]'
const LABEL_CLASS = 'text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]'

/**
 * The identity an author picks before the editor has anything to show: the fields the update screen never edits,
 * plus the art. Card id and display name live in the shared summary at the top of the editor, so they are not
 * repeated here.
 */
export function CardAdminIdentityPanel({
  draft,
  onChange,
  image,
  onUploadFile,
  onClearUpload,
  disabled,
}: ICardAdminIdentityPanelProps) {
  const { t } = useTranslation()

  return (
    <section className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-3">
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t('admin.create.identity.title')}</h2>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div>
          <label className={LABEL_CLASS} htmlFor="card-admin-create-names">
            {t('admin.create.identity.name')}
          </label>
          <textarea
            id="card-admin-create-names"
            value={draft.name}
            onChange={(event) => onChange({ name: event.target.value })}
            disabled={disabled}
            className={`${INPUT_CLASS} min-h-[64px]`}
          />
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">{t('admin.create.identity.nameHelp')}</p>
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="card-admin-create-original-id">
            {t('admin.create.identity.originalId')}
          </label>
          <input
            id="card-admin-create-original-id"
            value={draft.originalId}
            onChange={(event) => onChange({ originalId: event.target.value })}
            disabled={disabled}
            className={INPUT_CLASS}
          />

          <label className={`${LABEL_CLASS} mt-3 block`} htmlFor="card-admin-create-attribute">
            {t('admin.create.identity.attribute')}
          </label>
          <input
            id="card-admin-create-attribute"
            value={draft.attribute}
            onChange={(event) => onChange({ attribute: event.target.value })}
            disabled={disabled}
            className={INPUT_CLASS}
          />

          <label className="mt-3 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={draft.mainAlternate}
              onChange={(event) => onChange({ mainAlternate: event.target.checked })}
              disabled={disabled}
            />
            {t('admin.create.identity.mainAlternate')}
          </label>
        </div>

        <div className="lg:col-span-2">
          <label className={LABEL_CLASS} htmlFor="card-admin-create-traits">
            {t('admin.create.identity.traits')}
          </label>
          <textarea
            id="card-admin-create-traits"
            value={draft.traits}
            onChange={(event) => onChange({ traits: event.target.value })}
            disabled={disabled}
            className={`${INPUT_CLASS} min-h-[64px]`}
          />
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">{t('admin.create.identity.traitsHelp')}</p>
        </div>
      </div>

      <div className="mt-4 border-t border-[var(--border-subtle)] pt-3">
        <CardAdminArtPicker
          previewSrc={image.previewSrc ?? ''}
          isUploading={image.isUploading}
          error={image.error}
          // The art is not attached to anything yet, so say what will happen to it rather than implying it landed.
          statusMessage={image.uploadedReference && !image.isUploading ? t('admin.create.image.uploaded') : null}
          urlValue={draft.imageUrl}
          onUrlChange={(value) => onChange({ imageUrl: value })}
          onSelectFile={onUploadFile}
          disabled={disabled}
        >
          {image.uploadedReference ? (
            <AppButton type="button" variant="ghost" onClick={onClearUpload} disabled={disabled}>
              {t('admin.create.image.clear')}
            </AppButton>
          ) : null}
        </CardAdminArtPicker>
      </div>
    </section>
  )
}
