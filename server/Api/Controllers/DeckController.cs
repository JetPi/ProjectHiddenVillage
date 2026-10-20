using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ProjectHiddenVillage.Server.Api.Interfaces.Deck;
using ProjectHiddenVillage.Server.Data.DTOs;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server;

[ApiController]
[Route("api/[controller]")]
public sealed class DeckController : ApiControllerBase
{
    private readonly IDeckService deckService;

    public DeckController(IDeckService deckService)
    {
        this.deckService = deckService;
    }

    /// <summary>
    /// The legacy text import. A player pastes <c>"3x N-001"</c> lines when creating a game, so this endpoint
    /// stays anonymous and keeps its own parser; the structured admin endpoints below are the stricter door.
    /// </summary>
    [HttpPost]
    [ProducesResponseType(typeof(string), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<string>> CreateDeck([FromBody] CreateDeckRequest request)
    {
        var result = await deckService.CreateDeck(request);
        if (result.IsError)
        {
            return ProblemFromErrors<string>(result.Errors);
        }

        return Created($"/api/deck/{result.Value}", result.Value);
    }

    /// <summary>
    /// Creates an admin-authored public deck from structured lines. Held to the deck rules (one leader, at most
    /// four copies of any other card, one colour), which is why it is admin-only rather than another player door.
    /// </summary>
    [Authorize(Policy = AuthorizationPolicies.CardCatalogAdmin)]
    [HttpPost("public")]
    [ProducesResponseType(typeof(DeckResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(string), StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<DeckResponse>> CreatePublicDeck([FromBody] CreatePublicDeckRequest request)
    {
        var result = await deckService.CreatePublicDeckAsync(request);
        if (result.IsError)
        {
            return ProblemFromErrors<DeckResponse>(result.Errors);
        }

        return Created($"/api/deck/{result.Value.Id}", result.Value);
    }

    /// <summary>
    /// Replaces an existing deck's name and card lines. Same rules as a create: an edit is held to the deck rules
    /// exactly as strictly as a new deck is.
    /// </summary>
    [Authorize(Policy = AuthorizationPolicies.CardCatalogAdmin)]
    [HttpPut("{deckId}")]
    [ProducesResponseType(typeof(DeckResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(string), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<DeckResponse>> UpdateDeck(string deckId, [FromBody] UpdateDeckRequest request)
    {
        var result = await deckService.UpdateDeckAsync(deckId, request);
        if (result.IsError)
        {
            return ProblemFromErrors<DeckResponse>(result.Errors);
        }

        return Ok(result.Value);
    }

    /// <summary>
    /// Writes into the same deck table as the authoring endpoints, so it carries the same admin claim. A deck a
    /// game instance still points at answers 409 and stays put.
    /// </summary>
    [Authorize(Policy = AuthorizationPolicies.CardCatalogAdmin)]
    [HttpDelete("{deckId}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(string), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(string), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<bool>> DeleteDeck(string deckId)
    {
        var result = await deckService.DeleteDeck(deckId);
        if (result.IsError)
        {
            return ProblemFromErrors<bool>(result.Errors);
        }

        return NoContent();
    }

    [HttpGet("{deckId}")]
    [ProducesResponseType(typeof(DeckResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<DeckResponse>> GetDeck(string deckId, [FromQuery] bool populate = false)
    {
        var result = await deckService.GetDeck(deckId, populate);
        if (result.IsError)
        {
            return ProblemFromErrors<DeckResponse>(result.Errors);
        }

        return Ok(result.Value);
    }

    /// <summary>
    /// Lists decks. <paramref name="type"/> narrows it to <c>Public</c> or <c>User</c>, which is what the admin
    /// deck screen and the login pickers each need (they used to filter a full list client-side).
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(List<DeckResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<DeckResponse>>> GetDecks(
        [FromQuery] Guid? userId = null,
        [FromQuery] bool populate = false,
        [FromQuery] DeckType? type = null)
    {
        var result = await deckService.GetDecks(userId, populate, type);
        if (result.IsError)
        {
            return ProblemFromErrors<List<DeckResponse>>(result.Errors);
        }

        return Ok(result.Value);
    }
}