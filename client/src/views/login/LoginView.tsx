import { useEffect, useMemo, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import {
  deckOptionsModeOptions,
  gameCodeFieldConfigByMode,
  gameCodeModeOptions,
} from './configs/LoginView'
import { Link, useActionData, useLoaderData, useNavigate, useNavigation } from 'react-router-dom'
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
  FormTextarea,
  OptionToggle,
} from '../../components/forms'
import { Lightbulb, LogIn, X } from 'lucide-react'
import { showAppInfoToast, showAppSuccessToast } from '../../components/feedback/appToastNotifications'
import { clearAuthSession, useAuthSessionStore } from '../../state/authSession'
import { useSessionStore } from '../../state/sessionStore'
import { useThemeStore } from '../../state/themeStore'
import { useLoginViewModel } from './model/useLoginViewModel'
import type { ILoginActionData, ILoginLoaderData } from './types/routeHandlers'
import { createGameForUser, joinGameAsPlayer } from '../../services/api/gameApi'
import { getApiErrorMessage } from '../utils/getApiErrorMessage'
import { createUserDeck, fetchDecks } from '../../services/api/deckApi'
import { validateDeckCardsPayload } from './utils/validateDeckCardsPayload'
import type { IDeckResponse } from '../../types/deck'
import { preloadCardsByIds } from '../../services/cardPreloadService'

const DECK_LINE_PATTERN = /^\s*(\d+)x\s+([A-Za-z0-9-]+)\s*$/
const STARTER_DECK_FETCH_RETRY_ATTEMPTS = 3
const STARTER_DECK_FETCH_RETRY_DELAY_MS = 700
const TITLE_FONT_LOAD_QUERY = '1em "Water Brush"'

function getFontFaceSet(): FontFaceSet | null {
  if (typeof document === 'undefined' || !('fonts' in document)) {
    return null
  }

  const fontSet = document.fonts
  if (typeof fontSet.check !== 'function' || typeof fontSet.load !== 'function') {
    return null
  }

  return fontSet
}

