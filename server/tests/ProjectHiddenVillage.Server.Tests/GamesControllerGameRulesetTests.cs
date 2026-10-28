using ErrorOr;
using Microsoft.AspNetCore.Mvc;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Rematch;

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

    [TestMethod]
    public void GetGameRuleset_AnswersAReservedRematchCode_FromItsReservation()
    {
        // A rematch table exists as a reserved code before anybody is seated in it. The join form has to be able to
        // judge a deck against that format, or the player would have to claim the table blind.
        var controller = BuildController(
            Error.NotFound(code: "Game.NotFound", description: "no table yet"),
            BuildReservation(Binding));

        var response = controller.GetGameRuleset("ABCDE");

        var ok = response.Result as OkObjectResult;
        Assert.IsNotNull(ok);
        var payload = ok.Value as GameRulesetBindingResponse;
        Assert.IsNotNull(payload);
        Assert.AreEqual("e2e-format", payload.Key);
    }

    [TestMethod]
    public void GetGameRuleset_ReturnsNull_ForAReservedUnboundTable()
    {
        var controller = BuildController(
            Error.NotFound(code: "Game.NotFound", description: "no table yet"),
            BuildReservation(binding: null));

        var response = controller.GetGameRuleset("ABCDE");

        var ok = response.Result as OkObjectResult;
        Assert.IsNotNull(ok);
        Assert.IsNull(ok.Value);
    }

    [TestMethod]
    public void GetGameRuleset_ReturnsNotFound_ForAnExpiredReservation()
    {
        var controller = BuildController(
            Error.NotFound(code: "Game.NotFound", description: "no table yet"),
            Error.Validation(code: "Game.Rematch.Expired", description: "expired"));

        var response = controller.GetGameRuleset("ABCDE");

        Assert.IsInstanceOfType<NotFoundObjectResult>(response.Result);
    }

    private static RematchReservation BuildReservation(GameRulesetBinding? binding)
    {
        return new RematchReservation
        {
            Code = "ABCDE",
            SourceGameId = "FGHIJ",
            Ruleset = binding,
            PlayerIds = ["p1", "p2"],
            ExpiresAtUtc = DateTimeOffset.UnixEpoch.AddMinutes(10),
        };
    }

    private static GamesController BuildController(
        ErrorOr<GameInstance> game,
        ErrorOr<RematchReservation>? reservation = null)
    {
        return new GamesController(
            new StubGameReadService(game),
            new StubGameInstanceService(),
            rematchHandlingService: new StubRematchHandlingService(reservation));
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

    private sealed class StubRematchHandlingService(ErrorOr<RematchReservation>? reservation) : IRematchHandlingService
    {
        public ErrorOr<GameInstance> RequestRematch(string gameId, string playerId)
        {
            throw new NotImplementedException();
        }

        public ErrorOr<GameInstance> AcceptRematch(string gameId, string playerId)
        {
            throw new NotImplementedException();
        }

        public ErrorOr<GameInstance> DeclineRematch(string gameId, string playerId)
        {
            throw new NotImplementedException();
        }

        public ErrorOr<RematchReservation> GetActiveReservation(string gameCode)
        {
            return reservation
                ?? Error.NotFound(code: "Game.Rematch.NotFound", description: "stub");
        }

        public void CompleteReservation(string gameCode)
        {
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
