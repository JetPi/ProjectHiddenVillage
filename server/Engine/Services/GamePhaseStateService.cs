using ProjectHiddenVillage.Server;
using ProjectHiddenVillage.Server.Engine.Interfaces;

namespace ProjectHiddenVillage.Server.Engine;

public sealed class GamePhaseStateService : IGamePhaseStateService
{
    private static readonly IReadOnlyDictionary<GamePhase, PhaseMetadataTemplate> PhaseMetadata =
        new Dictionary<GamePhase, PhaseMetadataTemplate>
        {
            [GamePhase.ChooseStartingPlayer] = new(["goFirst", "goSecond"], true, PhaseAdvanceMode.ManualOnly),
            [GamePhase.DrawInitialHand] = new([], false, PhaseAdvanceMode.AutoAdvanceImmediately),
            [GamePhase.Mulligan] = new(["mulligan", "noMulligan"], true, PhaseAdvanceMode.ManualOnly),
            [GamePhase.RefreshPhase] = new([], false, PhaseAdvanceMode.AutoAdvanceImmediately),
            [GamePhase.StartOfMainPhase] = new([], false, PhaseAdvanceMode.AutoAdvanceImmediately),
            [GamePhase.DrawPhase] = new([], false, PhaseAdvanceMode.AutoAdvanceImmediately),
            [GamePhase.MainPhase] = new(["endPhase"], true, PhaseAdvanceMode.ManualOnly),
            [GamePhase.AttackDeclaration] = new([], false, PhaseAdvanceMode.AutoAdvanceImmediately),
            [GamePhase.BlockerDeclaration] = new([], true, PhaseAdvanceMode.ManualOnly),
            [GamePhase.ActionStep] = new(["pass"], true, PhaseAdvanceMode.ManualOnly),
            [GamePhase.AttackResolution] = new([], false,  PhaseAdvanceMode.AutoAdvanceImmediately),
            [GamePhase.BattleEndStep] = new([], false,  PhaseAdvanceMode.AutoAdvanceImmediately),
            [GamePhase.EndStep] = new([], false,  PhaseAdvanceMode.AutoAdvanceImmediately)
        };

    public GamePhaseData GetPhaseData(GamePhase phase)
    {
        if (!PhaseMetadata.TryGetValue(phase, out var metadata))
        {
            throw new ArgumentOutOfRangeException(nameof(phase), phase, "Unknown game phase.");
        }

        return new GamePhaseData(
            phase,
            [..metadata.AvailablePhaseOptions],
            metadata.HasPlayerInteraction,
            metadata.AdvanceMode);
    }

