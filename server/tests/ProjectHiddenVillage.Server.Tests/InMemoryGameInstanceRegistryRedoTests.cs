using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Games;
using ProjectHiddenVillage.Server.Engine;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// Taking a move back is a consent between the two players: one asks, the table freezes, and only the other
/// player's agreement moves the board. What an approval restores is the newest rewind point - the board as it was
/// when somebody was last in control - which is also why repeated approvals walk further back.
/// </summary>
[TestClass]
public sealed class InMemoryGameInstanceRegistryRedoTests
{
    private const int ResponseTimeoutMs = 1_000;

    private readonly TestClockProvider timeProvider = new(new DateTimeOffset(2026, 1, 1, 12, 0, 0, TimeSpan.Zero));
    private readonly InMemoryGameInstanceRegistry registry;

    public InMemoryGameInstanceRegistryRedoTests()
    {
        registry = new InMemoryGameInstanceRegistry(
            new GameInstanceFactory(),
            new global::ProjectHiddenVillage.Server.Engine.GamePhaseService(
                new global::ProjectHiddenVillage.Server.Engine.GamePhaseStateService()),
            timeProvider: timeProvider,
            redoOptions: new GameRedoOptions { ResponseTimeoutMs = ResponseTimeoutMs, MaxRewindPoints = 8 });
    }

    [TestMethod]
    public void ANewGame_HasNothingToTakeBack()
    {
        var game = CreateGame();

        Assert.AreEqual(0, game.RewindPoints.Count);
        Assert.IsFalse(game.HasRewindTarget);
    }

    [TestMethod]
    public void RequestRedo_WhileADecisionIsPending_IsRefused()
    {
        var game = CreateGame();

        var exception = Assert.ThrowsException<InvalidOperationException>(
            () => registry.RequestRedo(game.Id, game.State.Players[0].PlayerId));

        Assert.AreEqual("Cannot ask for a redo while a decision is pending.", exception.Message);
        Assert.IsNull(game.PendingRedoRequest);
    }

    [TestMethod]
    public void RequestRedo_FreezesTheTable_UntilTheOpponentAnswers()
    {
        var game = CreateGame();
        AdvanceToStartOfMainPhase(game);
        var requesterId = game.State.Players[0].PlayerId;
        var approverId = game.State.Players[1].PlayerId;

        registry.RequestRedo(game.Id, requesterId);

        var request = game.PendingRedoRequest;
        Assert.IsNotNull(request);
        Assert.AreEqual(requesterId, request.RequestedByPlayerId);
        Assert.AreEqual(approverId, request.ApproverPlayerId);

        var refused = Assert.ThrowsException<InvalidOperationException>(() => registry.AdvancePhase(game.Id));
        Assert.AreEqual("Cannot act while a redo request is waiting for an answer.", refused.Message);

        var clockStop = GameClockStopResolver.Resolve(game);
        Assert.IsFalse(clockStop.HasOwner);
    }

    [TestMethod]
    public void RespondToRedo_Declined_LeavesTheBoardAndClearsTheRequest()
    {
        var game = CreateGame();
        AdvanceToStartOfMainPhase(game);
        var requesterId = game.State.Players[0].PlayerId;
        var approverId = game.State.Players[1].PlayerId;
        var phaseBeforeRequest = game.State.Phase;

        var request = registry.RequestRedo(game.Id, requesterId).PendingRedoRequest!;
        registry.RespondToRedo(game.Id, approverId, request.RequestId, accepted: false);

        Assert.IsNull(game.PendingRedoRequest);
        Assert.AreEqual(phaseBeforeRequest, game.State.Phase);
        Assert.IsNull(game.LastRewindId);
        Assert.AreEqual(1, game.ActionLog.Count(entry => entry.ActionType == GameActionLogActionTypes.RedoRequested));
        Assert.AreEqual(1, game.ActionLog.Count(entry => entry.ActionType == GameActionLogActionTypes.RedoDeclined));
    }

    [TestMethod]
    public void RespondToRedo_Accepted_PutsTheBoardBackAndConsumesThePoint()
    {
        var game = CreateGame();
        AdvanceToStartOfMainPhase(game);
        var requesterId = game.State.Players[0].PlayerId;
        var approverId = game.State.Players[1].PlayerId;

        registry.AdvancePhase(game.Id);
        var phaseBeforeTheTurnOfEvents = GamePhase.StartOfMainPhase;
        var phaseAfterTheAction = game.State.Phase;
        Assert.AreNotEqual(phaseBeforeTheTurnOfEvents, phaseAfterTheAction);

        var request = registry.RequestRedo(game.Id, requesterId).PendingRedoRequest!;
        var pointsBeforeApproval = game.RewindPoints.Count;

        registry.RespondToRedo(game.Id, approverId, request.RequestId, accepted: true);

        Assert.IsNull(game.PendingRedoRequest);
        Assert.AreEqual(phaseBeforeTheTurnOfEvents, game.State.Phase);
        Assert.AreEqual(request.RequestId, game.LastRewindId);
        Assert.AreEqual(pointsBeforeApproval - 1, game.RewindPoints.Count);
        Assert.AreEqual(1, game.ActionLog.Count(entry => entry.ActionType == GameActionLogActionTypes.RedoAccepted));
    }

