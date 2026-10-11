using ErrorOr;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;
using ProjectHiddenVillage.Server.Engine;
using ProjectHiddenVillage.Server.Engine.Interfaces;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// The registry is where the game-end conditions are enforced: every mutation evaluates
/// <see cref="GameEndRules.TryResolveLeaderDefeat"/> at its boundary, the draw paths resolve a deck-out, and
/// every mutating entry point refuses to run once an outcome exists (<see cref="GameEndRules.ThrowIfGameOver"/>).
/// Without that guard a finished game could keep being played while both boards only showed the result.
/// </summary>
[TestClass]
public sealed class InMemoryGameInstanceRegistryGameOverTests
{
    private readonly InMemoryGameInstanceRegistry registry = new(
        new GameInstanceFactory(),
        new global::ProjectHiddenVillage.Server.Engine.GamePhaseService(new global::ProjectHiddenVillage.Server.Engine.GamePhaseStateService()));

    [TestMethod]
    public void AdvancePhase_WhenTheDeckRunsOut_EndsTheGameForThePlayerWhoHadToDraw()
    {
        // A one-card deck: the opening hand deals it, so the very first DrawPhase has to draw from an empty
        // deck - "if a player has to draw a card but their deck has no cards left, the other player wins".
        var game = CreateGame();
        registry.ResolvePrompt(game.Id, game.GetPendingPrompt()!.RequestedPlayerId, "goFirst");

        var activePlayerId = game.State.ActivePlayerId;
        var opponentPlayerId = game.State.Players.Single(player => player.PlayerId != activePlayerId).PlayerId;
        Assert.AreEqual(GamePhase.DrawInitialHand, game.State.Phase);

        AdvanceToStartOfMainPhase(game);

        // The opening hand dealt the only card, so the DrawPhase has nothing left to draw.
        Assert.AreEqual(0, game.State.Players.Single(player => player.PlayerId == activePlayerId).Deck.Count);

        registry.AdvancePhase(game.Id);

        Assert.AreEqual(GamePhase.DrawPhase, game.State.Phase);
        Assert.IsNotNull(game.State.Outcome);
        Assert.AreEqual(GameEndReason.DeckOut, game.State.Outcome!.Reason);
        CollectionAssert.AreEqual(new[] { activePlayerId }, game.State.Outcome.LoserPlayerIds.ToArray());
        Assert.AreEqual(opponentPlayerId, game.State.Outcome.WinnerPlayerId);
        Assert.AreEqual(1, game.ActionLog.Count(entry => entry.ActionType == GameEndRules.GameEndedActionType));
    }

