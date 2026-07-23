import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageShell } from '../../components/layout/PageShell'
import { Panel } from '../../components/ui/Panel'
import { AppButton } from '../../components/ui/AppButton'
import { useSessionStore } from '../../state/sessionStore'

export function LoginView() {
  const navigate = useNavigate()
  const setSession = useSessionStore((state) => state.setSession)
  const [displayName, setDisplayName] = useState('')
  const [gameCode, setGameCode] = useState('')

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!displayName.trim()) {
      return
    }

    setSession({
      displayName,
      gameCode,
    })

    navigate('/game')
  }

  return (
    <PageShell>
      <div className="grid grid-cols-2 min-h-[85vh] place-items-center">
         {/* <Panel className="w-1/2 max-w-xl"></Panel> */}
        <Panel className="w-1/2 max-w-xl">
          <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-accent)]">Project Hidden Village</p>
          <h1 className="mt-3 text-4xl font-black leading-tight text-[var(--text-primary)] sm:text-5xl">
            Enter the arena.
          </h1>
          <p className="mt-4 max-w-md text-sm text-[var(--text-secondary)]">
            Start with a name, join with a game code, and step into the duel board.
          </p>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                Display Name
              </span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--field-bg)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--focus-ring)] focus:outline-none"
                placeholder="Shinobi#01"
                maxLength={24}
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                Game Code
              </span>
              <input
                value={gameCode}
                onChange={(event) => setGameCode(event.target.value)}
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--field-bg)] px-4 py-3 text-sm uppercase text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--focus-ring)] focus:outline-none"
                placeholder="ABCD-1234"
                maxLength={12}
              />
            </label>

            <div className="flex items-center gap-3 pt-2">
              <AppButton type="submit" className="min-w-40">
                Enter Game
              </AppButton>
              <AppButton type="button" variant="ghost" className="min-w-32">
                Create Lobby
              </AppButton>
            </div>
          </form>
        </Panel>
      </div>
    </PageShell>
  )
}
