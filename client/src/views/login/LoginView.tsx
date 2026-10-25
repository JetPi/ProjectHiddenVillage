import { useEffect, useMemo, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import i18n, { translateKey } from '@/i18n'
import {
  deckOptionsModeOptions,
  gameCodeFieldConfigByMode,
  gameCodeModeOptions,
} from '@/views/login/configs/LoginView'
import { Link, useActionData, useLoaderData, useNavigate, useNavigation } from 'react-router-dom'
import { PageShell } from '@/components/layout/PageShell'
import { AppButton, Panel } from '@/components/ui'
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
} from '@/components/forms'
import type { IAdaptiveFieldConfig } from '@/components/forms'
import { Lightbulb, LogIn, X } from 'lucide-react'
import { showAppInfoToast, showAppSuccessToast } from '@/components/feedback/appToastNotifications'
import { clearAuthSession, useAuthSessionStore } from '@/state/authSession'
import { useSessionStore } from '@/state/sessionStore'
import { useThemeStore } from '@/state/themeStore'
import { useLoginViewModel } from '@/views/login/model/useLoginViewModel'
import type { ILoginActionData, ILoginLoaderData } from '@/views/login/types/routeHandlers'
import { createGameForUser, joinGameAsPlayer } from '@/services/api/gameApi'
import { getApiErrorMessage } from '@/views/utils/getApiErrorMessage'
import { createUserDeck, fetchDecks } from '@/services/api/deckApi'
import { preloadCardsByIds } from '@/services/cardPreloadService'
import { useCardCatalogByIdsQuery } from '@/services/queries/cardQueries'
import { useActiveDeckRulesetsQuery } from '@/services/queries/deckRulesetQueries'
import { evaluateDeckRulesets } from '@/domain/deck/evaluateDeckRulesets'
import { normalizeDeckCardId, parseDeckList } from '@/domain/deck/parseDeckList'
import { DeckImportValidation } from '@/views/login/components/DeckImportValidation'
import { writeCachedImportedDeck } from '@/views/login/utils/cachedImportedDeck'
import { buildDefaultSavedDeckName } from '@/views/login/utils/defaultDeckName'
import type { IDeckCardMetadata, IDeckListParseError } from '@/domain/deck/types'
import type { IDeckResponse } from '@/types/deck'
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

