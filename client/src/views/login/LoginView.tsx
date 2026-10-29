import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import i18n, { translateKey } from '@/i18n'
import {
  deckOptionsModeOptions,
  gameEntryModeOptions,
  isGameIntent,
  isRulesetIntent,
  joinGameCodeFieldConfig,
} from '@/views/login/configs/LoginView'
import { Link, useActionData, useNavigate, useNavigation } from 'react-router-dom'
import { PageShell } from '@/components/layout/PageShell'
import { AppButton, Panel } from '@/components/ui'
import {
  AdaptiveFormField,
  Form,
  FormActions,
  FormCheckboxField,
  FormErrorText,
  FormField,
  FormLabel,
  FormInput,
  OptionToggle,
} from '@/components/forms'
import type { IAdaptiveFieldConfig, ISelectChoice } from '@/components/forms'
import { Lightbulb, LogIn, Pencil, X } from 'lucide-react'
import { showAppInfoToast, showAppSuccessToast } from '@/components/feedback/appToastNotifications'
import { clearAuthSession, useAuthSessionStore, type IAuthSession } from '@/state/authSession'
import { ensurePlayerIdentity } from '@/state/guestSession'
import { clearPendingRematch, readPendingRematch } from '@/state/pendingRematch'
import { useSessionStore } from '@/state/sessionStore'
import { useThemeStore } from '@/state/themeStore'
import { useLoginViewModel } from '@/views/login/model/useLoginViewModel'
import { selectRulesetWaitingCount, usePresenceSnapshot } from '@/services/presence/usePresence'
import type { ILoginActionData } from '@/views/login/types/routeHandlers'
import type { IDeckOptionsEntryMode, IGameIntent } from '@/types/login'
import type { IDeckRuleset } from '@/types/deckRuleset'
import { matchModifierLabelKeys, TIME_RELAXED_MODIFIER } from '@/types/gameModifiers'
import type { IPresenceSnapshot } from '@/types/presence'
import {
  createGameForUser,
  fetchGameRuleset,
  fetchRematchReservation,
  joinGameAsPlayer,
  releaseRematchReservation,
} from '@/services/api/gameApi'
import { getApiErrorMessage, isApiBadRequestError } from '@/views/utils/getApiErrorMessage'
import { createUserDeck, fetchDecks } from '@/services/api/deckApi'
import { useDeleteDeckMutation, useUpdateDeckMutation } from '@/services/queries/deckQueries'
import { preloadCardsByIds } from '@/services/cardPreloadService'
import { useCardCatalogByIdsQuery } from '@/services/queries/cardQueries'
import { useActiveDeckRulesetsQuery } from '@/services/queries/deckRulesetQueries'
import { evaluateDeckRulesets, evaluateRuleset } from '@/domain/deck/evaluateDeckRulesets'
import { formatDeckAsImportText } from '@/domain/deck/deckListFormat'
import {
  buildDeckCardSignature,
  deckCardsFromSignature,
  normalizeDeckCardId,
  parseDeckList,
  parseDeckListPartial,
} from '@/domain/deck/parseDeckList'
import { CreateGameShareDialog } from '@/views/login/components/CreateGameShareDialog'
import { DeckImportDialog } from '@/views/login/components/DeckImportDialog'
import { DeleteDeckConfirmDialog } from '@/views/login/components/DeleteDeckConfirmDialog'
import { MatchmakingSearchDialog } from '@/views/login/components/MatchmakingSearchDialog'
import { QueuedPlayersBadge } from '@/views/login/components/QueuedPlayersBadge'
import { writeCachedImportedDeck } from '@/views/login/utils/cachedImportedDeck'
import { buildDefaultSavedDeckName } from '@/views/login/utils/defaultDeckName'
import { resolvePersistedDeckSelection } from '@/views/login/utils/persistedDeckSelection'
import type { IDeckCardMetadata, IDeckListParseError } from '@/domain/deck/types'
import type { IDeckCardInput, IDeckRecord, IDeckResponse } from '@/types/deck'
import type { IMatchTicket } from '@/types/matchmaking'
import { useEnqueueMatchMutation } from '@/services/queries/matchmakingQueries'
import { useGameRulesetByCodeQuery } from '@/services/queries/gameStateQueries'
const EMPTY_DECK_RECORD: IDeckRecord = { wins: 0, losses: 0, draws: 0 }
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

function translateAdaptiveFieldConfig(config: IAdaptiveFieldConfig, t: TFunction): IAdaptiveFieldConfig {
  if (config.type === 'select') {
    return {
      ...config,
      choices: config.choices.map((choice) => ({ ...choice, label: translateKey(t, choice.label) })),
    }
  }

  if (config.type === 'input') {
    const placeholder = config.props?.placeholder
    if (typeof placeholder !== 'string' || !placeholder) {
      return config
    }

    return {
      ...config,
      props: { ...config.props, placeholder: translateKey(t, placeholder) },
    }
  }

  const placeholder = config.props?.placeholder
  if (typeof placeholder !== 'string' || !placeholder) {
    return config
  }

  return {
    ...config,
    props: { ...config.props, placeholder: translateKey(t, placeholder) },
  }
}

/**
 * Queue depth answers "how many players are waiting to be paired", which is a quick-match question only: a host
 * opens a table of their own and has nobody to be paired with, so the host format list stays plain.
 */
function toRulesetChoices(
  rulesets: IDeckRuleset[],
  presenceSnapshot: IPresenceSnapshot | null,
  withQueueDepth: boolean,
) {
  return rulesets.map((ruleset) => {
    const waitingCount = withQueueDepth
      ? selectRulesetWaitingCount(presenceSnapshot, ruleset.id)
      : null

    return {
      value: ruleset.id,
      label: ruleset.name,
      trailing: waitingCount === null ? undefined : <QueuedPlayersBadge count={waitingCount} />,
    }
  })
}

function toRulesetSelectConfig(
  choices: ReturnType<typeof toRulesetChoices>,
  isLoading: boolean,
  t: TFunction,
): IAdaptiveFieldConfig {
  if (choices.length > 0) {
    return { type: 'select', choices }
  }

  return {
    type: 'select',
    choices: [
      {
        value: '',
        label: isLoading ? t('auth.config.loadingRulesets') : t('auth.config.noRulesets'),
      },
    ],
  }
}

