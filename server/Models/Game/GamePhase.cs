namespace ProjectHiddenVillage.Server;

public enum GamePhase
{
    StartOfMainPhase,
    Draw,
    SetResource,
    MainPhase,
    AttackDeclaration,
    BlockerDeclaration,
    ActionStep,
    AttackResolution,
    BattleEndStep,
    EndStep
}