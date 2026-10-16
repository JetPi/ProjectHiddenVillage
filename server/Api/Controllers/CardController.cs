using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using ProjectHiddenVillage.Server.Api.Interfaces.Card;

namespace ProjectHiddenVillage.Server;

[ApiController]
[Route("api/[controller]")]
public sealed class CardController : ApiControllerBase
{
    private readonly ICardMappingService cardMappingService;

    public CardController(ICardMappingService cardMappingService)
    {
        this.cardMappingService = cardMappingService;
    }

    /// <summary>
    /// The bulk seed path. It writes into the same catalogue table as the authoring endpoints, so it is held to
    /// the same claim as they are rather than being left open because it predates them.
    /// </summary>
    [Authorize(Policy = AuthorizationPolicies.CardCatalogAdmin)]
    [HttpPost("seed")]
    [ProducesResponseType(typeof(List<Card>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(string), StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<List<Card>>> Map([FromBody] List<CardDataSourceRecord> sourceCards)
    {
        var result = await cardMappingService.MapCards(sourceCards);
        if (result.IsError)
        {
            return ProblemFromErrors<List<Card>>(result.Errors);
        }

        return Ok(result.Value);
    }

    [HttpGet("catalog")]
    [ProducesResponseType(typeof(PagedResponse<CardCatalogItemResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<PagedResponse<CardCatalogItemResponse>>> GetCardCatalog(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 100,
        [FromQuery] string? sort = null)
    {
        var result = await cardMappingService.GetCardCatalog(page, pageSize, sort);
        if (result.IsError)
        {
            return ProblemFromErrors<PagedResponse<CardCatalogItemResponse>>(result.Errors);
        }

        return Ok(result.Value);
    }

    /// <summary>
    /// Creates a brand new card. The image reference is either an external URL or the local reference returned
    /// by <c>POST /api/card-art/{cardId}</c>.
    /// </summary>
    [Authorize(Policy = AuthorizationPolicies.CardCatalogAdmin)]
    [HttpPost("catalog")]
    [ProducesResponseType(typeof(CardCatalogItemResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(string), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(string), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<CardCatalogItemResponse>> CreateCard([FromBody] CreateCardRequest request)
    {
        var result = await cardMappingService.CreateCardAsync(request);
        if (result.IsError)
        {
            return ProblemFromErrors<CardCatalogItemResponse>(result.Errors);
        }

        return StatusCode(StatusCodes.Status201Created, result.Value);
    }

    [HttpPost("catalog/by-ids")]
    [ProducesResponseType(typeof(List<CardCatalogItemResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<List<CardCatalogItemResponse>>> GetCardCatalogByIds([FromBody] List<string>? cardIds)
    {
        var result = await cardMappingService.GetCardCatalogByIds(cardIds);
        if (result.IsError)
        {
            return ProblemFromErrors<List<CardCatalogItemResponse>>(result.Errors);
        }

        return Ok(result.Value);
    }

    [HttpGet("catalog/effect-condition-keywords")]
    [ProducesResponseType(typeof(List<string>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<List<string>>> GetEffectConditionKeywords()
    {
        var result = await cardMappingService.GetEffectConditionKeywords();
        if (result.IsError)
        {
            return ProblemFromErrors<List<string>>(result.Errors);
        }

        return Ok(result.Value);
    }

    /// <summary>
    /// Replaces a card's art, or clears it when the image is empty. The art master itself is uploaded separately
    /// through <c>POST /api/card-art/{cardId}</c>; this only points the card at it.
    /// </summary>
    [Authorize(Policy = AuthorizationPolicies.CardCatalogAdmin)]
    [HttpPut("catalog/{cardId}/image")]
    [ProducesResponseType(typeof(CardCatalogItemResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(string), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CardCatalogItemResponse>> UpdateCardImage(
        string cardId,
        [FromBody] UpdateCardImageRequest request)
    {
        var result = await cardMappingService.UpdateCardImageByCardId(cardId, request);
        if (result.IsError)
        {
            return ProblemFromErrors<CardCatalogItemResponse>(result.Errors);
        }

        return Ok(result.Value);
    }

    [Authorize(Policy = AuthorizationPolicies.CardCatalogAdmin)]
    [HttpPatch("catalog/{cardId}/effects")]
    [ProducesResponseType(typeof(CardCatalogItemResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(string), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CardCatalogItemResponse>> UpdateCardEffectsByCardId(
        string cardId,
        [FromBody] UpdateCardEffectsRequest request)
    {
        var result = await cardMappingService.UpdateCardEffectsByCardId(cardId, request);
        if (result.IsError)
        {
            return ProblemFromErrors<CardCatalogItemResponse>(result.Errors);
        }

        return Ok(result.Value);
    }
}