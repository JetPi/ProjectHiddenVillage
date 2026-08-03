using Microsoft.AspNetCore.Mvc;

namespace ProjectHiddenVillage.Server;

[ApiController]
[Route("api/[controller]")]
public sealed class CardController : ApiControllerBase
{
    private readonly CardMappingService cardMappingService;

    public CardController(CardMappingService cardMappingService)
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
}