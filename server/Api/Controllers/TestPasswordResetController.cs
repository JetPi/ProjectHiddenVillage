using Microsoft.AspNetCore.Mvc;
using ProjectHiddenVillage.Server.Api.Testing;

namespace ProjectHiddenVillage.Server;

public sealed record TestPasswordResetEmailResponse(
    string RecipientEmail,
    string ResetUrl,
    DateTimeOffset ExpiresAtUtc);

/// <summary>
/// Hands the e2e suite the recovery link that a real deployment would have mailed. The link carries a live token,
/// so the endpoint is gated by <see cref="TestEndpointGate"/> exactly like the other <c>api/test/**</c> routes: 404
/// unless the API runs in Development with the test profiles enabled.
/// </summary>
[ApiController]
[Route("api/test/password-reset")]
[ApiExplorerSettings(IgnoreApi = true)]
public sealed class TestPasswordResetController(
    PasswordResetEmailRecorder recorder,
    IWebHostEnvironment environment,
    IConfiguration configuration,
    ILogger<TestPasswordResetController> logger) : ApiControllerBase
{
    [HttpGet("last-reset")]
    [ProducesResponseType(typeof(TestPasswordResetEmailResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult<TestPasswordResetEmailResponse> LastReset([FromQuery] string? email)
    {
        if (!TestEndpointGate.IsEnabled(environment, configuration, logger, HttpContext.Request.Path))
        {
            return NotFound();
        }

        if (string.IsNullOrWhiteSpace(email) || !recorder.TryTake(email.Trim(), out var captured))
        {
            return NotFound();
        }

        return Ok(new TestPasswordResetEmailResponse(
            captured.RecipientEmail,
            captured.ResetUrl,
            captured.ExpiresAtUtc));
    }
}
