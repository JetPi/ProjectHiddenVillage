namespace ProjectHiddenVillage.Server;

public sealed class GameState
{
    public string GameId { get; set; } = Guid.NewGuid().ToString("N");

    public int TurnNumber { get; set; } = 1;

    public string ActivePlayerId { get; set; } = string.Empty;

    public string PriorityPlayerId { get; set; } = string.Empty;

    public int ConsecutivePasses { get; set; }

    public GamePhase Phase { get; set; } = GamePhase.MainPhase;

    public Queue<PhaseDirective> PhaseDirectives { get; set; } = new();

    public Queue<GamePhase> InsertedPhases { get; set; } = new();

    public Dictionary<string, Card> CardDefinitions { get; set; } = [];

    public bool Player1SummonCard { get; set; } = true;

    public bool Player2SummonCard { get; set; } = true;

    public List<PlayerState> Players { get; set; } = [];

    public List<EffectResolutionStackEntry> EffectResolutionStack { get; set; } = [];

    public void InsertPhase(GamePhase phase)
    {
        InsertedPhases.Enqueue(phase);
    }
}

public class GamePhaseData(
    GamePhase phaseName,
    List<string> availablePhaseOptions,
    bool hasPlayerInteraction,
    PhaseAdvanceMode advanceMode)
{
    public GamePhase PhaseName { get; } = phaseName;
    public List<string> AvailablePhaseOptions { get; } = availablePhaseOptions;
    public bool HasPlayerInteraction { get; } = hasPlayerInteraction;
    public PhaseAdvanceMode AdvanceMode { get; } = advanceMode;
}