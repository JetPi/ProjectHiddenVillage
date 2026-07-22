using Microsoft.AspNetCore.Mvc;

namespace ProjectHiddenVillage.Server;

[ApiController]
[Route("api/[controller]")]
public sealed class HealthController : ControllerBase
{
    [HttpGet]
    [ProducesResponseType(typeof(HealthResponse), StatusCodes.Status200OK)]
    public ActionResult<HealthResponse> Get()
    {
        return Ok(new HealthResponse(
            Status: "ok",
            Service: "project-hidden-village-server",
            Timestamp: DateTimeOffset.UtcNow));
    }
}