    [TestMethod]
    public void Redo_CanBeChained_ToWalkFurtherBack()
    {
        var game = CreateGame();
        AdvanceToStartOfMainPhase(game);
        var firstPlayerId = game.State.Players[0].PlayerId;
        var secondPlayerId = game.State.Players[1].PlayerId;

        var phaseBeforeFirstStep = game.State.Phase;
        registry.AdvancePhase(game.Id);
        var phaseAfterFirstStep = game.State.Phase;
        registry.AdvancePhase(game.Id);
        var phaseAfterSecondStep = game.State.Phase;

        Assert.AreNotEqual(phaseBeforeFirstStep, phaseAfterFirstStep);
        Assert.AreNotEqual(phaseAfterFirstStep, phaseAfterSecondStep);

        // First approval: the board goes back to the step it just left.
        var firstRequest = registry.RequestRedo(game.Id, firstPlayerId).PendingRedoRequest!;
        registry.RespondToRedo(game.Id, secondPlayerId, firstRequest.RequestId, accepted: true);
        Assert.AreEqual(phaseAfterFirstStep, game.State.Phase);

        // Second approval: one point further back, while the earlier points stay reachable.
        var secondRequest = registry.RequestRedo(game.Id, secondPlayerId).PendingRedoRequest!;
        registry.RespondToRedo(game.Id, firstPlayerId, secondRequest.RequestId, accepted: true);
        Assert.AreEqual(phaseBeforeFirstStep, game.State.Phase);
        Assert.AreEqual(secondRequest.RequestId, game.LastRewindId);
    }

    [TestMethod]
    public void OnlyTheOpponent_CanAnswerARedoRequest()
    {
        var game = CreateGame();
        AdvanceToStartOfMainPhase(game);
        var requesterId = game.State.Players[0].PlayerId;

        var request = registry.RequestRedo(game.Id, requesterId).PendingRedoRequest!;

        var exception = Assert.ThrowsException<InvalidOperationException>(
            () => registry.RespondToRedo(game.Id, requesterId, request.RequestId, accepted: true));

        Assert.AreEqual("Only the other player can answer a redo request.", exception.Message);
        Assert.IsNotNull(game.PendingRedoRequest);
    }

    [TestMethod]
    public void ASupersededRequestId_IsRefused()
    {
        var game = CreateGame();
        AdvanceToStartOfMainPhase(game);
        var approverId = game.State.Players[1].PlayerId;
        registry.RequestRedo(game.Id, game.State.Players[0].PlayerId);

        var exception = Assert.ThrowsException<InvalidOperationException>(
            () => registry.RespondToRedo(game.Id, approverId, "not-the-current-request", accepted: true));

        Assert.AreEqual("That redo request is no longer current.", exception.Message);
    }

    [TestMethod]
    public void AnUnansweredRequest_ExpiresAndTheTablePlaysOn()
    {
        var game = CreateGame();
        AdvanceToStartOfMainPhase(game);
        var requesterId = game.State.Players[0].PlayerId;
        var phaseBeforeRequest = game.State.Phase;

        registry.RequestRedo(game.Id, requesterId);
        timeProvider.Advance(TimeSpan.FromMilliseconds(ResponseTimeoutMs + 1));

        Assert.IsNull(game.PendingRedoRequest);
        Assert.AreEqual(phaseBeforeRequest, game.State.Phase);
        Assert.AreEqual(1, game.ActionLog.Count(entry => entry.ActionType == GameActionLogActionTypes.RedoDeclined));

        // The freeze is lifted with it.
        registry.AdvancePhase(game.Id);
        Assert.AreNotEqual(phaseBeforeRequest, game.State.Phase);
        Assert.IsTrue(
            GameClockStopResolver.Resolve(game).HasOwner || game.State.Phase != GamePhase.MainPhase,
            "the table must be playable again once the request lapsed.");
    }

    [TestMethod]
    public void ARequest_IsDropped_WhenTheAnsweringPlayerLeaves()
    {
        var game = CreateGame();
        AdvanceToStartOfMainPhase(game);
        var approverId = game.State.Players[1].PlayerId;

        registry.RequestRedo(game.Id, game.State.Players[0].PlayerId);
        registry.ReleaseRedoRequest(game.Id, approverId);

        Assert.IsNull(game.PendingRedoRequest);
        Assert.AreEqual(1, game.ActionLog.Count(entry => entry.ActionType == GameActionLogActionTypes.RedoCancelled));
    }