export function LoginView() {
  const { t } = useTranslation()
  const actionData = useActionData() as ILoginActionData | undefined
  const navigation = useNavigation()
  const navigate = useNavigate()

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [savedDecks, setSavedDecks] = useState<IDeckResponse[]>([])
  // The public decks are kept whole, not just as select choices: the deck summary names the selected one.
  const [starterDecks, setStarterDecks] = useState<IDeckResponse[]>([])
  const [importDeckName, setImportDeckName] = useState('')
  const [isSavingImportedDeck, setIsSavingImportedDeck] = useState(false)
  // Hosting mints a real game on the click, so every action button is held shut while one submission is in flight.
  const [pendingIntent, setPendingIntent] = useState<IGameIntent | null>(null)
  // Only the id is held: the deck itself is read from the list the player is looking at, so a stale copy of a deck
  // that was just removed can never reach the confirmation.
  const [deckPendingDeletionId, setDeckPendingDeletionId] = useState<string | null>(null)
  // The saved deck being overwritten through the import tab, plus the import draft that was there before the edit so
  // saving or cancelling can give it back untouched.
  const [editingDeckId, setEditingDeckId] = useState<string | null>(null)
  const importDraftBeforeEditRef = useRef<string | null>(null)
  const [savedDeckChoices, setSavedDeckChoices] = useState<ISelectChoice[]>([
    { value: '', label: t('auth.deckChoice.loginToLoad') },
  ])
  const [starterDeckChoices, setStarterDeckChoices] = useState<ISelectChoice[]>([
    { value: '', label: t('auth.deckChoice.loadingPublic') },
  ])
  const [starterDeckFetchFailed, setStarterDeckFetchFailed] = useState(false)
  // Separate from the choice lists on purpose: an account with no saved decks and a list that has not arrived yet both
  // leave a single placeholder choice, and only the flag can tell "that deck is gone" from "wait for it".
  const [hasLoadedSavedDecks, setHasLoadedSavedDecks] = useState(false)
  const [hasLoadedStarterDecks, setHasLoadedStarterDecks] = useState(false)
  const [starterDeckRetryToken, setStarterDeckRetryToken] = useState(0)
  const [savedDeckCardIdsByDeckId, setSavedDeckCardIdsByDeckId] = useState<Record<string, string[]>>({})
  const [starterDeckCardIdsByDeckId, setStarterDeckCardIdsByDeckId] = useState<Record<string, string[]>>({})
  // The full card list per deck, quantities included: the ruleset evaluation needs counts, which the id lists
  // (kept for preloading) collapse away.
  const [savedDeckCardsByDeckId, setSavedDeckCardsByDeckId] = useState<Record<string, IDeckCardInput[]>>({})
  const [starterDeckCardsByDeckId, setStarterDeckCardsByDeckId] = useState<Record<string, IDeckCardInput[]>>({})
  const [activeTicket, setActiveTicket] = useState<IMatchTicket | null>(() => readStoredMatchTicket())
  // A created game exists on the server the moment `Enter Game` runs, so its code is held here while the creator
  // copies it. The board is only opened once they confirm.
  // A rematch the two players already agreed on: the reserved table code is waiting for this view to claim it, and
  // the deck chosen here is the one brought to the next match.
  const [pendingRematch, setPendingRematch] = useState(() => readPendingRematch())
  // The release the view fires when the player leaves is only worth sending while the reservation is unclaimed, and
  // the unmount cleanup cannot read the state it captured at mount - hence the refs.
  const pendingRematchCodeRef = useRef(pendingRematch?.code ?? null)
  const didClaimRematchRef = useRef(false)
  const [createdGameShare, setCreatedGameShare] = useState<{
    gameId: string
    rulesetName: string
    modifierLabels: string[]
  } | null>(null)
  const [isTitleFontReady, setIsTitleFontReady] = useState(() => {
    const fontSet = getFontFaceSet()
    if (!fontSet) {
      return true
    }

    return fontSet.check(TITLE_FONT_LOAD_QUERY)
  })

  const setSession = useSessionStore((state) => state.setSession)
  const toggleTheme = useThemeStore((state) => state.toggleTheme)
  const {
    activeDeckOption,
    deckOptionsMode,
    displayName,
    gameEntryMode,
    hostRulesetId,
    hostTimeRelaxed,
    joinGameCode,
    quickmatchRulesetId,
    importDeckOption,
    savedDeckOption,
    setDeckOptionsMode,
    setDeckOptionValue,
    setDeckOptionValueForMode,
    setDisplayName,
    setGameEntryMode,
    setHostTimeRelaxed,
    setJoinGameCode,
    setRulesetId,
    showDisplayNameError,
    starterDeckOption,
    validateDisplayName,
  } = useLoginViewModel()

  const isSubmittingLogin =
    navigation.state === 'submitting' && navigation.formData?.get('intent') === 'login'
  const authSession = useAuthSessionStore((state) => state.session)
  // `authUser` means "a real account". Guests play through `authSession` like everyone else, but nothing that
  // persists ownership - saving a deck, loading saved decks - may treat them as a signed-in user.
  const authUser = actionData?.login?.user ?? (authSession && !authSession.isGuest ? authSession : null)
  const authUsername = authUser?.username ?? ''
  const isGuestSession = authSession?.isGuest === true

  const presenceSnapshot = usePresenceSnapshot()
  const onlineViewers = presenceSnapshot?.onlineViewers ?? null

  const activeDeckRulesetsQuery = useActiveDeckRulesetsQuery()
  const enqueueMatchMutation = useEnqueueMatchMutation()
  // The table behind a typed code, so the deck can be judged before the join is ever attempted.
  const joinGameRulesetQuery = useGameRulesetByCodeQuery(
    gameEntryMode === 'join_or_host' ? joinGameCode : '',
  )

  // Landing here from a finished match: fill the join form in and put the player on the tab that claims the table.
  // It is a prefill, not a join - the whole point of the detour is that the deck can still change.
  useEffect(() => {
    if (!pendingRematch) {
      return
    }

    setGameEntryMode('join_or_host')
    setJoinGameCode(pendingRematch.code)
    // Deliberately not dependant on the setters alone: this must run when a code arrives, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRematch])

  useEffect(() => {
    pendingRematchCodeRef.current = pendingRematch?.code ?? null
  }, [pendingRematch])

  /**
   * The banner is only as trustworthy as the reservation behind it. It is probed once when the view appears and once
   * when the player comes back to the tab - never on a timer - and cleared when the server says the rematch is gone:
   * lapsed, released by the other player, or bound to a format that was deactivated in between.
   */
  useEffect(() => {
    if (!pendingRematch) {
      return
    }

    const code = pendingRematch.code
    let isCancelled = false

    const checkReservation = async (): Promise<void> => {
      try {
        await fetchRematchReservation(code)
      } catch {
        if (isCancelled) {
          return
        }

        // Any refusal means the same thing here: there is nothing left to claim.
        clearPendingRematch()
        setPendingRematch(null)
        showAppInfoToast(t('auth.rematch.lapsed'))
      }
    }

    // Asking again is also what cancels a release this player's own last visit left behind.
    void checkReservation()

    const handleReturn = (): void => {
      if (document.visibilityState !== 'hidden') {
        void checkReservation()
      }
    }

    window.addEventListener('focus', handleReturn)
    document.addEventListener('visibilitychange', handleReturn)

    return () => {
      isCancelled = true
      window.removeEventListener('focus', handleReturn)
      document.removeEventListener('visibilitychange', handleReturn)
    }
  }, [pendingRematch, t])

  /**
   * Leaving is not the same as abandoning: unmounting fires on a refresh too. The release is therefore deferred
   * server side, and the probe above cancels it as soon as the player is back - which is why this can be fired
   * generously, from the unmount and from `pagehide` alike.
   */
  useEffect(() => {
    const releaseIfAbandoned = (): void => {
      const code = pendingRematchCodeRef.current

      if (!code || didClaimRematchRef.current) {
        return
      }

      pendingRematchCodeRef.current = null
      releaseRematchReservation(code)
    }

    window.addEventListener('pagehide', releaseIfAbandoned)

    return () => {
      window.removeEventListener('pagehide', releaseIfAbandoned)
      releaseIfAbandoned()
    }
  }, [])

  const dismissPendingRematch = (): void => {
    const code = pendingRematch?.code ?? null

    clearPendingRematch()
    setPendingRematch(null)
    pendingRematchCodeRef.current = null

    if (code) {
      releaseRematchReservation(code)
    }
  }

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
          setStarterDecks(publicDecks)
          setStarterDeckChoices(toDeckChoices(publicDecks, t('auth.deckChoice.noPublic'), false))
          setStarterDeckCardIdsByDeckId(toDeckCardIdsByDeckId(publicDecks))
          setStarterDeckCardsByDeckId(toDeckCardsByDeckId(publicDecks))
          setStarterDeckFetchFailed(false)
          setHasLoadedStarterDecks(true)
        }
      } catch {
        if (!isCancelled) {
          setStarterDecks([])
          setStarterDeckChoices([{ value: '', label: t('auth.deckChoice.failedPublic') }])
          setStarterDeckCardIdsByDeckId({})
          setStarterDeckCardsByDeckId({})
          setStarterDeckFetchFailed(true)
        }
      }

      if (!authUser?.userId) {
        if (!isCancelled) {
          setSavedDecks([])
          setSavedDeckChoices([{ value: '', label: t('auth.deckChoice.loginToLoad') }])
          setSavedDeckCardIdsByDeckId({})
          setSavedDeckCardsByDeckId({})
          setHasLoadedSavedDecks(false)
        }

        return
      }

      try {
        const userDecks = await fetchDecks({ userId: authUser.userId })

        if (!isCancelled) {
          setSavedDecks(userDecks)
          setSavedDeckChoices(toDeckChoices(userDecks, t('auth.deckChoice.noSaved')))
          setSavedDeckCardIdsByDeckId(toDeckCardIdsByDeckId(userDecks))
          setSavedDeckCardsByDeckId(toDeckCardsByDeckId(userDecks))
          setHasLoadedSavedDecks(true)
        }
      } catch {
        if (!isCancelled) {
          setSavedDecks([])
          setSavedDeckChoices([{ value: '', label: t('auth.deckChoice.failedSaved') }])
          setSavedDeckCardIdsByDeckId({})
          setSavedDeckCardsByDeckId({})
        }
      }
    }

    void loadDeckChoices()

    return () => {
      isCancelled = true
    }
  }, [authUser?.userId, starterDeckRetryToken, t])

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
    })
  }, [
    activeDeckOption,
    deckOptionsMode,
    savedDeckCardIdsByDeckId,
    starterDeckCardIdsByDeckId,
  ])

  const pendingDeletionDeck = useMemo(
    () => savedDecks.find((deck) => deck.id === deckPendingDeletionId) ?? null,
    [deckPendingDeletionId, savedDecks],
  )

  const deleteDeckMutation = useDeleteDeckMutation()

  const confirmDeckDeletion = async () => {
    const deck = pendingDeletionDeck
    if (!deck) {
      return
    }

    try {
      await deleteDeckMutation.mutateAsync(deck.id)
    } catch (error) {
      // The list is the truth: the deck stays, the dialog stays open, and the toast explains why (usually "this deck
      // is still assigned to a game").
      showAppInfoToast(getApiErrorMessage(error, t('auth.toasts.deckDeleteFailed')))
      return
    }

    const remainingDecks = savedDecks.filter((candidate) => candidate.id !== deck.id)

    setDeckPendingDeletionId(null)
    setSavedDecks(remainingDecks)
    setSavedDeckChoices(toDeckChoices(remainingDecks, t('auth.deckChoice.noSaved')))
    setSavedDeckCardIdsByDeckId((current) => omitDeckEntry(current, deck.id))
    setSavedDeckCardsByDeckId((current) => omitDeckEntry(current, deck.id))

    // The picker must stop pointing at a deck that no longer exists; anything selected for the next match is that deck.
    if (savedDeckOption.trim() === deck.id) {
      setDeckOptionValueForMode('saved_decks', '')
    }

    showAppSuccessToast(
      t('auth.toasts.deckDeleted', { name: describeDeckName(deck) }),
      { id: 'auth-deck-delete-status' },
    )
  }

  const updateDeckMutation = useUpdateDeckMutation()

  /**
   * Editing a saved deck reuses the import tab: same parser, same ruleset evaluation, same dialog, with the deck's
   * list loaded and the save turned into an overwrite. The import text belongs to the player, so the draft that is
   * there before the edit is snapshotted and restored when the edit is saved or cancelled.
   */
  const openDeckEditor = useCallback((deckId: string) => {
    const deck = savedDecks.find((candidate) => candidate.id === deckId)
    if (!deck) {
      return
    }

    importDraftBeforeEditRef.current = importDeckOption
    setEditingDeckId(deck.id)
    setImportDeckName(deck.name)
    setDeckOptionsMode('import')
    setDeckOptionValueForMode('import', formatDeckAsImportText(deck.cards))
    setIsImportModalOpen(true)
  }, [importDeckOption, savedDecks, setDeckOptionValueForMode, setDeckOptionsMode])

  /** Leaves the editor, giving the import draft back. The mode is chosen by the caller: a save lands on the list. */
  const closeDeckEditor = (nextMode: IDeckOptionsEntryMode | null = 'saved_decks') => {
    if (editingDeckId === null) {
      setIsImportModalOpen(false)
      return
    }

    const draft = importDraftBeforeEditRef.current ?? ''
    importDraftBeforeEditRef.current = null
    setEditingDeckId(null)
    setDeckOptionValueForMode('import', draft)
    writeCachedImportedDeck(draft)
    setIsImportModalOpen(false)

    if (nextMode) {
      setDeckOptionsMode(nextMode)
    }
  }

  // Switching tabs by hand while editing is a cancel: the player moved on, and the editor has no orphan state to keep.
  const handleDeckOptionsModeChange = (nextMode: IDeckOptionsEntryMode) => {
    if (editingDeckId !== null) {
      closeDeckEditor(null)
    }

    setDeckOptionsMode(nextMode)
    if (nextMode === 'import') {
      setIsImportModalOpen(true)
    }
  }

  const activeDeckFieldConfig = useMemo(() => {
    if (deckOptionsMode === 'saved_decks') {
      return {
        type: 'select' as const,
        // Edit and delete are offered on the player's own list only, and never on the placeholder row: a public deck
        // is nobody's to rewrite or remove, and this list is exactly the player's own.
        choices: savedDeckChoices.map((choice) => ({
          ...choice,
          actions: choice.value
            ? [
                {
                  label: t('auth.deckEdit.actionAria', { name: choice.label }),
                  onActivate: () => openDeckEditor(choice.value),
                  icon: <Pencil size={13} aria-hidden="true" />,
                },
                {
                  label: t('auth.deckChoice.deleteAria', { name: choice.label }),
                  onActivate: () => setDeckPendingDeletionId(choice.value),
                  icon: <X size={14} aria-hidden="true" />,
                },
              ]
            : undefined,
        })),
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
  }, [deckOptionsMode, savedDeckChoices, starterDeckChoices, openDeckEditor, t])

  const translatedGameEntryModeOptions = useMemo(
    () => gameEntryModeOptions.map((option) => ({ ...option, label: translateKey(t, option.label) })),
    [t],
  )

  const translatedDeckOptionsModeOptions = useMemo(
    () => deckOptionsModeOptions.map((option) => ({ ...option, label: translateKey(t, option.label) })),
    [t],
  )

  // Quick match only offers formats the admin left quick-matchable. A host-only format is still fully playable through
  // hosting and invites, and the queue endpoint refuses it server-side, so hiding it here is the good path rather
  // than the only guard.
  const quickmatchRulesets = useMemo(
    () => (activeDeckRulesetsQuery.data ?? []).filter((ruleset) => ruleset.availableInQuickMatch !== false),
    [activeDeckRulesetsQuery.data],
  )

  const quickmatchRulesetChoices = useMemo(
    () => toRulesetChoices(quickmatchRulesets, presenceSnapshot, true),
    [quickmatchRulesets, presenceSnapshot],
  )

  const hostRulesetChoices = useMemo(
    () => toRulesetChoices(activeDeckRulesetsQuery.data ?? [], presenceSnapshot, false),
    [activeDeckRulesetsQuery.data, presenceSnapshot],
  )

  const quickmatchRulesetConfig = useMemo(
    () => toRulesetSelectConfig(quickmatchRulesetChoices, activeDeckRulesetsQuery.isLoading, t),
    [activeDeckRulesetsQuery.isLoading, quickmatchRulesetChoices, t],
  )

  const hostRulesetConfig = useMemo(
    () => toRulesetSelectConfig(hostRulesetChoices, activeDeckRulesetsQuery.isLoading, t),
    [activeDeckRulesetsQuery.isLoading, hostRulesetChoices, t],
  )

  const translatedJoinGameCodeConfig = useMemo(
    () => translateAdaptiveFieldConfig(joinGameCodeFieldConfig, t),
    [t],
  )

  const selectedQuickmatchRuleset = useMemo(
    () => quickmatchRulesets.find((ruleset) => ruleset.id === quickmatchRulesetId) ?? null,
    [quickmatchRulesets, quickmatchRulesetId],
  )

  const selectedHostRuleset = useMemo(
    () => (activeDeckRulesetsQuery.data ?? []).find((ruleset) => ruleset.id === hostRulesetId) ?? null,
    [activeDeckRulesetsQuery.data, hostRulesetId],
  )

  // The code only names the format; the definition the deck is judged with comes from the active list the select
  // already loads, so both paths evaluate with exactly the same ruleset object.
  const joinTargetRuleset = useMemo(() => {
    const binding = joinGameRulesetQuery.ruleset
    if (!binding) {
      return null
    }

    return (activeDeckRulesetsQuery.data ?? []).find((ruleset) => ruleset.id === binding.id) ?? null
  }, [activeDeckRulesetsQuery.data, joinGameRulesetQuery.ruleset])

  // The dialog is where a deck gets fixed, so it always shows every active format: the warning about the format the
  // player is about to play is the login view's job, not the dialog's.
  const importDialogRulesets = useMemo(
    () => activeDeckRulesetsQuery.data ?? [],
    [activeDeckRulesetsQuery.data],
  )

  // Both format-driven actions default to the first format they can actually offer, each in its own slot so switching
  // tabs or changing the host format never moves the quick-match queue target. Quick match defaults from the
  // quick-matchable list only: a host-only format must never become the queue target.
  useEffect(() => {
    if (quickmatchRulesets.length === 0 || quickmatchRulesets.some((ruleset) => ruleset.id === quickmatchRulesetId)) {
      return
    }

    setRulesetId('quickmatch', quickmatchRulesets[0].id)
  }, [quickmatchRulesets, quickmatchRulesetId, setRulesetId])

  useEffect(() => {
    const rulesets = activeDeckRulesetsQuery.data ?? []
    if (rulesets.length === 0 || rulesets.some((ruleset) => ruleset.id === hostRulesetId)) {
      return
    }

    setRulesetId('host', rulesets[0].id)
  }, [activeDeckRulesetsQuery.data, hostRulesetId, setRulesetId])

  // A remembered deck is kept only while the deck still exists: a deleted saved deck or a withdrawn public deck clears
  // the selection instead of quietly choosing another one, so the submit's own "choose a deck" prompt answers it. The
  // loaded flags are what stop a pending fetch from wiping a selection it has not had a chance to see yet.
  useEffect(() => {
    const correctedValue = resolvePersistedDeckSelection(
      savedDeckOption,
      savedDecks.map((deck) => deck.id),
      hasLoadedSavedDecks,
    )

    if (correctedValue === savedDeckOption) {
      return
    }

    setDeckOptionValueForMode('saved_decks', correctedValue)
  }, [hasLoadedSavedDecks, savedDeckOption, savedDecks, setDeckOptionValueForMode])

  useEffect(() => {
    const correctedValue = resolvePersistedDeckSelection(
      starterDeckOption,
      starterDecks.map((deck) => deck.id),
      hasLoadedStarterDecks,
    )

    if (correctedValue === starterDeckOption) {
      return
    }

    setDeckOptionValueForMode('starter_decks', correctedValue)
  }, [hasLoadedStarterDecks, setDeckOptionValueForMode, starterDeckOption, starterDecks])

  // A remembered deck source can outlive the session that could use it: guests cannot load saved decks, so a restored
  // "saved decks" mode would open on a picker that can never fill. This runs once per mount and only over what was
  // restored - choosing that mode by hand still shows the sign-in hint the panel renders for guests.
  const hasAppliedGuestDeckModeRef = useRef(false)

  useEffect(() => {
    if (!isGuestSession || hasAppliedGuestDeckModeRef.current) {
      return
    }

    hasAppliedGuestDeckModeRef.current = true

    if (deckOptionsMode === 'saved_decks') {
      setDeckOptionsMode('starter_decks')
    }
  }, [deckOptionsMode, isGuestSession, setDeckOptionsMode])

  const importedDeckParse = useMemo(() => {
    if (deckOptionsMode !== 'import' || activeDeckOption.trim().length === 0) {
      return null
    }

    return parseDeckList(activeDeckOption)
  }, [deckOptionsMode, activeDeckOption])

  const importedDeckPartialCards = useMemo(() => {
    if (deckOptionsMode !== 'import') {
      return []
    }

    return parseDeckListPartial(activeDeckOption)
  }, [deckOptionsMode, activeDeckOption])

  const importedDeckPartialSignature = useMemo(
    () => buildDeckCardSignature(importedDeckPartialCards),
    [importedDeckPartialCards],
  )

  const importedDeckCards = useMemo(
    () => deckCardsFromSignature(importedDeckPartialSignature),
    [importedDeckPartialSignature],
  )

  const importedDeckCardIds = useMemo(
    () => importedDeckCards.map((card) => card.cardId),
    [importedDeckCards],
  )

  const importedDeckCardsQuery = useCardCatalogByIdsQuery(importedDeckCardIds, {
    enabled: deckOptionsMode === 'import' && importedDeckCardIds.length > 0,
  })

  const importedDeckCardsById = useMemo(() => {
    const byId = new Map<string, IDeckCardMetadata>()

    for (const card of importedDeckCardsQuery.data ?? []) {
      byId.set(normalizeDeckCardId(card.id), card)
    }

    return byId
  }, [importedDeckCardsQuery.data])

  const importedDeckValidation = useMemo(() => {
    if (importedDeckCards.length === 0) {
      return null
    }

    return evaluateDeckRulesets({
      cards: importedDeckCards,
      cardsById: importedDeckCardsById,
      rulesets: activeDeckRulesetsQuery.data ?? [],
    })
  }, [importedDeckCards, importedDeckCardsById, activeDeckRulesetsQuery.data])

  const isCheckingImportedDeck = importedDeckCardsQuery.isFetching || activeDeckRulesetsQuery.isFetching
  const isImportedDeckMetadataCold = isCheckingImportedDeck && importedDeckCardsById.size === 0
  const importedDeckDialogValidation = isImportedDeckMetadataCold ? null : importedDeckValidation
  const importedDeckParseError = importedDeckParse && !importedDeckParse.isValid
    ? importedDeckParse.error
    : null

  const selectedStoredDeckCards = useMemo(() => {
    const selectedDeckId = activeDeckOption.trim()
    if (!selectedDeckId || deckOptionsMode === 'import') {
      return []
    }

    return deckOptionsMode === 'saved_decks'
      ? savedDeckCardsByDeckId[selectedDeckId] ?? []
      : starterDeckCardsByDeckId[selectedDeckId] ?? []
  }, [activeDeckOption, deckOptionsMode, savedDeckCardsByDeckId, starterDeckCardsByDeckId])

  const storedDeckCardIds = useMemo(
    () => selectedStoredDeckCards.map((card) => card.cardId),
    [selectedStoredDeckCards],
  )

  const storedDeckCardsQuery = useCardCatalogByIdsQuery(storedDeckCardIds, {
    enabled: deckOptionsMode !== 'import' && storedDeckCardIds.length > 0,
  })

  const storedDeckCardsById = useMemo(() => {
    const byId = new Map<string, IDeckCardMetadata>()

    for (const card of storedDeckCardsQuery.data ?? []) {
      byId.set(normalizeDeckCardId(card.id), card)
    }

    return byId
  }, [storedDeckCardsQuery.data])

  // The deck the player is about to bring, whichever mode supplies it: parsed import text or the stored deck
  // they selected.
  const activeDeckCards = deckOptionsMode === 'import' ? importedDeckCards : selectedStoredDeckCards
  const activeDeckCardsById = deckOptionsMode === 'import' ? importedDeckCardsById : storedDeckCardsById

  /**
   * Quick match and host judge the deck against the format of the action about to run, nothing else: a deck that is
   * legal in some other format is still refused here, because the game it is about to enter only accepts this one.
   * The Join or Host tab shows both actions, and only hosting is format-bound.
   */
  const rulesetDeckEvaluation = useMemo(() => {
    const ruleset = gameEntryMode === 'quickmatch' ? selectedQuickmatchRuleset : selectedHostRuleset
    if (!ruleset || activeDeckCards.length === 0) {
      return null
    }

    return evaluateRuleset(activeDeckCards, activeDeckCardsById, ruleset)
  }, [gameEntryMode, selectedQuickmatchRuleset, selectedHostRuleset, activeDeckCards, activeDeckCardsById])

  const isCheckingActiveDeck = importedDeckCardsQuery.isFetching || storedDeckCardsQuery.isFetching

  /**
   * The format the deck summary judges against: the quick-match format while queueing, and on the Join or Host tab the
   * table behind the typed code - falling back to the host format while no code resolves to a game.
   */
  const summaryRuleset = gameEntryMode === 'quickmatch'
    ? selectedQuickmatchRuleset
    : joinTargetRuleset ?? selectedHostRuleset

  const summaryDeckEvaluation = useMemo(() => {
    if (!summaryRuleset || activeDeckCards.length === 0) {
      return null
    }

    return evaluateRuleset(activeDeckCards, activeDeckCardsById, summaryRuleset)
  }, [summaryRuleset, activeDeckCards, activeDeckCardsById])

  // A stored deck is named by the player, so its name is enough. An imported deck has none, so it takes the identity
  // of its leader, which is the one card every legal deck is built around.
  const summaryDeckName = useMemo(() => {
    if (deckOptionsMode === 'import') {
      const leaderCard = importedDeckCards.find(
        (card) => importedDeckCardsById.get(normalizeDeckCardId(card.cardId))?.type.trim().toLowerCase() === 'leader',
      )
      const leader = leaderCard
        ? importedDeckCardsById.get(normalizeDeckCardId(leaderCard.cardId))
        : undefined

      if (leader) {
        return `${leader.id} ${leader.displayName}`
      }

      return activeDeckOption.trim() ? t('auth.deckSummary.importedDeck') : null
    }

    const selectedDeckId = activeDeckOption.trim()
    if (!selectedDeckId) {
      return null
    }

    const decks = deckOptionsMode === 'saved_decks' ? savedDecks : starterDecks
    const deckName = decks.find((deck) => deck.id === selectedDeckId)?.name.trim()

    return deckName || t('auth.deckChoice.unnamedDeck', { shortId: selectedDeckId.slice(0, 8) })
  }, [
    activeDeckOption,
    deckOptionsMode,
    importedDeckCards,
    importedDeckCardsById,
    savedDecks,
    starterDecks,
    t,
  ])

  // The record belongs to the player - the server only returns the caller's own - so the summary can show it for a
  // saved deck and for a public one alike, and an imported list simply has none.
  const activeDeckRecord = useMemo<IDeckRecord | null>(() => {
    if (deckOptionsMode === 'import') {
      return null
    }

    const selectedDeckId = activeDeckOption.trim()
    if (!selectedDeckId) {
      return null
    }

    const decks = deckOptionsMode === 'saved_decks' ? savedDecks : starterDecks
    return decks.find((deck) => deck.id === selectedDeckId)?.record ?? null
  }, [activeDeckOption, deckOptionsMode, savedDecks, starterDecks])

  // The one change that resets a deck's record is a different leader. The stored leader comes from the deck itself,
  // the edited one from the same metadata the ruleset evaluation uses, and the comparison waits for that metadata so
  // the warning cannot flash while the card list is still resolving.
  const editingDeck = useMemo(
    () => savedDecks.find((deck) => deck.id === editingDeckId) ?? null,
    [editingDeckId, savedDecks],
  )

  const editedLeaderCardId = useMemo(() => {
    const leaderCard = importedDeckCards.find(
      (card) => importedDeckCardsById.get(normalizeDeckCardId(card.cardId))?.type.trim().toLowerCase() === 'leader',
    )

    return leaderCard ? normalizeDeckCardId(leaderCard.cardId) : ''
  }, [importedDeckCards, importedDeckCardsById])

  const leaderWillResetRecord = useMemo(() => {
    if (!editingDeck || (importedDeckCards.length > 0 && importedDeckCardsById.size === 0)) {
      return false
    }

    return normalizeDeckCardId(editingDeck.leaderCardId ?? '') !== editedLeaderCardId
  }, [editedLeaderCardId, editingDeck, importedDeckCards.length, importedDeckCardsById.size])

  const isCheckingDeckSummary = isCheckingActiveDeck || joinGameRulesetQuery.isChecking

  const describeImportedDeckParseError = (error: IDeckListParseError): string => {
    if (error.code === 'empty') {
      return t('deckRules.parse.empty')
    }

    if (error.code === 'nonPositiveQuantity') {
      return t('deckRules.parse.nonPositiveQuantity', { line: error.line })
    }

    return t('deckRules.parse.invalidLine', { line: error.line, value: error.value ?? '' })
  }

  const defaultImportDeckName = useMemo(
    () => buildDefaultSavedDeckName(savedDecks),
    [savedDecks],
  )

  const isImportedDeckReady =
    Boolean(importedDeckParse?.isValid)
    && !isCheckingImportedDeck
    && importedDeckValidation?.isLegalInAnyRuleset === true

  const handleImportDeckTextChange = (value: string) => {
    setDeckOptionValue(value)
    writeCachedImportedDeck(value)
  }

  const resolveReadyImportedDeck = () => {
    const cardsPayload = activeDeckOption.trim()

    if (!cardsPayload) {
      showAppInfoToast(t('auth.toasts.pasteDeckList'))
      return null
    }

    const parsedDeckList = parseDeckList(cardsPayload)
    if (!parsedDeckList.isValid) {
      showAppInfoToast(describeImportedDeckParseError(parsedDeckList.error))
      return null
    }

    if (isCheckingImportedDeck) {
      showAppInfoToast(t('auth.toasts.deckStillChecking'))
      return null
    }

    if (importedDeckValidation?.isLegalInAnyRuleset !== true) {
      showAppInfoToast(t('auth.toasts.deckNotLegal'))
      return null
    }

    return { cardsPayload, cards: parsedDeckList.cards }
  }

  const handleUseImportedDeck = () => {
    const resolvedDeck = resolveReadyImportedDeck()
    if (!resolvedDeck) {
      return
    }

    writeCachedImportedDeck(resolvedDeck.cardsPayload)
    setDeckOptionValue(resolvedDeck.cardsPayload)
    setIsImportModalOpen(false)
    showAppSuccessToast(t('auth.toasts.deckCached'), { id: 'auth-deck-import-status' })
  }

  const handleSaveImportedDeck = async () => {
    if (!authUser?.userId) {
      return
    }

    const resolvedDeck = resolveReadyImportedDeck()
    if (!resolvedDeck) {
      return
    }

    setIsSavingImportedDeck(true)

    try {
      const deckName = importDeckName.trim() || defaultImportDeckName

      if (editingDeckId) {
        const previousRecord = savedDecks.find((deck) => deck.id === editingDeckId)?.record
        const updatedDeck = await updateDeckMutation.mutateAsync({
          deckId: editingDeckId,
          name: deckName,
          cards: resolvedDeck.cards,
        })
        const nextSavedDecks = savedDecks.map((deck) => (
          deck.id === editingDeckId ? updatedDeck : deck
        ))

        setSavedDecks(nextSavedDecks)
        setSavedDeckChoices(toDeckChoices(nextSavedDecks, t('auth.deckChoice.noSaved')))
        setSavedDeckCardIdsByDeckId((current) => ({
          ...current,
          [updatedDeck.id]: resolvedDeck.cards.map((card) => card.cardId),
        }))
        setSavedDeckCardsByDeckId((current) => ({
          ...current,
          [updatedDeck.id]: resolvedDeck.cards,
        }))

        // The response carries the deck's own record, so "the leader changed" is read from the server's answer
        // instead of being inferred: the record is reset only when it actually was.
        const recordWasReset = hasPlayedGames(previousRecord) && !hasPlayedGames(updatedDeck.record)

        closeDeckEditor()
        setDeckOptionValue(updatedDeck.id)
        showAppSuccessToast(
          t(
            recordWasReset ? 'auth.deckEdit.savedWithReset' : 'auth.deckEdit.saved',
            { name: describeDeckName(updatedDeck) },
          ),
          { id: 'auth-deck-import-status' },
        )

        return
      }

      const deckId = await createUserDeck(resolvedDeck.cardsPayload, authUser.userId, deckName)
      const savedDeck: IDeckResponse = {
        id: deckId,
        name: deckName,
        type: 'User',
        userId: authUser.userId,
        cards: resolvedDeck.cards,
      }
      const nextSavedDecks = [...savedDecks, savedDeck]

      setSavedDecks(nextSavedDecks)
      setSavedDeckChoices(toDeckChoices(nextSavedDecks, t('auth.deckChoice.noSaved')))
      setSavedDeckCardIdsByDeckId((current) => ({
        ...current,
        [deckId]: resolvedDeck.cards.map((card) => card.cardId),
      }))
      setImportDeckName('')
      setIsImportModalOpen(false)
      setDeckOptionsMode('saved_decks')
      setDeckOptionValue(deckId)
      showAppSuccessToast(
        t('auth.toasts.deckSavedAs', { name: deckName }),
        { id: 'auth-deck-import-status' },
      )
    } catch (error) {
      showAppInfoToast(
        getApiErrorMessage(
          error,
          editingDeckId ? t('auth.deckEdit.failed') : t('auth.toasts.deckSaveFailed'),
        ),
        { id: 'auth-deck-import-status' },
      )
    } finally {
      setIsSavingImportedDeck(false)
    }
  }

  const handleLogout = () => {
    clearAuthSession()
    setDisplayName('')
    setLoginEmail('')
    setLoginPassword('')
    setIsLogoutModalOpen(false)
    showAppInfoToast(t('auth.toasts.loggedOut'), { id: 'auth-logout-status', duration: 3200 })
    navigate('/', { replace: true })
  }

  /**
   * Every mode is open to everyone: a display name is enough, and a guest session is minted on the spot when
   * there is no registered one. Only the features that persist ownership need `authUser`.
   */
  const resolvePlayerIdentity = async (): Promise<IAuthSession | null> => {
    try {
      const identity = await ensurePlayerIdentity(displayName)
      if (identity.username !== displayName) {
        setDisplayName(identity.username)
      }

      return identity
    } catch (error) {
      showAppInfoToast(getApiErrorMessage(error, t('auth.toasts.identityFailed')))
      return null
    }
  }

  /**
   * The toast shown when the chosen format refuses the deck. An imported deck is fixed in the import dialog, which
   * is where its violations are listed, so the toast points there instead of quoting the whole list.
   */
  const showRulesetDeckRejectedToast = (rulesetName: string) => {
    if (deckOptionsMode === 'import') {
      showAppInfoToast(t('auth.toasts.deckInvalidForImportedDeck'))
      return
    }

    showAppInfoToast(
      t('auth.toasts.deckNotLegalForRuleset', { ruleset: rulesetName }),
    )
  }

  const finishQuickmatch = (gameId: string) => {
    setActiveTicket(null)
    clearStoredMatchTicket()
    setSession({ displayName, gameCode: gameId })
    showAppSuccessToast(t('auth.toasts.matchFound'))
    navigate(toGameRoutePath(gameId))
  }

  const handleEnterCreatedGame = () => {
    if (!createdGameShare) {
      return
    }

    const gameId = createdGameShare.gameId
    setCreatedGameShare(null)
    setSession({ displayName, gameCode: gameId })
    // No "share this code" toast here: the dialog has just shown the code and the invite link, and repeating it over
    // the board adds nothing.
    navigate(toGameRoutePath(gameId))
  }

  const startQuickmatch = async (identity: IAuthSession, deckId: string, ruleset: IDeckRuleset) => {
    try {
      const ticket = await enqueueMatchMutation.mutateAsync({
        userId: identity.userId,
        deckId,
        rulesetId: ruleset.id,
      })

      if (ticket.state === 'matched' && ticket.gameId) {
        finishQuickmatch(ticket.gameId)
        return
      }

      storeMatchTicket(ticket)
      setActiveTicket(ticket)
    } catch (error) {
      // The queue refuses a deck with a full list of violations; the import dialog is where those are shown.
      if (isApiBadRequestError(error)) {
        showRulesetDeckRejectedToast(ruleset.name)
        return
      }

      showAppInfoToast(getApiErrorMessage(error, t('auth.toasts.matchmakingFailed')))
    }
  }

  /**
   * The format of the table behind a code. The debounced lookup usually has it already; when it does not (the player
   * typed fast and pressed Join), this asks directly rather than letting the server produce the same verdict later.
   * A code that names no live game, or a game with no format, resolves to null and leaves joining as it was.
   */
  const resolveJoinFormat = async (gameCode: string): Promise<IDeckRuleset | null> => {
    if (joinTargetRuleset && !joinGameRulesetQuery.isChecking) {
      return joinTargetRuleset
    }

    try {
      const binding = await fetchGameRuleset(gameCode)
      if (!binding) {
        return null
      }

      return (activeDeckRulesetsQuery.data ?? []).find((ruleset) => ruleset.id === binding.id) ?? null
    } catch {
      return null
    }
  }

  const showJoinFormatRejectedToast = (rulesetName: string) => {
    showAppInfoToast(t('auth.toasts.deckNotLegalForJoinedGame', { ruleset: rulesetName }))
  }

  /**
   * The single path behind every action button. The intent is what the pressed button asked for, which is finer
   * grained than the tab it sits on: the Join or Host tab offers two of them at once.
   */
  const submitGameIntent = async (intent: IGameIntent) => {
    if (pendingIntent) {
      return
    }

    if (!validateDisplayName()) {
      return
    }

    // Quick match and host both sit under a format, so both need a deck that fits it before anything is minted.
    const selectsRuleset = isRulesetIntent(intent)
    const requiresDeck = selectsRuleset
    const ruleset = intent === 'quickmatch'
      ? selectedQuickmatchRuleset
      : intent === 'host'
        ? selectedHostRuleset
        : null
    const normalizedGameCode = joinGameCode.trim()
    let joinFormat: IDeckRuleset | null = null

    // Hosting, queueing, or joining some other table is this player moving on: the stored rematch goes here, and
    // the server drops the reservation for that player on the corresponding path. Claiming the reserved code with a
    // fresh deck is the one intent that keeps it.
    if (intent !== 'join' || (pendingRematch && pendingRematch.code !== joinGameCode.trim().toUpperCase())) {
      clearPendingRematch()
      setPendingRematch(null)
      pendingRematchCodeRef.current = null
    }

    setPendingIntent(intent)

    try {
      const identity = await resolvePlayerIdentity()
      if (!identity) {
        return
      }

      // Before the deck is even resolved: knowing the table's format decides whether the imported deck has to be
      // legal in some format or in this one.
      if (intent === 'join' && normalizedGameCode) {
        joinFormat = await resolveJoinFormat(normalizedGameCode)
      }

      let deckId: string | null = null

      if (deckOptionsMode === 'import') {
        const deckCardsPayload = activeDeckOption.trim()
        if (!deckCardsPayload) {
          if (requiresDeck) {
            showAppInfoToast(t('auth.toasts.missingDeckForCreation'))
            return
          }
        } else {
          const parsedDeckList = parseDeckList(deckCardsPayload)
          if (!parsedDeckList.isValid) {
            showAppInfoToast(describeImportedDeckParseError(parsedDeckList.error))
            return
          }

          if (isCheckingImportedDeck) {
            showAppInfoToast(t('auth.toasts.deckStillChecking'))
            return
          }

          // The format-driven actions judge the deck against the format they are about to play, just below. Join
          // judges against the table's format when the code resolved one, and otherwise keeps the long-standing
          // "legal in some active format" rule.
          if (!selectsRuleset && !joinFormat && importedDeckValidation?.isLegalInAnyRuleset !== true) {
            showAppInfoToast(t('auth.toasts.deckNotLegal'))
            return
          }

          writeCachedImportedDeck(deckCardsPayload)

          void preloadCardsByIds(parsedDeckList.cards.map((card) => card.cardId)).catch(() => {
          })

          deckId = await createUserDeck(deckCardsPayload, identity.userId)
        }
      } else {
        const selectedDeckId = activeDeckOption.trim()
        if (!selectedDeckId) {
          if (!requiresDeck) {
            deckId = null
          } else {
            const deckModeLabel = t(deckOptionsMode === 'saved_decks' ? 'auth.deckMode.saved' : 'auth.deckMode.public')
            showAppInfoToast(t('auth.toasts.selectDeck', { mode: deckModeLabel }))
            return
          }
        } else {
          deckId = selectedDeckId
        }
      }

      // Joining a table that declares a format is judged against that format, before the request goes out.
      if (joinFormat && activeDeckCards.length > 0) {
        const joinEvaluation = evaluateRuleset(activeDeckCards, activeDeckCardsById, joinFormat)
        if (!joinEvaluation.isValid) {
          showJoinFormatRejectedToast(joinFormat.name)
          return
        }
      }

      if (selectsRuleset) {
        if (!ruleset) {
          showAppInfoToast(t('auth.toasts.selectRuleset'))
          return
        }

        if (!deckId) {
          showAppInfoToast(t('auth.toasts.missingDeckForCreation'))
          return
        }

        if (isCheckingActiveDeck) {
          showAppInfoToast(t('auth.toasts.deckStillChecking'))
          return
        }

        if (rulesetDeckEvaluation && !rulesetDeckEvaluation.isValid) {
          showRulesetDeckRejectedToast(ruleset.name)
          return
        }

        if (intent === 'quickmatch') {
          await startQuickmatch(identity, deckId, ruleset)
          return
        }

        // Hosting mints a real, already-joinable game and then holds the host on the code: the invite has to be
        // shareable before the board takes over the screen. The "time relaxed" toggle only exists on this path, so a
        // relaxed table can only ever be opened here - quick match has no modifier to send.
        const createdModifiers = hostTimeRelaxed ? [TIME_RELAXED_MODIFIER] : []
        const createdGame = await createGameForUser({
          userId: identity.userId,
          deckId,
          rulesetId: ruleset.id,
          ...(createdModifiers.length > 0 ? { modifiers: createdModifiers } : {}),
        })

        setCreatedGameShare({
          gameId: createdGame.id,
          rulesetName: ruleset.name,
          modifierLabels: createdModifiers
            .map((modifier) => matchModifierLabelKeys[modifier])
            .filter((key): key is string => Boolean(key))
            .map((key) => translateKey(t, key)),
        })
        return
      }

      if (!normalizedGameCode) {
        showAppInfoToast(t('auth.toasts.gameCodeRequired'))
        return
      }

      const joinedGame = await joinGameAsPlayer(normalizedGameCode, {
        userId: identity.userId,
        ...(deckId ? { deckId } : {}),
      })

      // The reserved code has been claimed: it must not survive to prefill the form for some later match, and the
      // view must not release it on the way out.
      didClaimRematchRef.current = true
      clearPendingRematch()
      setPendingRematch(null)

      setSession({
        displayName,
        gameCode: joinedGame.id,
      })

      showAppSuccessToast(t('auth.toasts.joinedGame'))
      navigate(toGameRoutePath(joinedGame.id))
    } catch (error) {
      // Under a format the only 400 the server sends back here is the deck/format verdict, and its description lists
      // every violation. Point at the import view instead of pasting that list into a toast.
      if (selectsRuleset && isApiBadRequestError(error)) {
        showRulesetDeckRejectedToast(ruleset?.name ?? '')
        return
      }

      // A join refused for its deck can only be about the joined table's format, so name that format instead of
      // quoting the server's violation list.
      if (joinFormat && isApiBadRequestError(error)) {
        showJoinFormatRejectedToast(joinFormat.name)
        return
      }

      const apiMessage = getApiErrorMessage(error, t('auth.toasts.submitFailed'))

      if (
        intent === 'join' &&
        normalizedGameCode.length > 0 &&
        apiMessage.toLowerCase().includes('already part of this game instance')
      ) {
        didClaimRematchRef.current = true
        clearPendingRematch()
        setPendingRematch(null)
        setSession({
          displayName,
          gameCode: normalizedGameCode,
        })
        navigate(toGameRoutePath(normalizedGameCode))
        return
      }

      // A claim refused for a rematch that is gone leaves nothing to retry, so the banner goes with the message
      // instead of sitting there until the next focus probe notices.
      if (
        intent === 'join' &&
        pendingRematch &&
        pendingRematch.code === normalizedGameCode.toUpperCase() &&
        isApiBadRequestError(error)
      ) {
        clearPendingRematch()
        setPendingRematch(null)
        pendingRematchCodeRef.current = null
      }

      showAppInfoToast(apiMessage)
    } finally {
      setPendingIntent(null)
    }
  }

  /**
   * Every action button is a submit button carrying its intent in `value`, so `Host` can never be mistaken for
   * `Join`. The Enter key arrives without a submitter and falls back to the visible tab's primary action.
   */
  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()

    const submitter = event.nativeEvent.submitter
    const pressedIntent = submitter instanceof HTMLButtonElement && isGameIntent(submitter.value)
      ? submitter.value
      : null

    void submitGameIntent(pressedIntent ?? (gameEntryMode === 'quickmatch' ? 'quickmatch' : 'join'))
  }

  return (
    <PageShell>
      <div className="grid w-full grid-cols-1 gap-4 px-2 sm:px-4">
        {/* The other player agreed to another match: this banner is the reason the join form arrived filled in, and
            it stays until the table is claimed so the player knows which code they are sitting down at. */}
        {pendingRematch ? (
          <div
            data-testid="login-rematch-banner"
            role="status"
            className="mx-2 flex items-start justify-between gap-3 rounded-xl border border-amber-300/50 bg-amber-100/10 px-3 py-2 text-left"
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                {t('auth.rematch.bannerHeadline')}
              </p>
              <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                {t('auth.rematch.bannerHint', {
                  code: pendingRematch.code,
                  ruleset: pendingRematch.rulesetName ?? t('game.rematch.noRuleset'),
                })}
              </p>
            </div>
            <button
              type="button"
              data-testid="login-rematch-banner-dismiss"
              aria-label={t('auth.rematch.dismissAria')}
              onClick={dismissPendingRematch}
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--text-secondary)] transition-[filter,color] hover:brightness-125 hover:text-[var(--text-primary)]"
            >
              <X size={11} strokeWidth={2.5} />
            </button>
          </div>
        ) : null}
        <Panel className="my-2 w-full border-0 bg-transparent px-5 text-center shadow-none">
          <p
            className={`mt-1 font-['Water_Brush'] text-6xl leading-none tracking-wide text-[var(--text-primary)] transition-opacity duration-150 sm:text-7xl ${
              isTitleFontReady ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {t('auth.title')}
          </p>
          <p className="mt-2 text-sm text-[var(--text-secondary)] sm:text-base">
            {t('auth.tagline')}
          </p>
        </Panel>
        <Panel className="my-2 w-full px-5 pt-3">
          <Form className="mt-0 grid grid-cols-2 items-stretch gap-x-4" onSubmit={handleSubmit}>

            <FormField className="col-span-2">
              <div className="flex items-center justify-between gap-3">
                <FormLabel htmlFor="displayName" className="mb-0">{t('auth.displayName')}</FormLabel>
                <div className="flex items-center gap-2">
                  {onlineViewers !== null ? (
                    <p
                      data-testid="online-players"
                      className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]"
                    >
                      {t('auth.onlinePlayers', { count: onlineViewers })}
                    </p>
                  ) : null}
                  <AppButton
                    type="button"
                    variant="ghost"
                    onClick={toggleTheme}
                    aria-label={t('auth.toggleThemeAria')}
                    className="h-6 w-6 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]"
                  >
                    <Lightbulb size={12} />
                  </AppButton>
                </div>
              </div>
              <div className="relative">
                <FormInput
                  id="displayName"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder={t('auth.displayNamePlaceholder')}
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
                  aria-label={authUsername ? t('auth.openLogoutModalAria') : t('auth.openLoginModalAria')}
                  className="absolute right-0 top-0 bottom-0 inline-flex w-10 items-center justify-center rounded-r-xl border-l border-[var(--border-subtle)] bg-transparent text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                >
                  {authUsername ? <X size={14} /> : <LogIn size={14} />}
                </button>
              </div>
              {showDisplayNameError ? <FormErrorText>{t('auth.displayNameRequired')}</FormErrorText> : null}
            </FormField>

            <FormField className="col-span-1">
              <OptionToggle
                ariaLabel={t('auth.gameEntryModeAria')}
                value={gameEntryMode}
                options={translatedGameEntryModeOptions}
                optionClassName="py-1"
                onChange={(nextMode) => {
                  setGameEntryMode(nextMode)
                }}
              />

              {gameEntryMode === 'quickmatch' ? (
                <>
                  <AdaptiveFormField
                    id="quickmatchRuleset"
                    value={quickmatchRulesetId}
                    onValueChange={(value) => setRulesetId('quickmatch', value)}
                    config={quickmatchRulesetConfig}
                    ariaLabel={t('auth.format')}
                    className="py-1.5"
                  />
                  <AppButton
                    type="submit"
                    name="intent"
                    value="quickmatch"
                    disabled={pendingIntent !== null || quickmatchRulesets.length === 0}
                    className="w-full justify-center py-1.5"
                  >
                    {t('auth.findMatch')}
                  </AppButton>
                </>
              ) : (
                <div className="grid grid-cols-2 items-start gap-2">
                  <div className="space-y-2">
                    <AdaptiveFormField
                      id="joinGameCode"
                      value={joinGameCode}
                      onValueChange={setJoinGameCode}
                      config={translatedJoinGameCodeConfig}
                      ariaLabel={t('auth.gameCode')}
                      className="py-1.5"
                    />
                    <AppButton
                      type="submit"
                      name="intent"
                      value="join"
                      disabled={pendingIntent !== null}
                      className="w-full justify-center py-1.5"
                    >
                      {t('auth.join')}
                    </AppButton>
                  </div>

                  <div className="space-y-2">
                    <AdaptiveFormField
                      id="hostRuleset"
                      value={hostRulesetId}
                      onValueChange={(value) => setRulesetId('host', value)}
                      config={hostRulesetConfig}
                      ariaLabel={t('auth.format')}
                      className="py-1.5"
                    />
                    <AppButton
                      type="submit"
                      name="intent"
                      value="host"
                      disabled={pendingIntent !== null}
                      className="w-full justify-center py-1.5"
                    >
                      {t('auth.host')}
                    </AppButton>
                    {/* Host-only: an invite table may run without the action clock. Quick match never offers it.
                        It sits under the button so the format select and the Host button stay level with the code
                        field and Join on the other half of the tab. */}
                    <FormCheckboxField
                      id="hostTimeRelaxed"
                      data-testid="host-time-relaxed"
                      label={t('auth.hostTimeRelaxed')}
                      checked={hostTimeRelaxed}
                      onChange={(event) => setHostTimeRelaxed(event.target.checked)}
                    />
                  </div>
                </div>
              )}
            </FormField>

            <FormField className="col-span-1">
                {/* The deck toggle is the first thing in this column, exactly like the tab toggle in the other one, so
                    both columns start on the same line. The retry hint sits below it for the same reason. */}
                <OptionToggle
                  ariaLabel={t('auth.deckOptionsModeAria')}
                  value={deckOptionsMode}
                  options={translatedDeckOptionsModeOptions}
                  optionClassName="py-1"
                  onChange={handleDeckOptionsModeChange}
                />
                {starterDeckFetchFailed && deckOptionsMode === 'starter_decks' ? (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setStarterDeckRetryToken((value) => value + 1)}
                      className="px-0.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] opacity-[0.45] transition-opacity hover:opacity-75"
                    >
                      {t('auth.retry')}
                    </button>
                  </div>
                ) : null}
                {isGuestSession && deckOptionsMode === 'saved_decks' ? (
                  <p className="text-[11px] leading-4 text-[var(--text-muted)]">
                    {t('auth.deckChoice.guestSavedDecksHint')}
                  </p>
                ) : null}
                {deckOptionsMode === 'import' ? (
                  <>
                    <AppButton
                      type="button"
                      variant="ghost"
                      onClick={() => setIsImportModalOpen(true)}
                      className="w-full justify-center py-1.5"
                    >
                      {t('auth.importDeckButton')}
                    </AppButton>
                    {importedDeckParseError && importedDeckParseError.code !== 'empty' ? (
                      <p
                        role="alert"
                        data-testid="login-deck-invalid-value"
                        className="truncate text-xs font-medium leading-5 text-[var(--button-primary-bg)]"
                      >
                        {t('auth.invalidDeckValue')}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <AdaptiveFormField
                    id="deckOptions"
                    value={activeDeckOption}
                    onValueChange={setDeckOptionValue}
                    config={activeDeckFieldConfig}
                    ariaLabel={t('auth.deckOptions')}
                    className="py-1.5"
                  />
                )}
                {summaryDeckName || summaryDeckEvaluation ? (
                  <div
                    data-testid="login-deck-summary"
                    data-legal={
                      summaryDeckEvaluation
                        ? summaryDeckEvaluation.isValid
                          ? 'true'
                          : 'false'
                        : 'unknown'
                    }
                    className="flex min-w-0 items-center gap-2 text-xs font-normal leading-5"
                  >
                    {summaryDeckEvaluation && !isCheckingDeckSummary ? (
                      <span
                        data-testid="login-deck-summary-pill"
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${
                          summaryDeckEvaluation.isValid
                            ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                            : 'bg-[var(--button-primary-bg)]/20 text-[var(--button-primary-bg)]'
                        }`}
                      >
                        {summaryDeckEvaluation.isValid
                          ? t('auth.deckSummary.legalPill')
                          : t('auth.deckSummary.illegalPill')}
                      </span>
                    ) : null}
                    <span className="min-w-0 truncate text-[var(--text-secondary)]">{summaryDeckName}</span>
                    {/* A stored deck always reports a record: the server sends one for a deck that was played, and a
                        deck nobody has played yet is exactly "no games", not a missing line. */}
                    {activeDeckOption.trim() && deckOptionsMode !== 'import' ? (
                      <span
                        data-testid="login-deck-record"
                        className="shrink-0 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]"
                      >
                        {describeDeckRecord(activeDeckRecord ?? EMPTY_DECK_RECORD)}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </FormField>
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
                {t('auth.loginModalTitle')}
              </h2>
            </div>

            <Form className="grid grid-cols-1 gap-2 space-y-0" method="post">
              <input type="hidden" name="intent" value="login" />
              <FormField className="space-y-0">
                <FormLabel htmlFor="loginEmail" className="mb-1 text-[11px] font-normal normal-case leading-none tracking-[0.08em] text-[var(--text-muted)]">
                  {t('auth.email')}
                </FormLabel>
                <FormInput
                  id="loginEmail"
                  name="email"
                  type="email"
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  placeholder={t('auth.emailPlaceholder')}
                  className="py-1.5"
                  required
                />
              </FormField>

              <FormField className="space-y-0">
                <FormLabel htmlFor="loginPassword" className="mb-1 text-[11px] font-normal normal-case leading-none tracking-[0.08em] text-[var(--text-muted)]">
                  {t('auth.password')}
                </FormLabel>
                <FormInput
                  id="loginPassword"
                  name="password"
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  placeholder={t('auth.passwordPlaceholder')}
                  className="py-1.5"
                  required
                />
              </FormField>
              {actionData?.login?.ok === false && actionData.login.error ? (
                <FormErrorText>{actionData.login.error}</FormErrorText>
              ) : null}
              <p className="text-center text-sm text-[var(--text-secondary)]">
                {t('auth.notRegistered')}{' '}
                <Link
                  to="/sign-in"
                  onClick={() => setIsLoginModalOpen(false)}
                  className="font-semibold text-[var(--text-accent)] underline-offset-2 hover:underline"
                >
                  {t('auth.signUpHere')}
                </Link>
              </p>

              <FormActions className="w-full justify-end gap-2 pt-0">
                <AppButton type="submit" disabled={isSubmittingLogin}>
                  {isSubmittingLogin ? t('auth.loggingIn') : t('auth.logIn')}
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
                {t('auth.logoutConfirmTitle')}
              </h2>
            </div>
            <p className="mb-4 text-sm text-[var(--text-secondary)]">
              {t('auth.logoutConfirmBody')}
            </p>
            <div className="flex justify-end gap-2">
              <AppButton type="button" variant="ghost" onClick={() => setIsLogoutModalOpen(false)}>
                {t('auth.cancel')}
              </AppButton>
              <AppButton type="button" onClick={handleLogout}>
                {t('auth.logOut')}
              </AppButton>
            </div>
          </Panel>
        </div>
      ) : null}

      {activeTicket ? (
        <MatchmakingSearchDialog
          ticket={activeTicket}
          onMatched={finishQuickmatch}
          onDismiss={() => {
            setActiveTicket(null)
            clearStoredMatchTicket()
          }}
        />
      ) : null}

      {createdGameShare ? (
        <CreateGameShareDialog
          gameId={createdGameShare.gameId}
          rulesetName={createdGameShare.rulesetName}
          modifierLabels={createdGameShare.modifierLabels}
          onEnterGame={handleEnterCreatedGame}
          onLeave={() => setCreatedGameShare(null)}
        />
      ) : null}

      {pendingDeletionDeck ? (
        <DeleteDeckConfirmDialog
          deckName={describeDeckName(pendingDeletionDeck)}
          isDeleting={deleteDeckMutation.isPending}
          onCancel={() => setDeckPendingDeletionId(null)}
          onConfirm={() => {
            void confirmDeckDeletion()
          }}
        />
      ) : null}

      <DeckImportDialog
        isOpen={isImportModalOpen}
        payload={activeDeckOption}
        onPayloadChange={handleImportDeckTextChange}
        parseError={importedDeckParseError}
        rulesets={importDialogRulesets}
        validation={importedDeckDialogValidation}
        isChecking={isCheckingImportedDeck}
        isAuthenticated={Boolean(authUser?.userId)}
        deckName={importDeckName}
        onDeckNameChange={setImportDeckName}
        defaultDeckName={defaultImportDeckName}
        canUse={isImportedDeckReady}
        isSaving={isSavingImportedDeck}
        onClose={() => closeDeckEditor()}
        onUse={handleUseImportedDeck}
        onSave={() => {
          void handleSaveImportedDeck()
        }}
        editDeckName={editingDeck ? describeDeckName(editingDeck) : null}
        leaderWillResetRecord={leaderWillResetRecord}
      />
    </PageShell>
  )
}

