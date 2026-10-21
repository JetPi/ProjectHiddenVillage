import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCardCatalogByIdsQuery } from '@/services/queries/cardQueries'
import {
  useCreatePublicDeckMutation,
  useDecksQuery,
  useDeckQuery,
  useDeleteDeckMutation,
  useUpdateDeckMutation,
} from '@/services/queries/deckQueries'
import type { ICardCatalogListItemResponse } from '@/types/cardCatalog'
import type { IDeckCardInput, IDeckResponse } from '@/types/deck'
import type {
  IDeckAdminCardMetadata,
  IDeckAdminDraft,
  IDeckAdminSelectedCard,
  IDeckAdminValidationResult,
} from '@/views/admin/types/deckAdminTypes'
import {
  buildDeckDraftSignature,
  buildDeckLeaderCard,
  buildSelectedDeckCards,
  evaluateDeckDraft,
  isLeaderCard,
  normalizeDeckCardId,
} from '@/views/admin/utils/deckDraftValidation'
import { mergeImportedDeckCards } from '@/views/admin/utils/deckImport'

const EMPTY_QUANTITIES: ReadonlyMap<string, number> = new Map()
const EMPTY_DRAFT: IDeckAdminDraft = { name: '', quantitiesByCardId: EMPTY_QUANTITIES }

export type IUseDeckAdminModelOptions = {
  deckId: string | null
  catalogCards: ReadonlyArray<ICardCatalogListItemResponse>
}

function toQuantitiesFromDeck(deck: IDeckResponse): Map<string, number> {
  const quantities = new Map<string, number>()
  let leaderCardId: string | null = null

  for (const card of deck.cards) {
    const cardId = normalizeDeckCardId(card.cardId)
    if (!cardId || card.quantity <= 0) {
      continue
    }

    if (isLeaderCard(card.card)) {
      if (!leaderCardId) {
        leaderCardId = cardId
      }
      continue
    }

    quantities.set(cardId, (quantities.get(cardId) ?? 0) + card.quantity)
  }

  if (leaderCardId) {
    quantities.set(leaderCardId, 1)
  }

  return quantities
}

function withoutLeaderEntries(
  quantitiesByCardId: ReadonlyMap<string, number>,
  cardsById: ReadonlyMap<string, IDeckAdminCardMetadata>,
): Map<string, number> {
  const withoutLeaders = new Map<string, number>()

  for (const [cardId, quantity] of quantitiesByCardId) {
    if (!isLeaderCard(cardsById.get(cardId))) {
      withoutLeaders.set(cardId, quantity)
    }
  }

  return withoutLeaders
}

function toDeckCardPayload(
  quantitiesByCardId: ReadonlyMap<string, number>,
  metadataById: ReadonlyMap<string, IDeckAdminCardMetadata>,
): IDeckCardInput[] {
  return [...quantitiesByCardId.entries()]
    .filter(([, quantity]) => quantity > 0)
    .map(([cardId, quantity]) => ({
      cardId: metadataById.get(cardId)?.id ?? cardId,
      quantity,
    }))
}

