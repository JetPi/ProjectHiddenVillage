using Microsoft.AspNetCore.Mvc;
using ProjectHiddenVillage.Server.Api.Interfaces.Deck;
using ProjectHiddenVillage.Server.Api.Testing;
using ProjectHiddenVillage.Server.Data.DTOs;

namespace ProjectHiddenVillage.Server;

/// <summary>
/// Test-only deck creation for the e2e suite.
///
/// The specs mint engine fixtures whose composition no format accepts: a 25-card deck holding 24 copies of one
/// card so an opening discard is deterministic, a three-card combination that makes one interaction certain, or a
/// deck built around a fabricated 10-power character. The player write paths reject all of those because they now
/// evaluate the deck rulesets, so this endpoint is the same bypass the development seed profiles already have: it
/// parses, resolves and stores the deck, but skips the ruleset evaluation. Like them, a deck minted here is
/// playable but can never be saved by a player as it is, because every save re-evaluates.
///
/// It answers 404 unless the API runs in Development with the test seed profiles enabled, so a deployed build
/// cannot reach it.
/// </summary>
[ApiController]
[Route("api/test/decks")]
[ApiExplorerSettings(IgnoreApi = true)]
public sealed class TestDecksController(
    IDeckService deckService,
    IWebHostEnvironment environment,
    IConfiguration configuration,
    ILogger<TestDecksController> logger) : ApiControllerBase
{
    [HttpPost]
    [ProducesResponseType(typeof(string), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<string>> CreateFixtureDeck([FromBody] CreateDeckRequest request)
    {
        if (!TestEndpointGate.IsEnabled(environment, configuration, logger, HttpContext.Request.Path))
        {
            return NotFound();
        }

        var result = await deckService.CreateFixtureDeckAsync(request);
        if (result.IsError)
        {
            return ProblemFromErrors<string>(result.Errors);
        }

        return Created($"/api/deck/{result.Value}", result.Value);
    }
}
