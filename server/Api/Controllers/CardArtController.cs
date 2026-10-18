using ErrorOr;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using ProjectHiddenVillage.Server.Api.Interfaces.CardArt;
using ProjectHiddenVillage.Server.Api.Services.CardArt;

namespace ProjectHiddenVillage.Server;

[ApiController]
[Route("api/card-art")]
public sealed class CardArtController : ApiControllerBase
{
    /// <summary>
    /// Request cap for an upload, deliberately above CardArt:MaxUploadBytes so the byte limit that reports a
    /// useful message is the service's own, not the framework's silent 413.
    /// </summary>
    private const long MaxUploadRequestBytes = 12 * 1024 * 1024;

    private readonly ICardArtService cardArtService;
    private readonly ICardArtWriteService cardArtWriteService;
    private readonly CardArtOptions options;

    public CardArtController(
        ICardArtService cardArtService,
        ICardArtWriteService cardArtWriteService,
        IOptions<CardArtOptions> options)
    {
        this.cardArtService = cardArtService;
        this.cardArtWriteService = cardArtWriteService;
        this.options = options.Value;
    }

    [AllowAnonymous]
    [HttpGet("{cardId}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetCardArt(
        string cardId,
        [FromQuery] int? w = null,
        [FromQuery] string? v = null,
        CancellationToken cancellationToken = default)
    {
        var width = w ?? 240;
        if (options.AllowedWidths.Count > 0 && !options.AllowedWidths.Contains(width))
        {
            return BadRequest($"Unsupported width '{width}'. Allowed widths: {string.Join(", ", options.AllowedWidths)}.");
        }

        var payload = await cardArtService.ResolveAsync(cardId, width, v, cancellationToken);
        if (payload is null)
        {
            return NotFound($"Card art for '{cardId}' could not be resolved.");
        }

        Response.Headers.CacheControl = payload.IsImmutable
            ? "public, max-age=31536000, immutable"
            : "public, max-age=300";
        Response.Headers.ETag = payload.ETag;

        return File(payload.Stream, payload.ContentType);
    }

    /// <summary>
    /// Stores an uploaded art master for a card. The returned reference is what the create request sends back
    /// as the card's image, so an upload is always tied to a card id the author has already chosen.
    /// </summary>
    [Authorize(Policy = AuthorizationPolicies.CardCatalogAdmin)]
    [HttpPost("{cardId}")]
    [RequestSizeLimit(MaxUploadRequestBytes)]
    [ProducesResponseType(typeof(CardArtUploadResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(string), StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<CardArtUploadResponse>> UploadCardArt(
        string cardId,
        [FromForm] IFormFile? file,
        CancellationToken cancellationToken = default)
    {
        if (file is null || file.Length == 0)
        {
            return BadRequest("A non-empty image file is required.");
        }

        await using var content = file.OpenReadStream();

        var result = await cardArtWriteService.StoreUploadAsync(
            cardId,
            content,
            file.ContentType,
            cancellationToken);

        if (result.IsError)
        {
            return ProblemFromErrors<CardArtUploadResponse>(result.Errors);
        }

        return Ok(new CardArtUploadResponse(
            CardId: result.Value.CardId,
            Reference: result.Value.Reference,
            Version: result.Value.Version));
    }

    /// <summary>
    /// Removes a stored master and its cached variants. Used when an author abandons the create form, so an
    /// upload that never became a card does not sit on disk forever.
    /// </summary>
    [Authorize(Policy = AuthorizationPolicies.CardCatalogAdmin)]
    [HttpDelete("{cardId}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(string), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(string), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(string), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> DeleteCardArt(string cardId, CancellationToken cancellationToken = default)
    {
        var result = await cardArtWriteService.DeleteUploadAsync(cardId, cancellationToken);
        if (result.IsError)
        {
            // A delete only fails on validation or on the filesystem, and both are the caller's 400 to read.
            return BadRequest(result.Errors[0].Description);
        }

        return NoContent();
    }
}
