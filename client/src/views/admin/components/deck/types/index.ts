import type { IDeckCardInput, IDeckResponse } from "@/types/deck"
import type { IDeckRuleset } from "@/types/deckRuleset"
import type {
  IDeckAdminCardMetadata,
  IDeckAdminSelectedCard,
  IDeckAdminValidationResult,
} from "@/views/admin/types/deckAdminTypes"

export type IDeckAdminEditorPaneProps = {
  isNew: boolean
  name: string
  onNameChange: (value: string) => void
  leaderCard: IDeckAdminSelectedCard | null
  selectedCards: IDeckAdminSelectedCard[]
  leaderCopies: number
  nonLeaderCopies: number
  validation: IDeckAdminValidationResult
  isCheckingCards: boolean
  canSave: boolean
  isDirty: boolean
  isSaving: boolean
  isLoading: boolean
  isError: boolean
  onAddCopy: (cardId: string) => void
  onRemoveCopy: (cardId: string) => void
  onClearCard: (cardId: string) => void
  onClearLeader: () => void
  onSave: () => void
  onOpenImport: () => void
  onOpenDelete: () => void
  /** Copies the current draft as the `Nx CARD` text the import window and the deck endpoint read. */
  onExport: () => void
}

export type IDeckAdminDeleteDialogProps = {
  isOpen: boolean
  deckName: string
  isDeleting: boolean
  onCancel: () => void
  onConfirm: () => void
}

export type IDeckAdminImportDialogProps = {
  isOpen: boolean
  rulesets: readonly IDeckRuleset[]
  cardsById: ReadonlyMap<string, IDeckAdminCardMetadata>
  onClose: () => void
  onReplace: (cards: IDeckCardInput[], leaderCardId: string | null) => void
}

export type IDeckAdminListRailProps = {
  decks: IDeckResponse[]
  selectedDeckId: string | null
  isLoading: boolean
  isError: boolean
}

export type IDeckAdminSelectedCardRowProps = {
  card: IDeckAdminSelectedCard
  onAddCopy: (cardId: string) => void
  onRemoveCopy: (cardId: string) => void
  onClearCard: (cardId: string) => void
}

export type IDeckAdminValidationListProps = {
  validation: IDeckAdminValidationResult
  isCheckingCards: boolean
}
