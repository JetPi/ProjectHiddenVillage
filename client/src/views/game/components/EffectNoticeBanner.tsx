import { useEffect, useState } from 'react'
import type { IEffectNoticeBannerProps } from '@/views/game/types'
import type { IEffectNoticeResponse } from '@/services/api/gameApi'

/** How long a notice stays up before fading itself out. */
const EFFECT_NOTICE_VISIBLE_MS = 4200

/**
 * Transient toast for an effect that resolved with nothing to act on ("Gamabunta's effect had no valid
 * targets."). It is purely informational - `pointer-events-none`, never a click to dismiss - because the board
 * has to stay fully interactive: the notice can appear in the very same push as a card-play animation.
 *
 * The server republishes the notice tail on every state push, so the board treats whatever was already known
 * when it mounted as seen (that keeps a mid-game page reload from replaying old notices) and shows the newest
 * notice only while it is not that mount-time one. Each notice renders as its own keyed toast, so a second
 * notice replaces the first and restarts the fade.
 */
function EffectNoticeBanner({ notices }: IEffectNoticeBannerProps) {
  const [mountNoticeId] = useState(() => notices?.[notices.length - 1]?.noticeId ?? null)

  const notice = notices && notices.length > 0 ? notices[notices.length - 1] : null

  if (!notice || notice.noticeId === mountNoticeId) {
    return null
  }

  return <EffectNoticeToast key={notice.noticeId} notice={notice} />
}

function EffectNoticeToast({ notice }: { notice: IEffectNoticeResponse }) {
  // The parent keys this component by notice id, so each notice starts un-expired.
  const [isExpired, setIsExpired] = useState(false)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setIsExpired(true)
    }, EFFECT_NOTICE_VISIBLE_MS)

    return () => window.clearTimeout(timeoutId)
  }, [])

  return (
    <div
      data-testid="effect-notice-banner"
      role="status"
      aria-live="polite"
      className={`effect-notice-enter pointer-events-none fixed left-2 top-2 z-40 flex max-w-[min(60vw,24rem)] items-start gap-2 rounded-lg border border-amber-300/50 bg-slate-950/90 px-3 py-2 text-[11px] font-semibold leading-tight text-amber-50 shadow-[0_12px_30px_rgba(0,0,0,0.55)] backdrop-blur-sm transition-opacity duration-500 ease-out ${
        isExpired ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <span aria-hidden="true" className="shrink-0 text-amber-300">
        !
      </span>
      <span data-testid="effect-notice-message" className="min-w-0 flex-1 break-words">
        {notice.message}
      </span>
    </div>
  )
}

export { EffectNoticeBanner }
