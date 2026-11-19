import type { INonLeaderCardViewModel } from '@/views/game/types'

/**
 * The number of support slots a support row draws. Mirrors `SupportSlotRules.SlotCount` on the server.
 */
const SUPPORT_SLOT_COUNT = 5

type ISupportSlotLayout = {
  /** One entry per drawn slot, in slot order. `null` means the slot is empty. */
  slots: Array<INonLeaderCardViewModel | null>
  /**
   * Slot indexes that more than one card claimed. Anything here means the engine published a row that cannot
   * be drawn as-is; the client still draws every card, but the caller should say so out loud in development.
   */
  contestedSlotIndexes: number[]
  /** Instance ids of cards that had to be moved because their declared slot was taken or out of range. */
  displacedInstanceIds: string[]
  /** Instance ids of cards that did not fit: more cards than the row has slots. */
  overflowInstanceIds: string[]
}

function resolveDeclaredSlotIndex(card: INonLeaderCardViewModel): number | null {
  const slotIndex = card.supportSlotIndex
  if (typeof slotIndex !== 'number' || !Number.isInteger(slotIndex)) {
    return null
  }

  return slotIndex >= 0 && slotIndex < SUPPORT_SLOT_COUNT ? slotIndex : null
}

/**
 * Lays a support row out across exactly {@link SUPPORT_SLOT_COUNT} slots, drawing every card the engine sent.
 *
 * The row used to be collapsed by slot index with a `Map`, so two cards on one slot silently became one card -
 * the losing card vanished and every card after it slid a cell to the left, because the grid is filled by DOM
 * order. Which one survived depended on the order of the array the server happened to publish, so a refresh
 * could flip the occupant of a cell and remount it: the reported "support card flashes the card beneath it".
 *
 * The layout is therefore deterministic in the data and never drops a card it was given:
 * - cards that declare a valid slot claim it, ordered by slot index then instance id (so a duplicate pair is
 *   resolved the same way for the same data, whatever order it arrives in);
 * - a card whose slot is taken, missing or out of range takes the leftmost free slot instead of disappearing;
 * - a row with more cards than slots keeps the first five and reports the rest as overflow.
 */
function buildSupportSlotLayout(cards: INonLeaderCardViewModel[]): ISupportSlotLayout {
  const slots: Array<INonLeaderCardViewModel | null> = Array.from(
    { length: SUPPORT_SLOT_COUNT },
    () => null,
  )
  const claimedSlotIndexes = new Set<number>()
  const contestedSlotIndexes: number[] = []
  const displacedInstanceIds: string[] = []
  const overflowInstanceIds: string[] = []

  const orderedCards = [...cards].sort((left, right) => {
    const leftSlotIndex = resolveDeclaredSlotIndex(left) ?? Number.MAX_SAFE_INTEGER
    const rightSlotIndex = resolveDeclaredSlotIndex(right) ?? Number.MAX_SAFE_INTEGER

    if (leftSlotIndex !== rightSlotIndex) {
      return leftSlotIndex - rightSlotIndex
    }

    return left.instanceId.localeCompare(right.instanceId)
  })

  for (const card of orderedCards) {
    const declaredSlotIndex = resolveDeclaredSlotIndex(card)

    if (declaredSlotIndex !== null && !claimedSlotIndexes.has(declaredSlotIndex)) {
      slots[declaredSlotIndex] = card
      claimedSlotIndexes.add(declaredSlotIndex)
      continue
    }

    if (declaredSlotIndex !== null && !contestedSlotIndexes.includes(declaredSlotIndex)) {
      contestedSlotIndexes.push(declaredSlotIndex)
    }

    const freeSlotIndex = slots.findIndex((slot) => slot === null)
    if (freeSlotIndex < 0) {
      overflowInstanceIds.push(card.instanceId)
      continue
    }

    slots[freeSlotIndex] = card
    claimedSlotIndexes.add(freeSlotIndex)
    displacedInstanceIds.push(card.instanceId)
  }

  return {
    slots,
    contestedSlotIndexes,
    displacedInstanceIds,
    overflowInstanceIds,
  }
}

export { buildSupportSlotLayout, SUPPORT_SLOT_COUNT }
export type { ISupportSlotLayout }
