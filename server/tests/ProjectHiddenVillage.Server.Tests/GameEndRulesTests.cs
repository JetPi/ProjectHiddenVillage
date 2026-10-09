using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// The game-end conditions live in <see cref="GameEndRules"/> and nowhere else: the engine evaluates them at
/// every mutation boundary, the draw paths call the deck-out half, and the response mapper reads
/// <see cref="GameState.Outcome"/> to publish an empty action list. These tests pin the write-once result,
/// the winner/loser projection, the tiebreak used when both players lose at the same instant, and the
/// interaction state the end clears.
/// </summary>
[TestClass]
public sealed class GameEndRulesTests
{
    [TestMethod]
    public void IsGameOver_IsFalse_WhileNoOutcomeIsPublished()
    {
        var state = BuildState();

        Assert.IsFalse(GameEndRules.IsGameOver(state));
        GameEndRules.ThrowIfGameOver(state);
    }

    [TestMethod]
    public void TryResolveLeaderDefeat_ResolvesTheOtherPlayerAsWinner()
    {
        var state = BuildState(leaderLife: [("p1", 0)], withTurnNumber: 4);

        var resolved = GameEndRules.TryResolveLeaderDefeat(state);

        Assert.IsTrue(resolved);
        Assert.IsNotNull(state.Outcome);
        Assert.AreEqual("p2", state.Outcome.WinnerPlayerId);
        CollectionAssert.AreEqual(new[] { "p1" }, state.Outcome.LoserPlayerIds.ToArray());
        Assert.AreEqual(GameEndReason.LeaderLifeDepleted, state.Outcome.Reason);
        Assert.AreEqual(4, state.Outcome.TurnNumber);
    }

    [TestMethod]
    public void TryResolveLeaderDefeat_KeepsTheGameRunning_WhileBothLeadersAreAlive()
    {
        var state = BuildState(leaderLife: [("p1", 1), ("p2", 3)]);

        Assert.IsFalse(GameEndRules.TryResolveLeaderDefeat(state));
        Assert.IsNull(state.Outcome);
    }

    [TestMethod]
    public void TryResolveLeaderDefeat_ReadsTheResolvedLife_NotTheStoredOne()
    {
        // The leader still stores 1 life; an active effect subtracts 1, so the game is over even though the
        // raw value never reached 0.
        var state = BuildState(leaderLife: [("p1", 1)]);
        state.AppliedCardEffects.Add(new AppliedCardEffectState
        {
            Id = "lose-life",
            EffectSpecId = "lose-life",
            SourceCardInstanceId = "support-1",
            TargetCardInstanceId = "leader-p1",
            ModifierKind = AppliedCardModifierKind.Attribute,
            DurationMode = EffectDurationMode.DuringThisTurn,
            AttributeType = EffectAttributeType.LeaderCurrentLife,
            AttributeOperation = AttributeModificationOperation.Subtract,
            AttributeValue = 1,
            AppliedByPlayerId = "p2",
            AppliedTurnNumber = state.TurnNumber,
        });

        Assert.IsTrue(GameEndRules.TryResolveLeaderDefeat(state));
        Assert.AreEqual("p2", state.Outcome!.WinnerPlayerId);
    }

    [TestMethod]
    public void TryResolveDeckOut_LosesOnly_ForThePlayerWhoCouldNotDraw()
    {
        var state = BuildState();

        var resolved = GameEndRules.TryResolveDeckOut(state, "p2");

        Assert.IsTrue(resolved);
        Assert.AreEqual(GameEndReason.DeckOut, state.Outcome!.Reason);
        Assert.AreEqual("p1", state.Outcome.WinnerPlayerId);
        CollectionAssert.AreEqual(new[] { "p2" }, state.Outcome.LoserPlayerIds.ToArray());
    }

    [TestMethod]
    public void TryResolveDeckOut_IgnoresAnUnknownPlayer()
    {
        var state = BuildState();

        Assert.IsFalse(GameEndRules.TryResolveDeckOut(state, "p3"));
        Assert.IsNull(state.Outcome);
    }

