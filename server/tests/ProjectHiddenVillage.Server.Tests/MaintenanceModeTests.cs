using ErrorOr;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;
using ProjectHiddenVillage.Server.Api.Services.Maintenance;
using ProjectHiddenVillage.Server.Api.Services.Matchmaking;
using ProjectHiddenVillage.Server.Data;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class MaintenanceModeTests
{
    private const string CustomMessage = "Back in five minutes.";

    [TestMethod]
    public void MaintenanceState_StartsOpen_UntilConfigured()
    {
        var state = CreateState();

        Assert.IsFalse(state.IsEnabled);
        Assert.IsNull(state.EnabledAtUtc);
    }

    [TestMethod]
    public void MaintenanceState_StartsClosed_WhenTheConfigurationAsksForIt()
    {
        var state = CreateState(new MaintenanceOptions { Enabled = true, Message = "Deploying." });

        Assert.IsTrue(state.IsEnabled);
        Assert.AreEqual("Deploying.", state.Message);
        Assert.IsNotNull(state.EnabledAtUtc);
    }

    [TestMethod]
    public void MaintenanceState_PrefersTheRequestedMessage_AndFallsBackWhenBlank()
    {
        var state = CreateState();

        state.Enable(CustomMessage);
        Assert.AreEqual(CustomMessage, state.Message);

        state.Enable("   ");
        Assert.AreEqual(new MaintenanceOptions().Message, state.Message);
    }

    [TestMethod]
    public void MaintenanceState_Disable_ClearsTheStartTime()
    {
        var state = CreateState();

        state.Enable(CustomMessage);
        state.Disable();

        Assert.IsFalse(state.IsEnabled);
        Assert.IsNull(state.EnabledAtUtc);
    }

    [TestMethod]
    public void MaintenanceGate_ReturnsNoErrorWhileOpen()
    {
        Assert.IsNull(MaintenanceGate.BlockedError(CreateState()));
        Assert.IsNull(MaintenanceGate.BlockedError(null));
    }

    [TestMethod]
    public void MaintenanceGate_ReturnsA503CarryingTheMessage()
    {
        var state = CreateState();
        state.Enable(CustomMessage);

        var error = MaintenanceGate.BlockedError(state);

        Assert.IsNotNull(error);
        Assert.AreEqual((ErrorType)MaintenanceGate.StatusCode, error.Value.Type);
        Assert.AreEqual(MaintenanceGate.ErrorCode, error.Value.Code);
        Assert.AreEqual(CustomMessage, error.Value.Description);
    }

    [TestMethod]
    public async Task CreateGameForUser_IsRefusedWhileMaintenanceIsOn()
    {
        var registry = CreateRegistry();
        var state = CreateState();
        state.Enable(CustomMessage);

        var service = new GameInstanceService(
            registry,
            new UnusedGameReadService(),
            maintenanceState: state);

        var result = await service.CreateGameForUser(new CreateGameForUserRequest(Guid.NewGuid(), Guid.NewGuid()));

        Assert.IsTrue(result.IsError);
        Assert.AreEqual(MaintenanceGate.ErrorCode, result.FirstError.Code);
        Assert.AreEqual(0, registry.Snapshot().Count);
    }

    [TestMethod]
    public async Task Enqueue_IsRefusedWhileMaintenanceIsOn()
    {
        var state = CreateState();
        state.Enable(CustomMessage);

        var matchmaking = new MatchmakingService(
            CreateRegistry(),
            new UnusedGameReadService(),
            new DeckRulesetService(CreateDbContext()),
            new GameRulesetDeckValidator(),
            new MatchmakingQueue(),
            Options.Create(new MatchmakingOptions()),
            TimeProvider.System,
            maintenanceState: state);

        var result = await matchmaking.EnqueueAsync(
            new EnqueueMatchRequest(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid()));

        Assert.IsTrue(result.IsError);
        Assert.AreEqual(MaintenanceGate.ErrorCode, result.FirstError.Code);
    }

    [TestMethod]
    public void MaintenanceReporter_CountsOnlyTablesThatAreStillInPlay()
    {
        var registry = CreateRegistry();
        var definitions = BuildDefinitions();
        registry.Create(
            [BuildPlayer("p1"), BuildPlayer("p2")],
            definitions,
            preferredGameCode: null);
        registry.Create([BuildPlayer("p3")], definitions, preferredGameCode: null);

        var reporter = CreateReporter(registry, CreateState());

        var snapshot = reporter.GetSnapshot();

        Assert.AreEqual(1, snapshot.ActiveGames);
        Assert.AreEqual(0, snapshot.WaitingPlayers);
        Assert.IsFalse(snapshot.IsDrained);
    }

    [TestMethod]
    public void MaintenanceReporter_IsDrained_WhenNothingIsRunning()
    {
        var reporter = CreateReporter(CreateRegistry(), CreateState());

        var snapshot = reporter.GetSnapshot();

        Assert.IsTrue(snapshot.IsDrained);
        Assert.IsFalse(snapshot.Enabled);
    }

    private static MaintenanceState CreateState(MaintenanceOptions? options = null)
    {
        return new MaintenanceState(
            Options.Create(options ?? new MaintenanceOptions()),
            TimeProvider.System);
    }

    private static MaintenanceReporter CreateReporter(
        InMemoryGameInstanceRegistry registry,
        MaintenanceState state)
    {
        return new MaintenanceReporter(
            state,
            registry,
            new MatchmakingQueue(),
            Options.Create(new MatchmakingOptions()),
            TimeProvider.System);
    }

    private static InMemoryGameInstanceRegistry CreateRegistry()
    {
        return new InMemoryGameInstanceRegistry(
            new GameInstanceFactory(),
            new global::ProjectHiddenVillage.Server.Engine.GamePhaseService(
                new global::ProjectHiddenVillage.Server.Engine.GamePhaseStateService()));
    }

    private static Player BuildPlayer(string playerId)
    {
        return new Player
        {
            Id = playerId,
            Name = playerId,
            DisplayName = playerId,
            Deck = ["c1"],
        };
    }

    private static Dictionary<string, Card> BuildDefinitions()
    {
        return new Dictionary<string, Card>(StringComparer.Ordinal)
        {
            ["c1"] = new Card
            {
                Id = "c1",
                DisplayName = "c1",
                Name = ["c1"],
                Type = CardType.Character,
                Traits = [],
                Color = CardColor.Red,
                Description = string.Empty,
                Conditions = [],
                Effects = [],
            },
        };
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var builderOptions = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"maintenance-mode-tests-{Guid.NewGuid()}")
            .Options;

        return new ApplicationDbContext(builderOptions);
    }

    private sealed class UnusedGameReadService : IGameReadService
    {
        public Task<ErrorOr<List<CardCatalogItemResponse>>> GetCardDataForGame(string gameCode)
            => throw new NotSupportedException("Maintenance refuses the request before any read.");

        public ErrorOr<GameState> GetCurrentGameState(string gameCode)
            => throw new NotSupportedException("Maintenance refuses the request before any read.");

        public Task<ErrorOr<ResolvedPlayerDeck>> ResolvePlayerDeckData(Guid userId, Guid deckId, string operationName)
            => throw new NotSupportedException("Maintenance refuses the request before any read.");

        public ErrorOr<GameInstance> GetById(string gameCode)
            => throw new NotSupportedException("Maintenance refuses the request before any read.");
    }
}