    [TestMethod]
    public void EveryMutation_IsRefused_OnceTheGameIsOver()
    {
        var game = CreateGame();
        registry.ResolvePrompt(game.Id, game.GetPendingPrompt()!.RequestedPlayerId, "goFirst");
        AdvanceToStartOfMainPhase(game);
        registry.AdvancePhase(game.Id);
        var activePlayerId = game.State.ActivePlayerId;

        AssertGameOverRefusal(() => registry.AdvancePhase(game.Id));
        AssertGameOverRefusal(() => registry.DeclareEndStep(game.Id));
        AssertGameOverRefusal(() => registry.CompleteEndStep(game.Id));
        AssertGameOverRefusal(() => registry.DeclarePassInActionStep(game.Id, activePlayerId));
        AssertGameOverRefusal(() => registry.DeclareActionInActionStep(game.Id, activePlayerId));
        AssertGameOverRefusal(() => registry.ResolvePrompt(game.Id, activePlayerId, "noMulligan"));
        AssertGameOverRefusal(() => registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: activePlayerId,
                ActionId: "summon-to-field:card-1",
                SourceCardInstanceId: "card-instance-1"),
            new NoopSequentialExecutor()));

        var targets = registry.GetCardActionTargets(
            game.Id,
            new GameCardActionTargetsRequest(
                PlayerId: activePlayerId,
                ActionId: "summon-to-field:card-instance-1",
                SourceCardInstanceId: "card-instance-1"),
            BuildEvaluator());

        Assert.IsFalse(targets.IsEnabled);
        Assert.AreEqual(GameEndRules.GameOverMessage, targets.DisabledReason);
        Assert.AreEqual(0, targets.ValidTargets.Count);
    }

    [TestMethod]
    public void ALeaderAtZeroLife_EndsTheGame_AtTheNextMutationBoundary()
    {
        var game = CreateGame(withLeader: true);
        var defeatedPlayerId = game.State.Players[1].PlayerId;
        var winnerPlayerId = game.State.Players[0].PlayerId;
        game.State.Players[1].LeaderCardInstance!.CurrentLife = 0;

        // Any mutation evaluates the conditions at its boundary, whatever the action was.
        registry.ResolvePrompt(game.Id, game.GetPendingPrompt()!.RequestedPlayerId, "goFirst");

        Assert.IsNotNull(game.State.Outcome);
        Assert.AreEqual(GameEndReason.LeaderLifeDepleted, game.State.Outcome!.Reason);
        Assert.AreEqual(winnerPlayerId, game.State.Outcome.WinnerPlayerId);
        CollectionAssert.AreEqual(new[] { defeatedPlayerId }, game.State.Outcome.LoserPlayerIds.ToArray());
    }

    private GameInstance CreateGame(bool withLeader = false)
    {
        var deck = withLeader ? new List<string> { "leader-def", "card-1" } : ["card-1"];

        return registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = [.. deck] },
                new Player { Id = "p2", Deck = [.. deck] },
            ],
            cardDefinitions: BuildDefinitions(),
            random: new FixedIndexRandom(0));
    }

    /// <summary>
    /// Drives the game from the DrawInitialHand phase up to (and including) the StartOfMainPhase that follows
    /// the mulligan prompt, answering that prompt by declining it (so nothing is redrawn). The DrawPhase is
    /// entered by the caller, because that is the phase each scenario needs to observe.
    /// </summary>
    private void AdvanceToStartOfMainPhase(GameInstance game)
    {
        registry.AdvancePhase(game.Id);
        Assert.AreEqual(GamePhase.Mulligan, game.State.Phase);

        var mulliganPrompt = game.GetPendingPrompt();
        if (mulliganPrompt is not null)
        {
            registry.ResolvePrompt(game.Id, mulliganPrompt.RequestedPlayerId, "noMulligan");
        }

        Assert.AreEqual(GamePhase.StartOfMainPhase, game.State.Phase);
    }

    private static void AssertGameOverRefusal(Action action)
    {
        var exception = Assert.ThrowsException<InvalidOperationException>(action);
        Assert.AreEqual(GameEndRules.GameOverMessage, exception.Message);
    }

    private static IGameEffectCanExecuteEvaluator BuildEvaluator()
    {
        return new GameEffectCanExecuteEvaluator(
            new EffectContextConditionEvaluator(),
            new EffectTargetResolver(),
            new GameValidTargetResultFactory(),
            new GameEffectConditionDiagnostics());
    }

    private static Dictionary<string, Card> BuildDefinitions()
    {
        return new Dictionary<string, Card>(StringComparer.Ordinal)
        {
            ["card-1"] = new Card
            {
                Id = "card-1",
                DisplayName = "card-1",
                Name = ["card-1"],
                Type = CardType.Character,
                Traits = [],
                Color = CardColor.Red,
                Description = string.Empty,
                Damage = 2,
                Power = 2,
                Conditions = [],
                Effects = [],
            },
            ["leader-def"] = new LeaderCard
            {
                Id = "leader-def",
                DisplayName = "Leader",
                Name = ["Leader"],
                Type = CardType.Leader,
                Traits = ["Leader"],
                Color = CardColor.Red,
                Life = 5,
                Effects = [],
            },
        };
    }

    private sealed class FixedIndexRandom(int fixedIndex) : Random
    {
        public override int Next(int maxValue)
        {
            return maxValue <= 0 ? 0 : fixedIndex % maxValue;
        }
    }

    /// <summary>
    /// A sequential executor that does nothing: the game-over guard must refuse the action before any effect
    /// could run, so this test never reaches an effect.
    /// </summary>
    private sealed class NoopSequentialExecutor : IGameSequentialEffectExecutor
    {
        public ErrorOr<Success> Execute(GameCardEffectContext context)
        {
            return Result.Success;
        }

        public ErrorOr<Success> Resume(
            GameInstance game,
            PendingEffectContinuation continuation,
            IReadOnlyList<GameEffectTargetReference> selection)
        {
            return Result.Success;
        }
    }
}
