import type { ICardCatalogItemResponse } from '@/types/cardCatalog'
import type { IGameStateResponse } from '@/services/api/gameApi'

/** Who an entry is about. Engine bookkeeping (a turn starting, a clock expiring) belongs to nobody. */
export type IActionLogViewActor = 'you' | 'opponent' | 'system'

/**
 * One rendered line of the action log.
 *
 * `text` is already phrased: the helper builds it from the entry's action type and the card it names, and falls back
 * to the server's own message for a type it does not recognise. The panel therefore never parses anything, and a new
 * server action type shows up as readable text instead of disappearing.
 */
export type IActionLogViewEntry = {
  entryId: string
  sequence: number
  timestampUtc: string
  actionType: string
  category: string
  actor: IActionLogViewActor
  cardInstanceId: string | null
  displayName: string | null
  targetDisplayName: string | null
  phase: string | null
  turnNumber: number | null
  /** A grouped row's second line: the phases a merged turn-start run walked through. Null for a plain entry. */
  details: string | null
  text: string
}

export type IActionLogMode = 'compact' | 'expanded'

/**
 * The action log takes the game it is reading and nothing else: whether it is open, and whether it is expanded, are
 * its own state (see `gameUIStore`), so the view that mounts it never has to thread panel callbacks through.
 */
export type IActionLogProps = {
  gameState: IGameStateResponse
  authUserId?: string
  cardById?: ReadonlyMap<string, ICardCatalogItemResponse>
  isConnected: boolean
}
