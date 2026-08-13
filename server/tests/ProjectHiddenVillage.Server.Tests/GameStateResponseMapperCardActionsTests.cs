using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class GameStateResponseMapperCardActionsTests
{
    [TestMethod]
    public void ToGameStateResponse_MapsCardActions_ForRequestingPlayerZones()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var requesterHandCard = CreateCardInstance("hand-1", "card-hand", requesterId);
        var requesterSupportCard = CreateCardInstance("support-1", "card-support", requesterId);
        var requesterBattleCard = CreateCardInstance("battle-1", "card-battle", requesterId);

        var state = BuildState(
            requesterId,
            opponentId,
            handCards: [requesterHandCard],
            supportCards: [requesterSupportCard],
            battlefieldCards: [requesterBattleCard]);

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);

        Assert.AreEqual(1, requester.Hand[0].AvailableActions.Count);
        Assert.AreEqual("play-card:hand-1", requester.Hand[0].AvailableActions[0].ActionId);

        Assert.AreEqual(1, requester.SupportZone[0].AvailableActions.Count);
        Assert.AreEqual("activate-support:support-1", requester.SupportZone[0].AvailableActions[0].ActionId);

        Assert.AreEqual(1, requester.CharacterField[0].AvailableActions.Count);
        Assert.AreEqual("battle-action:battle-1", requester.CharacterField[0].AvailableActions[0].ActionId);
    }

    [TestMethod]
    public void ToGameStateResponse_DoesNotMapCardActions_ForOpponentZones()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var opponentSupportCard = CreateCardInstance("support-opponent", "card-support", opponentId);
        var opponentBattleCard = CreateCardInstance("battle-opponent", "card-battle", opponentId);

        var state = BuildState(
            requesterId,
            opponentId,
            opponentSupportCards: [opponentSupportCard],
            opponentBattlefieldCards: [opponentBattleCard]);

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var opponent = response.Players.Single(player => player.PlayerId == opponentId);

        Assert.AreEqual(0, opponent.SupportZone[0].AvailableActions.Count);
        Assert.AreEqual(0, opponent.CharacterField[0].AvailableActions.Count);
    }

    [TestMethod]
    public void ToGameStateResponse_DoesNotMapCardActions_WhilePromptIsPending()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var requesterHandCard = CreateCardInstance("hand-1", "card-hand", requesterId);
        var state = BuildState(requesterId, opponentId, handCards: [requesterHandCard]);

        var game = new GameInstance(state);
        game.EnqueuePrompt(new GamePrompt
        {
            RequestedPlayerId = requesterId,
            Type = GamePromptType.ChooseStartingPlayer,
            Options = ["goFirst", "goSecond"]
        });

        var response = GameStateResponseMapper.ToGameStateResponse(game, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);

        Assert.AreEqual(0, requester.Hand[0].AvailableActions.Count);
    }

    private static GameState BuildState(
        string requesterId,
        string opponentId,
        List<CardInstance>? handCards = null,
        List<CardInstance>? supportCards = null,
        List<CardInstance>? battlefieldCards = null,
        List<CardInstance>? opponentSupportCards = null,
        List<CardInstance>? opponentBattlefieldCards = null)
    {
        return new GameState
        {
            GameId = "ABCDE",
            Phase = GamePhase.ActionStep,
            ActivePlayerId = requesterId,
            PriorityPlayerId = requesterId,
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
                    RecoveryEffect = "Recover 1"
                },
                ["card-hand"] = CreateCharacterDefinition("card-hand", "Hand Card"),
                ["card-support"] = CreateCharacterDefinition("card-support", "Support Card"),
                ["card-battle"] = CreateCharacterDefinition("card-battle", "Battle Card")
            },
            Players =
            [
                new PlayerState
                {
                    PlayerId = requesterId,
                    LeaderCardInstance = CreateLeader(requesterId),
                    Hand = handCards ?? [],
                    SupportZone = supportCards ?? [],
                    Battlefield = battlefieldCards ?? []
                },
                new PlayerState
                {
                    PlayerId = opponentId,
                    LeaderCardInstance = CreateLeader(opponentId),
                    SupportZone = opponentSupportCards ?? [],
                    Battlefield = opponentBattlefieldCards ?? []
                }
            ]
        };
    }

    private static CardInstance CreateCardInstance(string instanceId, string definitionId, string playerId)
    {
        return new CardInstance
        {
            InstanceId = instanceId,
            CardDefinitionId = definitionId,
            OwnerPlayerId = playerId,
            ControllerPlayerId = playerId,
            IsExhausted = false
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
            RecoveryEffect = "Recover 1"
        };
    }

    private static CharacterCard CreateCharacterDefinition(string id, string displayName)
    {
        return new CharacterCard
        {
            Id = id,
            DisplayName = displayName,
            Name = [displayName],
            Traits = ["Trait"],
            Type = CardType.Character,
            Color = CardColor.Blue,
            Health = 3,
            Damage = 1,
            Power = 2
        };
    }
}