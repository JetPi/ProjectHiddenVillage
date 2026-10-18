import { useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AppButton, CardImage } from '@/components/ui'
import { CardAdminArtSourceDialog } from './CardAdminArtSourceDialog'
import type { ICardAdminStoredArt } from '@/views/admin/types/cardAdminDetailTypes'

const INPUT_CLASS =
  'mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text-primary)]'
const LABEL_CLASS = 'text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]'

export type ICardAdminArtPickerProps = {
  /** What the preview paints: an object URL for a just-chosen file, or the art the card currently resolves. */
  previewSrc: string
  /** Only for screens where choosing a file sends it at once, which is what labels the button "Uploading...". */
  isUploading?: boolean
  error: string | null
  /** A line under the controls, for what the screen wants to say about the current art. */
  statusMessage?: string | null
  /**
   * The art the card already stores. Rendered as read-only text with a link to its source, kept well away from
   * the input below so reading where an image came from cannot turn into overwriting it.
   */
  storedArt?: ICardAdminStoredArt | null
  /** The external-URL alternative to an upload. */
  urlValue: string
  onUrlChange: (value: string) => void
  onSelectFile: (file: File) => void
  disabled: boolean
  /** Screen-specific actions: the create screen discards a pending upload, the update screen applies or removes. */
  children?: ReactNode
}

/**
 * The art controls both card screens use. Deliberately presentational: what a chosen image *means* differs between
 * them - on a new card it is held in the draft until the card exists, on an existing one it is applied at once -
 * so this renders the controls and the parent owns the behaviour.
 *
 * Choosing the image itself happens in `CardAdminArtSourceDialog`, because a paste needs a focused target and a
 * modal is an honest place for one. This keeps the result of that choice - the preview, the current image, the URL
 * alternative - and nothing else.
 */
export function CardAdminArtPicker({
  previewSrc,
  isUploading = false,
  error,
  statusMessage,
  storedArt,
  urlValue,
  onUrlChange,
  onSelectFile,
  disabled,
  children,
}: ICardAdminArtPickerProps) {
  const { t } = useTranslation()
  const [isSourceDialogOpen, setIsSourceDialogOpen] = useState(false)

  const isUploadDisabled = disabled || isUploading
  const hasImage = (storedArt?.reference.length ?? 0) > 0

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
          <div className="flex flex-wrap items-center gap-2">
            <AppButton
              type="button"
              onClick={() => setIsSourceDialogOpen(true)}
              disabled={isUploadDisabled}
              data-testid="admin-art-source-open"
            >
              {isUploading
                ? t('admin.art.uploading')
                : hasImage
                  ? t('admin.art.changeImage')
                  : t('admin.art.addImage')}
            </AppButton>

            <span className="text-[11px] text-[var(--text-muted)]">{t('admin.art.uploadHelp')}</span>
          </div>

          {statusMessage ? (
            <p className="text-xs text-[var(--text-secondary)]">{statusMessage}</p>
          ) : null}

          {error ? (
            <p className="text-xs text-amber-700">{error}</p>
          ) : null}

          {storedArt ? (
            // A divider row rather than a panel: the section around this picker is already a filled, bordered
            // surface, and nesting another box inside it is the card-in-card the admin layout avoids.
            <div className="border-t border-[var(--border-subtle)] pt-2">
              <p className={LABEL_CLASS}>{t('admin.art.currentImage')}</p>

              {/* Selectable rather than an input: it is what the card stores, so it can be read and copied,
                  but replacing it stays a deliberate act through the field below. */}
              <p className="mt-1 font-mono text-[11px] break-all text-[var(--text-primary)] select-all">
                {storedArt.reference}
              </p>

              <div className="mt-1 flex flex-wrap items-center gap-2">
                {storedArt.href ? (
                  <a
                    href={storedArt.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-semibold text-[var(--text-accent)] underline"
                  >
                    {storedArt.isExternal ? t('admin.art.openSource') : t('admin.art.openStoredImage')}
                  </a>
                ) : null}

                <span className="text-[11px] text-[var(--text-muted)]">{t('admin.art.currentImageHelp')}</span>
              </div>
            </div>
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

      {isSourceDialogOpen ? (
        <CardAdminArtSourceDialog
          onSelectFile={onSelectFile}
          // A pasted address is not an upload: it belongs in the URL field, which keeps the source resolution.
          onSelectUrl={onUrlChange}
          onClose={() => setIsSourceDialogOpen(false)}
          disabled={disabled}
        />
      ) : null}
    </div>
  )
}
