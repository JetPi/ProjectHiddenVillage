using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// Covers the player-facing action log: the response carries a bounded tail of the game's log, oldest first, with
/// absolute sequence numbers, and every entry is subject to the publication allow-list and to the entry's own
/// visibility. The engine's own audit trail keeps everything either way.
/// </summary>
[TestClass]
public sealed class GameStateResponseMapperActionLogTests
{
    [TestMethod]
    public void ToGameStateResponse_PublishesBoardActionsToBothPlayers_OldestFirst()
    {
        var game = CreateGame();

        game.AddActionLogEntry(
            actionType: GameActionLogActionTypes.CardSummoned,
            message: "Naruto was summoned.",
            playerId: "p1",
            metadata: CreateCardMetadata("summon-1", "Naruto"),
            category: GameActionLogCategory.Action);

        game.AddActionLogEntry(
            actionType: GameActionLogActionTypes.SupportSet,
            message: "A support card was set face down.",
            playerId: "p2",
            category: GameActionLogCategory.Action);

        var responder = GameStateResponseMapper.ToGameStateResponse(game, "p1");
        var opponent = GameStateResponseMapper.ToGameStateResponse(game, "p2");

        Assert.IsNotNull(responder.ActionLog);
        Assert.AreEqual(2, responder.ActionLog!.Count);
        Assert.AreEqual(GameActionLogActionTypes.CardSummoned, responder.ActionLog[0].ActionType);
        Assert.AreEqual(GameActionLogActionTypes.SupportSet, responder.ActionLog[1].ActionType);
        // Sequence is the entry's position in the game's own log, so it survives list truncation on the client.
        Assert.AreEqual(1, responder.ActionLog[0].Sequence);
        Assert.AreEqual(2, responder.ActionLog[1].Sequence);
        Assert.AreEqual("Action", responder.ActionLog[0].Category);

        Assert.IsNotNull(opponent.ActionLog);
        CollectionAssert.AreEqual(
            new[] { GameActionLogActionTypes.CardSummoned, GameActionLogActionTypes.SupportSet },
            opponent.ActionLog!.Select(entry => entry.ActionType).ToArray(),
            "A public entry is public to both players.");
    }

    [TestMethod]
    public void ToGameStateResponse_HidesEngineDiagnosticsThatAreNotPublished()
    {
        var game = CreateGame();

        game.AddActionLogEntry(
            actionType: GameTriggeredEffectRunner.OnSummonSkippedActionType,
            message: "Skipped 'onSummon' effect on card 'summon-1'.",
            playerId: "p1");

        game.AddActionLogEntry(
            actionType: "phase_presentation_acknowledged",
            message: "Phase Draw presentation acknowledged.",
            playerId: "p1",
            category: GameActionLogCategory.Phase);

        game.AddActionLogEntry(
            actionType: GameActionLogActionTypes.CardSummoned,
            message: "Naruto was summoned.",
            playerId: "p1",
            metadata: CreateCardMetadata("summon-1", "Naruto"),
            category: GameActionLogCategory.Action);

        var response = GameStateResponseMapper.ToGameStateResponse(game, "p1");

        Assert.IsNotNull(response.ActionLog);
        Assert.AreEqual(1, response.ActionLog!.Count);
        Assert.AreEqual(GameActionLogActionTypes.CardSummoned, response.ActionLog[0].ActionType);
        // The two hidden entries still occupy sequence 1 and 2, which is why the published one keeps 3.
        Assert.AreEqual(3, response.ActionLog[0].Sequence);
    }

    [TestMethod]
    public void ToGameStateResponse_ShowsOwnerOnlyEntriesOnlyToTheirOwner()
    {
        var game = CreateGame();

        game.AddActionLogEntry(
            actionType: GameActionLogActionTypes.CardSummoned,
            message: "A hidden entry.",
            playerId: "p1",
            metadata: CreateCardMetadata("hidden-1", "Hidden"),
            category: GameActionLogCategory.Action,
            visibility: GameActionLogVisibility.OwnerOnly);

        var owner = GameStateResponseMapper.ToGameStateResponse(game, "p1");
        var opponent = GameStateResponseMapper.ToGameStateResponse(game, "p2");

        Assert.IsNotNull(owner.ActionLog);
        Assert.AreEqual(1, owner.ActionLog!.Count);
        Assert.AreEqual("hidden-1", owner.ActionLog[0].CardInstanceId);

        Assert.IsNotNull(opponent.ActionLog);
        Assert.AreEqual(0, opponent.ActionLog!.Count);
    }

    [TestMethod]
    public void ToGameStateResponse_LiftsCardAndTurnMetadataOutOfTheEntry()
    {
        var game = CreateGame();

        game.AddActionLogEntry(
            actionType: GameActionLogActionTypes.AttackDeclared,
            message: "Naruto declared an attack on Sasuke.",
            playerId: "p1",
            metadata: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["cardInstanceId"] = "attacker-1",
                ["cardDefinitionId"] = "naruto-def",
                ["displayName"] = "Naruto",
                ["targetInstanceId"] = "defender-1",
                ["targetDisplayName"] = "Sasuke",
                ["phase"] = nameof(GamePhase.ActionStep),
                ["turnNumber"] = "4",
            },
            category: GameActionLogCategory.Action);

        var response = GameStateResponseMapper.ToGameStateResponse(game, "p1");

        Assert.IsNotNull(response.ActionLog);
        var entry = response.ActionLog![0];
        Assert.AreEqual("attacker-1", entry.CardInstanceId);
        Assert.AreEqual("naruto-def", entry.CardDefinitionId);
        Assert.AreEqual("Naruto", entry.DisplayName);
        Assert.AreEqual("defender-1", entry.TargetInstanceId);
        Assert.AreEqual("Sasuke", entry.TargetDisplayName);
        Assert.AreEqual(nameof(GamePhase.ActionStep), entry.Phase);
        Assert.AreEqual(4, entry.TurnNumber);
        Assert.IsFalse(string.IsNullOrWhiteSpace(entry.TimestampUtc));
        Assert.IsFalse(string.IsNullOrWhiteSpace(entry.Message));
    }

    [TestMethod]
    public void AddActionLogEntry_RefusesAnOwnerOnlyEntryThatNamesNobody()
    {
        var game = CreateGame();

        Assert.ThrowsException<InvalidOperationException>(() =>
            game.AddActionLogEntry(
                actionType: GameActionLogActionTypes.SupportSet,
                message: "A support card was set face down.",
                visibility: GameActionLogVisibility.OwnerOnly));
    }

    private static Dictionary<string, string> CreateCardMetadata(string instanceId, string displayName)
    {
        return new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["cardInstanceId"] = instanceId,
            ["displayName"] = displayName,
            ["phase"] = nameof(GamePhase.MainPhase),
            ["turnNumber"] = "2",
        };
    }

    private static GameInstance CreateGame()
    {
        return new GameInstance(new GameState
        {
            GameId = "game-action-log-1",
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
                    Type = CardType.Leader,
                    Color = CardColor.Blue,
                    Traits = ["Leader"],
                    Life = 5,
                    RecoveryEffect = "Recover 1",
                },
            },
            Players =
            [
                new PlayerState { PlayerId = "p1", LeaderCardInstance = CreateLeader("p1") },
                new PlayerState { PlayerId = "p2", LeaderCardInstance = CreateLeader("p2") },
            ],
        });
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
