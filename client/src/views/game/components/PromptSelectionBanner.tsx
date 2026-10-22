import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { OVERLAY_ENTER_SPRING, OVERLAY_EXIT_TRANSITION } from '@/views/game/animation/tuning'

const PROMPT_SELECTION_BANNER_VISIBLE_MS = 3200

type IPromptSelectionBannerProps = {
  promptKey: string | null
  title: string | null
}

function PromptSelectionBanner({ promptKey, title }: IPromptSelectionBannerProps) {
  const [expiredPromptKey, setExpiredPromptKey] = useState<string | null>(null)

  useEffect(() => {
    if (!promptKey) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setExpiredPromptKey(promptKey)
    }, PROMPT_SELECTION_BANNER_VISIBLE_MS)

    return () => window.clearTimeout(timeoutId)
  }, [promptKey])

  const isVisible = Boolean(promptKey && title) && expiredPromptKey !== promptKey

  return (
    <AnimatePresence>
      {isVisible ? (
        <motion.div
          key={promptKey}
          data-testid="prompt-selection-banner"
          aria-live="polite"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98, transition: OVERLAY_EXIT_TRANSITION }}
          transition={OVERLAY_ENTER_SPRING}
          style={{ x: '-50%', y: '-50%' }}
          className="pointer-events-none fixed left-1/2 top-1/2 z-40 max-w-[min(92vw,26rem)] rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)]/95 px-4 py-2 text-center shadow-[var(--panel-shadow)]"
        >
          <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export { PromptSelectionBanner }