export function useDeckAdminModel({ deckId, catalogCards }: IUseDeckAdminModelOptions) {
  const navigate = useNavigate()

  const decksQuery = useDecksQuery({ type: 'Public' })
  const deckQuery = useDeckQuery(deckId, { populate: true })
  const createDeckMutation = useCreatePublicDeckMutation()
  const updateDeckMutation = useUpdateDeckMutation()
  const deleteDeckMutation = useDeleteDeckMutation()

  const [editedDraft, setEditedDraft] = useState<IDeckAdminDraft | null>(null)
  const [savedSignature, setSavedSignature] = useState<string | null>(null)

  const loadedDraft = useMemo<IDeckAdminDraft | null>(() => {
    const loadedDeck = deckQuery.data
    if (!loadedDeck || !deckId || loadedDeck.id !== deckId) {
      return null
    }

    return { name: loadedDeck.name, quantitiesByCardId: toQuantitiesFromDeck(loadedDeck) }
  }, [deckQuery.data, deckId])

  const draft = editedDraft ?? loadedDraft ?? EMPTY_DRAFT

  const baselineSignature = useMemo(
    () => savedSignature ?? buildDeckDraftSignature(loadedDraft ?? EMPTY_DRAFT),
    [savedSignature, loadedDraft],
  )

  const selectedCardIds = useMemo(() => [...draft.quantitiesByCardId.keys()], [draft.quantitiesByCardId])

  const selectedCardsQuery = useCardCatalogByIdsQuery(selectedCardIds)

  const metadataById = useMemo(() => {
    const byId = new Map<string, IDeckAdminCardMetadata>()

    const addCard = (card: IDeckAdminCardMetadata | null | undefined) => {
      if (!card) {
        return
      }

      const cardId = normalizeDeckCardId(card.id)
      if (cardId && !byId.has(cardId)) {
        byId.set(cardId, card)
      }
    }

    for (const card of deckQuery.data?.cards ?? []) {
      addCard(card.card)
    }

    for (const card of selectedCardsQuery.data ?? []) {
      addCard(card)
    }

    for (const card of catalogCards) {
      addCard(card)
    }

    return byId
  }, [deckQuery.data, selectedCardsQuery.data, catalogCards])

  const validation = useMemo<IDeckAdminValidationResult>(() => {
    const result = evaluateDeckDraft(draft, metadataById)

    if (!selectedCardsQuery.isFetching) {
      return result
    }

    return {
      isValid: false,
      violations: result.violations.filter((violation) => violation.code !== 'unknownCards'),
    }
  }, [draft, metadataById, selectedCardsQuery.isFetching])

  const selectedCards = useMemo<IDeckAdminSelectedCard[]>(
    () => buildSelectedDeckCards(draft, metadataById),
    [draft, metadataById],
  )

  const leaderCard = useMemo(() => buildDeckLeaderCard(draft, metadataById), [draft, metadataById])

  const totalCopies = useMemo(
    () => selectedCards.reduce((total, card) => total + card.quantity, 0) + (leaderCard?.quantity ?? 0),
    [selectedCards, leaderCard],
  )

  const draftSignature = useMemo(() => buildDeckDraftSignature(draft), [draft])
  const isDirty = draftSignature !== baselineSignature
  const isSaving = createDeckMutation.isPending || updateDeckMutation.isPending

  const canSave = validation.isValid && isDirty && !isSaving

  const setName = (value: string) => {
    setEditedDraft({ name: value, quantitiesByCardId: draft.quantitiesByCardId })
  }

  const updateQuantities = (
    transform: (quantities: ReadonlyMap<string, number>) => ReadonlyMap<string, number>,
  ) => {
    setEditedDraft({ name: draft.name, quantitiesByCardId: transform(draft.quantitiesByCardId) })
  }

  const addCopy = (cardId: string) => {
    const normalizedCardId = normalizeDeckCardId(cardId)
    if (!normalizedCardId) {
      return
    }

    if (isLeaderCard(metadataById.get(normalizedCardId))) {
      const nextQuantities = withoutLeaderEntries(draft.quantitiesByCardId, metadataById)
      nextQuantities.set(normalizedCardId, 1)

      setEditedDraft({ name: draft.name, quantitiesByCardId: nextQuantities })
      return
    }

    updateQuantities((quantities) => {
      const next = new Map(quantities)
      next.set(normalizedCardId, (next.get(normalizedCardId) ?? 0) + 1)
      return next
    })
  }

  const removeCopy = (cardId: string) => {
    const normalizedCardId = normalizeDeckCardId(cardId)

    updateQuantities((quantities) => {
      const existingQuantity = quantities.get(normalizedCardId) ?? 0
      if (existingQuantity <= 0) {
        return quantities
      }

      const next = new Map(quantities)
      if (existingQuantity === 1) {
        next.delete(normalizedCardId)
      } else {
        next.set(normalizedCardId, existingQuantity - 1)
      }

      return next
    })
  }

  const clearCard = (cardId: string) => {
    const normalizedCardId = normalizeDeckCardId(cardId)

    updateQuantities((quantities) => {
      if (!quantities.has(normalizedCardId)) {
        return quantities
      }

      const next = new Map(quantities)
      next.delete(normalizedCardId)
      return next
    })
  }

  const importCards = (cards: IDeckCardInput[]) => {
    const importedLeaderIds: string[] = []
    const importedCardLines: IDeckCardInput[] = []

    for (const card of cards) {
      const cardId = normalizeDeckCardId(card.cardId)
      if (cardId && isLeaderCard(metadataById.get(cardId))) {
        importedLeaderIds.push(cardId)
        continue
      }

      importedCardLines.push(card)
    }

    const baseQuantities = importedLeaderIds.length > 0
      ? withoutLeaderEntries(draft.quantitiesByCardId, metadataById)
      : draft.quantitiesByCardId
    const nextQuantities = mergeImportedDeckCards(baseQuantities, importedCardLines)
    const importedLeaderId = importedLeaderIds.at(-1)

    if (importedLeaderId) {
      nextQuantities.set(importedLeaderId, 1)
    }

    setEditedDraft({ name: draft.name, quantitiesByCardId: nextQuantities })
  }

  const adoptSavedDeck = (savedName: string) => {
    const savedDraft: IDeckAdminDraft = { name: savedName, quantitiesByCardId: draft.quantitiesByCardId }

    setEditedDraft(savedDraft)
    setSavedSignature(buildDeckDraftSignature(savedDraft))
  }

  const save = async (): Promise<IDeckResponse> => {
    const payloadCards = toDeckCardPayload(draft.quantitiesByCardId, metadataById)
    const trimmedName = draft.name.trim()

    if (deckId) {
      const savedDeck = await updateDeckMutation.mutateAsync({
        deckId,
        name: trimmedName,
        cards: payloadCards,
      })

      adoptSavedDeck(savedDeck.name)
      return savedDeck
    }

    const createdDeck = await createDeckMutation.mutateAsync({ name: trimmedName, cards: payloadCards })

    adoptSavedDeck(createdDeck.name)
    navigate(`/admin/decks/${createdDeck.id}`)

    return createdDeck
  }

  const remove = async (): Promise<void> => {
    if (!deckId) {
      return
    }

    await deleteDeckMutation.mutateAsync(deckId)
    navigate('/admin/decks')
  }

  return {
    decks: decksQuery.data ?? [],
    isDecksLoading: decksQuery.isLoading,
    isDecksError: decksQuery.isError,
    isDeckLoading: deckId !== null && deckQuery.isLoading,
    isDeckError: deckQuery.isError,
    draft,
    name: draft.name,
    setName,
    selectedCards,
    leaderCard,
    totalCopies,
    metadataById,
    validation,
    isDirty,
    isSaving,
    isDeleting: deleteDeckMutation.isPending,
    canSave,
    addCopy,
    removeCopy,
    clearCard,
    importCards,
    save,
    remove,
  }
}

export type IDeckAdminModel = ReturnType<typeof useDeckAdminModel>

