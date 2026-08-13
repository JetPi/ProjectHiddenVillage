export type IGamePhase =
  | 'ChooseStartingPlayer'
  | 'DrawInitialHand'
  | 'Mulligan'
  | 'RefreshPhase'
  | 'StartOfMainPhase'
  | 'DrawPhase'
  | 'MainPhase'
  | 'AttackDeclaration'
  | 'BlockerDeclaration'
  | 'ActionStep'
  | 'AttackResolution'
  | 'BattleEndStep'
  | 'EndStep'

export type IGameActionLogEntry = {
  entryId: string
  timestampUtc: string
  actionType: string
  message: string
  playerId: string
  metadata: Record<string, string>
}
