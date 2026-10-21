import { useEffect, useRef, useState } from 'react'
import type { ClipboardEvent, DragEvent, ReactNode, SyntheticEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui'
import {
  CARD_ART_MAX_UPLOAD_BYTES,
  CARD_ART_MIN_SOURCE_WIDTH,
  isExternalCardArtReference,
} from '@/services/api/cardArt'

type ArtSourceCandidate = {
  file: File
  previewSrc: string
  width: number | null
  height: number | null
  isUndecodable: boolean
}

export type ICardAdminArtSourceDialogProps = {
  onSelectFile: (file: File) => void
  onSelectUrl: (url: string) => void
  onClose: () => void
  disabled?: boolean
}

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
}

function withPastedName(file: File): File {
  if (file.name.trim().length > 0) {
    return file
  }

  return new File([file], `pasted-image${EXTENSION_BY_TYPE[file.type] ?? ''}`, { type: file.type })
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function CardAdminArtSourceDialog({
  onSelectFile,
  onSelectUrl,
  onClose,
  disabled = false,
}: ICardAdminArtSourceDialogProps) {
  const { t } = useTranslation()

  const [candidate, setCandidate] = useState<ArtSourceCandidate | null>(null)
  const [clipboardMessage, setClipboardMessage] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const pasteAreaRef = useRef<HTMLDivElement | null>(null)
  const previewSrcRef = useRef<string | null>(null)

  useEffect(() => {
    pasteAreaRef.current?.focus()
  }, [])

  useEffect(() => {
    previewSrcRef.current = candidate?.previewSrc ?? null
  }, [candidate])

  useEffect(() => {
    return () => {
      if (previewSrcRef.current) {
        URL.revokeObjectURL(previewSrcRef.current)
      }
    }
  }, [])

  const stage = (file: File) => {
    const previousPreviewSrc = previewSrcRef.current

    if (previousPreviewSrc) {
      URL.revokeObjectURL(previousPreviewSrc)
    }

    setClipboardMessage(null)
    setCandidate({
      file,
      previewSrc: URL.createObjectURL(file),
      width: null,
      height: null,
      isUndecodable: false,
    })
  }

  const measure = (previewSrc: string, width: number, height: number) => {
    setCandidate((current) =>
      current && current.previewSrc === previewSrc ? { ...current, width, height } : current,
    )
  }

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const items = event.clipboardData?.items
    const imageItem = items ? Array.from(items).find((item) => item.type.startsWith('image/')) : undefined
    const pastedFile = imageItem?.getAsFile()

    if (pastedFile) {
      event.preventDefault()
      stage(withPastedName(pastedFile))
      return
    }

    const pastedText = event.clipboardData?.getData('text/plain')?.trim() ?? ''

    if (isExternalCardArtReference(pastedText)) {
      event.preventDefault()
      onSelectUrl(pastedText)
      onClose()
      return
    }

    setClipboardMessage(t('admin.art.sourceDialog.nothingOnClipboard'))
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()

    const droppedFile = event.dataTransfer.files[0]

    if (droppedFile) {
      stage(droppedFile)
    }
  }

  const handlePreviewLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const element = event.currentTarget

    measure(element.src, element.naturalWidth, element.naturalHeight)
  }

  const width = candidate?.width ?? null
  const isMeasuring = candidate !== null && candidate.width === null && !candidate.isUndecodable
  const isTooNarrow = width !== null && width < CARD_ART_MIN_SOURCE_WIDTH
  const isTooLarge = candidate !== null && candidate.file.size > CARD_ART_MAX_UPLOAD_BYTES
  const canUse =
    candidate !== null &&
    !isMeasuring &&
    !candidate.isUndecodable &&
    !isTooNarrow &&
    !isTooLarge &&
    !disabled

  if (typeof document === 'undefined') {
    return null
  }

  let blockedMessage: ReactNode = null

  if (candidate?.isUndecodable) {
    blockedMessage = t('admin.art.sourceDialog.undecodable')
  } else if (isTooNarrow) {
    blockedMessage = t('admin.art.sourceDialog.tooNarrow', {
      width,
      min: CARD_ART_MIN_SOURCE_WIDTH,
    })
  } else if (isTooLarge) {
    blockedMessage = t('admin.art.sourceDialog.tooLarge', {
      size: formatBytes(candidate?.file.size ?? 0),
      max: formatBytes(CARD_ART_MAX_UPLOAD_BYTES),
    })
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !disabled) {
          onClose()
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !disabled) {
          onClose()
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-admin-art-source-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4"
      >
        <h2
          id="card-admin-art-source-title"
          className="text-lg font-bold text-[var(--text-primary)]"
        >
          {t('admin.art.sourceDialog.title')}
        </h2>

        <p className="mt-1 text-xs text-[var(--text-secondary)]">{t('admin.art.sourceDialog.storesAs', { width: CARD_ART_MIN_SOURCE_WIDTH })}</p>

        <div
          id="card-admin-art-paste"
          ref={pasteAreaRef}
          tabIndex={0}
          onPaste={handlePaste}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] sm:grid-cols-[10rem_1fr]"
        >
          <div className="grid h-40 w-32 place-items-center overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)]">
            {candidate ? (
              <img
                key={candidate.previewSrc}
                src={candidate.previewSrc}
                alt={t('admin.art.previewAlt')}
                onLoad={handlePreviewLoad}
                onError={() => {
                  setCandidate((current) => (current ? { ...current, isUndecodable: true } : current))
                }}
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="px-2 text-center text-[11px] text-[var(--text-muted)]">
                {t('admin.art.sourceDialog.emptyPreview')}
              </span>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{t('admin.art.sourceDialog.pasteTitle')}</p>
            <p className="text-xs text-[var(--text-secondary)]">{t('admin.art.sourceDialog.pasteHint')}</p>

            <div className="flex flex-wrap items-center gap-2">
              <AppButton
                type="button"
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
              >
                {t('admin.art.sourceDialog.chooseFile')}
              </AppButton>

              <span className="text-[11px] text-[var(--text-muted)]">{t('admin.art.uploadHelp')}</span>
            </div>

            <input
              id="card-admin-art-file"
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const pickedFile = event.target.files?.[0]

                event.target.value = ''

                if (pickedFile) {
                  stage(pickedFile)
                }
              }}
              disabled={disabled}
              tabIndex={-1}
              className="sr-only"
            />

            <p className="text-[11px] text-[var(--text-muted)]">{t('admin.art.sourceDialog.dropHint')}</p>

            {candidate ? (
              <p className="break-all font-mono text-[11px] text-[var(--text-primary)]">
                {candidate.width !== null && candidate.height !== null
                  ? t('admin.art.sourceDialog.measured', {
                      width: candidate.width,
                      height: candidate.height,
                      type: candidate.file.type,
                      size: formatBytes(candidate.file.size),
                    })
                  : candidate.file.name}
              </p>
            ) : null}

            {clipboardMessage ? (
              <p className="text-xs text-amber-700">{clipboardMessage}</p>
            ) : null}
          </div>
        </div>

        {blockedMessage ? (
          <p className="mt-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
            {blockedMessage}
          </p>
        ) : null}

        <p className="mt-3 text-[11px] text-[var(--text-muted)]">{t('admin.art.sourceDialog.addressHint')}</p>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <AppButton type="button" variant="ghost" onClick={onClose} disabled={disabled}>
            {t('admin.art.sourceDialog.cancel')}
          </AppButton>

          <AppButton
            type="button"
            onClick={() => {
              if (candidate) {
                onSelectFile(candidate.file)
              }

              onClose()
            }}
            disabled={!canUse}
            data-testid="admin-art-source-confirm"
          >
            {t('admin.art.sourceDialog.confirm')}
          </AppButton>
        </div>
      </div>
    </div>,
    document.body,
  )
}
