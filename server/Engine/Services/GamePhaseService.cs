using ProjectHiddenVillage.Server.Engine.Interfaces;

namespace ProjectHiddenVillage.Server.Engine;

public sealed class GamePhaseService(IGamePhaseStateService phaseStateService)
{
    private readonly IGamePhaseStateService phaseStateService = phaseStateService ?? throw new ArgumentNullException(nameof(phaseStateService));

    public bool AdvancePhase(GameInstance instance)
    {
        ArgumentNullException.ThrowIfNull(instance);

        var previousPhase = instance.State.Phase;
        var advancedToEndOfWindow = phaseStateService.AdvancePhase(instance.State);
        var activePlayerId = instance.State.ActivePlayerId;

        instance.AddActionLogEntry(
            actionType: "phase_started",
            message: $"{DescribePlayer(activePlayerId)} started {instance.State.Phase}.",
            playerId: activePlayerId,
            metadata: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["fromPhase"] = previousPhase.ToString(),
                ["toPhase"] = instance.State.Phase.ToString(),
                ["turnNumber"] = instance.State.TurnNumber.ToString(System.Globalization.CultureInfo.InvariantCulture)
            });

        return advancedToEndOfWindow;
    }

    public bool DeclarePassInActionStep(GameInstance instance, string playerId)
    {
        ArgumentNullException.ThrowIfNull(instance);

        var advancedToResolution = phaseStateService.DeclarePassInActionStep(instance.State, playerId);

        instance.AddActionLogEntry(
            actionType: "action_step_pass_declared",
            message: $"{playerId} declared pass in ActionStep.",
            playerId: playerId,
            metadata: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["advancedToAttackResolution"] = advancedToResolution.ToString(),
                ["nextPriorityPlayerId"] = instance.State.PriorityPlayerId,
                ["consecutivePasses"] = instance.State.ConsecutivePasses.ToString(System.Globalization.CultureInfo.InvariantCulture)
            });

        return advancedToResolution;
    }

    public void DeclareActionInActionStep(GameInstance instance, string playerId)
    {
        ArgumentNullException.ThrowIfNull(instance);

        phaseStateService.DeclareActionInActionStep(instance.State, playerId);

        instance.AddActionLogEntry(
            actionType: "action_step_action_declared",
            message: $"{playerId} declared an action in ActionStep.",
            playerId: playerId,
            metadata: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["nextPriorityPlayerId"] = instance.State.PriorityPlayerId,
                ["consecutivePasses"] = instance.State.ConsecutivePasses.ToString(System.Globalization.CultureInfo.InvariantCulture)
            });
    }

    public void DeclareEndStep(GameInstance instance)
    {
        ArgumentNullException.ThrowIfNull(instance);

        phaseStateService.DeclareEndStep(instance.State);

        instance.AddActionLogEntry(
            actionType: "end_step_declared",
            message: $"{DescribePlayer(instance.State.ActivePlayerId)} declared EndStep.",
            playerId: instance.State.ActivePlayerId,
            metadata: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["phase"] = instance.State.Phase.ToString(),
                ["turnNumber"] = instance.State.TurnNumber.ToString(System.Globalization.CultureInfo.InvariantCulture)
            });
    }

    public bool CompleteEndStep(GameInstance instance)
    {
        ArgumentNullException.ThrowIfNull(instance);

        var previousActivePlayerId = instance.State.ActivePlayerId;
        var wrapped = phaseStateService.CompleteEndStep(instance.State);

        instance.AddActionLogEntry(
            actionType: "turn_started",
            message: $"Turn {instance.State.TurnNumber} started for {instance.State.ActivePlayerId}.",
            playerId: instance.State.ActivePlayerId,
            metadata: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["previousActivePlayerId"] = previousActivePlayerId,
                ["phase"] = instance.State.Phase.ToString(),
                ["turnNumber"] = instance.State.TurnNumber.ToString(System.Globalization.CultureInfo.InvariantCulture)
            });

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

}