export function LoginView() {
  const loaderData = useLoaderData() as ILoginLoaderData
  const actionData = useActionData() as ILoginActionData | undefined
  const navigation = useNavigation()
  const navigate = useNavigate()

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [savedDeckChoices, setSavedDeckChoices] = useState<{ value: string; label: string }[]>([
    { value: '', label: 'Log in to load your decks' },
  ])
  const [starterDeckChoices, setStarterDeckChoices] = useState<{ value: string; label: string }[]>([
    { value: '', label: 'Loading public decks...' },
  ])
  const [starterDeckFetchFailed, setStarterDeckFetchFailed] = useState(false)
  const [starterDeckRetryToken, setStarterDeckRetryToken] = useState(0)
  const [savedDeckCardIdsByDeckId, setSavedDeckCardIdsByDeckId] = useState<Record<string, string[]>>({})
  const [starterDeckCardIdsByDeckId, setStarterDeckCardIdsByDeckId] = useState<Record<string, string[]>>({})
  const [isTitleFontReady, setIsTitleFontReady] = useState(() => {
    const fontSet = getFontFaceSet()
    if (!fontSet) {
      return true
    }

    return fontSet.check(TITLE_FONT_LOAD_QUERY)
  })
  const hasShownSignupToast = useRef(false)
  const lastAuthToastUsername = useRef<string | null>(null)
  
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

  const isSubmittingLogin =
    navigation.state === 'submitting' && navigation.formData?.get('intent') === 'login'
  const authSession = useAuthSessionStore((state) => state.session)
  const authUser = authSession ?? actionData?.login?.user ?? null
  const authUsername = authUser?.username ?? ''

  useEffect(() => {
    if (isTitleFontReady) {
      return
    }

    let isCancelled = false

    async function ensureTitleFontLoaded() {
      const fontSet = getFontFaceSet()
      if (!fontSet) {
        if (!isCancelled) {
          setIsTitleFontReady(true)
        }
        return
      }

      try {
        await fontSet.load(TITLE_FONT_LOAD_QUERY)
      } finally {
        if (!isCancelled) {
          setIsTitleFontReady(true)
        }
      }
    }

    void ensureTitleFontLoaded()

    return () => {
      isCancelled = true
    }
  }, [isTitleFontReady])

  useEffect(() => {
    if (!loaderData.signupSuccess || hasShownSignupToast.current) {
      return
    }

    showAppSuccessToast('Account created successfully.', { id: 'signup-success', duration: 3200 })
    hasShownSignupToast.current = true
  }, [loaderData.signupSuccess])

  useEffect(() => {
    if (!authUsername) {
      lastAuthToastUsername.current = null
      return
    }

    if (loaderData.signupSuccess || lastAuthToastUsername.current === authUsername) {
      return
    }

    showAppInfoToast('Logged in as ' + authUsername, { id: 'auth-login-status', duration: 3200 })
    lastAuthToastUsername.current = authUsername
  }, [authUsername, loaderData.signupSuccess])

  useEffect(() => {
    if (!authUsername) {
      return
    }

    setDisplayName(authUsername)
  }, [authUsername, setDisplayName])

  useEffect(() => {
    const user = actionData?.login?.user

    if (!user) {
      return
    }

    queueMicrotask(() => {
      setIsLoginModalOpen(false)
      setLoginEmail('')
      setLoginPassword('')
    })
  }, [actionData])

  useEffect(() => {
    let isCancelled = false

    async function loadDeckChoices() {
      try {
        const allDecks = await fetchDecksWithRetry(
          () => fetchDecks(),
          STARTER_DECK_FETCH_RETRY_ATTEMPTS,
          STARTER_DECK_FETCH_RETRY_DELAY_MS,
        )

        if (!isCancelled) {
          const publicDecks = allDecks.filter((deck) => deck.type === 'Public')
          setStarterDeckChoices(toDeckChoices(publicDecks, 'No public decks available yet.'))
          setStarterDeckCardIdsByDeckId(toDeckCardIdsByDeckId(publicDecks))
          setStarterDeckFetchFailed(false)
        }
      } catch {
        if (!isCancelled) {
          setStarterDeckChoices([{ value: '', label: 'Failed to load public decks.' }])
          setStarterDeckCardIdsByDeckId({})
          setStarterDeckFetchFailed(true)
        }
      }

      if (!authUser?.userId) {
        if (!isCancelled) {
          setSavedDeckChoices([{ value: '', label: 'Log in to load your decks' }])
          setSavedDeckCardIdsByDeckId({})
        }

        return
      }

      try {
        const userDecks = await fetchDecks({ userId: authUser.userId })

        if (!isCancelled) {
          setSavedDeckChoices(toDeckChoices(userDecks, 'No saved decks found for this user.'))
          setSavedDeckCardIdsByDeckId(toDeckCardIdsByDeckId(userDecks))
        }
      } catch {
        if (!isCancelled) {
          setSavedDeckChoices([{ value: '', label: 'Failed to load your decks.' }])
          setSavedDeckCardIdsByDeckId({})
        }
      }
    }

    void loadDeckChoices()

    return () => {
      isCancelled = true
    }
  }, [authUser?.userId, starterDeckRetryToken])

  useEffect(() => {
    const selectedDeckId = activeDeckOption.trim()
    if (!selectedDeckId) {
      return
    }

    const deckCardIds =
      deckOptionsMode === 'saved_decks'
        ? savedDeckCardIdsByDeckId[selectedDeckId]
        : deckOptionsMode === 'starter_decks'
          ? starterDeckCardIdsByDeckId[selectedDeckId]
          : undefined

    if (!deckCardIds || deckCardIds.length === 0) {
      return
    }

    void preloadCardsByIds(deckCardIds).catch(() => {
      // Deck image warm-up should never block the login flow.
    })
  }, [
    activeDeckOption,
    deckOptionsMode,
    savedDeckCardIdsByDeckId,
    starterDeckCardIdsByDeckId,
  ])

  const activeDeckFieldConfig = useMemo(() => {
    if (deckOptionsMode === 'saved_decks') {
      return {
        type: 'select' as const,
        choices: savedDeckChoices,
      }
    }

    if (deckOptionsMode === 'starter_decks') {
      return {
        type: 'select' as const,
        choices: starterDeckChoices,
      }
    }

    return {
      type: 'select' as const,
      choices: starterDeckChoices,
    }
  }, [deckOptionsMode, savedDeckChoices, starterDeckChoices])

  const importedDeckLineCount = useMemo(
    () =>
      activeDeckOption
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0).length,
    [activeDeckOption],
  )

  const handleLogout = () => {
    clearAuthSession()
    setDisplayName('')
    setLoginEmail('')
    setLoginPassword('')
    setIsLogoutModalOpen(false)
    showAppInfoToast('Logged out successfully.', { id: 'auth-logout-status', duration: 3200 })
    navigate('/', { replace: true })
  }

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!validateDisplayName()) {
      return
    }

    const normalizedGameCode = activeGameCode.trim()

    if (gameCodeMode === 'quickmatch') {
      setSession({
        displayName,
        gameCode: normalizedGameCode,
      })

      navigate(toGameRoutePath(normalizedGameCode))
      return
    }

    if (!authUser?.userId) {
      showAppInfoToast('Please log in before creating or joining a game.')
      setIsLoginModalOpen(true)
      return
    }

    try {
      const isCreateMode = gameCodeMode === 'create'
      let deckId: string | null = null

      if (deckOptionsMode === 'import') {
        const deckCardsPayload = activeDeckOption.trim()
        if (!deckCardsPayload) {
          if (isCreateMode) {
            showAppInfoToast('Please paste your deck list before continuing.')
            return
          }
        } else {
          const deckPayloadValidation = validateDeckCardsPayload(deckCardsPayload)
          if (!deckPayloadValidation.isValid) {
            showAppInfoToast(deckPayloadValidation.message ?? 'Deck list format is invalid.')
            return
          }

          const importedDeckCardIds = parseDeckCardIdsFromPayload(deckCardsPayload)
          void preloadCardsByIds(importedDeckCardIds).catch(() => {
            // Import preloading is best effort and should not block submit.
          })

          deckId = await createUserDeck(deckCardsPayload, authUser.userId)
        }
      } else {
        const selectedDeckId = activeDeckOption.trim()
        if (!selectedDeckId) {
          if (!isCreateMode) {
            deckId = null
          } else {
            const deckModeLabel = deckOptionsMode === 'saved_decks' ? 'saved deck' : 'public deck'
            showAppInfoToast(`Please select a ${deckModeLabel} before continuing.`)
            return
          }
        } else {
          deckId = selectedDeckId
        }
      }

      if (gameCodeMode === 'create') {
        if (!deckId) {
          const deckModeLabel = deckOptionsMode === 'saved_decks' ? 'saved deck' : 'public deck'
          showAppInfoToast(`Please select a ${deckModeLabel} before continuing.`)
          return
        }

        const createdGame = await createGameForUser({
          userId: authUser.userId,
          deckId,
        })

        setGameCodeValue(createdGame.id)
        setSession({
          displayName,
          gameCode: createdGame.id,
        })

        showAppSuccessToast(`Game created. Share code ${createdGame.id}`)
        navigate(toGameRoutePath(createdGame.id))
        return
      }

      if (!normalizedGameCode) {
        showAppInfoToast('Please provide a game code to join.')
        return
      }

      const joinedGame = await joinGameAsPlayer(normalizedGameCode, {
        userId: authUser.userId,
        ...(deckId ? { deckId } : {}),
      })

      setSession({
        displayName,
        gameCode: joinedGame.id,
      })

      showAppSuccessToast('Joined game successfully.')
      navigate(toGameRoutePath(joinedGame.id))
    } catch (error) {
      const apiMessage = getApiErrorMessage(error, 'Unable to submit deck or join game. Please try again.')

      if (
        gameCodeMode === 'join' &&
        normalizedGameCode.length > 0 &&
        apiMessage.toLowerCase().includes('already part of this game instance')
      ) {
        setSession({
          displayName,
          gameCode: normalizedGameCode,
        })
        navigate(toGameRoutePath(normalizedGameCode))
        return
      }

      showAppInfoToast(apiMessage)
    }
  }

  return (
    <PageShell>
      <div className="grid w-full grid-cols-1 gap-4 px-2 sm:px-4">
        <Panel className="my-2 w-full border-0 bg-transparent px-5 text-center shadow-none">
          <p
            className={`mt-1 font-['Water_Brush'] text-6xl leading-none tracking-wide text-[var(--text-primary)] transition-opacity duration-150 sm:text-7xl ${
              isTitleFontReady ? 'opacity-100' : 'opacity-0'
            }`}
          >
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
                <AppButton
                  type="button"
                  variant="ghost"
                  onClick={toggleTheme}
                  aria-label="Toggle light and dark mode"
                  className="h-6 w-6 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]"
                >
                  <Lightbulb size={12} />
                </AppButton>
              </div>
              <div className="relative">
                <FormInput
                  id="displayName"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Enter name here"
                  maxLength={24}
                  className="py-1.5 pr-12"
                  required
                />
                <button
                  type="button"
                  onClick={() => {
                    if (authUsername) {
                      setIsLogoutModalOpen(true)
                      return
                    }

                    setIsLoginModalOpen(true)
                  }}
                  aria-label={authUsername ? 'Open logout modal' : 'Open login modal'}
                  className="absolute right-0 top-0 bottom-0 inline-flex w-10 items-center justify-center rounded-r-xl border-l border-[var(--border-subtle)] bg-transparent text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                >
                  {authUsername ? <X size={14} /> : <LogIn size={14} />}
                </button>
              </div>
              {showDisplayNameError ? <FormErrorText>Please enter a display name.</FormErrorText> : null}
            </FormField>

            <FormField className="col-span-1">
              <FormLabel htmlFor="gameCode">Game Code</FormLabel>
              <OptionToggle
                ariaLabel="Game code input mode"
                value={gameCodeMode}
                options={gameCodeModeOptions}
                optionClassName="py-1"
                onChange={(nextMode) => {
                  setGameCodeMode(nextMode)
                }}
              />
              <AdaptiveFormField
                id="gameCode"
                value={activeGameCode}
                onValueChange={setGameCodeValue}
                config={gameCodeFieldConfigByMode[gameCodeMode]}
                className="py-1.5"
              />
            </FormField>

            <FormField className="col-span-1">
                <div className="flex items-center justify-between gap-2">
                  <FormLabel htmlFor="deckOptions" className="mb-0">Deck Options</FormLabel>
                  {starterDeckFetchFailed && deckOptionsMode === 'starter_decks' ? (
                    <button
                      type="button"
                      onClick={() => setStarterDeckRetryToken((value) => value + 1)}
                      className="px-0.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] opacity-[0.45] transition-opacity hover:opacity-75"
                    >
                      Retry
                    </button>
                  ) : null}
                </div>
                <OptionToggle
                  ariaLabel="Deck options input mode"
                  value={deckOptionsMode}
                  options={deckOptionsModeOptions}
                  optionClassName="py-1"
                  onChange={(nextMode) => {
                    setDeckOptionsMode(nextMode)
                    if (nextMode === 'import') {
                      setIsImportModalOpen(true)
                    }
                  }}
                />
                {deckOptionsMode === 'import' ? (
                  <>
                    <AppButton
                      type="button"
                      variant="ghost"
                      onClick={() => setIsImportModalOpen(true)}
                      className="w-full justify-center py-1.5"
                    >
                      Import your deck here
                    </AppButton>
                    {importedDeckLineCount > 0 ? (
                      <p className="mt-2 text-xs text-[var(--text-secondary)]">
                        Imported deck list ready ({importedDeckLineCount} lines).
                      </p>
                    ) : null}
                  </>
                ) : (
                  <AdaptiveFormField
                    id="deckOptions"
                    value={activeDeckOption}
                    onValueChange={setDeckOptionValue}
                    config={activeDeckFieldConfig}
                    className="py-1.5"
                  />
                )}
              </FormField>

            <FormActions className="col-span-full pt-2 w-full justify-start">
              <AppButton type="submit" className="w-full">
                Enter Game
              </AppButton>
            </FormActions>
          </Form>
        </Panel>
      </div>

      {isLoginModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="login-modal-title"
          onClick={() => setIsLoginModalOpen(false)}
        >
          <Panel
            className="w-full max-w-md p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="login-modal-title" className="text-lg font-semibold text-[var(--text-primary)]">
                Log In
              </h2>
            </div>

            <Form className="grid grid-cols-1 gap-2 space-y-0" method="post">
              <input type="hidden" name="intent" value="login" />
              <FormField className="space-y-0">
                <FormLabel htmlFor="loginEmail" className="mb-1 text-[11px] font-normal normal-case leading-none tracking-[0.08em] text-[var(--text-muted)]">
                  Email
                </FormLabel>
                <FormInput
                  id="loginEmail"
                  name="email"
                  type="email"
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="py-1.5"
                  required
                />
              </FormField>

              <FormField className="space-y-0">
                <FormLabel htmlFor="loginPassword" className="mb-1 text-[11px] font-normal normal-case leading-none tracking-[0.08em] text-[var(--text-muted)]">
                  Password
                </FormLabel>
                <FormInput
                  id="loginPassword"
                  name="password"
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  placeholder="Enter password"
                  className="py-1.5"
                  required
                />
              </FormField>
              {actionData?.login?.ok === false && actionData.login.error ? (
                <FormErrorText>{actionData.login.error}</FormErrorText>
              ) : null}
              <p className="text-center text-sm text-[var(--text-secondary)]">
                Not registered?{' '}
                <Link
                  to="/sign-in"
                  onClick={() => setIsLoginModalOpen(false)}
                  className="font-semibold text-[var(--text-accent)] underline-offset-2 hover:underline"
                >
                  Sign up here!
                </Link>
              </p>

              <FormActions className="w-full justify-end gap-2 pt-0">
                <AppButton type="submit" disabled={isSubmittingLogin}>
                  {isSubmittingLogin ? 'Logging In...' : 'Log In'}
                </AppButton>
              </FormActions>

            </Form>
          </Panel>
        </div>
      ) : null}

      {isLogoutModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-modal-title"
          onClick={() => setIsLogoutModalOpen(false)}
        >
          <Panel
            className="w-full max-w-md p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 id="logout-modal-title" className="text-lg font-semibold text-[var(--text-primary)]">
                Are you sure?
              </h2>
            </div>
            <p className="mb-4 text-sm text-[var(--text-secondary)]">
              Do you want to log out of your current session?
            </p>
            <div className="flex justify-end gap-2">
              <AppButton type="button" variant="ghost" onClick={() => setIsLogoutModalOpen(false)}>
                Cancel
              </AppButton>
              <AppButton type="button" onClick={handleLogout}>
                Log Out
              </AppButton>
            </div>
          </Panel>
        </div>
      ) : null}

      {isImportModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-modal-title"
          onClick={() => setIsImportModalOpen(false)}
        >
          <Panel
            className="w-full max-w-2xl p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 id="import-modal-title" className="text-lg font-semibold text-[var(--text-primary)]">
                Import Deck List
              </h2>
            </div>
            <p className="mb-2 text-sm text-[var(--text-secondary)]">
              Paste one card per line using format like: 1x N-001
            </p>
            <FormTextarea
              id="deckImportPayload"
              value={activeDeckOption}
              onChange={(event) => setDeckOptionValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  setIsImportModalOpen(false)
                }
              }}
              placeholder={'1x N-001\n2x N-045'}
              rows={10}
              className="py-2"
            />
            <div className="mt-4 flex justify-end gap-2">
              <AppButton type="button" variant="ghost" onClick={() => setIsImportModalOpen(false)}>
                Close
              </AppButton>
            </div>
          </Panel>
        </div>
      ) : null}
    </PageShell>
  )
}

