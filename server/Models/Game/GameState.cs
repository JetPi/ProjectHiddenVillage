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

    public bool[] Player1CurrentChakras { get; set; } = [true, true, true, true, true, true];

    public bool[] Player2CurrentChakras { get; set; } = [true, true, true, true, true, true];

    public bool Player1SummonCard { get; set; } = true;

    public bool Player2SummonCard { get; set; } = true;

    public Dictionary<string, bool> SummonCardReadyByPlayerId { get; set; } =
        new(StringComparer.Ordinal);

    public List<PlayerState> Players { get; set; } = [];

    public List<EffectResolutionStackEntry> EffectResolutionStack { get; set; } = [];

    public List<PassiveActivationState> PassiveStates { get; set; } = [];

    public List<AppliedCardEffectState> AppliedCardEffects { get; set; } = [];

    public bool HasPendingAttack { get; set; }

    public string PendingAttackDeclarationId { get; set; } = string.Empty;

    public string PendingAttackAttackerInstanceId { get; set; } = string.Empty;

    public string PendingAttackDefenderPlayerId { get; set; } = string.Empty;

    public string PendingAttackDefenderInstanceId { get; set; } = string.Empty;

    public PlayerZone? PendingAttackDefenderZone { get; set; }

    public string PendingAttackOptionalEffectSourceCardInstanceId { get; set; } = string.Empty;

    public string PendingAttackOptionalEffectId { get; set; } = string.Empty;

    public string PendingAttackOptionalEffectPlayerId { get; set; } = string.Empty;

    public void InsertPhase(GamePhase phase)
    {
        InsertedPhases.Enqueue(phase);
    }

    public void EnsureSummonCardStateForPlayers()
    {
        foreach (var player in Players)
        {
            if (string.IsNullOrWhiteSpace(player.PlayerId))
            {
                continue;
            }

            if (!SummonCardReadyByPlayerId.ContainsKey(player.PlayerId))
            {
                SummonCardReadyByPlayerId[player.PlayerId] = true;
            }
        }
    }

    public bool IsSummonCardReady(string playerId)
    {
        EnsureSummonCardStateForPlayers();

        if (string.IsNullOrWhiteSpace(playerId))
        {
            return false;
        }

        return SummonCardReadyByPlayerId.TryGetValue(playerId, out var isReady) && isReady;
    }

    public void SetSummonCardReady(string playerId, bool isReady)
    {
        EnsureSummonCardStateForPlayers();

        if (string.IsNullOrWhiteSpace(playerId))
        {
            return;
        }

        SummonCardReadyByPlayerId[playerId] = isReady;
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