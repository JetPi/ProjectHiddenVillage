using Microsoft.AspNetCore.Mvc;

namespace ProjectHiddenVillage.Server;

[ApiController]
[Route("api/[controller]")]
public sealed class GamesController : ApiControllerBase
{
    private readonly GamesService gamesService;

    public GamesController(GamesService gamesService)
    {
        this.gamesService = gamesService;
    }

    [HttpPost]
    [ProducesResponseType(typeof(GameInstance), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<GameInstance>> Create([FromBody] CreateGameForUserRequest request)
    {
        var result = await gamesService.CreateGameForUser(request);
        if (result.IsError)
        {
            return ProblemFromErrors<GameInstance>(result.Errors);
        }

        return CreatedAtAction(nameof(GetById), new { gameId = result.Value.Id }, result.Value);
    }

    [HttpGet("{gameId}")]
    [ProducesResponseType(typeof(GameInstance), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult<GameInstance> GetById(string gameId)
    {
        var result = gamesService.GetById(gameId);
        if (result.IsError)
        {
            return ProblemFromErrors<GameInstance>(result.Errors);
        }

        return Ok(result.Value);
    }

    [HttpGet("{gameId}/cards")]
    [ProducesResponseType(typeof(List<CardCatalogItemResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<List<CardCatalogItemResponse>>> GetCardsForGame(string gameId)
    {
        var result = await gamesService.GetCardsForGame(gameId);
        if (result.IsError)
        {
            return ProblemFromErrors<List<CardCatalogItemResponse>>(result.Errors);
        }

        return Ok(result.Value);
    }

    [HttpPost("{gameId}/join")]
    [ProducesResponseType(typeof(GameInstance), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<GameInstance>> Join(string gameId, [FromBody] JoinGameAsPlayer request)
    {
        var result = await gamesService.JoinGameForUser(gameId, request);
        if (result.IsError)
        {
            return ProblemFromErrors<GameInstance>(result.Errors);
        }

        return Ok(result.Value);
    }

    [HttpPost("{gameId}/prompts/resolve")]
    [ProducesResponseType(typeof(GameInstance), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
    public ActionResult<GameInstance> ResolvePrompt(string gameId, [FromBody] ResolvePromptRequest request)
    {
        var result = gamesService.ResolvePrompt(gameId, request);
        if (result.IsError)
        {
            return ProblemFromErrors<GameInstance>(result.Errors);
        }

        return Ok(result.Value);
    }

    [HttpPost("{gameId}/phase/advance")]
    [ProducesResponseType(typeof(GameInstance), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
    public ActionResult<GameInstance> AdvancePhase(string gameId)
    {
        var result = gamesService.AdvancePhase(gameId);
        if (result.IsError)
        {
            return ProblemFromErrors<GameInstance>(result.Errors);
        }

        return Ok(result.Value);
    }

    [HttpPost("{gameId}/action-step/pass")]
    [ProducesResponseType(typeof(GameInstance), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
    public ActionResult<GameInstance> DeclarePassInActionStep(string gameId, [FromBody] PlayerPhaseActionRequest request)
    {
        var result = gamesService.DeclarePassInActionStep(gameId, request);
        if (result.IsError)
        {
            return ProblemFromErrors<GameInstance>(result.Errors);
        }

        return Ok(result.Value);
    }

    [HttpPost("{gameId}/action-step/action")]
    [ProducesResponseType(typeof(GameInstance), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
    public ActionResult<GameInstance> DeclareActionInActionStep(string gameId, [FromBody] PlayerPhaseActionRequest request)
    {
        var result = gamesService.DeclareActionInActionStep(gameId, request);
        if (result.IsError)
        {
            return ProblemFromErrors<GameInstance>(result.Errors);
        }

        return Ok(result.Value);
    }

    [HttpPost("{gameId}/end-step/declare")]
    [ProducesResponseType(typeof(GameInstance), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
    public ActionResult<GameInstance> DeclareEndStep(string gameId)
    {
        var result = gamesService.DeclareEndStep(gameId);
        if (result.IsError)
        {
            return ProblemFromErrors<GameInstance>(result.Errors);
        }

        return Ok(result.Value);
    }

    [HttpPost("{gameId}/end-step/complete")]
    [ProducesResponseType(typeof(GameInstance), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
    public ActionResult<GameInstance> CompleteEndStep(string gameId)
    {
        var result = gamesService.CompleteEndStep(gameId);
        if (result.IsError)
        {
            return ProblemFromErrors<GameInstance>(result.Errors);
        }

        return Ok(result.Value);
    }
}