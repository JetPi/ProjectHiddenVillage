using ProjectHiddenVillage.Server;
using ProjectHiddenVillage.Server.Api.Services.Games;
using ProjectHiddenVillage.Server.Engine.Interfaces;

namespace ProjectHiddenVillage.Server.Engine;

public sealed class GamePhaseStateService : IGamePhaseStateService
{
    /// <summary>
    /// The single home for how each phase behaves: what it offers the players, whether it asks them anything,
    /// whether the engine ends it on its own, and what a client has to present when it is entered. The
    /// presentation kind is what the phase-presentation handshake stops on (a <see cref="PhasePresentationKind.None"/>
    /// entry means there is nothing to show and the engine keeps walking).
    /// </summary>
    private static readonly IReadOnlyDictionary<GamePhase, PhaseMetadataTemplate> PhaseMetadata =
        new Dictionary<GamePhase, PhaseMetadataTemplate>
        {
            [GamePhase.ChooseStartingPlayer] = new(["goFirst", "goSecond"], true, PhaseAdvanceMode.ManualOnly, PhasePresentationKind.None),
            [GamePhase.DrawInitialHand] = new([], false, PhaseAdvanceMode.AutoAdvanceImmediately, PhasePresentationKind.InitialDeal),
            [GamePhase.Mulligan] = new(["mulligan", "noMulligan"], true, PhaseAdvanceMode.ManualOnly, PhasePresentationKind.None),
            [GamePhase.RefreshPhase] = new([], false, PhaseAdvanceMode.AutoAdvanceImmediately, PhasePresentationKind.Ready),
            [GamePhase.StartOfMainPhase] = new([], false, PhaseAdvanceMode.AutoAdvanceImmediately, PhasePresentationKind.None),
            [GamePhase.DrawPhase] = new([], false, PhaseAdvanceMode.AutoAdvanceImmediately, PhasePresentationKind.Draw),
            [GamePhase.MainPhase] = new(["endPhase"], true, PhaseAdvanceMode.ManualOnly, PhasePresentationKind.None),
            // The attack window is entered *only* when the attacker owes an optional On Attack choice
            // (`TryPrepareOptionalWhenAttackingChoice`); a plain attack goes straight to the cut-in window. It
            // therefore asks the attacker something and must never be drained past, which is exactly the stray
            // "Advance Phase" click the old arrangement allowed.
            [GamePhase.AttackDeclaration] = new([], true, PhaseAdvanceMode.ManualOnly, PhasePresentationKind.None),
            // Nothing publishes an action for the blocker stage - the engine's support cut-in is ActionStep, and
            // answering the optional On Attack choice leaves AttackDeclaration for ActionStep directly. Keeping
            // it a pass-through means an engine path that still enters it can never strand the table on a phase
            // with no affordance.
            [GamePhase.BlockerDeclaration] = new([], false, PhaseAdvanceMode.AutoAdvanceImmediately, PhasePresentationKind.None),
            [GamePhase.ActionStep] = new(["pass"], true, PhaseAdvanceMode.ManualOnly, PhasePresentationKind.None),
            [GamePhase.AttackResolution] = new([], false,  PhaseAdvanceMode.AutoAdvanceImmediately, PhasePresentationKind.Damage),
            [GamePhase.BattleEndStep] = new([], false,  PhaseAdvanceMode.AutoAdvanceImmediately, PhasePresentationKind.BattleEnd),
            [GamePhase.EndStep] = new([], false, PhaseAdvanceMode.AutoAdvanceImmediately, PhasePresentationKind.TurnEnd)
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
            metadata.AdvanceMode,
            metadata.PresentationKind);
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
            CompleteEndStep(state);
            return GetPhaseData(state.Phase);
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

