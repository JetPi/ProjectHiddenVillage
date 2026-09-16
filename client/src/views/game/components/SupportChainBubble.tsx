import { twMerge } from 'tailwind-merge'
import type { ISupportChainBubbleProps, ISupportChainViewActor, ISupportChainViewEntry } from '@/views/game/types'
import { buildSupportChainView, shouldShowSupportChainBubble } from '@/views/game/utils/functions/helpers'

const ACTOR_LABEL: Record<ISupportChainViewActor, string> = {
  you: 'You',
  opponent: 'Opponent',
  unknown: 'Player',
}

const ACTOR_CHIP_CLASS: Record<ISupportChainViewActor, string> = {
  you: 'border-orange-300/70 bg-orange-400/20 text-orange-100',
  opponent: 'border-cyan-300/70 bg-cyan-400/20 text-cyan-100',
  unknown: 'border-white/25 bg-white/10 text-white/80',
}

const NEGATE_ACCENT_CLASS = 'text-rose-200'

function SupportChainBubble({ gameInstance, authUserId }: ISupportChainBubbleProps) {
  const entries = buildSupportChainView(gameInstance, authUserId)

  if (!shouldShowSupportChainBubble(entries)) {
    return null
  }

  return (
    <div
      data-testid="support-chain-bubble"
      className="support-chain-bubble-enter pointer-events-none fixed right-2 top-2 z-40 flex w-[252px] max-w-[46vw] flex-col gap-1 rounded-xl border border-cyan-300/45 bg-slate-950/90 p-2 text-[10px] leading-tight text-white shadow-[0_12px_30px_rgba(0,0,0,0.55)] backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-cyan-200">
          Support chain
        </span>
        <span
          data-testid="support-chain-count"
          className="rounded-full border border-white/20 bg-white/10 px-1.5 py-px text-[9px] font-semibold text-white/85"
        >
          {entries.length} activations
        </span>
      </div>

      <ol className="flex flex-col gap-1">
        {entries.map((entry) => (
          <SupportChainBubbleRow key={entry.entryId} entry={entry} />
        ))}
      </ol>

      <p className="text-[9px] leading-snug text-white/55">Resolves last in, first out.</p>
    </div>
  )
}

function SupportChainBubbleRow({ entry }: { entry: ISupportChainViewEntry }) {
  const isClaimedByNegate = entry.negatedBySequence !== null
  const isDoomed = isClaimedByNegate || entry.isNegated

  return (
    <li
      data-testid="support-chain-entry"
      data-entry-sequence={entry.sequence}
      data-entry-negated={isDoomed ? 'true' : 'false'}
      className={twMerge(
        'rounded-lg border px-1.5 py-1',
        isDoomed
          ? 'border-rose-400/60 bg-rose-500/12'
          : 'border-white/15 bg-white/[0.07]',
      )}
    >
      <div className="flex items-center gap-1">
        <span className="shrink-0 rounded-sm border border-white/25 bg-black/40 px-1 font-mono text-[9px] font-bold text-white/85">
          #{entry.sequence}
        </span>
        <span
          className={twMerge(
            'shrink-0 rounded-sm border px-1 text-[8px] font-bold uppercase tracking-[0.06em]',
            ACTOR_CHIP_CLASS[entry.actor],
          )}
        >
          {ACTOR_LABEL[entry.actor]}
        </span>
        <span className="min-w-0 flex-1 truncate font-semibold text-white" title={entry.sourceCardDisplayName}>
          {entry.sourceCardDisplayName || 'Unknown support'}
        </span>
        {entry.resolvesNext ? (
          <span className="shrink-0 rounded-sm border border-amber-300/70 bg-amber-400/20 px-1 text-[8px] font-bold uppercase tracking-[0.06em] text-amber-100">
            Next
          </span>
        ) : null}
      </div>

      {entry.negatedTargets.length > 0 ? (
        <div className={twMerge('mt-0.5 flex flex-col', NEGATE_ACCENT_CLASS)}>
          {entry.negatedTargets.map((target) => (
            <span key={`negates-${target.sequence}`} data-testid="support-chain-negate-link" className="truncate">
              ⚡ Negates #{target.sequence} {target.displayName}
            </span>
          ))}
        </div>
      ) : null}

      {entry.cardTargets.length > 0 ? (
        <div className="mt-0.5 flex flex-col text-white/80">
          {entry.cardTargets.map((target) => (
            <span key={`target-${target.cardInstanceId}`} className="truncate" title={target.displayName}>
              → Targets {target.displayName || 'a card'} {target.isOwnCard ? '(yours)' : '(theirs)'}
            </span>
          ))}
        </div>
      ) : null}

      {isClaimedByNegate ? (
        <div data-testid="support-chain-negated-note" className={twMerge('mt-0.5 font-semibold', NEGATE_ACCENT_CLASS)}>
          Will be negated by #{entry.negatedBySequence}
        </div>
      ) : null}

      {entry.isNegated ? (
        <div data-testid="support-chain-negated-note" className={twMerge('mt-0.5 font-semibold', NEGATE_ACCENT_CLASS)}>
          Negated
        </div>
      ) : null}
    </li>
  )
}

export { SupportChainBubble }
