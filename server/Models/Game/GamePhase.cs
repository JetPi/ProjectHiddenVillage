namespace ProjectHiddenVillage.Server;

public enum GamePhase
{
    ChooseStartingPlayer,
    DrawInitialHand,
    Mulligan,
    RefreshPhase,
    StartOfMainPhase,
    DrawPhase,
    MainPhase,
    AttackDeclaration,
    BlockerDeclaration,
    ActionStep,
    AttackResolution,
    BattleEndStep,
    EndStep
}