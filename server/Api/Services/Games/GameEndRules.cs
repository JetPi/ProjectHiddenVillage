namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>
/// Single source of truth for the game-end conditions ("If a player's leader's life points hit 0, that
/// player loses and the other wins" / "if a player has to draw a card but their deck has no cards left,
/// the other player wins").
///
/// The engine resolves the outcome through this class and nothing else: every registry mutation guards on
/// <see cref="ThrowIfGameOver"/> and evaluates <see cref="TryResolveLeaderDefeat"/> at its boundary, the
/// draw paths call <see cref="TryResolveDeckOut"/> when the deck runs out, and the response mapper reads
/// <see cref="IsGameOver"/> to publish an empty action list. Keeping the write-once flag
/// (<see cref="GameState.Outcome"/>) in one place is what stops the UI and the engine from disagreeing
/// about whether the game is still running.
/// </summary>
public static class GameEndRules
{
    /// <summary>The action-log entry the game's single end is recorded with.</summary>
    public const string GameEndedActionType = "game_ended";

    /// <summary>The refusal every mutating entry point throws once the game is over.</summary>
    public const string GameOverMessage = "The game is over; no further actions are allowed.";

    public static bool IsGameOver(GameState state)
    {
        ArgumentNullException.ThrowIfNull(state);
        return state.Outcome is not null;
    }

    public static void ThrowIfGameOver(GameState state)
    {
        if (IsGameOver(state))
        {
            throw new InvalidOperationException(GameOverMessage);
        }
    }

    /// <summary>
    /// Resolves the leader-defeat condition: any player whose leader's resolved life reached 0 loses. A
    /// leader's life is only ever bounded from below, so a life of 0 is the terminal state - and the
    /// resolved value (not the raw one) is read so an active life-modifying effect is honoured.
    /// </summary>
    public static bool TryResolveLeaderDefeat(GameState state)
    {
        ArgumentNullException.ThrowIfNull(state);

        if (IsGameOver(state))
        {
            return true;
        }

        var defeatedPlayerIds = state.Players
            .Where(player => player.LeaderCardInstance is { } leader
                && CardRuntimeEffectStateService.ResolveEffectiveLeaderCurrentLife(state, leader) <= 0)
            .Select(player => player.PlayerId)
            .ToList();

        if (defeatedPlayerIds.Count == 0)
        {
            return false;
        }

        Resolve(state, defeatedPlayerIds, GameEndReason.LeaderLifeDepleted);
        return true;
    }

    /// <summary>
    /// Resolves the deck-out condition for the player who had to draw with an empty deck. Called by the
    /// draw paths themselves, because "had to draw" is an event: an empty deck only loses when the player
    /// is asked for a card it cannot provide.
    /// </summary>
    public static bool TryResolveDeckOut(GameState state, string playerId)
    {
        ArgumentNullException.ThrowIfNull(state);

        if (IsGameOver(state))
        {
            return true;
        }

        if (string.IsNullOrWhiteSpace(playerId)
            || !state.Players.Any(player => string.Equals(player.PlayerId, playerId, StringComparison.Ordinal)))
        {
            return false;
        }

        Resolve(state, [playerId], GameEndReason.DeckOut);
        return true;
    }

