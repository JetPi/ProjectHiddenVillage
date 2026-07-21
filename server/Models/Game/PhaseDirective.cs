namespace ProjectHiddenVillage.Server;

public enum PhaseDirectiveType
{
    SkipPhase,
    JumpToPhase
}

public sealed class PhaseDirective
{
    public PhaseDirectiveType Type { get; set; }

    public GamePhase Phase { get; set; }
}