    [TestMethod]
    public void CancelRedo_WithdrawsTheRequestersOwnRequest()
    {
        var game = CreateGame();
        AdvanceToStartOfMainPhase(game);
        var requesterId = game.State.Players[0].PlayerId;

        registry.RequestRedo(game.Id, requesterId);
        registry.CancelRedo(game.Id, requesterId);

        Assert.IsNull(game.PendingRedoRequest);
        Assert.AreEqual(1, game.ActionLog.Count(entry => entry.ActionType == GameActionLogActionTypes.RedoCancelled));

        // Withdrawing twice is not an error: a double click has nothing to report.
        registry.CancelRedo(game.Id, requesterId);
        Assert.IsNull(game.PendingRedoRequest);
    }

    [TestMethod]
    public void EveryPlayerAction_LeavesARewindPointBehind()
    {
        var game = CreateGame();
        var pointsAfterCreate = game.RewindPoints.Count;

        registry.ResolvePrompt(game.Id, game.GetPendingPrompt()!.RequestedPlayerId, "goFirst");
        Assert.AreEqual(pointsAfterCreate + 1, game.RewindPoints.Count);

        registry.AdvancePhase(game.Id);
        Assert.AreEqual(pointsAfterCreate + 2, game.RewindPoints.Count);

        var mulligan = game.GetPendingPrompt();
        if (mulligan is not null)
        {
            registry.ResolvePrompt(game.Id, mulligan.RequestedPlayerId, "noMulligan");
            Assert.AreEqual(pointsAfterCreate + 3, game.RewindPoints.Count);
        }

        Assert.IsTrue(game.HasRewindTarget);
    }

    [TestMethod]
    public void TheResponse_PublishesTheRequestToBothPlayers_AndTheRewindToBothBoards()
    {
        var game = CreateGame();
        AdvanceToStartOfMainPhase(game);
        var requesterId = game.State.Players[0].PlayerId;
        var approverId = game.State.Players[1].PlayerId;

        registry.AdvancePhase(game.Id);

        var request = registry.RequestRedo(game.Id, requesterId).PendingRedoRequest!;

        var requesterView = GameStateResponseMapper.ToGameStateResponse(game, requesterId);
        var approverView = GameStateResponseMapper.ToGameStateResponse(game, approverId);

        Assert.IsNotNull(requesterView.PendingRedo);
        Assert.IsNotNull(approverView.PendingRedo);
        Assert.AreEqual(request.RequestId, requesterView.PendingRedo!.RequestId);
        Assert.AreEqual(requesterId, requesterView.PendingRedo!.RequestedByPlayerId);
        Assert.AreEqual(approverId, requesterView.PendingRedo!.ApproverPlayerId);
        Assert.IsFalse(requesterView.CanRequestRedo);
        Assert.IsNull(requesterView.LastRewindId);

        registry.RespondToRedo(game.Id, approverId, request.RequestId, accepted: true);

        var afterRewind = GameStateResponseMapper.ToGameStateResponse(game, requesterId);
        Assert.IsNull(afterRewind.PendingRedo);
        Assert.AreEqual(request.RequestId, afterRewind.LastRewindId);
        Assert.IsTrue(afterRewind.CanRequestRedo);
    }

    private GameInstance CreateGame()
    {
        return registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = BuildDeck() },
                new Player { Id = "p2", Deck = BuildDeck() },
            ],
            cardDefinitions: BuildDefinitions(),
            random: new FixedIndexRandom(0));
    }

    /// <summary>Answers the opening choice and the mulligan, leaving the game on its first StartOfMainPhase.</summary>
    private void AdvanceToStartOfMainPhase(GameInstance game)
    {
        registry.ResolvePrompt(game.Id, game.GetPendingPrompt()!.RequestedPlayerId, "goFirst");

        for (var step = 0; step < 6 && game.State.Phase != GamePhase.StartOfMainPhase; step += 1)
        {
            if (game.GetPendingPrompt() is { } prompt)
            {
                registry.ResolvePrompt(game.Id, prompt.RequestedPlayerId, "noMulligan");
                continue;
            }

            registry.AdvancePhase(game.Id);
        }

        Assert.AreEqual(GamePhase.StartOfMainPhase, game.State.Phase);
    }

    private static List<string> BuildDeck()
    {
        return ["leader-def", "card-1", "card-1", "card-1", "card-1", "card-1", "card-1", "card-1", "card-1", "card-1"];
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
}
