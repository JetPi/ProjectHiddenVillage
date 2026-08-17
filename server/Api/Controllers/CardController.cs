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

    [HttpPost("seed")]
    [ProducesResponseType(typeof(List<Card>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
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