import type { IDeckCardInput, IDeckResponse } from "@/types/deck"
import type { IDeckAdminSelectedCard, IDeckAdminValidationResult, IDeckAdminViolation } from "@/views/admin/types/deckAdminTypes"

export type IDeckAdminEditorPaneProps = {
  isNew: boolean
  name: string
  onNameChange: (value: string) => void
  leaderCard: IDeckAdminSelectedCard | null
  selectedCards: IDeckAdminSelectedCard[]
  totalCopies: number
  validation: IDeckAdminValidationResult
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
  onClose: () => void
  onImport: (cards: IDeckCardInput[]) => void
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
  violations: IDeckAdminViolation[]
}