    /// <summary>
    /// Records the game's single end in the action log, exactly once (the flag can be written by the
    /// engine's draw path, which has no <see cref="GameInstance"/> to log on).
    /// </summary>
    public static void EnsureGameEndLogged(GameInstance instance)
    {
        ArgumentNullException.ThrowIfNull(instance);

        if (instance.State.Outcome is not { } outcome)
        {
            return;
        }

        // Log entries are append-only, so an existing entry of this type means this end is already recorded.
        if (instance.ActionLog.Any(entry =>
                string.Equals(entry.ActionType, GameEndedActionType, StringComparison.Ordinal)))
        {
            return;
        }

        instance.AddActionLogEntry(
            actionType: GameEndedActionType,
            message: DescribeOutcome(outcome),
            metadata: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["reason"] = outcome.Reason.ToString(),
                ["winnerPlayerId"] = outcome.WinnerPlayerId ?? string.Empty,
                ["loserPlayerIds"] = string.Join(",", outcome.LoserPlayerIds),
                ["turnNumber"] = outcome.TurnNumber.ToString(System.Globalization.CultureInfo.InvariantCulture),
            });
    }

    public static string DescribeOutcome(GameOutcome outcome)
    {
        ArgumentNullException.ThrowIfNull(outcome);

        var reason = outcome.Reason switch
        {
            GameEndReason.DeckOut => "a player ran out of cards to draw",
            _ => "a leader's life points reached 0",
        };

        return outcome.WinnerPlayerId is null
            ? $"The game ended because {reason}; the result is a draw."
            : $"The game ended because {reason}; player '{outcome.WinnerPlayerId}' wins.";
    }

    private static void Resolve(GameState state, IReadOnlyList<string> loserPlayerIds, GameEndReason reason)
    {
        var losers = loserPlayerIds
            .Where(playerId => !string.IsNullOrWhiteSpace(playerId))
            .Distinct(StringComparer.Ordinal)
            .ToList();

        var winnerPlayerId = ResolveWinner(state, losers);

        ClearPendingInteraction(state);

        state.Outcome = new GameOutcome
        {
            WinnerPlayerId = winnerPlayerId,
            LoserPlayerIds = losers,
            Reason = reason,
            TurnNumber = state.TurnNumber,
        };
    }

    private static string? ResolveWinner(GameState state, IReadOnlyList<string> loserPlayerIds)
    {
        var survivors = state.Players
            .Where(player => !loserPlayerIds.Contains(player.PlayerId, StringComparer.Ordinal))
            .ToList();

        // The normal case: one player met a losing condition, the other wins.
        if (survivors.Count == 1)
        {
            return survivors[0].PlayerId;
        }

        if (survivors.Count > 1 || state.Players.Count < 2)
        {
            return null;
        }

        // Both players met a losing condition at the same instant: only then does the rules' tiebreak
        // decide, and only a full tie is a draw. Order: most leader life, then the most cards between
        // hand/support/battlefield, then the most cards left in the deck.
        var ranked = state.Players
            .OrderByDescending(player => ResolveLeaderLife(state, player))
            .ThenByDescending(ResolveInteractionCardCount)
            .ThenByDescending(player => player.Deck.Count)
            .ToList();

        var frontRunner = ranked[0];
        var runnerUp = ranked[1];

        var isTie = ResolveLeaderLife(state, frontRunner) == ResolveLeaderLife(state, runnerUp)
            && ResolveInteractionCardCount(frontRunner) == ResolveInteractionCardCount(runnerUp)
            && frontRunner.Deck.Count == runnerUp.Deck.Count;

        return isTie ? null : frontRunner.PlayerId;
    }

    private static int ResolveLeaderLife(GameState state, PlayerState player)
    {
        return player.LeaderCardInstance is { } leader
            ? CardRuntimeEffectStateService.ResolveEffectiveLeaderCurrentLife(state, leader)
            : 0;
    }

    private static int ResolveInteractionCardCount(PlayerState player)
    {
        return player.Hand.Count + player.SupportZone.Count + player.Battlefield.Count;
    }

    /// <summary>
    /// Nothing may still be waiting on a player once the game is over: a pending attack (and the cut-in
    /// window it keeps open), queued support activations, phase directives and the consecutive-pass
    /// counter are all meaningless, and leaving them behind would keep the board rendering an interaction
    /// that can never be answered. Priority is deliberately left alone - it is only cleared as part of a
    /// turn handoff, and the ActionStep invariant requires it to be set.
    /// </summary>
    private static void ClearPendingInteraction(GameState state)
    {
        state.HasPendingAttack = false;
        state.PendingAttackDeclarationId = string.Empty;
        state.PendingAttackAttackerInstanceId = string.Empty;
        state.PendingAttackDefenderPlayerId = string.Empty;
        state.PendingAttackDefenderInstanceId = string.Empty;
        state.PendingAttackDefenderZone = null;
        state.PendingAttackOptionalEffectSourceCardInstanceId = string.Empty;
        state.PendingAttackOptionalEffectId = string.Empty;
        state.PendingAttackOptionalEffectPlayerId = string.Empty;
        state.ConsecutivePasses = 0;
        state.PhaseDirectives.Clear();
        state.InsertedPhases.Clear();
        state.EffectResolutionStack.Clear();
    }
}
