import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { OVERLAY_ENTER_SPRING, OVERLAY_EXIT_TRANSITION } from '@/views/game/animation/tuning'
import type { IEffectNoticeBannerProps } from '@/views/game/types'
import type { IEffectNoticeResponse } from '@/services/api/gameApi'

const EFFECT_NOTICE_VISIBLE_MS = 4200

function EffectNoticeBanner({ notices }: IEffectNoticeBannerProps) {
  const [mountNoticeId] = useState(() => notices?.[notices.length - 1]?.noticeId ?? null)

  const notice = notices && notices.length > 0 ? notices[notices.length - 1] : null

  if (!notice || notice.noticeId === mountNoticeId) {
    return null
  }

  return <EffectNoticeToast key={notice.noticeId} notice={notice} />
}

function EffectNoticeToast({ notice }: { notice: IEffectNoticeResponse }) {
  const [isExpired, setIsExpired] = useState(false)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setIsExpired(true)
    }, EFFECT_NOTICE_VISIBLE_MS)

    return () => window.clearTimeout(timeoutId)
  }, [])

  return (
    <motion.div
      data-testid="effect-notice-banner"
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, y: -6 }}
      animate={isExpired ? { opacity: 0, y: -6 } : { opacity: 1, y: 0 }}
      transition={isExpired ? OVERLAY_EXIT_TRANSITION : OVERLAY_ENTER_SPRING}
      className="pointer-events-none fixed left-2 top-2 z-40 flex max-w-[min(60vw,24rem)] items-start gap-2 rounded-lg border border-amber-300/50 bg-slate-950/90 px-3 py-2 text-[11px] font-semibold leading-tight text-amber-50 shadow-[0_12px_30px_rgba(0,0,0,0.55)] backdrop-blur-sm"
    >
      <span aria-hidden="true" className="shrink-0 text-amber-300">
        !
      </span>
      <span data-testid="effect-notice-message" className="min-w-0 flex-1 break-words">
        {notice.message}
      </span>
    </motion.div>
  )
}

export { EffectNoticeBanner }
