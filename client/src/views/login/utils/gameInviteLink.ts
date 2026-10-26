/**
 * The invite a creator pastes to a friend: an absolute URL to the board route, so it survives being sent through a
 * chat app. The path is the same one `Enter Game` navigates to, which keeps the copy honest.
 */
export function buildGameInviteLink(gameId: string): string {
  const normalizedGameId = gameId.trim()
  const path = `/game/${encodeURIComponent(normalizedGameId)}`

  if (typeof window === 'undefined' || !window.location?.origin) {
    return path
  }

  return `${window.location.origin}${path}`
}
