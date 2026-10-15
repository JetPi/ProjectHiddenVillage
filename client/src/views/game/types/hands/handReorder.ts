/**
 * Hand-row reorder contract.
 *
 * The reorder is Motion's: the row renders a `Reorder.Group` and each card a `Reorder.Item`, so the drag is a
 * `transform` on an element that stays in flow and the siblings are laid out by Motion's projection. Nothing
 * takes a card out of flow any more - see `plans/board-position-fixes.md` for the measured defect
 * (`position: fixed` written onto a card inside a transformed slot, which drew it 566px below the pointer).
 */

export type IHandReorderCard = {
  instanceId: string
}

export type IHandRowReorderProps<TCard> = {
  /** The instance ids in display order; must match the items' `value`s one for one. */
  values: string[]
  /** Commits a new display order (Reorder.Group reports it as the items move). */
  onReorder: (values: string[]) => void
  /** Whether this card may be picked up (the row decides: more than one card, and not a locked card). */
  isDraggableCard: (card: TCard) => boolean
  /** The card currently being dragged, so the row can lift it above its neighbours. */
  activeValue: string | null
  /** Fired when a drag begins/ends, so the row can freeze the per-card overlays. */
  onDragStateChange: (instanceId: string | null) => void
}
