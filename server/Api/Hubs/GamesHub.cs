using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Hubs;

[Authorize]
public sealed partial class GamesHub : Hub
{
    private readonly IGameInstanceService gameInstanceService;
    private readonly IGamePhaseHandlingService gamePhaseHandlingService;
    private readonly IGameReadService gameReadService;

    public GamesHub(
        IGameInstanceService gameInstanceService,
        IGamePhaseHandlingService gamePhaseHandlingService,
        IGameReadService gameReadService)
    {
        this.gameInstanceService = gameInstanceService;
        this.gamePhaseHandlingService = gamePhaseHandlingService;
        this.gameReadService = gameReadService;
    }
}
