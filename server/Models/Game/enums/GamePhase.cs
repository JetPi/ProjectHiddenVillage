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

public enum PhaseAdvanceMode
{
    ManualOnly,
    AutoAdvanceWhenNoPriority,
    AutoAdvanceImmediately
}

public enum PhaseDirectiveType
{
    SkipPhase,
    JumpToPhase
}
