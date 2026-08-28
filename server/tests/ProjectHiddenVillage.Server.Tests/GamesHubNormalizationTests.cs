using System.Security.Claims;
using ErrorOr;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.SignalR;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Hubs;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class GamesHubNormalizationTests
{
    [TestMethod]
    public async Task SubscribeToGame_NormalizesGameIdBeforeAuthorizationAndGroupSubscription()
    {
        var requesterUserId = Guid.NewGuid();
        const string canonicalGameId = "ABCDE";

        var game = CreateGameInstance(canonicalGameId, requesterUserId.ToString("N"));
        var gameReadService = new StubGameReadService(canonicalGameId, game);

        var hub = CreateHub(
            requesterUserId,
            new StubGameInstanceService(),
            new StubGamePhaseHandlingService(),
            gameReadService);

        await hub.Hub.SubscribeToGame("abcde");

        Assert.AreEqual(canonicalGameId, gameReadService.LastGetByIdInput);
        Assert.AreEqual(canonicalGameId, hub.GroupsRecorder.AddedGroups.Single());
    }

    [TestMethod]
    public async Task JoinGame_EmitsParticipantJoinedAndInvalidated_OnNormalizedGroup()
    {
        var requesterUserId = Guid.NewGuid();
        var otherPlayerId = Guid.NewGuid().ToString("N");
        const string canonicalGameId = "ABCDE";

        var joinResultGame = CreateGameInstance(canonicalGameId, requesterUserId.ToString("N"), otherPlayerId);

        var instanceService = new StubGameInstanceService
        {
            JoinHandler = (_, _) => Task.FromResult<ErrorOr<GameInstance>>(joinResultGame)
        };

        var hub = CreateHub(
            requesterUserId,
            instanceService,
            new StubGamePhaseHandlingService(),
            new StubGameReadService(canonicalGameId, joinResultGame));

        var result = await hub.Hub.JoinGame("abcde", new JoinGameAsPlayer(requesterUserId, DeckId: null));

        Assert.IsTrue(result.Succeeded);
        Assert.AreEqual(canonicalGameId, hub.GroupsRecorder.AddedGroups.Single());

        var messages = hub.ClientsRecorder.GetGroupMessages(canonicalGameId);
        Assert.AreEqual(2, messages.Count);
        Assert.AreEqual("GameStateInvalidated", messages[0].Method);
        Assert.AreEqual(canonicalGameId, (string)messages[0].Args[0]);
        Assert.AreEqual("GameParticipantJoined", messages[1].Method);
        Assert.AreEqual(canonicalGameId, (string)messages[1].Args[0]);
    }

    private static HubFixture CreateHub(
        Guid requesterUserId,
        IGameInstanceService instanceService,
        IGamePhaseHandlingService phaseHandlingService,
        IGameReadService gameReadService)
    {
        var groupsRecorder = new RecordingGroupManager();
        var clientsRecorder = new RecordingHubCallerClients();
        var hub = new GamesHub(instanceService, phaseHandlingService, gameReadService)
        {
            Context = new TestHubCallerContext(requesterUserId),
            Groups = groupsRecorder,
            Clients = clientsRecorder,
        };

        return new HubFixture(hub, groupsRecorder, clientsRecorder);
    }

    private static GameInstance CreateGameInstance(string gameId, string playerOneId, string? playerTwoId = null)
    {
        var players = new List<PlayerState>
        {
            new()
            {
                PlayerId = playerOneId,
                LeaderCardInstance = CreateLeader(playerOneId),
            }
        };

        if (!string.IsNullOrWhiteSpace(playerTwoId))
        {
            players.Add(new PlayerState
            {
                PlayerId = playerTwoId,
                LeaderCardInstance = CreateLeader(playerTwoId),
            });
        }

        var state = new GameState
        {
            GameId = gameId,
            TurnNumber = 1,
            Phase = GamePhase.MainPhase,
            CardDefinitions = BuildCardDefinitions(),
            Players = players,
        };

        return new GameInstance(state);
    }

    private static LeaderCardInstanceState CreateLeader(string playerId)
    {
        return new LeaderCardInstanceState
        {
            InstanceId = $"leader-{playerId}",
            CardDefinitionId = "leader-1",
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

    private static Dictionary<string, Card> BuildCardDefinitions()
    {
        return new Dictionary<string, Card>(StringComparer.Ordinal)
        {
            ["leader-1"] = new LeaderCard
            {
                Id = "leader-1",
                DisplayName = "Leader",
                Name = ["Leader"],
                Type = CardType.Leader,
                Color = CardColor.Blue,
                Traits = ["Leader"],
                Life = 5,
                RecoveryEffect = "Recover 1",
            }
        };
    }

    private sealed record HubFixture(
        GamesHub Hub,
        RecordingGroupManager GroupsRecorder,
        RecordingHubCallerClients ClientsRecorder);

    private sealed class StubGameReadService(string gameId, GameInstance gameInstance) : IGameReadService
    {
        public string LastGetByIdInput { get; private set; } = string.Empty;

        public Task<ErrorOr<List<CardCatalogItemResponse>>> GetCardDataForGame(string gameCode)
            => throw new NotImplementedException();

        public ErrorOr<GameState> GetCurrentGameState(string gameCode)
            => throw new NotImplementedException();

        public Task<ErrorOr<ResolvedPlayerDeck>> ResolvePlayerDeckData(Guid userId, Guid deckId, string operationName)
            => throw new NotImplementedException();

        public ErrorOr<GameInstance> GetById(string gameCode)
        {
            LastGetByIdInput = gameCode;

            if (string.Equals(gameCode, gameId, StringComparison.Ordinal))
            {
                return gameInstance;
            }

            return Error.NotFound(code: "Game.NotFound", description: "Not found");
        }
    }

    private sealed class StubGameInstanceService : IGameInstanceService
    {
        public Func<string, JoinGameAsPlayer, Task<ErrorOr<GameInstance>>>? JoinHandler { get; init; }

        public Task<ErrorOr<GameInstance>> CreateGameForUser(CreateGameForUserRequest request)
            => throw new NotImplementedException();

        public Task<ErrorOr<GameInstance>> CreateGameForUser(CreateGameForUserRequest request, string? preferredGameCode)
            => throw new NotImplementedException();

        public Task<ErrorOr<GameInstance>> JoinGameForUser(string gameCode, JoinGameAsPlayer request)
            => JoinHandler?.Invoke(gameCode, request)
               ?? throw new InvalidOperationException("JoinHandler not configured.");
    }

    private sealed class StubGamePhaseHandlingService : IGamePhaseHandlingService
    {
        public ErrorOr<GameInstance> ResolvePrompt(string gameId, ResolvePromptRequest request)
            => throw new NotImplementedException();

        public ErrorOr<GameInstance> AdvancePhase(string gameId)
            => throw new NotImplementedException();

        public ErrorOr<GameInstance> DeclarePassInActionStep(string gameId, PlayerPhaseActionRequest request)
            => throw new NotImplementedException();

        public ErrorOr<GameInstance> DeclareActionInActionStep(string gameId, PlayerPhaseActionRequest request)
            => throw new NotImplementedException();

        public ErrorOr<GameInstance> ExecuteCardAction(string gameId, GameCardActionExecutionRequest request)
            => throw new NotImplementedException();

        public ErrorOr<GameCardActionTargetsResponse> GetCardActionTargets(string gameId, GameCardActionTargetsRequest request)
            => throw new NotImplementedException();

        public ErrorOr<GameInstance> DeclareEndStep(string gameId)
            => throw new NotImplementedException();

        public ErrorOr<GameInstance> CompleteEndStep(string gameId)
            => throw new NotImplementedException();
    }

    private sealed class TestHubCallerContext(Guid requesterUserId) : HubCallerContext
    {
        private readonly ClaimsPrincipal user = new(new ClaimsIdentity(
        [
            new Claim(ClaimTypes.NameIdentifier, requesterUserId.ToString())
        ],
        authenticationType: "Test"));

        public override string ConnectionId => "test-connection";

        public override string? UserIdentifier => requesterUserId.ToString("N");

        public override ClaimsPrincipal? User => user;

        public override IDictionary<object, object?> Items { get; } = new Dictionary<object, object?>();

        public override IFeatureCollection Features { get; } = new FeatureCollection();

        public override CancellationToken ConnectionAborted => CancellationToken.None;

        public override void Abort()
        {
        }
    }

    private sealed class RecordingGroupManager : IGroupManager
    {
        public List<string> AddedGroups { get; } = [];

        public List<string> RemovedGroups { get; } = [];

        public Task AddToGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default)
        {
            AddedGroups.Add(groupName);
            return Task.CompletedTask;
        }

        public Task RemoveFromGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default)
        {
            RemovedGroups.Add(groupName);
            return Task.CompletedTask;
        }
    }

    private sealed class RecordingHubCallerClients : IHubCallerClients
    {
        private readonly RecordingClientProxy all = new();
        private readonly RecordingClientProxy caller = new();
        private readonly RecordingClientProxy others = new();
        private readonly Dictionary<string, RecordingClientProxy> groupProxies = new(StringComparer.Ordinal);

        public IReadOnlyList<(string Method, object?[] Args)> GetGroupMessages(string groupName)
        {
            if (!groupProxies.TryGetValue(groupName, out var proxy))
            {
                return [];
            }

            return proxy.Messages;
        }

        public IClientProxy All => all;

        public IClientProxy Caller => caller;

        public IClientProxy Others => others;

        public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => new RecordingClientProxy();

        public IClientProxy Client(string connectionId) => new RecordingClientProxy();

        public IClientProxy Clients(IReadOnlyList<string> connectionIds) => new RecordingClientProxy();

        public IClientProxy Group(string groupName)
        {
            if (!groupProxies.TryGetValue(groupName, out var proxy))
            {
                proxy = new RecordingClientProxy();
                groupProxies[groupName] = proxy;
            }

            return proxy;
        }

        public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds)
            => Group(groupName);

        public IClientProxy Groups(IReadOnlyList<string> groupNames) => new RecordingClientProxy();

        public IClientProxy OthersInGroup(string groupName) => Group(groupName);

        public IClientProxy User(string userId) => new RecordingClientProxy();

        public IClientProxy Users(IReadOnlyList<string> userIds) => new RecordingClientProxy();
    }

    private sealed class RecordingClientProxy : IClientProxy
    {
        public List<(string Method, object?[] Args)> Messages { get; } = [];

        public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)
        {
            Messages.Add((method, args));
            return Task.CompletedTask;
        }
    }
}
