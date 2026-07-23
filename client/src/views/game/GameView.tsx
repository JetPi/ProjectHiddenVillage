import { Link } from 'react-router-dom'
import { PageShell } from '../../components/layout/PageShell'
import { Panel } from '../../components/ui/Panel'
import { AppButton } from '../../components/ui/AppButton'
import { useSessionStore } from '../../state/sessionStore'

export function GameView() {
  const displayName = useSessionStore((state) => state.displayName)
  const gameCode = useSessionStore((state) => state.gameCode)
  const clearSession = useSessionStore((state) => state.clearSession)

  return (
    <PageShell>
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1.9fr_1.1fr]">
        <Panel className="space-y-3">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-accent)]">Player</p>
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">{displayName || 'Unknown Player'}</h2>
          <p className="text-sm text-[var(--text-secondary)]">Code: {gameCode || 'N/A'}</p>
          <div className="pt-2">
            <Link to="/">
              <AppButton variant="ghost" onClick={clearSession}>Back to Login</AppButton>
            </Link>
          </div>
        </Panel>

        <Panel className="min-h-[60vh]">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-accent)]">Battlefield</p>
          <div className="mt-4 grid min-h-[50vh] place-items-center rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-muted)] text-center">
            <div>
              <p className="text-xl font-semibold text-[var(--text-primary)]">Game Board Placeholder</p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Future zones: deck, hand, stack, battlefield, and turn actions.
              </p>
            </div>
          </div>
        </Panel>

        <div className="grid gap-4">
          <Panel className="min-h-44">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-accent)]">Turn Control</p>
            <div className="mt-3 space-y-2">
              <AppButton className="w-full">Advance Phase</AppButton>
              <AppButton variant="ghost" className="w-full">Declare Action</AppButton>
            </div>
          </Panel>

          <Panel className="min-h-72">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-accent)]">Action Log</p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
              <li>Waiting for first turn events...</li>
              <li>Player logs will stream here next.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </PageShell>
  )
}
