using ErrorOr;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using System.Security.Claims;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class GamesControllerStateVisibilityTests
{
    [TestMethod]
    public void GetCurrentGameState_HidesOpponentPrivateZones()
    {
        var requesterId = Guid.NewGuid();
        var opponentId = Guid.NewGuid();

        var requesterPlayerId = requesterId.ToString("N");
        var opponentPlayerId = opponentId.ToString("N");

        var gameState = new GameState
        {
            GameId = "ABCDE",
            Players =
            [
                new PlayerState
                {
                    PlayerId = requesterPlayerId,
                    Deck = [CreateCard("r-deck", requesterPlayerId)],
                    Hand = [CreateCard("r-hand", requesterPlayerId)],
                    Battlefield = [CreateCard("r-field", requesterPlayerId)]
                },
                new PlayerState
                {
                    PlayerId = opponentPlayerId,
                    Deck = [CreateCard("o-deck", opponentPlayerId)],
                    Hand = [CreateCard("o-hand", opponentPlayerId)],
                    Battlefield = [CreateCard("o-field", opponentPlayerId)]
                }
            ]
        };

        var controller = BuildController(new StubGameReadService(gameState));
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = CreateHttpContextWithSub(requesterId.ToString())
        };

        var response = controller.GetCurrentGameState("ABCDE");

        var ok = response.Result as OkObjectResult;
        Assert.IsNotNull(ok);
        var payload = ok.Value as GameStateResponse;
        Assert.IsNotNull(payload);

        var self = payload.Players.Single(player => player.PlayerId == requesterPlayerId);
        var opponent = payload.Players.Single(player => player.PlayerId == opponentPlayerId);

        Assert.AreEqual(1, self.Deck.Count);
        Assert.AreEqual(1, self.Hand.Count);
        Assert.AreEqual(1, self.DeckCount);
        Assert.AreEqual(1, self.HandCount);

        Assert.AreEqual(0, opponent.Deck.Count);
        Assert.AreEqual(0, opponent.Hand.Count);
        Assert.AreEqual(1, opponent.DeckCount);
        Assert.AreEqual(1, opponent.HandCount);
        Assert.AreEqual(1, opponent.CharacterField.Count);
    }

    [TestMethod]
    public void GetCurrentGameState_ReturnsUnauthorized_WhenUserClaimMissing()
    {
        var controller = BuildController(new StubGameReadService(new GameState { GameId = "ABCDE" }));
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity())
            }
        };

        var response = controller.GetCurrentGameState("ABCDE");

        Assert.IsInstanceOfType<UnauthorizedObjectResult>(response.Result);
    }

    [TestMethod]
    public void GetCurrentGameState_ReturnsUnauthorized_WhenUserNotInGame()
    {
        var requesterId = Guid.NewGuid();

        var gameState = new GameState
        {
            GameId = "ABCDE",
            Players =
            [
                new PlayerState { PlayerId = Guid.NewGuid().ToString("N") }
            ]
        };

        var controller = BuildController(new StubGameReadService(gameState));
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = CreateHttpContextWithSub(requesterId.ToString())
        };

        var response = controller.GetCurrentGameState("ABCDE");

        Assert.IsInstanceOfType<UnauthorizedObjectResult>(response.Result);
    }

    private static GamesController BuildController(IGameReadService readService)
    {
        return new GamesController(readService);
    }

    private static DefaultHttpContext CreateHttpContextWithSub(string sub)
    {
        var context = new DefaultHttpContext();
        context.User = new ClaimsPrincipal(
            new ClaimsIdentity(
            [
                new Claim("sub", sub)
            ],
            authenticationType: "Bearer"));

        return context;
    }

    private static CardInstance CreateCard(string instanceId, string playerId)
    {
        return new CardInstance
        {
            InstanceId = instanceId,
            CardDefinitionId = "card-1",
            OwnerPlayerId = playerId,
            ControllerPlayerId = playerId
        };
    }

    private sealed class StubGameReadService(GameState gameState) : IGameReadService
    {
        public Task<ErrorOr<List<CardCatalogItemResponse>>> GetCardDataForGame(string gameCode)
        {
            throw new NotImplementedException();
        }

        public ErrorOr<GameState> GetCurrentGameState(string gameCode)
        {
            return gameState;
        }

        public Task<ErrorOr<ResolvedPlayerDeck>> ResolvePlayerDeckData(Guid userId, Guid deckId, string operationName)
        {
            throw new NotImplementedException();
        }

        public ErrorOr<GameInstance> GetById(string gameCode)
        {
            throw new NotImplementedException();
        }
    }

}
