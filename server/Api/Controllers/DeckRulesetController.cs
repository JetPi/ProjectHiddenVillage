using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ProjectHiddenVillage.Server.Api.Interfaces.Deck;

namespace ProjectHiddenVillage.Server;

[ApiController]
[Route("api/deck-rulesets")]
public sealed class DeckRulesetController : ApiControllerBase
{
    private readonly IDeckRulesetService deckRulesetService;

    public DeckRulesetController(IDeckRulesetService deckRulesetService)
    {
        this.deckRulesetService = deckRulesetService;
    }

    [HttpGet]
    [ProducesResponseType(typeof(List<DeckRulesetResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<DeckRulesetResponse>>> GetRulesets()
    {
        var result = await deckRulesetService.GetRulesets(includeInactive: false);
        if (result.IsError)
        {
            return ProblemFromErrors<List<DeckRulesetResponse>>(result.Errors);
        }

        return Ok(result.Value);
    }

    [Authorize(Policy = AuthorizationPolicies.CardCatalogAdmin)]
    [HttpGet("all")]
    [ProducesResponseType(typeof(List<DeckRulesetResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(string), StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<List<DeckRulesetResponse>>> GetAllRulesets()
    {
        var result = await deckRulesetService.GetRulesets(includeInactive: true);
        if (result.IsError)
        {
            return ProblemFromErrors<List<DeckRulesetResponse>>(result.Errors);
        }

        return Ok(result.Value);
    }

    /// <summary>
    /// The set codes the catalogue holds, with card counts, so the rule editor can offer them as suggestions
    /// rather than expecting the admin to know every prefix.
    /// </summary>
    [Authorize(Policy = AuthorizationPolicies.CardCatalogAdmin)]
    [HttpGet("card-pool/set-codes")]
    [ProducesResponseType(typeof(List<DeckRulesetSetCodeResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(string), StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<List<DeckRulesetSetCodeResponse>>> GetCardPoolSetCodes()
    {
        var result = await deckRulesetService.GetCardPoolSetCodes();
        if (result.IsError)
        {
            return ProblemFromErrors<List<DeckRulesetSetCodeResponse>>(result.Errors);
        }

        return Ok(result.Value);
    }

    [Authorize(Policy = AuthorizationPolicies.CardCatalogAdmin)]
    [HttpPost]
    [ProducesResponseType(typeof(DeckRulesetResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(string), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(string), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<DeckRulesetResponse>> CreateRuleset([FromBody] CreateDeckRulesetRequest request)
    {
        var result = await deckRulesetService.CreateRuleset(request);
        if (result.IsError)
        {
            return ProblemFromErrors<DeckRulesetResponse>(result.Errors);
        }

        return Created($"/api/deck-rulesets/{result.Value.Id}", result.Value);
    }

    [Authorize(Policy = AuthorizationPolicies.CardCatalogAdmin)]
    [HttpPut("{rulesetId}")]
    [ProducesResponseType(typeof(DeckRulesetResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(string), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<DeckRulesetResponse>> UpdateRuleset(
        string rulesetId,
        [FromBody] UpdateDeckRulesetRequest request)
    {
        var result = await deckRulesetService.UpdateRuleset(rulesetId, request);
        if (result.IsError)
        {
            return ProblemFromErrors<DeckRulesetResponse>(result.Errors);
        }

        return Ok(result.Value);
    }

    [Authorize(Policy = AuthorizationPolicies.CardCatalogAdmin)]
    [HttpDelete("{rulesetId}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(string), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<bool>> DeleteRuleset(string rulesetId)
    {
        var result = await deckRulesetService.DeleteRuleset(rulesetId);
        if (result.IsError)
        {
            return ProblemFromErrors<bool>(result.Errors);
        }

        return NoContent();
    }
}