    [TestMethod]
    public void TryResolveDeckOut_DoesNotRewriteAnAlreadyResolvedOutcome()
    {
        var state = BuildState(leaderLife: [("p1", 0)]);
        GameEndRules.TryResolveLeaderDefeat(state);
        var firstOutcome = state.Outcome;

        Assert.IsTrue(GameEndRules.TryResolveDeckOut(state, "p2"));
        Assert.AreSame(firstOutcome, state.Outcome);
        Assert.AreEqual(GameEndReason.LeaderLifeDepleted, state.Outcome!.Reason);
    }

    [TestMethod]
    public void TryResolveLeaderDefeat_WhenBothPlayersLoseAtOnce_UsesTheCardCountTiebreak()
    {
        // Both leaders are at 0, so the rules' tiebreak decides: the first metric (most life) is tied at 0,
        // so the amount of cards between hand/support/battlefield decides.
        var state = BuildState(leaderLife: [("p1", 0), ("p2", 0)]);
        state.Players[0].Hand.Add(BuildCard("hand-p1"));
        state.Players[1].Hand.Add(BuildCard("hand-p2"));
        state.Players[1].Battlefield.Add(BuildCard("field-p2"));

        Assert.IsTrue(GameEndRules.TryResolveLeaderDefeat(state));

        Assert.AreEqual("p2", state.Outcome!.WinnerPlayerId);
        CollectionAssert.AreEquivalent(new[] { "p1", "p2" }, state.Outcome.LoserPlayerIds.ToArray());
    }

    [TestMethod]
    public void TryResolveLeaderDefeat_WhenBothPlayersLoseAtOnce_AndTheCardCountIsTied_UsesTheDeckTiebreak()
    {
        var state = BuildState(leaderLife: [("p1", 0), ("p2", 0)]);
        state.Players[0].Deck.Add(BuildCard("deck-p1"));

        Assert.IsTrue(GameEndRules.TryResolveLeaderDefeat(state));

        Assert.AreEqual("p1", state.Outcome!.WinnerPlayerId);
    }

    [TestMethod]
    public void TryResolveLeaderDefeat_WhenEveryMetricIsTied_IsADraw()
    {
        var state = BuildState(leaderLife: [("p1", 0), ("p2", 0)]);

        Assert.IsTrue(GameEndRules.TryResolveLeaderDefeat(state));

        Assert.IsNull(state.Outcome!.WinnerPlayerId);
        CollectionAssert.AreEquivalent(new[] { "p1", "p2" }, state.Outcome.LoserPlayerIds.ToArray());
        StringAssert.Contains(GameEndRules.DescribeOutcome(state.Outcome), "draw");
    }

    [TestMethod]
    public void ThrowIfGameOver_RefusesEveryFurtherAction()
    {
        var state = BuildState(leaderLife: [("p1", 0)]);
        GameEndRules.TryResolveLeaderDefeat(state);

        var exception = Assert.ThrowsException<InvalidOperationException>(() => GameEndRules.ThrowIfGameOver(state));

        Assert.AreEqual(GameEndRules.GameOverMessage, exception.Message);
    }

    [TestMethod]
    public void Resolve_ClearsEveryPendingInteraction()
    {
        var state = BuildState(leaderLife: [("p2", 0)]);
        state.HasPendingAttack = true;
        state.PendingAttackAttackerInstanceId = "attacker-1";
        state.PendingAttackDefenderPlayerId = "p2";
        state.PendingAttackDefenderZone = PlayerZone.Leader;
        state.PendingAttackOptionalEffectId = "on-attack";
        state.ConsecutivePasses = 2;
        state.PhaseDirectives.Enqueue(new PhaseDirective { Type = PhaseDirectiveType.SkipPhase, Phase = GamePhase.DrawPhase });
        state.InsertedPhases.Enqueue(GamePhase.ActionStep);
        state.EffectResolutionStack.Add(new EffectResolutionStackEntry
        {
            EntryId = "entry-1",
            SourcePlayerId = "p1",
            SourceCardInstanceId = "support-1",
            EffectTypeKey = "change-values",
        });

        GameEndRules.TryResolveLeaderDefeat(state);

        Assert.IsFalse(state.HasPendingAttack);
        Assert.AreEqual(string.Empty, state.PendingAttackDeclarationId);
        Assert.AreEqual(string.Empty, state.PendingAttackAttackerInstanceId);
        Assert.AreEqual(string.Empty, state.PendingAttackDefenderPlayerId);
        Assert.AreEqual(string.Empty, state.PendingAttackDefenderInstanceId);
        Assert.IsNull(state.PendingAttackDefenderZone);
        Assert.AreEqual(string.Empty, state.PendingAttackOptionalEffectId);
        Assert.AreEqual(string.Empty, state.PendingAttackOptionalEffectPlayerId);
        Assert.AreEqual(0, state.ConsecutivePasses);
        Assert.AreEqual(0, state.PhaseDirectives.Count);
        Assert.AreEqual(0, state.InsertedPhases.Count);
        Assert.AreEqual(0, state.EffectResolutionStack.Count);
    }

