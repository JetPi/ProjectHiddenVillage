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
    private readonly ICardArtService cardArtService;
    private readonly CardArtOptions options;

    public CardArtController(ICardArtService cardArtService, IOptions<CardArtOptions> options)
    {
        this.cardArtService = cardArtService;
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
}
