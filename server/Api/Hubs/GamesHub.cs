using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using ProjectHiddenVillage.Server.Api.Interfaces.Chat;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Hubs;

[Authorize]
public sealed partial class GamesHub : Hub
{
    private readonly IGameInstanceService gameInstanceService;
    private readonly IGamePhaseHandlingService gamePhaseHandlingService;
    private readonly IGameRedoHandlingService gameRedoHandlingService;
    private readonly IGameReadService gameReadService;
    private readonly IGamePresenceTracker gamePresenceTracker;
    private readonly IGameChatStore gameChatStore;
    private readonly ILogger<GamesHub> logger;

    public GamesHub(
        IGameInstanceService gameInstanceService,
        IGamePhaseHandlingService gamePhaseHandlingService,
        IGameRedoHandlingService gameRedoHandlingService,
        IGameReadService gameReadService,
        IGamePresenceTracker gamePresenceTracker,
        IGameChatStore gameChatStore,
        ILogger<GamesHub> logger)
    {
        this.gameInstanceService = gameInstanceService;
        this.gamePhaseHandlingService = gamePhaseHandlingService;
        this.gameRedoHandlingService = gameRedoHandlingService;
        this.gameReadService = gameReadService;
        this.gamePresenceTracker = gamePresenceTracker;
        this.gameChatStore = gameChatStore;
        this.logger = logger;
    }
}
