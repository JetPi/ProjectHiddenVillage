using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Hubs;

[Authorize]
public sealed partial class GamesHub : Hub
{
    private readonly IGameInstanceService gameInstanceService;
    private readonly IGamePhaseHandlingService gamePhaseHandlingService;
    private readonly IGameReadService gameReadService;
    private readonly IGamePresenceTracker gamePresenceTracker;
    private readonly ILogger<GamesHub> logger;

    public GamesHub(
        IGameInstanceService gameInstanceService,
        IGamePhaseHandlingService gamePhaseHandlingService,
        IGameReadService gameReadService,
        IGamePresenceTracker gamePresenceTracker,
        ILogger<GamesHub> logger)
    {
        this.gameInstanceService = gameInstanceService;
        this.gamePhaseHandlingService = gamePhaseHandlingService;
        this.gameReadService = gameReadService;
        this.gamePresenceTracker = gamePresenceTracker;
        this.logger = logger;
    }
}
