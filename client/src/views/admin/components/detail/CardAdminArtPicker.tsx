import { useRef } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AppButton, CardImage } from '@/components/ui'
import type { ICardAdminStoredArt } from '@/views/admin/types/cardAdminDetailTypes'

const INPUT_CLASS =
  'mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text-primary)]'
const LABEL_CLASS = 'text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]'

export type ICardAdminArtPickerProps = {
  /** What the preview paints: an object URL for a just-picked file, or the art the card currently resolves. */
  previewSrc: string
  /** Only for screens where picking a file sends it at once, which is what labels the button "Uploading...". */
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
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const isUploadDisabled = disabled || isUploading

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
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadDisabled}
            >
              {isUploading ? t('admin.art.uploading') : t('admin.art.upload')}
            </AppButton>

            <span className="text-[11px] text-[var(--text-muted)]">{t('admin.art.uploadHelp')}</span>
          </div>

          {/*
            Driven by the button above. A file input cannot be styled - the browser draws its own "no file
            chosen" chrome, which is what this replaces - so it is kept out of sight and out of the tab order,
            leaving the button as the single control. It stays in the layout (rather than `display: none`) so it
            keeps a box, and it keeps its id because the e2e spec uploads through it.
          */}
          <input
            id="card-admin-art-file"
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0]

              // Cleared before the callback so picking the same file again - the retry after a rejected upload -
              // still counts as a change.
              event.target.value = ''

              if (file) {
                onSelectFile(file)
              }
            }}
            disabled={isUploadDisabled}
            tabIndex={-1}
            className="sr-only"
          />

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
    </div>
  )
}