    [TestMethod]
    public void EnsureGameEndLogged_RecordsTheEndExactlyOnce()
    {
        var state = BuildState(leaderLife: [("p1", 0)]);
        GameEndRules.TryResolveLeaderDefeat(state);
        var instance = new GameInstance(state);

        GameEndRules.EnsureGameEndLogged(instance);
        GameEndRules.EnsureGameEndLogged(instance);

        var entries = instance.ActionLog
            .Where(entry => entry.ActionType == GameEndRules.GameEndedActionType)
            .ToList();
        Assert.AreEqual(1, entries.Count);
        Assert.AreEqual("LeaderLifeDepleted", entries[0].Metadata["reason"]);
        Assert.AreEqual("p2", entries[0].Metadata["winnerPlayerId"]);
        Assert.AreEqual("p1", entries[0].Metadata["loserPlayerIds"]);
    }

    [TestMethod]
    public void EnsureGameEndLogged_IsANoOp_WhileTheGameIsStillRunning()
    {
        var instance = new GameInstance(BuildState());

        GameEndRules.EnsureGameEndLogged(instance);

        Assert.IsFalse(instance.ActionLog.Any(entry => entry.ActionType == GameEndRules.GameEndedActionType));
    }

    private static GameState BuildState(
        (string PlayerId, int Life)[]? leaderLife = null,
        int withTurnNumber = 1)
    {
        var state = new GameState
        {
            GameId = "game-1",
            TurnNumber = withTurnNumber,
            Phase = GamePhase.MainPhase,
            ActivePlayerId = "p1",
            PriorityPlayerId = "p1",
            CardDefinitions = new Dictionary<string, Card>(StringComparer.Ordinal)
            {
                ["leader-def"] = new LeaderCard
                {
                    Id = "leader-def",
                    DisplayName = "Leader",
                    Name = ["Leader"],
                    Traits = ["Leader"],
                    Type = CardType.Leader,
                    Color = CardColor.Blue,
                    Life = 5,
                },
                ["card-def"] = new Card
                {
                    Id = "card-def",
                    DisplayName = "Card",
                    Name = ["Card"],
                    Type = CardType.Character,
                    Traits = [],
                    Color = CardColor.Blue,
                    Description = string.Empty,
                    Damage = 1,
                    Power = 1,
                    Conditions = [],
                    Effects = [],
                },
            },
        };

        var lives = leaderLife is null || leaderLife.Length == 0
            ? new Dictionary<string, int>(StringComparer.Ordinal) { ["p1"] = 5, ["p2"] = 5 }
            : leaderLife.ToDictionary(entry => entry.PlayerId, entry => entry.Life, StringComparer.Ordinal);

        state.Players =
        [
            BuildPlayer("p1", lives.TryGetValue("p1", out var p1Life) ? p1Life : 5),
            BuildPlayer("p2", lives.TryGetValue("p2", out var p2Life) ? p2Life : 5),
        ];

        return state;
    }

    private static PlayerState BuildPlayer(string playerId, int leaderLife)
    {
        return new PlayerState
        {
            PlayerId = playerId,
            LeaderCardInstance = new LeaderCardInstanceState
            {
                InstanceId = $"leader-{playerId}",
                CardDefinitionId = "leader-def",
                OwnerPlayerId = playerId,
                ControllerPlayerId = playerId,
                Name = "Leader",
                Color = CardColor.Blue,
                Traits = ["Leader"],
                Damage = 1,
                Power = 1,
                TotalLife = 5,
                CurrentLife = leaderLife,
            },
        };
    }

    private static CardInstance BuildCard(string instanceId)
    {
        return new CardInstance
        {
            InstanceId = instanceId,
            CardDefinitionId = "card-def",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
        };
    }
}