    /// <summary>
    /// Declares a pass inside an open MainPhase support reaction window. A support activated during the
    /// MainPhase keeps that window open until both players pass, exactly like the attack cut-in window;
    /// returns true when the window closes and the pending activations can resolve.
    /// </summary>
    /// <summary>
    /// A pass in the MainPhase support reaction window closes it. Priority is handed to the opponent of
    /// the latest activator when that activation is queued, so the player passing is the one being asked
    /// for a response: declining without reacting leaves nothing to answer, and the activation resolves
    /// immediately instead of demanding a second, meaningless pass from the activator. The activator is
    /// only ever asked when the opponent actually reacted (another activation flipped priority back).
    /// </summary>
    public bool DeclarePassInSupportWindow(GameState state, string playerId)
    {
        ArgumentNullException.ThrowIfNull(state);

        if (state.Phase != GamePhase.MainPhase)
        {
            throw new InvalidOperationException("Support window passes are only valid during MainPhase.");
        }

        if (!SupportTimingRules.HasPendingSupportActivation(state))
        {
            throw new InvalidOperationException("No support activation is waiting for responses.");
        }

        if (!string.Equals(state.PriorityPlayerId, playerId, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Only the priority player can declare pass.");
        }

        ClearConsecutivePasses(state);
        return true;
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
        RemoveTemporaryCardEffects(state, EffectDurationMode.DuringThisTurn);
        RemoveOpponentNextTurnEffects(state);
        RemoveUntilEndOfYourNextTurnEffects(state);
        ResetTemporaryCharacterDamage(state);
        ResetPendingAttackState(state);
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
        // Default true so an entry with nothing to hide still presents: only an entry that knows it changed
        // nothing (a RefreshPhase that readied no rested card) turns this off, and the drain reads it to skip a
        // presentation with nothing to show.
        state.LastPhaseEntryChangedAnything = true;

        switch (state.Phase)
        {
            case GamePhase.DrawPhase:
                DrawCardsForActivePlayerTurn(state);
                break;
            case GamePhase.RefreshPhase:
                state.LastPhaseEntryChangedAnything = OnEnterRefreshPhase(state);
                break;
            case GamePhase.ActionStep:
                OnEnterActionStep(state);
                break;
            case GamePhase.BattleEndStep:
                OnEnterBattleEndStep(state);
                break;
        }
    }

    /// <summary>
    /// Readies the active player's rested cards. Returns whether anything actually stood up: the drain uses that
    /// to skip the "Ready" presentation for a refresh that changed nothing, instead of parking the table for a
    /// transition with no visible content.
    /// </summary>
    private static bool OnEnterRefreshPhase(GameState state)
    {
        var activePlayer = state.Players.SingleOrDefault(player =>
            string.Equals(player.PlayerId, state.ActivePlayerId, StringComparison.Ordinal));

        if (activePlayer is null)
        {
            return false;
        }

        var didStandAnything = false;

        foreach (var card in activePlayer.Battlefield)
        {
            didStandAnything |= card.IsRested;
            card.IsRested = false;
        }

        // Leaders rest like battlefield cards when they attack, so they stand up with them too.
        if (activePlayer.LeaderCardInstance is not null)
        {
            didStandAnything |= activePlayer.LeaderCardInstance.IsRested;
            activePlayer.LeaderCardInstance.IsRested = false;
        }

        state.SetSummonCardReady(activePlayer.PlayerId, true);
        return didStandAnything;
    }

    private static void OnEnterActionStep(GameState state)
    {
        state.PriorityPlayerId = state.ActivePlayerId;
        state.ConsecutivePasses = 0;
    }

    private static void OnEnterBattleEndStep(GameState state)
    {
        RemoveTemporaryCardEffects(state, EffectDurationMode.DuringThisBattle);
        ResetPendingAttackState(state);
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
        state.HasPendingAttack = true;
        state.PendingAttackDeclarationId = Guid.NewGuid().ToString("N");
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

    private static void RemoveTemporaryCardEffects(GameState state, EffectDurationMode durationMode)
    {
        if (state.AppliedCardEffects.Count == 0)
        {
            return;
        }

        state.AppliedCardEffects.RemoveAll(effect => effect.DurationMode == durationMode);
    }

    private static void RemoveOpponentNextTurnEffects(GameState state)
    {
        if (state.AppliedCardEffects.Count == 0)
        {
            return;
        }

        state.AppliedCardEffects.RemoveAll(effect =>
            effect.DurationMode == EffectDurationMode.DuringOpponentNextTurn
            && effect.AppliedTurnNumber < state.TurnNumber);
    }

    private static void RemoveUntilEndOfYourNextTurnEffects(GameState state)
    {
        if (state.AppliedCardEffects.Count == 0)
        {
            return;
        }

        var activePlayerId = state.ActivePlayerId;
        state.AppliedCardEffects.RemoveAll(effect =>
            effect.DurationMode == EffectDurationMode.UntilTheEndOfYourNextTurn
            && effect.AppliedTurnNumber < state.TurnNumber
            && string.Equals(effect.AppliedByPlayerId, activePlayerId, StringComparison.Ordinal));
    }

    private static void DrawCardsForActivePlayerTurn(GameState state)
    {
        var activePlayer = state.Players.SingleOrDefault(player =>
            string.Equals(player.PlayerId, state.ActivePlayerId, StringComparison.Ordinal));

        if (activePlayer is null)
        {
            return;
        }

        // Only the very first global turn draws one. Every subsequent turn draws two.
        var cardsToDraw = state.TurnNumber <= 1 ? 1 : 2;
        for (var index = 0; index < cardsToDraw; index++)
        {
            if (activePlayer.Deck.Count == 0)
            {
                // "If a player has to draw a card but their deck has no cards left, the other player wins."
                // The draw stops here: the game is over, and the remaining draws of this turn are moot.
                GameEndRules.TryResolveDeckOut(state, activePlayer.PlayerId);
                return;
            }

            var drawnCard = activePlayer.Deck[0];
            activePlayer.Deck.RemoveAt(0);
            activePlayer.Hand.Add(drawnCard);
        }
    }

    private static void ResetTemporaryCharacterDamage(GameState state)
    {
        foreach (var player in state.Players)
        {
            foreach (var card in player.Battlefield)
            {
                card.CurrentHealth = null;
            }
        }
    }

    private static void ResetPendingAttackState(GameState state)
    {
        state.HasPendingAttack = false;
        state.PendingAttackDeclarationId = string.Empty;
        state.PendingAttackAttackerInstanceId = string.Empty;
        state.PendingAttackDefenderPlayerId = string.Empty;
        state.PendingAttackDefenderInstanceId = string.Empty;
        state.PendingAttackDefenderZone = null;
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
        PhaseAdvanceMode AdvanceMode,
        PhasePresentationKind PresentationKind);
}
