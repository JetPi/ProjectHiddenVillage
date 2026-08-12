using ProjectHiddenVillage.Server;

namespace ProjectHiddenVillage.Server.Engine;

public sealed class GamePhaseService
{
    public bool AdvancePhase(GameInstance instance)
    {
        ArgumentNullException.ThrowIfNull(instance);

        var previousPhase = instance.State.Phase;
        var advancedToEndOfWindow = AdvancePhase(instance.State);
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

    public GamePhase GetNextPhase(GamePhase currentPhase)
    {
        return currentPhase switch
        {
            GamePhase.StartOfMainPhase => GamePhase.Draw,
            GamePhase.Draw => GamePhase.SetResource,
            GamePhase.SetResource => GamePhase.MainPhase,
            GamePhase.MainPhase => GamePhase.AttackDeclaration,
            GamePhase.AttackDeclaration => GamePhase.BlockerDeclaration,
            GamePhase.BlockerDeclaration => GamePhase.ActionStep,
            GamePhase.ActionStep => GamePhase.AttackResolution,
            GamePhase.AttackResolution => GamePhase.BattleEndStep,
            GamePhase.BattleEndStep => GamePhase.MainPhase,
            GamePhase.EndStep => GamePhase.StartOfMainPhase,
            _ => throw new ArgumentOutOfRangeException(nameof(currentPhase), currentPhase, "Unknown game phase.")
        };
    }

    public bool AdvancePhase(GameState state)
    {
        ArgumentNullException.ThrowIfNull(state);

        if (state.Phase == GamePhase.EndStep)
        {
            throw new InvalidOperationException("Use CompleteEndStep to advance from EndStep.");
        }

        if (state.InsertedPhases.Count > 0)
        {
            state.Phase = state.InsertedPhases.Dequeue();
        }
        else
        {
            var defaultNextPhase = GetNextPhase(state.Phase);
            state.Phase = ResolveNextPhaseWithDirectives(state, defaultNextPhase);
        }

        if (state.Phase == GamePhase.ActionStep)
        {
            state.PriorityPlayerId = state.ActivePlayerId;
            state.ConsecutivePasses = 0;
        }

        return false;
    }

    public void EnqueueSkipPhase(GameState state, GamePhase phaseToSkip)
    {
        ArgumentNullException.ThrowIfNull(state);

        state.PhaseDirectives.Enqueue(new PhaseDirective
        {
            Type = PhaseDirectiveType.SkipPhase,
            Phase = phaseToSkip
        });
    }

    public void EnqueueJumpToPhase(GameState state, GamePhase targetPhase)
    {
        ArgumentNullException.ThrowIfNull(state);

        state.PhaseDirectives.Enqueue(new PhaseDirective
        {
            Type = PhaseDirectiveType.JumpToPhase,
            Phase = targetPhase
        });
    }

    public bool DeclarePassInActionStep(GameState state, string playerId)
    {
        ArgumentNullException.ThrowIfNull(state);

        if (state.Phase != GamePhase.ActionStep)
        {
            throw new InvalidOperationException("Pass declarations are only valid during ActionStep.");
        }

        if (!string.Equals(state.PriorityPlayerId, playerId, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Only the priority player can declare pass.");
        }

        state.ConsecutivePasses++;

        if (state.ConsecutivePasses >= 2)
        {
            state.Phase = GamePhase.AttackResolution;
            ClearPlayerPriority(state);
            ClearConsecutivePasses(state);
            return true;
        }

        SwapPlayerInPriority(state, playerId);
        return false;
    }

    public bool DeclarePassInActionStep(GameInstance instance, string playerId)
    {
        ArgumentNullException.ThrowIfNull(instance);

        var advancedToResolution = DeclarePassInActionStep(instance.State, playerId);

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

    public void DeclareActionInActionStep(GameState state, string playerId)
    {
        ArgumentNullException.ThrowIfNull(state);

        if (state.Phase != GamePhase.ActionStep)
        {
            throw new InvalidOperationException("Actions are only valid during ActionStep.");
        }

        if (!string.Equals(state.PriorityPlayerId, playerId, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Only the priority player can declare an action.");
        }

        ClearConsecutivePasses(state);
        SwapPlayerInPriority(state, playerId);
    }

    public void DeclareActionInActionStep(GameInstance instance, string playerId)
    {
        ArgumentNullException.ThrowIfNull(instance);

        DeclareActionInActionStep(instance.State, playerId);

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

    public void DeclareEndStep(GameState state)
    {
        ArgumentNullException.ThrowIfNull(state);

        if (state.Phase != GamePhase.MainPhase)
        {
            throw new InvalidOperationException("End step can only be declared from MainPhase.");
        }

        state.Phase = GamePhase.EndStep;
    }

    public void DeclareEndStep(GameInstance instance)
    {
        ArgumentNullException.ThrowIfNull(instance);

        DeclareEndStep(instance.State);

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

    public bool CompleteEndStep(GameState state)
    {
        ArgumentNullException.ThrowIfNull(state);

        if (state.Phase != GamePhase.EndStep)
        {
            throw new InvalidOperationException("CompleteEndStep can only be used while in EndStep.");
        }

        state.Phase = GamePhase.StartOfMainPhase;
        var nextActivePlayerId = ChangeActivePlayer(state);
        var nextPlayer = state.Players.Single(player => string.Equals(player.PlayerId, nextActivePlayerId, StringComparison.Ordinal));
        nextPlayer.TurnCount++;
        ClearPlayerPriority(state);
        ClearConsecutivePasses(state);
        state.TurnNumber++;
        return true;
    }

    public bool CompleteEndStep(GameInstance instance)
    {
        ArgumentNullException.ThrowIfNull(instance);

        var previousActivePlayerId = instance.State.ActivePlayerId;
        var wrapped = CompleteEndStep(instance.State);

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


    private GamePhase ResolveNextPhaseWithDirectives(GameState state, GamePhase defaultNextPhase)
    {
        var resolvedPhase = defaultNextPhase;
        var guardCounter = 0;

        while (state.PhaseDirectives.Count > 0)
        {
            guardCounter++;

            if (guardCounter > 32)
            {
                throw new InvalidOperationException("Phase directive processing exceeded safe iteration limit.");
            }

            var directive = state.PhaseDirectives.Peek();

            if (directive.Type == PhaseDirectiveType.SkipPhase)
            {
                if (directive.Phase != resolvedPhase)
                {
                    break;
                }

                state.PhaseDirectives.Dequeue();
                resolvedPhase = GetNextPhase(resolvedPhase);
                continue;
            }

            if (directive.Type == PhaseDirectiveType.JumpToPhase)
            {
                state.PhaseDirectives.Dequeue();
                resolvedPhase = directive.Phase;
                continue;
            }

            throw new InvalidOperationException($"Unknown phase directive type '{directive.Type}'.");
        }

        return resolvedPhase;
    }

    private static void ClearConsecutivePasses(GameState state)
    {
        state.ConsecutivePasses = 0;
    }

    private static void ClearPlayerPriority(GameState state)
    {
        state.PriorityPlayerId = string.Empty;
    }

    private static string ChangeActivePlayer(GameState state)
    {
        return state.ActivePlayerId = GetNextPlayerId(state, state.ActivePlayerId);
    }

    private static string SwapPlayerInPriority(GameState state, string playerId)
    {
        return state.PriorityPlayerId = GetNextPlayerId(state, playerId);
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

    private static string DescribePlayer(string playerId)
    {
        return string.IsNullOrWhiteSpace(playerId) ? "System" : playerId;
    }

}