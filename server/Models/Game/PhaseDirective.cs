namespace ProjectHiddenVillage.Server;

public sealed class PhaseDirective
{
    public PhaseDirectiveType Type { get; set; }

    public GamePhase Phase { get; set; }
}