function toGameRoutePath(joinCode: string): string {
  return `/game/${encodeURIComponent(joinCode.trim())}`
}

/**
 * Deck choices carry the name and, as a trailing badge, the player's own record: the list is where a deck is picked,
 * so it is also where "this one is 7-3" belongs. The badge is its own element rather than part of the label, so a long
 * name truncates without eating the numbers, and the collapsed control shows it too - the record stays visible while
 * picking and after.
 *
 * `showEmptyRecord` is on for the player's own decks (a deck nobody has played yet reads 0W–0L) and off for the
 * public list, where an untouched deck would only add noise.
 */
function toDeckChoices(
  decks: IDeckResponse[],
  emptyStateLabel: string,
  showEmptyRecord = true,
): ISelectChoice[] {
  if (decks.length === 0) {
    return [{ value: '', label: emptyStateLabel }]
  }

  return decks.map((deck) => {
    const recordLabel = formatDeckRecordSuffix(deck.record, showEmptyRecord)

    return {
      value: deck.id,
      label: describeDeckName(deck),
      trailing: recordLabel ? (
        <span
          data-testid="deck-option-record"
          className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums dark:bg-white/15"
        >
          {recordLabel}
        </span>
      ) : undefined,
    }
  })
}

/** A deck's display name: the player's own, or a short id for the unnamed rows the import path creates. */
function describeDeckName(deck: Pick<IDeckResponse, 'id' | 'name'>): string {
  const name = deck.name.trim()

  return name || i18n.t('auth.deckChoice.unnamedDeck', { shortId: deck.id.slice(0, 8) })
}

