import type { GamePlayerStateResponse, GameStateResponse, PlayerAuth } from './types'

export function normalizeUserId(userId: string): string {
  return userId.trim().toLowerCase().replace(/-/g, '')
}

export function resolvePlayerState(state: GameStateResponse, player: PlayerAuth): GamePlayerStateResponse {
  const matchedPlayer = state.players.find((entry) => normalizeUserId(entry.playerId) === player.normalizedUserId)
  if (!matchedPlayer) {
    throw new Error(`Player state '${player.userId}' was not found in game state response.`)
  }

  return matchedPlayer
}
