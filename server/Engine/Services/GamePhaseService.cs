using ProjectHiddenVillage.Server.Engine.Interfaces;

namespace ProjectHiddenVillage.Server.Engine;

public sealed class GamePhaseService(IGamePhaseStateService phaseStateService)
{
    private static readonly IReadOnlyDictionary<GamePhase, Action<GameInstance>> PhaseEntryPromptHandlers =
        new Dictionary<GamePhase, Action<GameInstance>>
        {
            [GamePhase.Mulligan] = EnsureMulliganPrompt
        };

    private readonly IGamePhaseStateService phaseStateService = phaseStateService ?? throw new ArgumentNullException(nameof(phaseStateService));

    public GamePhaseData AdvancePhase(GameInstance instance)
    {
        ArgumentNullException.ThrowIfNull(instance);

        var previousPhase = instance.State.Phase;
        var phaseData = phaseStateService.AdvancePhase(instance.State);
        var activePlayerId = instance.State.ActivePlayerId;

        if (PhaseEntryPromptHandlers.TryGetValue(instance.State.Phase, out var promptHandler))
        {
            promptHandler(instance);
        }

        LogAction(
            instance,
            actionType: "phase_started",
            playerId: activePlayerId,
            previousPhase: previousPhase);

        return phaseData;
    }

    public bool DeclarePassInActionStep(GameInstance instance, string playerId)
    {
        ArgumentNullException.ThrowIfNull(instance);

        var advancedToResolution = phaseStateService.DeclarePassInActionStep(instance.State, playerId);

        LogAction(
            instance,
            actionType: "action_step_pass_declared",
            playerId: playerId,
            advancedToAttackResolution: advancedToResolution);

        return advancedToResolution;
    }

    public void DeclareActionInActionStep(GameInstance instance, string playerId)
    {
        ArgumentNullException.ThrowIfNull(instance);

        phaseStateService.DeclareActionInActionStep(instance.State, playerId);

        LogAction(
            instance,
            actionType: "action_step_action_declared",
            playerId: playerId);
    }

    public void DeclareEndStep(GameInstance instance)
    {
        ArgumentNullException.ThrowIfNull(instance);

        phaseStateService.DeclareEndStep(instance.State);

        LogAction(
            instance,
            actionType: "end_step_declared",
            playerId: instance.State.ActivePlayerId);
    }

    public bool CompleteEndStep(GameInstance instance)
    {
        ArgumentNullException.ThrowIfNull(instance);

        var previousActivePlayerId = instance.State.ActivePlayerId;
        var wrapped = phaseStateService.CompleteEndStep(instance.State);

        LogAction(
            instance,
            actionType: "turn_started",
            playerId: instance.State.ActivePlayerId,
            previousActivePlayerId: previousActivePlayerId);

        return wrapped;
    }

    public GamePhase GetNextPhase(GamePhase currentPhase)
    {
        return phaseStateService.GetNextPhase(currentPhase);
    }

    public void EnqueueSkipPhase(GameInstance instance, GamePhase phaseToSkip)
    {
        ArgumentNullException.ThrowIfNull(instance);
        phaseStateService.EnqueueSkipPhase(instance.State, phaseToSkip);
    }

    public void EnqueueJumpToPhase(GameInstance instance, GamePhase targetPhase)
    {
        ArgumentNullException.ThrowIfNull(instance);
        phaseStateService.EnqueueJumpToPhase(instance.State, targetPhase);
    }

    private static string DescribePlayer(string playerId)
    {
        return string.IsNullOrWhiteSpace(playerId) ? "System" : playerId;
    }

    private static void EnsureMulliganPrompt(GameInstance instance)
    {
        if (instance.State.Players.Count < 2)
        {
            return;
        }

        if (instance.PendingPrompts.Any(prompt => prompt.Type == GamePromptType.Mulligan))
        {
            return;
        }

        var secondPlayerId = GetNextPlayerId(instance.State, instance.State.ActivePlayerId);

        instance.EnqueuePrompt(new GamePrompt
        {
            RequestedPlayerId = secondPlayerId,
            Type = GamePromptType.Mulligan,
            Options = ["mulligan", "noMulligan"]
        });

        LogAction(
            instance,
            actionType: "mulligan_prompted",
            playerId: secondPlayerId);
    }