/** The per-deck caches with one deck removed, used when that deck leaves the picker. */
function omitDeckEntry<T>(entries: Record<string, T>, deckId: string): Record<string, T> {
  const next = { ...entries }
  delete next[deckId]

  return next
}

/** Whether a record has anything on it; the reset toast only fires when it had something to lose. */
function hasPlayedGames(record: IDeckRecord | null | undefined): boolean {
  return normalizeRecordCount(record?.wins)
    + normalizeRecordCount(record?.losses)
    + normalizeRecordCount(record?.draws) > 0
}

/**
 * The compact form the picker shows next to a deck. A deck nobody has played yet is 0W–0L rather than an empty
 * space - the player is choosing a deck, and "no games" is part of what they are choosing between.
 */
function formatDeckRecordSuffix(
  record: IDeckRecord | null | undefined,
  showEmptyRecord = true,
): string {
  const wins = normalizeRecordCount(record?.wins)
  const losses = normalizeRecordCount(record?.losses)
  const draws = normalizeRecordCount(record?.draws)

  if (wins + losses + draws === 0) {
    return showEmptyRecord ? i18n.t('auth.deckSummary.recordZero') : ''
  }

  // A deck that only ever drew has no win rate to show, and "0%" next to one draw would read as a losing streak.
  if (wins + losses === 0) {
    return i18n.t('auth.deckSummary.recordDrawsOnly', { draws })
  }

  const rate = Math.round((wins / (wins + losses)) * 100)

  return draws > 0
    ? i18n.t('auth.deckSummary.recordSuffixWithDraws', { wins, losses, draws, rate })
    : i18n.t('auth.deckSummary.recordSuffix', { wins, losses, rate })
}

