import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui'
import { CardAdminArtPicker } from '@/views/admin/components/detail'
import { CardAdminTokenField } from '@/views/admin/components/controls'
import type { ICardAdminIdentityPanelProps } from '@/views/admin/types/cardAdminCreateTypes'

const LABEL_CLASS = 'text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]'

/**
 * The identity an author picks before the editor has anything to show: the fields the update screen never edits,
 * plus the art. Card id and display name live in the shared summary at the top of the editor, so they are not
 * repeated here.
 */
export function CardAdminIdentityPanel({
  draft,
  onChange,
  traitOptions,
  image,
  onUploadFile,
  onClearUpload,
  disabled,
}: ICardAdminIdentityPanelProps) {
  const { t } = useTranslation()

  return (
    <section className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-3">
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t('admin.create.identity.title')}</h2>

      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="min-w-0">
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

        <div className="min-w-0 lg:border-l lg:border-[var(--border-subtle)] lg:pl-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS} htmlFor="card-admin-create-names">
                {t('admin.create.identity.name')}
              </label>
              <CardAdminTokenField
                id="card-admin-create-names"
                values={draft.name}
                onChange={(name) => onChange({ name })}
                placeholder={t('admin.create.identity.namePlaceholder')}
                disabled={disabled}
                ariaLabel={t('admin.create.identity.name')}
                chipTestId="admin-identity-name-chip"
              />
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">{t('admin.create.identity.nameHelp')}</p>
            </div>

            <label className="flex items-center gap-2 self-start text-sm text-[var(--text-secondary)] sm:mt-5">
              <input
                type="checkbox"
                checked={draft.mainAlternate}
                onChange={(event) => onChange({ mainAlternate: event.target.checked })}
                disabled={disabled}
              />
              {t('admin.create.identity.mainAlternate')}
            </label>

            <div className="sm:col-span-2">
              <label className={LABEL_CLASS} htmlFor="card-admin-create-traits">
                {t('admin.create.identity.traits')}
              </label>
              <CardAdminTokenField
                id="card-admin-create-traits"
                values={draft.traits}
                onChange={(traits) => onChange({ traits })}
                suggestions={traitOptions}
                placeholder={t('admin.create.identity.traitsPlaceholder')}
                disabled={disabled}
                ariaLabel={t('admin.create.identity.traits')}
                chipTestId="admin-identity-trait-chip"
              />
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">{t('admin.create.identity.traitsHelp')}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
