using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ProjectHiddenVillage.Server.Api.Services.Maintenance;

namespace ProjectHiddenVillage.Server;

/// <summary>
/// The deploy drain switch. Reading it is anonymous because the login view paints the banner from it, and the
/// presence snapshot carries the same numbers, while only a card-catalogue admin may flip it.
/// </summary>
[ApiController]
[Route("api/maintenance")]
public sealed class MaintenanceController(
    MaintenanceState maintenanceState,
    MaintenanceReporter maintenanceReporter) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType(typeof(MaintenanceSnapshot), StatusCodes.Status200OK)]
    public ActionResult<MaintenanceSnapshot> GetMaintenance()
    {
        return Ok(maintenanceReporter.GetSnapshot());
    }

    [Authorize(Policy = AuthorizationPolicies.CardCatalogAdmin)]
    [HttpPost("enable")]
    [ProducesResponseType(typeof(MaintenanceSnapshot), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public ActionResult<MaintenanceSnapshot> Enable([FromQuery] string? message)
    {
        maintenanceState.Enable(message);
        return Ok(maintenanceReporter.GetSnapshot());
    }

    [Authorize(Policy = AuthorizationPolicies.CardCatalogAdmin)]
    [HttpPost("disable")]
    [ProducesResponseType(typeof(MaintenanceSnapshot), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public ActionResult<MaintenanceSnapshot> Disable()
    {
        maintenanceState.Disable();
        return Ok(maintenanceReporter.GetSnapshot());
    }
}
