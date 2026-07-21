namespace ProjectHiddenVillage.Server;

public enum GamePhase
{
    Draw,
    SetResource,
    StartOfMainPhase,
    MainPhase,
    AttackDeclaration,
    BlockerDeclaration,
    ActionStep,
    AttackResolution,
    BattleEndStep,
    EndStep
}