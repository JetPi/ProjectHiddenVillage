import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { twMerge } from 'tailwind-merge'
import { GAME_CHAT_MAX_TEXT_LENGTH } from '@/services/api/types/gameChat'
import { useGameChatStore } from '@/state/gameChatStore'
import { useGameUIStore } from '@/state/gameUIStore'
import type { IGameChatMessage } from '@/services/api/types/gameChat'
import type { IGameChatPanelProps } from '@/views/game/types'
import { useHasRoomForChatColumn } from '@/views/game/hooks'
import {
  ACTION_LOG_COMPACT_BOTTOM_REM,
  GAME_CHAT_PANEL_HEIGHT_REM,
  HUD_PANEL_WIDTH_CLASS,
} from '@/views/game/utils/contants'

const PINNED_TO_NEWEST_THRESHOLD_PX = 24
const COUNTER_VISIBILITY_RATIO = 0.8

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })

function normalizePlayerId(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/-/g, '')
}

function isOwnMessage(message: IGameChatMessage, authUserId: string | undefined): boolean {
  const normalizedAuthUserId = normalizePlayerId(authUserId)

  return normalizedAuthUserId.length > 0 && normalizedAuthUserId === normalizePlayerId(message.senderPlayerId)
}

function formatSentAt(sentAtUtc: string): string {
  const sentAt = new Date(sentAtUtc)

  return Number.isNaN(sentAt.getTime()) ? '' : timeFormatter.format(sentAt)
}

/**
 * The player chat.
 *
 * A short strip in the bottom-right corner, about the height of the hand row: an overlay that grows over the board
 * is the hazard the action log had to solve, and chat has no reason to take that risk. Where the board has room it
 * is always on screen and the sidebar offers no button for it; where it does not, the button is the only way in and
 * the log and the chat share one slot, which the UI store enforces.
 */
