using ErrorOr;
using Microsoft.EntityFrameworkCore;
using ProjectHiddenVillage.Server.Api.Interfaces.Card;
using ProjectHiddenVillage.Server.Api.Interfaces.CardArt;
using ProjectHiddenVillage.Server.Data;

namespace ProjectHiddenVillage.Server;

public sealed class CardDeletionService : ICardDeletionService
{
    private readonly ApplicationDbContext dbContext;
    private readonly ICardArtWriteService cardArtWriteService;
    private readonly ILogger<CardDeletionService> logger;

    public CardDeletionService(
        ApplicationDbContext dbContext,
        ICardArtWriteService cardArtWriteService,
        ILogger<CardDeletionService> logger)
    {
        this.dbContext = dbContext;
        this.cardArtWriteService = cardArtWriteService;
        this.logger = logger;
    }

    public async Task<ErrorOr<CardDeletionImpactResponse>> DeleteCardAsync(string cardId, bool force)
    {
        if (string.IsNullOrWhiteSpace(cardId))
        {
            return Error.Validation(
                code: "Card.Delete.CardIdRequired",
                description: "Card id is required.");
        }

        var normalizedCardId = cardId.Trim();
        var normalizedCardIdUpper = normalizedCardId.ToUpperInvariant();

        var entry = await dbContext.CardCatalogEntries
            .SingleOrDefaultAsync(existing => existing.CardId.ToUpper() == normalizedCardIdUpper);

        if (entry is null)
        {
            return Error.NotFound(
                code: "Card.Delete.NotFound",
                description: $"Card '{normalizedCardId}' was not found.");
        }

        // Two different kinds of reference, reported together because a caller has to weigh both before agreeing:
        // deck_cards is a restricting FK (the delete would fail in the database), while saved_deck_cards only
        // stores a card id (the saved deck would silently start listing a card that no longer resolves).
        var deckCount = await dbContext.DeckCards
            .Where(deckCard => deckCard.CardCatalogEntryId == entry.Id)
            .Select(deckCard => deckCard.DeckId)
            .Distinct()
            .CountAsync();

        var savedDeckCount = await dbContext.SavedDeckCards
            .Where(savedDeckCard => savedDeckCard.CardId.ToUpper() == normalizedCardIdUpper)
            .Select(savedDeckCard => savedDeckCard.SavedDeckId)
            .Distinct()
            .CountAsync();

        var impact = new CardDeletionImpactResponse(
            CardId: entry.CardId,
            DeckCount: deckCount,
            SavedDeckCount: savedDeckCount);

        if (!force && (deckCount > 0 || savedDeckCount > 0))
        {
            return Error.Conflict(
                code: "Card.Delete.InUse",
                description:
                    $"Card '{entry.CardId}' is still used by {deckCount} deck(s) and {savedDeckCount} saved deck(s). "
                    + "Deleting it also removes it from them.");
        }

        // Loaded rather than executed as a set-based delete so the rows are removed in the same SaveChanges as
        // the card itself: a half-applied delete would leave deck rows pointing at nothing.
        var deckCards = await dbContext.DeckCards
            .Where(deckCard => deckCard.CardCatalogEntryId == entry.Id)
            .ToListAsync();

        var savedDeckCards = await dbContext.SavedDeckCards
            .Where(savedDeckCard => savedDeckCard.CardId.ToUpper() == normalizedCardIdUpper)
            .ToListAsync();

        if (deckCards.Count > 0)
        {
            dbContext.DeckCards.RemoveRange(deckCards);
        }

        if (savedDeckCards.Count > 0)
        {
            dbContext.SavedDeckCards.RemoveRange(savedDeckCards);
        }

        dbContext.CardCatalogEntries.Remove(entry);

        try
        {
            await dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            return Error.Failure(
                code: "Card.Delete.PersistFailed",
                description: "The card could not be deleted.");
        }

        await DeleteStoredArtAsync(entry.CardId);

        return impact;
    }

    /// <summary>
    /// Removes the card's master and its cached variants.
    /// </summary>
    /// <remarks>
    /// Best effort, and deliberately after the row is committed: the card is gone by now, so a failure here leaves
    /// a file that nothing references - which is exactly what the orphan sweep exists to collect - rather than a
    /// card that still exists with its art missing.
    /// </remarks>
    private async Task DeleteStoredArtAsync(string cardId)
    {
        try
        {
            var result = await cardArtWriteService.DeleteUploadAsync(cardId, CancellationToken.None);

            if (result.IsError)
            {
                logger.LogWarning(
                    "Stored art for deleted card '{CardId}' was not removed: {Reason}",
                    cardId,
                    result.Errors[0].Description);
            }
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception, "Stored art for deleted card '{CardId}' was not removed.", cardId);
        }
    }
}
