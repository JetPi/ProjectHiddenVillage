import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CardImage } from '@/components/ui'

const INPUT_CLASS =
  'mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text-primary)]'
const LABEL_CLASS = 'text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]'

export type ICardAdminArtPickerProps = {
  /** What the preview paints: an object URL for a just-picked file, or the art the card currently resolves. */
  previewSrc: string
  isUploading: boolean
  error: string | null
  /** A line under the controls, for what the screen wants to say about the current art. */
  statusMessage?: string | null
  /** The external-URL alternative to an upload. */
  urlValue: string
  onUrlChange: (value: string) => void
  onSelectFile: (file: File) => void
  disabled: boolean
  /** Screen-specific actions: the create screen discards a pending upload, the edit screen applies or removes. */
  children?: ReactNode
}

/**
 * The art controls both card screens use. Deliberately presentational: what an upload *means* differs between
 * them - on a new card it is held in the draft until the card exists, on an existing one it is applied at once -
 * so this renders the controls and the parent owns the behaviour.
 */
export function CardAdminArtPicker({
  previewSrc,
  isUploading,
  error,
  statusMessage,
  urlValue,
  onUrlChange,
  onSelectFile,
  disabled,
  children,
}: ICardAdminArtPickerProps) {
  const { t } = useTranslation()

  return (
    <div>
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t('admin.art.title')}</h3>

      <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-[10rem_1fr]">
        <CardImage
          src={previewSrc}
          alt={t('admin.art.previewAlt')}
          className="h-40 w-32"
        />

        <div className="space-y-2">
          <label className={LABEL_CLASS} htmlFor="card-admin-art-file">
            {t('admin.art.upload')}
          </label>
          <input
            id="card-admin-art-file"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) {
                onSelectFile(file)
              }
            }}
            disabled={disabled || isUploading}
            className="block w-full text-sm text-[var(--text-secondary)]"
          />
          <p className="text-[11px] text-[var(--text-muted)]">{t('admin.art.uploadHelp')}</p>

          {isUploading ? (
            <p className="text-xs text-[var(--text-secondary)]">{t('admin.art.uploading')}</p>
          ) : null}

          {statusMessage ? (
            <p className="text-xs text-[var(--text-secondary)]">{statusMessage}</p>
          ) : null}

          {error ? (
            <p className="text-xs text-amber-700">{error}</p>
          ) : null}

          <label className={`${LABEL_CLASS} block`} htmlFor="card-admin-art-url">
            {t('admin.art.externalUrl')}
          </label>
          <input
            id="card-admin-art-url"
            value={urlValue}
            placeholder={t('admin.art.externalUrlPlaceholder')}
            onChange={(event) => onUrlChange(event.target.value)}
            disabled={disabled}
            className={INPUT_CLASS}
          />

          {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
        </div>
      </div>
    </div>
  )
}