    public GamePhase GetNextPhase(GamePhase currentPhase)
    {
        return currentPhase switch
        {
            GamePhase.ChooseStartingPlayer => GamePhase.DrawInitialHand,
            GamePhase.DrawInitialHand => GamePhase.Mulligan,
            GamePhase.Mulligan => GamePhase.StartOfMainPhase,
            GamePhase.StartOfMainPhase => GamePhase.DrawPhase,
            GamePhase.DrawPhase => GamePhase.RefreshPhase,
            GamePhase.RefreshPhase => GamePhase.MainPhase,
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

    public GamePhaseData AdvancePhase(GameState state)
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
            state.Phase = AdvanceCurrentPhase(state);
        }

        ApplyPhaseEntryState(state);

        return GetPhaseData(state.Phase);
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

    public void DeclareEndStep(GameState state)
    {
        ArgumentNullException.ThrowIfNull(state);

        if (state.Phase != GamePhase.MainPhase)
        {
            throw new InvalidOperationException("End step can only be declared from MainPhase.");
        }

        state.Phase = GamePhase.EndStep;
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

    private GamePhase AdvanceCurrentPhase(GameState state)
    {
        return state.Phase switch
        {
            GamePhase.ChooseStartingPlayer => EnterChooseStartingPlayer(state),
            GamePhase.DrawInitialHand => EnterDrawInitialHand(state),
            GamePhase.Mulligan => EnterMulligan(state),
            GamePhase.RefreshPhase => EnterRefreshPhase(state),
            GamePhase.StartOfMainPhase => EnterStartOfMainPhase(state),
            GamePhase.DrawPhase => EnterDrawPhase(state),
            GamePhase.MainPhase => EnterMainPhase(state),
            GamePhase.AttackDeclaration => EnterAttackDeclaration(state),
            GamePhase.BlockerDeclaration => EnterBlockerDeclaration(state),
            GamePhase.ActionStep => EnterActionStep(state),
            GamePhase.AttackResolution => EnterAttackResolution(state),
            GamePhase.BattleEndStep => EnterBattleEndStep(state),
            _ => throw new ArgumentOutOfRangeException(nameof(state.Phase), state.Phase, "Unknown game phase.")
        };
    }

    private void ApplyPhaseEntryState(GameState state)
    {
        switch (state.Phase)
        {
            case GamePhase.RefreshPhase:
                OnEnterRefreshPhase(state);
                break;
            case GamePhase.ActionStep:
                OnEnterActionStep(state);
                break;
        }
    }

    private static void OnEnterRefreshPhase(GameState state)
    {
        var activePlayer = state.Players.SingleOrDefault(player =>
            string.Equals(player.PlayerId, state.ActivePlayerId, StringComparison.Ordinal));

        if (activePlayer is null)
        {
            return;
        }

        foreach (var card in activePlayer.Battlefield)
        {
            card.IsRested = false;
        }
    }

    private static void OnEnterActionStep(GameState state)
    {
        state.PriorityPlayerId = state.ActivePlayerId;
        state.ConsecutivePasses = 0;
    }

    private GamePhase EnterChooseStartingPlayer(GameState state)
    {
        return ApplyQueuedPhaseDirectives(state, GamePhase.DrawInitialHand);
    }

    private GamePhase EnterDrawInitialHand(GameState state)
    {
        DealInitialHands(state, cardsToDraw: 5);
        return ApplyQueuedPhaseDirectives(state, GamePhase.Mulligan);
    }

    private GamePhase EnterMulligan(GameState state)
    {
        return ApplyQueuedPhaseDirectives(state, GamePhase.StartOfMainPhase);
    }

    private GamePhase EnterRefreshPhase(GameState state)
    {
        return ApplyQueuedPhaseDirectives(state, GamePhase.MainPhase);
    }

    private GamePhase EnterStartOfMainPhase(GameState state)
    {
        return ApplyQueuedPhaseDirectives(state, GamePhase.DrawPhase);
    }

    private GamePhase EnterDrawPhase(GameState state)
    {
        return ApplyQueuedPhaseDirectives(state, GamePhase.RefreshPhase);
    }

    private GamePhase EnterMainPhase(GameState state)
    {
        return ApplyQueuedPhaseDirectives(state, GamePhase.AttackDeclaration);
    }

    private GamePhase EnterAttackDeclaration(GameState state)
    {
        return ApplyQueuedPhaseDirectives(state, GamePhase.BlockerDeclaration);
    }

    private GamePhase EnterBlockerDeclaration(GameState state)
    {
        return ApplyQueuedPhaseDirectives(state, GamePhase.ActionStep);
    }

    private GamePhase EnterActionStep(GameState state)
    {
        return ApplyQueuedPhaseDirectives(state, GamePhase.AttackResolution);
    }

    private GamePhase EnterAttackResolution(GameState state)
    {
        return ApplyQueuedPhaseDirectives(state, GamePhase.BattleEndStep);
    }

    private GamePhase EnterBattleEndStep(GameState state)
    {
        return ApplyQueuedPhaseDirectives(state, GamePhase.MainPhase);
    }

    private GamePhase ApplyQueuedPhaseDirectives(GameState state, GamePhase defaultNextPhase)
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

    private static void DealInitialHands(GameState state, int cardsToDraw)
    {
        foreach (var player in state.Players)
        {
            var drawCount = Math.Min(cardsToDraw, player.Deck.Count);
            if (drawCount <= 0)
            {
                continue;
            }

            var drawnCards = player.Deck.Take(drawCount).ToList();
            player.Deck.RemoveRange(0, drawCount);
            player.Hand.AddRange(drawnCards);
        }
    }

    private sealed record PhaseMetadataTemplate(
        IReadOnlyList<string> AvailablePhaseOptions,
        bool HasPlayerInteraction,
        PhaseAdvanceMode AdvanceMode);
}