function GameChatPanel({ authUserId, isConnected, onSendMessage }: IGameChatPanelProps) {
  const { t } = useTranslation()
  const isOpen = useGameUIStore((state) => state.isGameChatOpen)
  const closeGameChat = useGameUIStore((state) => state.closeGameChat)
  const messages = useGameChatStore((state) => state.messages)
  const isSending = useGameChatStore((state) => state.isSending)
  const error = useGameChatStore((state) => state.error)
  const clearUnread = useGameChatStore((state) => state.clearUnread)
  const hasRoom = useHasRoomForChatColumn()

  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLOListElement | null>(null)
  const isPinnedToNewestRef = useRef(true)

  const isVisible = hasRoom || isOpen
  const isCounterVisible = draft.length >= GAME_CHAT_MAX_TEXT_LENGTH * COUNTER_VISIBILITY_RATIO
  const canSend = isConnected && !isSending && draft.trim().length > 0

  useEffect(() => {
    if (isVisible) {
      clearUnread()
    }
  }, [clearUnread, isVisible, messages.length])

  // Follow the newest message, but only while the reader is already at the bottom.
  useEffect(() => {
    const list = listRef.current
    if (!isVisible || !list || !isPinnedToNewestRef.current) {
      return
    }

    list.scrollTop = list.scrollHeight
  }, [isVisible, messages.length])

  // A docked panel has no close affordance, so Escape belongs to the toggled one only.
  useEffect(() => {
    if (!isOpen || hasRoom) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeGameChat()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeGameChat, hasRoom, isOpen])

  const handleScroll = () => {
    const list = listRef.current
    if (!list) {
      return
    }

    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight
    isPinnedToNewestRef.current = distanceFromBottom <= PINNED_TO_NEWEST_THRESHOLD_PX
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const text = draft.trim()
    if (!canSend || text.length === 0) {
      return
    }

    if (await onSendMessage(text)) {
      setDraft('')
    }
  }

  const renderedMessages = useMemo(
    () => messages.map((message) => ({
      message,
      isOwn: isOwnMessage(message, authUserId),
      time: formatSentAt(message.sentAtUtc),
    })),
    [authUserId, messages],
  )

  if (!isVisible) {
    return null
  }

  return (
    <div
      data-testid="game-chat-panel"
      data-dock={hasRoom ? 'docked' : 'toggled'}
      style={{
        bottom: `${ACTION_LOG_COMPACT_BOTTOM_REM}rem`,
        height: `${GAME_CHAT_PANEL_HEIGHT_REM}rem`,
      }}
      className={twMerge(
        'fixed right-2 z-30 flex flex-col overflow-hidden rounded-xl border border-cyan-300/45 bg-slate-950/92 text-[10px] leading-tight text-white shadow-[0_12px_30px_rgba(0,0,0,0.55)] backdrop-blur-sm',
        HUD_PANEL_WIDTH_CLASS,
      )}
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-white/10 px-2 py-1">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-cyan-200">
          {t('game.chat.heading')}
        </span>
      </div>

      {isConnected ? null : (
        <p data-testid="game-chat-offline" className="shrink-0 px-2 py-1 text-[9px] font-semibold text-amber-200">
          {t('game.chat.offline')}
        </p>
      )}

      {renderedMessages.length === 0 ? (
        <p data-testid="game-chat-empty" className="px-2 py-2 text-[10px] text-white/65">
          {t('game.chat.empty')}
        </p>
      ) : (
        <ol
          ref={listRef}
          data-testid="game-chat-list"
          onScroll={handleScroll}
          className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-1.5 py-1"
        >
          {renderedMessages.map(({ message, isOwn, time }) => (
            <li
              key={message.messageId}
              data-testid="game-chat-message"
              data-own={isOwn ? 'true' : 'false'}
              data-sequence={message.sequence}
              className={twMerge('flex flex-col gap-0.5', isOwn ? 'items-end' : 'items-start')}
            >
              <span className="px-0.5 text-[8px] font-semibold uppercase tracking-[0.06em] text-white/40">
                {isOwn ? t('game.chat.you') : t('game.chat.opponent')}
                {time ? ` · ${time}` : ''}
              </span>
              <span
                className={twMerge(
                  'max-w-[92%] break-words rounded-lg border px-1.5 py-1',
                  isOwn
                    ? 'border-orange-300/70 bg-orange-400/20 text-orange-100'
                    : 'border-cyan-300/70 bg-cyan-400/20 text-cyan-100',
                )}
              >
                {message.text}
              </span>
            </li>
          ))}
        </ol>
      )}

      {error ? (
        <p data-testid="game-chat-error" className="shrink-0 px-2 pb-1 text-[9px] font-semibold text-rose-200">
          {error}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="flex shrink-0 items-center gap-1 border-t border-white/10 px-1.5 py-1">
        <input
          data-testid="game-chat-input"
          value={draft}
          maxLength={GAME_CHAT_MAX_TEXT_LENGTH}
          disabled={isSending}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('game.chat.placeholder')}
          aria-label={t('game.chat.inputAria')}
          className="min-w-0 flex-1 rounded-md border border-white/20 bg-white/10 px-1.5 py-1 text-[10px] text-white placeholder:text-white/40 focus:border-cyan-300/70 focus:outline-none disabled:opacity-60"
        />
        {isCounterVisible ? (
          <span data-testid="game-chat-counter" className="shrink-0 text-[8px] tabular-nums text-white/50">
            {draft.length}/{GAME_CHAT_MAX_TEXT_LENGTH}
          </span>
        ) : null}
        <button
          type="submit"
          data-testid="game-chat-send"
          disabled={!canSend}
          aria-label={t('game.chat.sendAria')}
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-white/25 bg-white/10 text-white/85 transition-[filter] hover:brightness-125 disabled:opacity-40"
        >
          <Send size={9} />
        </button>
      </form>
    </div>
  )
}

export { GameChatPanel }
