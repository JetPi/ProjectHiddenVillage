using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// The phase presentation is the handshake that replaced the client's system <c>advance-phase</c> action for the
/// games whose non-interactive phases the engine drives itself. The response has to carry the receipt the client
/// acknowledges (<c>pendingPresentation</c>) and, for exactly those games, has to stop offering the system action:
/// publishing both would let a client try to advance a phase the engine is already holding mid-transition.
/// </summary>
[TestClass]
public sealed class GameStateResponseMapperPhasePresentationTests
{
    [TestMethod]
    public void ToGameStateResponse_PublishesThePresentation_AndStopsOfferingAdvancePhase()
    {
        var state = BuildState(GamePhase.DrawPhase, "p1", "p1", "p2");
        var game = new GameInstance(state) { IsPhaseAutomationEnabled = true };

        var presentation = game.MintPhasePresentation(
            kind: PhasePresentationKind.Draw,
            requiredAckPlayerIds: ["p1", "p2"]);

        var response = GameStateResponseMapper.ToGameStateResponse(game, "p1");

        Assert.IsNotNull(response.PendingPresentation);
        Assert.AreEqual(presentation.PresentationId, response.PendingPresentation.PresentationId);
        Assert.AreEqual(nameof(GamePhase.DrawPhase), response.PendingPresentation.Phase);
        Assert.AreEqual(nameof(PhasePresentationKind.Draw), response.PendingPresentation.Kind);
        CollectionAssert.AreEquivalent(new[] { "p1", "p2" }, response.PendingPresentation.RequiredAckPlayerIds.ToArray());
        Assert.AreEqual(0, response.PendingPresentation.AcknowledgedPlayerIds.Count);

        Assert.IsFalse(
            response.AvailableActions.Any(action => action.ActionId == "advance-phase"),
            "The engine owns these phases, so there is no system action left for the client to send.");
    }

    [TestMethod]
    public void ToGameStateResponse_KeepsOfferingAdvancePhase_ForTheGamesTheClientStillDrives()
    {
        var state = BuildState(GamePhase.DrawPhase, "p1", "p1", "p2");
        var game = new GameInstance(state);

        var response = GameStateResponseMapper.ToGameStateResponse(game, "p1");

        Assert.IsNull(response.PendingPresentation);
        Assert.IsTrue(
            response.AvailableActions.Any(action => action.ActionId == "advance-phase"),
            "With the automation off the client still drives the phase walk exactly as before.");
    }

    [TestMethod]
    public void ToGameStateResponse_StopsPublishingThePresentation_OnceTheGameIsOver()
    {
        var state = BuildState(GamePhase.DrawPhase, "p1", "p1", "p2");
        state.Outcome = new GameOutcome
        {
            WinnerPlayerId = "p2",
            LoserPlayerIds = ["p1"],
            Reason = GameEndReason.LeaderLifeDepleted,
        };

        var game = new GameInstance(state) { IsPhaseAutomationEnabled = true };
        game.MintPhasePresentation(kind: PhasePresentationKind.Draw, requiredAckPlayerIds: ["p1", "p2"]);

        var response = GameStateResponseMapper.ToGameStateResponse(game, "p1");

        Assert.IsNull(
            response.PendingPresentation,
            "A finished game owes nobody a presentation: the result overlay is the only affordance left.");
        Assert.AreEqual(0, response.AvailableActions.Count);
    }

    [TestMethod]
    public void ToGameStateResponse_ReportsEachAcknowledgement_AsItArrives()
    {
        var state = BuildState(GamePhase.DrawPhase, "p1", "p1", "p2");
        var game = new GameInstance(state) { IsPhaseAutomationEnabled = true };
        var presentation = game.MintPhasePresentation(
            kind: PhasePresentationKind.Draw,
            requiredAckPlayerIds: ["p1", "p2"]);

        Assert.IsTrue(game.AcknowledgePhasePresentation(presentation.PresentationId, "p1"));

        var response = GameStateResponseMapper.ToGameStateResponse(game, "p2");

        Assert.IsNotNull(response.PendingPresentation);
        CollectionAssert.AreEquivalent(new[] { "p1" }, response.PendingPresentation.AcknowledgedPlayerIds.ToArray());
        Assert.IsFalse(response.PendingPresentation.RequiredAckPlayerIds.Count == response.PendingPresentation.AcknowledgedPlayerIds.Count);
    }

    private static GameState BuildState(
        GamePhase phase,
        string activePlayerId,
        string requesterId,
        string opponentId)
    {
        return new GameState
        {
            GameId = "ABCDE",
            TurnNumber = 1,
            Phase = phase,
            ActivePlayerId = activePlayerId,
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
                    RecoveryEffect = "Recover 1",
                },
            },
            Players =
            [
                new PlayerState
                {
                    PlayerId = requesterId,
                    LeaderCardInstance = CreateLeader(requesterId),
                },
                new PlayerState
                {
                    PlayerId = opponentId,
                    LeaderCardInstance = CreateLeader(opponentId),
                },
            ],
        };
    }

    private static LeaderCardInstanceState CreateLeader(string playerId)
    {
        return new LeaderCardInstanceState
        {
            InstanceId = $"leader-{playerId}",
            CardDefinitionId = "leader-def",
            OwnerPlayerId = playerId,
            ControllerPlayerId = playerId,
            Name = "Leader",
            Color = CardColor.Blue,
            Traits = ["Leader"],
            Damage = 0,
            Power = 0,
            TotalLife = 5,
            CurrentLife = 5,
            RecoveryEffect = "Recover 1",
        };
    }
}
