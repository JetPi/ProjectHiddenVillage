using Microsoft.AspNetCore.Mvc;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Presence;

namespace ProjectHiddenVillage.Server;

/// <summary>
/// The snapshot a client can read before its presence socket is up, and the fallback when it is down. Anonymous
/// on purpose: the number it returns is public information, and a visitor has no identity yet.
/// </summary>
[ApiController]
[Route("api/presence")]
public sealed class PresenceController(
    PresenceRegistry presenceRegistry,
    IMatchmakingService matchmakingService) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType(typeof(PresenceSnapshot), StatusCodes.Status200OK)]
    public ActionResult<PresenceSnapshot> GetPresence()
    {
        return Ok(PresenceSnapshotFactory.Create(
            presenceRegistry.GetCounts(),
            matchmakingService.GetQueueSummary()));
    }
}
