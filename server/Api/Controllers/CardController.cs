using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using ProjectHiddenVillage.Server.Api.Interfaces.Card;

namespace ProjectHiddenVillage.Server;

[ApiController]
[Route("api/[controller]")]
public sealed class CardController : ApiControllerBase
{
    private readonly ICardMappingService cardMappingService;
    private readonly ICardDeletionService cardDeletionService;

    public CardController(
        ICardMappingService cardMappingService,
        ICardDeletionService cardDeletionService)
    {
        this.cardMappingService = cardMappingService;
        this.cardDeletionService = cardDeletionService;
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

    /// <summary>
    /// The catalogue listing. Deliberately lean: `search` and the type/colour filters are applied in SQL, and each
    /// item carries only what a tile renders - the full card comes from `by-ids` when one is selected.
    /// </summary>
    [HttpGet("catalog")]
    [ProducesResponseType(typeof(PagedResponse<CardCatalogListItemResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<PagedResponse<CardCatalogListItemResponse>>> GetCardCatalog(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 100,
        [FromQuery] string? sort = null,
        [FromQuery] string? search = null,
        [FromQuery] List<string>? types = null,
        [FromQuery] List<string>? colors = null)
    {
        var result = await cardMappingService.GetCardCatalog(page, pageSize, sort, search, types, colors);
        if (result.IsError)
        {
            return ProblemFromErrors<PagedResponse<CardCatalogListItemResponse>>(result.Errors);
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
    /// The traits already present in the catalogue, so the create screen can offer them as suggestions while
    /// still accepting values the author invents.
    /// </summary>
    [HttpGet("catalog/traits")]
    [ProducesResponseType(typeof(List<string>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<string>>> GetTraits()
    {
        var result = await cardMappingService.GetTraits();
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

    /// <summary>
    /// Removes a card from the catalogue, along with its stored art and every deck row that references it.
    /// Without <paramref name="force"/> a card that is still in use is refused with a conflict, so the caller can
    /// confirm what it is about to change.
    /// </summary>
    [Authorize(Policy = AuthorizationPolicies.CardCatalogAdmin)]
    [HttpDelete("catalog/{cardId}")]
    [ProducesResponseType(typeof(CardDeletionImpactResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(string), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(string), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<CardDeletionImpactResponse>> DeleteCard(
        string cardId,
        [FromQuery] bool force = false)
    {
        var result = await cardDeletionService.DeleteCardAsync(cardId, force);
        if (result.IsError)
        {
            return ProblemFromErrors<CardDeletionImpactResponse>(result.Errors);
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