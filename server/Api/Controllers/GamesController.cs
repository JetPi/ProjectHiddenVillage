using Microsoft.AspNetCore.Mvc;

namespace ProjectHiddenVillage.Server;

[ApiController]
[Route("api/[controller]")]
public sealed class GamesController : ControllerBase
{
    private readonly InMemoryGameInstanceRegistry registry;

    public GamesController(InMemoryGameInstanceRegistry registry)
    {
        this.registry = registry;
    }

    [HttpPost]
    [ProducesResponseType(typeof(GameInstance), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    public ActionResult<GameInstance> Create([FromBody] CreateGameInstanceRequest request)
    {
        if (request.Players is null)
        {
            return BadRequest("Players payload is required.");
        }

        if (request.CardDefinitions is null)
        {
            return BadRequest("CardDefinitions payload is required.");
        }

        try
        {
            var cardDefinitions = request.CardDefinitions.ToDictionary(
                keySelector: card => card.Id,
                elementSelector: card => card,
                comparer: StringComparer.Ordinal);

            var game = registry.Create(request.Players, cardDefinitions);
            return CreatedAtAction(nameof(GetById), new { gameId = game.Id }, game);
        }
        catch (Exception ex) when (ex is InvalidOperationException || ex is ArgumentException)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpGet("{gameId}")]
    [ProducesResponseType(typeof(GameInstance), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult<GameInstance> GetById(string gameId)
    {
        if (!registry.TryGet(gameId, out var game) || game is null)
        {
            return NotFound();
        }

        return Ok(game);
    }

    [HttpPost("{gameId}/join")]
    [ProducesResponseType(typeof(GameInstance), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
    public ActionResult<GameInstance> Join(string gameId, [FromBody] JoinGameInstanceRequest request)
    {
        try
        {
            var game = registry.Join(gameId, request.Player);
            return Ok(game);
        }
        catch (Exception ex) when (ex is InvalidOperationException || ex is KeyNotFoundException)
        {
            return ex is KeyNotFoundException
                ? NotFound(ex.Message)
                : BadRequest(ex.Message);
        }
    }

    [HttpPost("{gameId}/prompts/resolve")]
    [ProducesResponseType(typeof(GameInstance), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
    public ActionResult<GameInstance> ResolvePrompt(string gameId, [FromBody] ResolvePromptRequest request)
    {
        try
        {
            var game = registry.ResolvePrompt(gameId, request.RequestedPlayerId, request.SelectedOption);
            return Ok(game);
        }
        catch (Exception ex) when (ex is InvalidOperationException || ex is KeyNotFoundException)
        {
            return ex is KeyNotFoundException
                ? NotFound(ex.Message)
                : BadRequest(ex.Message);
        }
    }
}