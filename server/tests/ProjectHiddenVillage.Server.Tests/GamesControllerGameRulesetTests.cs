using ErrorOr;
using Microsoft.AspNetCore.Mvc;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// The endpoint a player hits while typing a code, before they are a player of that game: it has to name the format
/// for a bound game, stay quiet for an unbound one, and answer not-found rather than pretending a format exists.
/// </summary>
[TestClass]
public sealed class GamesControllerGameRulesetTests
{
    private static readonly GameRulesetBinding Binding = new(
        Guid.Parse("20000000-0000-0000-0000-0000000000e3"),
        "e2e-format",
        "E2E Format",
        GameClockPolicy.Standard);

    [TestMethod]
    public void GetGameRuleset_ReturnsTheBinding_ForABoundGame()
    {
        var controller = BuildController(BuildGame(Binding));

        var response = controller.GetGameRuleset("ABCDE");

        var ok = response.Result as OkObjectResult;
        Assert.IsNotNull(ok);
        var payload = ok.Value as GameRulesetBindingResponse;
        Assert.IsNotNull(payload);
        Assert.AreEqual(Binding.Id.ToString(), payload.Id);
        Assert.AreEqual("e2e-format", payload.Key);
        Assert.AreEqual("E2E Format", payload.Name);
    }

    [TestMethod]
    public void GetGameRuleset_ReturnsNull_ForAnUnboundGame()
    {
        var controller = BuildController(BuildGame(binding: null));

        var response = controller.GetGameRuleset("ABCDE");

        var ok = response.Result as OkObjectResult;
        Assert.IsNotNull(ok);
        Assert.IsNull(ok.Value, "An unbound game has no format to judge a deck against.");
    }

    [TestMethod]
    public void GetGameRuleset_ReturnsNotFound_ForACodeWithNoGame()
    {
        var controller = BuildController(
            Error.NotFound(code: "Game.NotFound", description: "Game instance 'ZZZZZ' was not found."));

        var response = controller.GetGameRuleset("ZZZZZ");

        Assert.IsInstanceOfType<NotFoundObjectResult>(response.Result);
    }

    private static GamesController BuildController(ErrorOr<GameInstance> game)
    {
        return new GamesController(new StubGameReadService(game), new StubGameInstanceService());
    }

    private static ErrorOr<GameInstance> BuildGame(GameRulesetBinding? binding)
    {
        return new GameInstance(new GameState
        {
            GameId = "ABCDE",
            CardDefinitions = new Dictionary<string, Card>(StringComparer.Ordinal)
        })
        {
            Ruleset = binding
        };
    }

    private sealed class StubGameReadService(ErrorOr<GameInstance> game) : IGameReadService
    {
        public Task<ErrorOr<List<CardCatalogItemResponse>>> GetCardDataForGame(string gameCode)
        {
            throw new NotImplementedException();
        }

        public ErrorOr<GameState> GetCurrentGameState(string gameCode)
        {
            throw new NotImplementedException();
        }

        public Task<ErrorOr<ResolvedPlayerDeck>> ResolvePlayerDeckData(Guid userId, Guid deckId, string operationName)
        {
            throw new NotImplementedException();
        }

        public ErrorOr<GameInstance> GetById(string gameCode)
        {
            return game;
        }
    }

    private sealed class StubGameInstanceService : IGameInstanceService
    {
        public Task<ErrorOr<GameInstance>> CreateGameForUser(CreateGameForUserRequest request)
        {
            throw new NotImplementedException();
        }

        public Task<ErrorOr<GameInstance>> CreateGameForUser(CreateGameForUserRequest request, string? preferredGameCode)
        {
            throw new NotImplementedException();
        }

        public Task<ErrorOr<GameInstance>> JoinGameForUser(string gameCode, JoinGameAsPlayer request)
        {
            throw new NotImplementedException();
        }
    }
}