function toGameRoutePath(joinCode: string): string {
  return `/game/${encodeURIComponent(joinCode.trim())}`
}

function toDeckChoices(decks: IDeckResponse[], emptyStateLabel: string): { value: string; label: string }[] {
  if (decks.length === 0) {
    return [{ value: '', label: emptyStateLabel }]
  }

  return decks.map((deck, index) => {
    const totalCards = deck.cards.reduce((sum, card) => sum + card.quantity, 0)
    const shortId = deck.id.slice(0, 8)
    const deckNumber = index + 1

    return {
      value: deck.id,
      label: `Deck ${deckNumber} (${shortId}) - ${totalCards} cards`,
    }
  })
}

function toDeckCardIdsByDeckId(decks: IDeckResponse[]): Record<string, string[]> {
  return decks.reduce<Record<string, string[]>>((result, deck) => {
    const seen = new Set<string>()
    const cardIds: string[] = []

    for (const card of deck.cards) {
      const normalizedCardId = card.cardId.trim()
      const key = normalizedCardId.toLowerCase()

      if (!normalizedCardId || seen.has(key)) {
        continue
      }

      seen.add(key)
      cardIds.push(normalizedCardId)
    }

    result[deck.id] = cardIds
    return result
  }, {})
}

function parseDeckCardIdsFromPayload(cardsPayload: string): string[] {
  const lines = cardsPayload
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const seen = new Set<string>()
  const cardIds: string[] = []

  for (const line of lines) {
    const match = DECK_LINE_PATTERN.exec(line)
    if (!match) {
      continue
    }

    const cardId = match[2].trim()
    const cardKey = cardId.toLowerCase()

    if (!cardId || seen.has(cardKey)) {
      continue
    }

    seen.add(cardKey)
    cardIds.push(cardId)
  }

  return cardIds
}

async function fetchDecksWithRetry(
  fetchOperation: () => Promise<IDeckResponse[]>,
  attempts: number,
  baseDelayMs: number,
): Promise<IDeckResponse[]> {
  const totalAttempts = Math.max(1, attempts)
  let lastError: unknown

  for (let attemptIndex = 0; attemptIndex < totalAttempts; attemptIndex += 1) {
    try {
      return await fetchOperation()
    } catch (error) {
      lastError = error

      if (attemptIndex >= totalAttempts - 1) {
        break
      }

      const retryDelayMs = baseDelayMs * (attemptIndex + 1)
      await waitForMilliseconds(retryDelayMs)
    }
  }

  throw lastError ?? new Error('Failed to fetch deck list after retries.')
}

function waitForMilliseconds(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, delayMs))
  })
}
