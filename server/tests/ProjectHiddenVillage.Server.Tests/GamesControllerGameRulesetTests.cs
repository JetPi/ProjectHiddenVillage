using System.Security.Claims;
using ErrorOr;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Deck;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Rematch;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// The endpoint a player hits while typing a code, before they are a player of that game: it has to name the format
/// for a bound game, stay quiet for an unbound one, and answer not-found rather than pretending a format exists.
///
/// It is also the check the login view makes when it comes back with a reserved rematch code, so it answers the
/// reservation while the table is still only reserved - and it has to be honest about a rematch that stopped being
/// feasible instead of naming a format that would only be refused on the claim.
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
    public async Task GetGameRuleset_ReturnsTheBinding_ForABoundGame()
    {
        var controller = BuildController(BuildGame(Binding));

        var response = await controller.GetGameRuleset("ABCDE");

        var ok = response.Result as OkObjectResult;
        Assert.IsNotNull(ok);
        var payload = ok.Value as GameRulesetBindingResponse;
        Assert.IsNotNull(payload);
        Assert.AreEqual(Binding.Id.ToString(), payload.Id);
        Assert.AreEqual("e2e-format", payload.Key);
        Assert.AreEqual("E2E Format", payload.Name);
    }

    [TestMethod]
    public async Task GetGameRuleset_ReturnsNull_ForAnUnboundGame()
    {
        var controller = BuildController(BuildGame(binding: null));

        var response = await controller.GetGameRuleset("ABCDE");

        var ok = response.Result as OkObjectResult;
        Assert.IsNotNull(ok);
        Assert.IsNull(ok.Value, "An unbound game has no format to judge a deck against.");
    }

    [TestMethod]
    public async Task GetGameRuleset_ReturnsNotFound_ForACodeWithNoGame()
    {
        var controller = BuildController(
            Error.NotFound(code: "Game.NotFound", description: "Game instance 'ZZZZZ' was not found."));

        var response = await controller.GetGameRuleset("ZZZZZ");

        Assert.IsInstanceOfType<NotFoundObjectResult>(response.Result);
    }

    [TestMethod]
    public async Task GetGameRuleset_AnswersAReservedRematchCode_FromItsReservation()
    {
        // A rematch table exists as a reserved code before anybody is seated in it. The join form has to be able to
        // judge a deck against that format, or the player would have to claim the table blind.
        var controller = BuildController(
            Error.NotFound(code: "Game.NotFound", description: "no table yet"),
            rematch: new StubRematchHandlingService { Reservation = BuildReservation(Binding) });

        var response = await controller.GetGameRuleset("ABCDE");

        var ok = response.Result as OkObjectResult;
        Assert.IsNotNull(ok);
        var payload = ok.Value as GameRulesetBindingResponse;
        Assert.IsNotNull(payload);
        Assert.AreEqual("e2e-format", payload.Key);
    }

    [TestMethod]
    public async Task GetGameRuleset_ReturnsNull_ForAReservedUnboundTable()
    {
        var controller = BuildController(
            Error.NotFound(code: "Game.NotFound", description: "no table yet"),
            rematch: new StubRematchHandlingService { Reservation = BuildReservation(binding: null) });

        var response = await controller.GetGameRuleset("ABCDE");

        var ok = response.Result as OkObjectResult;
        Assert.IsNotNull(ok);
        Assert.IsNull(ok.Value);
    }

    [TestMethod]
    public async Task GetGameRuleset_AnswersTheReleasedError_WhenTheOtherPlayerLeft()
    {
        // The banner is cleared on this answer rather than on a claim, so the player is not left pressing Join on
        // a table nobody is coming back to.
        var controller = BuildController(
            Error.NotFound(code: "Game.NotFound", description: "no table yet"),
            rematch: new StubRematchHandlingService
            {
                Reservation = Error.Validation(
                    code: "Game.Rematch.Released",
                    description: "The other player left."),
            });

        var response = await controller.GetGameRuleset("ABCDE");

        Assert.IsInstanceOfType<BadRequestObjectResult>(response.Result);
    }

    [TestMethod]
    public async Task GetGameRuleset_AnswersRulesetUnavailable_WhenTheFormatWasDeactivated()
    {
        // The reservation snapshots the binding, so the snapshot alone would happily name a format that no longer
        // exists. The live definition is what decides.
        var controller = BuildController(
            Error.NotFound(code: "Game.NotFound", description: "no table yet"),
            rematch: new StubRematchHandlingService { Reservation = BuildReservation(Binding) },
            rulesets: new StubDeckRulesetService(
                Error.NotFound(code: "DeckRuleset.NotFound", description: "gone")));

        var response = await controller.GetGameRuleset("ABCDE");

        Assert.IsInstanceOfType<BadRequestObjectResult>(response.Result);
    }

    [TestMethod]
    public void ReleaseRematch_ReleasesTheReservation_ForASeat()
    {
        var playerId = Guid.NewGuid();
        var rematch = new StubRematchHandlingService { ReleaseResult = Result.Success };
        var controller = BuildController(
            Error.NotFound(code: "Game.NotFound", description: "no table yet"),
            rematch: rematch);
        Authenticate(controller, playerId);

        var response = controller.ReleaseRematch("ABCDE");

        Assert.IsInstanceOfType<NoContentResult>(response.Result);
        Assert.AreEqual(1, rematch.ReleaseCalls.Count);
        Assert.AreEqual("ABCDE", rematch.ReleaseCalls[0].Code);
        Assert.AreEqual(playerId.ToString("N"), rematch.ReleaseCalls[0].PlayerId);
    }

    [TestMethod]
    public void ReleaseRematch_IsUnauthorized_ForANonSeat()
    {
        var controller = BuildController(
            Error.NotFound(code: "Game.NotFound", description: "no table yet"),
            rematch: new StubRematchHandlingService
            {
                ReleaseResult = Error.Unauthorized(
                    code: "Game.Rematch.Forbidden",
                    description: "This rematch table is reserved for the two players of the previous match."),
            });
        Authenticate(controller, Guid.NewGuid());

        var response = controller.ReleaseRematch("ABCDE");

        Assert.IsInstanceOfType<UnauthorizedObjectResult>(response.Result);
    }

    [TestMethod]
    public void ReleaseRematch_ReturnsNotFound_ForAnUnknownCode()
    {
        var controller = BuildController(
            Error.NotFound(code: "Game.NotFound", description: "no table yet"),
            rematch: new StubRematchHandlingService
            {
                ReleaseResult = Error.NotFound(code: "Game.Rematch.NotFound", description: "gone"),
            });
        Authenticate(controller, Guid.NewGuid());

        var response = controller.ReleaseRematch("ZZZZZ");

        Assert.IsInstanceOfType<NotFoundObjectResult>(response.Result);
    }

    private static void Authenticate(GamesController controller, Guid userId)
    {
        var identity = new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, userId.ToString("D"))],
            authenticationType: "test");

        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(identity) },
        };
    }

    private static RematchReservation BuildReservation(GameRulesetBinding? binding)
    {
        return new RematchReservation
        {
            Code = "ABCDE",
            SourceGameId = "FGHIJ",
            Ruleset = binding,
            PlayerIds = ["p1", "p2"],
            ExpiresAtUtc = DateTimeOffset.UnixEpoch.AddMinutes(30),
        };
    }

    private static GamesController BuildController(
        ErrorOr<GameInstance> game,
        StubRematchHandlingService? rematch = null,
        IDeckRulesetService? rulesets = null)
    {
        var controller = new GamesController(
            new StubGameReadService(game),
            new StubGameInstanceService(),
            rematchHandlingService: rematch,
            deckRulesetService: rulesets);

        // Anonymous by default: the probe is reachable without an identity, and it is the identity that decides
        // whether a release can be cancelled. Tests that need a caller call Authenticate, which replaces this.
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity()) },
        };

        return controller;
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

    private sealed class StubRematchHandlingService : IRematchHandlingService
    {
        /// <summary>What the probe answers. Defaults to "no reservation", like an unknown code.</summary>
        public ErrorOr<RematchReservation> Reservation { get; init; } =
            Error.NotFound(code: "Game.Rematch.NotFound", description: "stub");

        public ErrorOr<Success> ReleaseResult { get; init; } = Result.Success;

        public List<(string Code, string PlayerId)> ReleaseCalls { get; } = [];

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

        public ErrorOr<RematchReservation> GetActiveReservation(
            string gameCode,
            string? requestingPlayerId = null,
            bool cancelsPendingRelease = false)
        {
            return Reservation;
        }

        public ErrorOr<Success> ReleaseReservation(string gameCode, string playerId)
        {
            ReleaseCalls.Add((gameCode, playerId));
            return ReleaseResult;
        }

        public IReadOnlyList<string> ReleaseReservationsForPlayer(string playerId, string? exceptGameCode = null)
        {
            return [];
        }

        public void CompleteReservation(string gameCode)
        {
        }
    }

    private sealed class StubDeckRulesetService(ErrorOr<DeckRulesetDefinition> definition) : IDeckRulesetService
    {
        public Task<ErrorOr<List<DeckRulesetResponse>>> GetRulesets(bool includeInactive = false)
        {
            throw new NotImplementedException();
        }

        public Task<ErrorOr<DeckRulesetDefinition>> GetActiveRulesetDefinition(Guid rulesetId)
        {
            return Task.FromResult(definition);
        }

        public Task<ErrorOr<DeckRulesetResponse>> CreateRuleset(CreateDeckRulesetRequest request)
        {
            throw new NotImplementedException();
        }

        public Task<ErrorOr<DeckRulesetResponse>> UpdateRuleset(string rulesetId, UpdateDeckRulesetRequest request)
        {
            throw new NotImplementedException();
        }

        public Task<ErrorOr<bool>> DeleteRuleset(string rulesetId)
        {
            throw new NotImplementedException();
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
