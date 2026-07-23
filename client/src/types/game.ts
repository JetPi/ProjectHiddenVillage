export type GamePhase =
  | 'StartOfMainPhase'
  | 'Draw'
  | 'SetResource'
  | 'MainPhase'
  | 'AttackDeclaration'
  | 'BlockerDeclaration'
  | 'ActionStep'
  | 'AttackResolution'
  | 'BattleEndStep'
  | 'EndStep'

export type GameActionLogEntry = {
  entryId: string
  timestampUtc: string
  actionType: string
  message: string
  playerId: string
  metadata: Record<string, string>
}