export function LoginView() {
  const { t } = useTranslation()
  const loaderData = useLoaderData() as ILoginLoaderData
  const actionData = useActionData() as ILoginActionData | undefined
  const navigation = useNavigation()
  const navigate = useNavigate()

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [savedDecks, setSavedDecks] = useState<IDeckResponse[]>([])
  const [importDeckName, setImportDeckName] = useState('')
  const [isSavingImportedDeck, setIsSavingImportedDeck] = useState(false)
  const [savedDeckChoices, setSavedDeckChoices] = useState<{ value: string; label: string }[]>([
    { value: '', label: t('auth.deckChoice.loginToLoad') },
  ])
  const [starterDeckChoices, setStarterDeckChoices] = useState<{ value: string; label: string }[]>([
    { value: '', label: t('auth.deckChoice.loadingPublic') },
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

    showAppSuccessToast(t('auth.toasts.accountCreated'), { id: 'signup-success', duration: 3200 })
    hasShownSignupToast.current = true
  }, [loaderData.signupSuccess, t])

  useEffect(() => {
    if (!authUsername) {
      lastAuthToastUsername.current = null
      return
    }

    if (loaderData.signupSuccess || lastAuthToastUsername.current === authUsername) {
      return
    }

    showAppInfoToast(t('auth.toasts.loggedInAs', { username: authUsername }), { id: 'auth-login-status', duration: 3200 })
    lastAuthToastUsername.current = authUsername
  }, [authUsername, loaderData.signupSuccess, t])

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
          setStarterDeckChoices(toDeckChoices(publicDecks, t('auth.deckChoice.noPublic')))
          setStarterDeckCardIdsByDeckId(toDeckCardIdsByDeckId(publicDecks))
          setStarterDeckFetchFailed(false)
        }
      } catch {
        if (!isCancelled) {
          setStarterDeckChoices([{ value: '', label: t('auth.deckChoice.failedPublic') }])
          setStarterDeckCardIdsByDeckId({})
          setStarterDeckFetchFailed(true)
        }
      }

      if (!authUser?.userId) {
        if (!isCancelled) {
          setSavedDecks([])
          setSavedDeckChoices([{ value: '', label: t('auth.deckChoice.loginToLoad') }])
          setSavedDeckCardIdsByDeckId({})
        }

        return
      }

      try {
        const userDecks = await fetchDecks({ userId: authUser.userId })

        if (!isCancelled) {
          setSavedDecks(userDecks)
          setSavedDeckChoices(toDeckChoices(userDecks, t('auth.deckChoice.noSaved')))
          setSavedDeckCardIdsByDeckId(toDeckCardIdsByDeckId(userDecks))
        }
      } catch {
        if (!isCancelled) {
          setSavedDecks([])
          setSavedDeckChoices([{ value: '', label: t('auth.deckChoice.failedSaved') }])
          setSavedDeckCardIdsByDeckId({})
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

  const translatedGameCodeModeOptions = useMemo(
    () => gameCodeModeOptions.map((option) => ({ ...option, label: translateKey(t, option.label) })),
    [t],
  )

  const translatedDeckOptionsModeOptions = useMemo(
    () => deckOptionsModeOptions.map((option) => ({ ...option, label: translateKey(t, option.label) })),
    [t],
  )

  const translatedGameCodeConfig = useMemo(
    () => translateAdaptiveFieldConfig(gameCodeFieldConfigByMode[gameCodeMode], t),
    [gameCodeMode, t],
  )

  const importedDeckParse = useMemo(() => {
    if (deckOptionsMode !== 'import' || activeDeckOption.trim().length === 0) {
      return null
    }

    return parseDeckList(activeDeckOption)
  }, [deckOptionsMode, activeDeckOption])

  const importedDeckCardIds = useMemo(
    () => (importedDeckParse?.isValid ? importedDeckParse.cards.map((card) => card.cardId) : []),
    [importedDeckParse],
  )

  const importedDeckCardsQuery = useCardCatalogByIdsQuery(importedDeckCardIds, {
    enabled: deckOptionsMode === 'import' && importedDeckCardIds.length > 0,
  })
  const activeDeckRulesetsQuery = useActiveDeckRulesetsQuery()

  const importedDeckCardsById = useMemo(() => {
    const byId = new Map<string, IDeckCardMetadata>()

    for (const card of importedDeckCardsQuery.data ?? []) {
      byId.set(normalizeDeckCardId(card.id), card)
    }

    return byId
  }, [importedDeckCardsQuery.data])

  const importedDeckValidation = useMemo(() => {
    if (!importedDeckParse?.isValid) {
      return null
    }

    return evaluateDeckRulesets({
      cards: importedDeckParse.cards,
      cardsById: importedDeckCardsById,
      rulesets: activeDeckRulesetsQuery.data ?? [],
    })
  }, [importedDeckParse, importedDeckCardsById, activeDeckRulesetsQuery.data])

  const isCheckingImportedDeck = importedDeckCardsQuery.isFetching || activeDeckRulesetsQuery.isFetching
  const visibleImportedDeckValidation = isCheckingImportedDeck ? null : importedDeckValidation
  const importedDeckParseError = importedDeckParse && !importedDeckParse.isValid
    ? importedDeckParse.error
    : null

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
    !isCheckingImportedDeck && importedDeckValidation?.isLegalInAnyRuleset === true

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
        getApiErrorMessage(error, t('auth.toasts.deckSaveFailed')),
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
      showAppInfoToast(t('auth.toasts.loginRequired'))
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
            showAppInfoToast(t('auth.toasts.pasteDeckList'))
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

          if (importedDeckValidation?.isLegalInAnyRuleset !== true) {
            showAppInfoToast(t('auth.toasts.deckNotLegal'))
            return
          }

          writeCachedImportedDeck(deckCardsPayload)

          void preloadCardsByIds(parsedDeckList.cards.map((card) => card.cardId)).catch(() => {
          })

          deckId = await createUserDeck(deckCardsPayload, authUser.userId)
        }
      } else {
        const selectedDeckId = activeDeckOption.trim()
        if (!selectedDeckId) {
          if (!isCreateMode) {
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

      if (gameCodeMode === 'create') {
        if (!deckId) {
          const deckModeLabel = t(deckOptionsMode === 'saved_decks' ? 'auth.deckMode.saved' : 'auth.deckMode.public')
          showAppInfoToast(t('auth.toasts.selectDeck', { mode: deckModeLabel }))
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

        showAppSuccessToast(t('auth.toasts.gameCreated', { code: createdGame.id }))
        navigate(toGameRoutePath(createdGame.id))
        return
      }

      if (!normalizedGameCode) {
        showAppInfoToast(t('auth.toasts.gameCodeRequired'))
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

      showAppSuccessToast(t('auth.toasts.joinedGame'))
      navigate(toGameRoutePath(joinedGame.id))
    } catch (error) {
      const apiMessage = getApiErrorMessage(error, t('auth.toasts.submitFailed'))

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
            {t('auth.title')}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)] sm:text-base">
            <span className="block">{t('auth.tagline1')}</span>
            <span className="block"><Trans i18nKey="auth.tagline2" components={{ strong: <strong /> }} /></span>
          </p>
        </Panel>
        <Panel className="my-2 w-full px-5 pt-3">
          <Form className="mt-0 grid grid-cols-2 items-stretch gap-x-4" onSubmit={handleSubmit}>

            <FormField className="col-span-2">
              <div className="flex items-center justify-between gap-3">
                <FormLabel htmlFor="displayName" className="mb-0">{t('auth.displayName')}</FormLabel>
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
              <FormLabel htmlFor="gameCode">{t('auth.gameCode')}</FormLabel>
              <OptionToggle
                ariaLabel={t('auth.gameCodeModeAria')}
                value={gameCodeMode}
                options={translatedGameCodeModeOptions}
                optionClassName="py-1"
                onChange={(nextMode) => {
                  setGameCodeMode(nextMode)
                }}
              />
              <AdaptiveFormField
                id="gameCode"
                value={activeGameCode}
                onValueChange={setGameCodeValue}
                config={translatedGameCodeConfig}
                className="py-1.5"
              />
            </FormField>

            <FormField className="col-span-1">
                <div className="flex items-center justify-between gap-2">
                  <FormLabel htmlFor="deckOptions" className="mb-0">{t('auth.deckOptions')}</FormLabel>
                  {starterDeckFetchFailed && deckOptionsMode === 'starter_decks' ? (
                    <button
                      type="button"
                      onClick={() => setStarterDeckRetryToken((value) => value + 1)}
                      className="px-0.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] opacity-[0.45] transition-opacity hover:opacity-75"
                    >
                      {t('auth.retry')}
                    </button>
                  ) : null}
                </div>
                <OptionToggle
                  ariaLabel={t('auth.deckOptionsModeAria')}
                  value={deckOptionsMode}
                  options={translatedDeckOptionsModeOptions}
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
                      {t('auth.importDeckButton')}
                    </AppButton>
                    <DeckImportValidation
                      parseError={importedDeckParseError}
                      validation={visibleImportedDeckValidation}
                      variant="summary"
                    />
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
                {t('auth.enterGame')}
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
                {t('auth.importModalTitle')}
              </h2>
            </div>
            <p className="mb-2 text-sm text-[var(--text-secondary)]">
              {t('auth.importModalBody')}
            </p>
            <FormTextarea
              id="deckImportPayload"
              value={activeDeckOption}
              onChange={(event) => handleImportDeckTextChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  setIsImportModalOpen(false)
                }
              }}
              placeholder={t('auth.importPlaceholder')}
              rows={10}
              className="py-2"
            />
            <DeckImportValidation
              parseError={importedDeckParseError}
              validation={importedDeckValidation}
              isChecking={isCheckingImportedDeck}
            />

            {authUser?.userId ? (
              <div className="mt-3">
                <FormLabel htmlFor="importDeckName">{t('auth.importDeckNameLabel')}</FormLabel>
                <FormInput
                  id="importDeckName"
                  data-testid="import-deck-name"
                  value={importDeckName}
                  placeholder={defaultImportDeckName}
                  onChange={(event) => setImportDeckName(event.target.value)}
                  className="py-2"
                />
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                  {t('auth.importDeckNameHint', { name: defaultImportDeckName })}
                </p>
              </div>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <AppButton type="button" variant="ghost" onClick={() => setIsImportModalOpen(false)}>
                {t('auth.close')}
              </AppButton>

              <AppButton
                type="button"
                variant="ghost"
                onClick={handleUseImportedDeck}
                disabled={!isImportedDeckReady}
                data-testid="import-deck-use"
              >
                {t('auth.importUse')}
              </AppButton>

              {authUser?.userId ? (
                <AppButton
                  type="button"
                  onClick={() => {
                    void handleSaveImportedDeck()
                  }}
                  disabled={!isImportedDeckReady || isSavingImportedDeck}
                  data-testid="import-deck-save"
                >
                  {isSavingImportedDeck ? t('auth.importSaving') : t('auth.importSave')}
                </AppButton>
              ) : null}
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
    const deckName = deck.name.trim()

    if (deckName) {
      return {
        value: deck.id,
        label: i18n.t('auth.deckChoice.namedDeckLabel', { name: deckName, totalCards }),
      }
    }

    return {
      value: deck.id,
      label: i18n.t('auth.deckChoice.deckLabel', {
        number: index + 1,
        shortId: deck.id.slice(0, 8),
        totalCards,
      }),
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
