using Microsoft.AspNetCore.Mvc;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server;

/// <summary>How to warm a game up. Position 0 is the first player to join.</summary>
public sealed record WarmStartGameRequest(int StartingPlayerPosition = 0);

/// <summary>
/// Test-only endpoints for the e2e suite. They mutate game state without going through the rules the players do,
/// so every action answers 404 unless the API runs in Development *and* the test seed profiles are enabled (the
/// e2e start script sets <c>PHV_INCLUDE_TEST_SEED_PROFILES=true</c>). A deployed build therefore cannot reach
/// them even though the route exists.
/// </summary>
[ApiController]
[Route("api/test/games")]
[ApiExplorerSettings(IgnoreApi = true)]
public sealed class TestGamesController(
    IGameWarmStartService warmStartService,
    IWebHostEnvironment environment,
    IConfiguration configuration,
    ILogger<TestGamesController> logger) : ApiControllerBase
{
    private const string TestEndpointsEnvironmentVariable = "PHV_INCLUDE_TEST_SEED_PROFILES";

    /// <summary>
    /// Walks a just-created two-player game through its opening and returns the first MainPhase, so an e2e
    /// scenario starts where it wants to assert instead of replaying the prompts and the phase walk.
    /// </summary>
    [HttpPost("{gameCode}/warm-start")]
    [ProducesResponseType(typeof(GameWarmStartResult), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult<GameWarmStartResult> WarmStart(
        string gameCode,
        [FromBody] WarmStartGameRequest request)
    {
        if (!TestEndpointsAreEnabled())
        {
            return NotFound();
        }

        var result = warmStartService.WarmStart(gameCode, request.StartingPlayerPosition);
        if (result.IsError)
        {
            return ProblemFromErrors<GameWarmStartResult>(result.Errors);
        }

        return Ok(result.Value);
    }

    private bool TestEndpointsAreEnabled()
    {
        if (!environment.IsDevelopment())
        {
            return false;
        }

        var configured = configuration[TestEndpointsEnvironmentVariable];
        if (bool.TryParse(configured, out var enabled) && enabled)
        {
            return true;
        }

        if (string.Equals(configured, "1", StringComparison.Ordinal))
        {
            return true;
        }

        logger.LogWarning(
            "Refusing a test-endpoint call on {Path}: set {EnvironmentVariable}=true to enable them.",
            HttpContext.Request.Path,
            TestEndpointsEnvironmentVariable);

        return false;
    }
}
