import type { SubmitEvent } from 'react'
import {
  deckOptionsFieldConfigByMode,
  deckOptionsModeOptions,
  gameCodeFieldConfigByMode,
  gameCodeModeOptions,
} from './configs/LoginView'
import { useNavigate } from 'react-router-dom'
import { PageShell } from '../../components/layout/PageShell'
import { Panel } from '../../components/ui/Panel'
import { AppButton } from '../../components/ui/AppButton'
import {
  AdaptiveFormField,
  Form,
  FormActions,
  FormErrorText,
  FormField,
  FormLabel,
  FormInput,
  OptionToggle,
} from '../../components/forms'
import { Lightbulb } from 'lucide-react'
import { useSessionStore } from '../../state/sessionStore'
import { useThemeStore } from '../../state/themeStore'
import { useLoginViewModel } from './model/useLoginViewModel'


export function LoginView() {
  const navigate = useNavigate()
  const setSession = useSessionStore((state) => state.setSession)
  const toggleTheme = useThemeStore((state) => state.toggleTheme)
  const {
    activeDeckOption,
    activeGameCode,
    deckOptionsMode,
    displayName,
    gameCodeMode,
    setDeckOptionsMode,
    setDeckOptionValue,
    setDisplayName,
    setGameCodeMode,
    setGameCodeValue,
    showDisplayNameError,
    validateDisplayName,
  } = useLoginViewModel()

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!validateDisplayName()) {
      return
    }

    setSession({
      displayName,
      gameCode: activeGameCode,
    })

    navigate('/game')
  }

  return (
    <PageShell>
      <div className="grid w-full grid-cols-1 gap-4 px-2 sm:px-4">
        <Panel className="my-2 w-full border-0 bg-transparent px-5 text-center shadow-none">
          <p className="mt-1 font-['Water_Brush'] text-6xl leading-none tracking-wide text-[var(--text-primary)] sm:text-7xl">
            Shinobi Tactics
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)] sm:text-base">
            <span className="block">Make your deck, test against opponents, and seize victory.</span>
            <span className="block">Prepare for official tournament play in a free online <strong>Naruto Card Game</strong> simulator.</span>
          </p>
        </Panel>
        <Panel className="my-2 w-full px-5 pt-3">
          <Form className="mt-0 grid grid-cols-2 items-stretch gap-x-4" onSubmit={handleSubmit}>

            <FormField className="col-span-2">
              <div className="flex items-center justify-between gap-3">
                <FormLabel htmlFor="displayName" className="mb-0">Display Name</FormLabel>
                <button
                  type="button"
                  onClick={toggleTheme}
                  aria-label="Toggle light and dark mode"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)]"
                >
                  <Lightbulb size={12} />
                </button>
              </div>
              <FormInput
                id="displayName"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Enter name here"
                maxLength={24}
                className="!py-1.5"
                required
              />
              {showDisplayNameError ? <FormErrorText>Please enter a display name.</FormErrorText> : null}
            </FormField>

            <FormField className="col-span-1">
              <FormLabel htmlFor="gameCode">Game Code</FormLabel>
              <OptionToggle
                ariaLabel="Game code input mode"
                value={gameCodeMode}
                options={gameCodeModeOptions}
                optionClassName="!py-1"
                onChange={(nextMode) => {
                  setGameCodeMode(nextMode)
                }}
              />
              <AdaptiveFormField
                id="gameCode"
                value={activeGameCode}
                onValueChange={setGameCodeValue}
                config={gameCodeFieldConfigByMode[gameCodeMode]}
                className="!py-1.5"
              />
            </FormField>

            <FormField className="col-span-1">
                <FormLabel htmlFor="deckOptions">Deck Options</FormLabel>
                <OptionToggle
                  ariaLabel="Deck options input mode"
                  value={deckOptionsMode}
                  options={deckOptionsModeOptions}
                  optionClassName="!py-1"
                  onChange={(nextMode) => {
                    setDeckOptionsMode(nextMode)
                  }}
                />
                <AdaptiveFormField
                  id="deckOptions"
                  value={activeDeckOption}
                  onValueChange={setDeckOptionValue}
                  config={deckOptionsFieldConfigByMode[deckOptionsMode]}
                  className="!py-1.5"
                />
              </FormField>

            <FormActions className="col-span-full w-full justify-start">
              <AppButton type="submit" className="w-full">
                Enter Game
              </AppButton>
            </FormActions>
          </Form>
        </Panel>
      </div>
    </PageShell>
  )
}
