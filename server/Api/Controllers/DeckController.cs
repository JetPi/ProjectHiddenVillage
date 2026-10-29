using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
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

    [Authorize(Policy = AuthorizationPolicies.RegisteredUser)]
    [HttpPost]
    [ProducesResponseType(typeof(string), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(string), StatusCodes.Status403Forbidden)]
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

    // Authentication-only, like the delete: a player overwrites their own deck from the login picker, while the
    // service decides whether the caller owns it and an admin keeps the catalogue-wide edit they had before.
    [Authorize]
    [HttpPut("{deckId}")]
    [ProducesResponseType(typeof(DeckResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(string), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<DeckResponse>> UpdateDeck(string deckId, [FromBody] UpdateDeckRequest request)
    {
        var result = await deckService.UpdateDeckAsync(
            deckId,
            request,
            GetRequestingUserId(),
            IsCardCatalogAdmin());

        if (result.IsError)
        {
            return ProblemFromErrors<DeckResponse>(result.Errors);
        }

        return Ok(result.Value);
    }

    // Deliberately authentication-only: a player must be able to remove their own saved deck. The service decides
    // whether the caller owns it, and an admin keeps the catalogue-wide delete they had before.
    [Authorize]
    [HttpDelete("{deckId}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(string), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(string), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<bool>> DeleteDeck(string deckId)
    {
        var result = await deckService.DeleteDeck(
            deckId,
            GetRequestingUserId(),
            IsCardCatalogAdmin());

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

    [HttpGet]
    [ProducesResponseType(typeof(List<DeckResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<DeckResponse>>> GetDecks(
        [FromQuery] Guid? userId = null,
        [FromQuery] bool populate = false,
        [FromQuery] DeckType? type = null)
    {
        // The listing itself is public, but the wins and losses in it are not: they travel only when the caller is
        // the player they belong to.
        var result = await deckService.GetDecks(userId, populate, type, GetRequestingUserId());
        if (result.IsError)
        {
            return ProblemFromErrors<List<DeckResponse>>(result.Errors);
        }

        return Ok(result.Value);
    }

    /// <summary>
    /// The authenticated caller, when the request carries a valid token. Anonymous listings are still served - the
    /// public decks are readable without an account - they simply carry no record.
    /// </summary>
    private Guid? GetRequestingUserId()
    {
        var rawUserId = User?.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User?.FindFirstValue(JwtRegisteredClaimNames.Sub);

        return Guid.TryParse(rawUserId, out var userId) ? userId : null;
    }

    private bool IsCardCatalogAdmin()
    {
        return User?.HasClaim(
            AuthorizationPolicies.CardCatalogAdminClaimType,
            AuthorizationPolicies.CardCatalogAdminClaimValue) == true;
    }
}