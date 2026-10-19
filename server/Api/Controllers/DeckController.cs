using Microsoft.AspNetCore.Mvc;
using ProjectHiddenVillage.Server.Api.Interfaces.Deck;
using ProjectHiddenVillage.Server.Data.DTOs;

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

    [HttpDelete("{deckId}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
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

    [HttpGet]
    [ProducesResponseType(typeof(List<DeckResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<DeckResponse>>> GetDecks([FromQuery] Guid? userId = null, [FromQuery] bool populate = false)
    {
        var result = await deckService.GetDecks(userId, populate);
        if (result.IsError)
        {
            return ProblemFromErrors<List<DeckResponse>>(result.Errors);
        }

        return Ok(result.Value);
    }
}