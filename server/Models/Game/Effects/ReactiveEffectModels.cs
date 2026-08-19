namespace ProjectHiddenVillage.Server;

public enum GameMutationKind
{
    CardSummoned,
    CardMovedZone,
    CardStatChanged,
    LeaderStatChanged,
    KeywordChanged,
    TurnAdvanced,
    PhaseAdvanced,
    EffectResolved,
}

public sealed class GameMutationEvent
{
    public string EventId { get; set; } = Guid.NewGuid().ToString("N");

    public GameMutationKind Kind { get; set; }

    public string GameId { get; set; } = string.Empty;

    public string ActingPlayerId { get; set; } = string.Empty;

    public int TurnNumber { get; set; }

    public GamePhase Phase { get; set; }

    public IReadOnlyList<string> AffectedCardInstanceIds { get; set; } = [];

    public IReadOnlyList<string> AffectedPlayerIds { get; set; } = [];

    public IReadOnlyDictionary<string, string> Metadata { get; set; } =
        new Dictionary<string, string>(StringComparer.Ordinal);
}

public sealed class PassiveActivationState
{
    public string PassiveKey { get; set; } = string.Empty;

    public string SourceCardInstanceId { get; set; } = string.Empty;

    public string SourcePlayerId { get; set; } = string.Empty;

    public string EffectSpecId { get; set; } = string.Empty;

    public bool IsActive { get; set; }

    public int LastChangedAtTurn { get; set; }

    public GamePhase LastChangedAtPhase { get; set; } = GamePhase.MainPhase;
}

public sealed class PassiveChainResolutionOptions
{
    public int MaxEntriesPerCycle { get; set; } = 64;

    public int MaxDepth { get; set; } = 8;

    public bool DeduplicateByPassiveKey { get; set; } = true;
}

public sealed class PassiveEvaluationResult
{
    public IReadOnlyList<string> ActivatedPassiveKeys { get; set; } = [];

    public IReadOnlyList<string> DeactivatedPassiveKeys { get; set; } = [];

    public IReadOnlyList<string> EnqueuedStackEntryIds { get; set; } = [];
}

public sealed class EffectChainResolutionResult
{
    public IReadOnlyList<string> ResolvedStackEntryIds { get; set; } = [];

    public IReadOnlyList<string> SkippedNegatedEntryIds { get; set; } = [];

    public string FailedEntryId { get; set; } = string.Empty;

    public string FailureReason { get; set; } = string.Empty;
}

public sealed class ReactiveOrchestrationResult
{
    public PassiveEvaluationResult PassiveEvaluation { get; set; } = new();

    public EffectChainResolutionResult ChainResolution { get; set; } = new();
}