    private static string GetNextPlayerId(GameState state, string currentPlayerId)
    {
        if (state.Players.Count < 2)
        {
            throw new InvalidOperationException("At least two players are required for control handoff.");
        }

        var currentIndex = state.Players.FindIndex(player =>
            string.Equals(player.PlayerId, currentPlayerId, StringComparison.Ordinal));

        if (currentIndex < 0)
        {
            throw new InvalidOperationException($"Player '{currentPlayerId}' was not found in turn order.");
        }

        var nextIndex = (currentIndex + 1) % state.Players.Count;
        return state.Players[nextIndex].PlayerId;
    }

    private static void LogAction(
        GameInstance instance,
        string actionType,
        string? playerId = null,
        GamePhase? previousPhase = null,
        bool? advancedToAttackResolution = null,
        string? previousActivePlayerId = null)
    {
        var message = actionType switch
        {
            "phase_started" => $"{DescribePlayer(playerId ?? string.Empty)} started {instance.State.Phase}.",
            "action_step_pass_declared" => $"{playerId} declared pass in ActionStep.",
            "action_step_action_declared" => $"{playerId} declared an action in ActionStep.",
            "end_step_declared" => $"{DescribePlayer(instance.State.ActivePlayerId)} declared EndStep.",
            "turn_started" => $"Turn {instance.State.TurnNumber} started for {instance.State.ActivePlayerId}.",
            "mulligan_prompted" => $"{playerId} can choose mulligan.",
            _ => throw new InvalidOperationException($"Unsupported action log type '{actionType}'.")
        };

        var metadata = actionType switch
        {
            "phase_started" => CreateMetadata(
                ("fromPhase", (previousPhase ?? throw new InvalidOperationException("Previous phase is required.")).ToString()),
                ("toPhase", instance.State.Phase.ToString()),
                ("turnNumber", ToInvariant(instance.State.TurnNumber))),
            "action_step_pass_declared" => CreateMetadata(
                ("advancedToAttackResolution", (advancedToAttackResolution ?? throw new InvalidOperationException("Pass resolution flag is required.")).ToString()),
                ("nextPriorityPlayerId", instance.State.PriorityPlayerId),
                ("consecutivePasses", ToInvariant(instance.State.ConsecutivePasses))),
            "action_step_action_declared" => CreateMetadata(
                ("nextPriorityPlayerId", instance.State.PriorityPlayerId),
                ("consecutivePasses", ToInvariant(instance.State.ConsecutivePasses))),
            "end_step_declared" => CreateMetadata(
                ("phase", instance.State.Phase.ToString()),
                ("turnNumber", ToInvariant(instance.State.TurnNumber))),
            "turn_started" => CreateMetadata(
                ("previousActivePlayerId", previousActivePlayerId ?? throw new InvalidOperationException("Previous active player id is required.")),
                ("phase", instance.State.Phase.ToString()),
                ("turnNumber", ToInvariant(instance.State.TurnNumber))),
            "mulligan_prompted" => CreateMetadata(
                ("promptType", nameof(GamePromptType.Mulligan)),
                ("phase", instance.State.Phase.ToString()),
                ("turnNumber", ToInvariant(instance.State.TurnNumber))),
            _ => throw new InvalidOperationException($"Unsupported action log type '{actionType}'.")
        };

        instance.AddActionLogEntry(actionType, message, playerId, metadata);
    }

    private static IReadOnlyDictionary<string, string> CreateMetadata(params (string Key, string Value)[] entries)
    {
        var metadata = new Dictionary<string, string>(StringComparer.Ordinal);

        foreach (var (key, value) in entries)
        {
            metadata[key] = value;
        }

        return metadata;
    }

    private static string ToInvariant(int value)
    {
        return value.ToString(System.Globalization.CultureInfo.InvariantCulture);
    }

}