/** The selected deck's record, spelled out for the summary line under the picker. */
function describeDeckRecord(record: IDeckRecord): string {
  const wins = normalizeRecordCount(record.wins)
  const losses = normalizeRecordCount(record.losses)
  const draws = normalizeRecordCount(record.draws)

  if (wins + losses + draws === 0) {
    return i18n.t('auth.deckSummary.recordNone')
  }

  if (wins + losses === 0) {
    return i18n.t('auth.deckSummary.recordDrawsOnly', { draws })
  }

  const rate = Math.round((wins / (wins + losses)) * 100)

  return draws > 0
    ? i18n.t('auth.deckSummary.recordFullWithDraws', { wins, losses, draws, rate })
    : i18n.t('auth.deckSummary.recordFull', { wins, losses, rate })
}

function normalizeRecordCount(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0
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

function toDeckCardsByDeckId(decks: IDeckResponse[]): Record<string, IDeckCardInput[]> {
  return decks.reduce<Record<string, IDeckCardInput[]>>((result, deck) => {
    result[deck.id] = deck.cards
      .filter((card) => Number.isFinite(card.quantity) && card.quantity > 0)
      .map((card) => ({ cardId: card.cardId.trim(), quantity: card.quantity }))
      .filter((card) => card.cardId.length > 0)

    return result
  }, {})
}

const MATCH_TICKET_STORAGE_KEY = 'phv-quickmatch-ticket'

/**
 * A queue ticket survives a reload, so a player who refreshes while searching comes back to the search dialog
 * instead of leaving a ticket behind and queueing a second time.
 */
function readStoredMatchTicket(): IMatchTicket | null {
  if (typeof window === 'undefined') {
    return null
  }

  const rawValue = window.sessionStorage.getItem(MATCH_TICKET_STORAGE_KEY)
  if (!rawValue) {
    return null
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<IMatchTicket>
    if (!parsed.ticketId || !parsed.rulesetId || !parsed.state) {
      return null
    }

    return parsed as IMatchTicket
  } catch {
    return null
  }
}

function storeMatchTicket(ticket: IMatchTicket): void {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.setItem(MATCH_TICKET_STORAGE_KEY, JSON.stringify(ticket))
}

function clearStoredMatchTicket(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.removeItem(MATCH_TICKET_STORAGE_KEY)
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
