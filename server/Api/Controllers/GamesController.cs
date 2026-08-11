using Microsoft.AspNetCore.Mvc;

namespace ProjectHiddenVillage.Server;

[ApiController]
[Route("api/[controller]")]
public sealed class GamesController : ApiControllerBase
{
    private readonly IGameInstanceService gameInstanceService;
    private readonly IGameReadService gameReadService;
    private readonly IGamePhaseHandlingService gamePhaseHandlingService;

    public GamesController(
        IGameInstanceService gameInstanceService,
        IGameReadService gameReadService,
        IGamePhaseHandlingService gamePhaseHandlingService)
    {
        this.gameInstanceService = gameInstanceService;
        this.gameReadService = gameReadService;
        this.gamePhaseHandlingService = gamePhaseHandlingService;
    }

    [HttpPost]
    [ProducesResponseType(typeof(GameInstance), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<GameInstance>> Create([FromBody] CreateGameForUserRequest request)
    {
        var result = await gameInstanceService.CreateGameForUser(request);
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
        var result = gameReadService.GetById(gameId);
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
        var result = await gameReadService.GetCardDataForGame(gameId);
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
        var result = await gameInstanceService.JoinGameForUser(gameId, request);
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
        var result = gamePhaseHandlingService.ResolvePrompt(gameId, request);
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
        var result = gamePhaseHandlingService.AdvancePhase(gameId);
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
        var result = gamePhaseHandlingService.DeclarePassInActionStep(gameId, request);
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
        var result = gamePhaseHandlingService.DeclareActionInActionStep(gameId, request);
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
        var result = gamePhaseHandlingService.DeclareEndStep(gameId);
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
        var result = gamePhaseHandlingService.CompleteEndStep(gameId);
        if (result.IsError)
        {
            return ProblemFromErrors<GameInstance>(result.Errors);
        }

        return Ok(result.Value);
    }
}