using ErrorOr;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.CardArt;
using ProjectHiddenVillage.Server.Api.Services.CardArt;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// Deleting a catalogue card touches more than its own row: <c>deck_cards</c> has a restricting FK to it and
/// <c>saved_deck_cards</c> stores the id as a plain column. These pin both halves - that the delete is refused
/// while something references the card, and that agreeing to the refusal's advice removes every one of those rows.
/// </summary>
[TestClass]
public sealed class CardDeletionServiceTests
{
    private const string CardId = "N-001";

    [TestMethod]
    public async Task DeleteCardAsync_ReportsAnUnknownCard()
    {
        await using var dbContext = CreateDbContext();
        var art = new RecordingCardArtWriteService();

        var result = await CreateService(dbContext, art).DeleteCardAsync("N-404", force: true);

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Card.Delete.NotFound", result.Errors[0].Code);
        Assert.AreEqual(0, art.DeletedCardIds.Count);
    }

    [TestMethod]
    public async Task DeleteCardAsync_RefusesWhileADeckUsesTheCardAndChangesNothing()
    {
        await using var dbContext = CreateDbContext();
        var entry = await SeedCardAsync(dbContext);
        await SeedDeckAsync(dbContext, entry, quantity: 3);
        var art = new RecordingCardArtWriteService();

        var result = await CreateService(dbContext, art).DeleteCardAsync(CardId, force: false);

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Card.Delete.InUse", result.Errors[0].Code);
        StringAssert.Contains(result.Errors[0].Description, "1 deck(s)", "the refusal has to say what is in the way");

        Assert.AreEqual(1, await dbContext.CardCatalogEntries.CountAsync(), "a refused delete must not touch the row");
        Assert.AreEqual(1, await dbContext.DeckCards.CountAsync());
        Assert.AreEqual(0, art.DeletedCardIds.Count, "a refused delete must not touch the card's art");
    }

    [TestMethod]
    public async Task DeleteCardAsync_WithForceRemovesTheCardAndEveryRowThatReferencedIt()
    {
        await using var dbContext = CreateDbContext();
        var entry = await SeedCardAsync(dbContext);
        await SeedDeckAsync(dbContext, entry, quantity: 3);
        await SeedSavedDeckAsync(dbContext, cardId: CardId);
        var art = new RecordingCardArtWriteService();

        var result = await CreateService(dbContext, art).DeleteCardAsync(CardId, force: true);

        Assert.IsFalse(result.IsError, result.IsError ? result.Errors[0].Description : null);
        Assert.AreEqual(1, result.Value.DeckCount);
        Assert.AreEqual(1, result.Value.SavedDeckCount);
        Assert.AreEqual(CardId, result.Value.CardId);

        Assert.AreEqual(0, await dbContext.CardCatalogEntries.CountAsync());
        Assert.AreEqual(0, await dbContext.DeckCards.CountAsync(), "a restricting FK cannot be left pointing at a deleted card");
        Assert.AreEqual(0, await dbContext.SavedDeckCards.CountAsync(), "a saved deck would otherwise list a card that no longer resolves");
        Assert.AreEqual(1, await dbContext.Decks.CountAsync(), "the deck itself stays; only its card row goes");

        CollectionAssert.AreEqual(new[] { CardId }, art.DeletedCardIds, "the deleted card's art is cleaned up eagerly");
    }

    [TestMethod]
    public async Task DeleteCardAsync_DeletesAnUnusedCardWithoutAsking()
    {
        await using var dbContext = CreateDbContext();
        await SeedCardAsync(dbContext);
        var art = new RecordingCardArtWriteService();

        var result = await CreateService(dbContext, art).DeleteCardAsync(CardId, force: false);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(0, result.Value.DeckCount);
        Assert.AreEqual(0, result.Value.SavedDeckCount);
        Assert.AreEqual(0, await dbContext.CardCatalogEntries.CountAsync());
        CollectionAssert.AreEqual(new[] { CardId }, art.DeletedCardIds);
    }

    [TestMethod]
    public async Task DeleteCardAsync_MatchesTheCardIdCaseInsensitively()
    {
        await using var dbContext = CreateDbContext();
        await SeedCardAsync(dbContext);

        var result = await CreateService(dbContext, new RecordingCardArtWriteService())
            .DeleteCardAsync("n-001", force: false);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(CardId, result.Value.CardId, "the response reports the stored id, not the queried one");
        Assert.AreEqual(0, await dbContext.CardCatalogEntries.CountAsync());
    }

    [TestMethod]
    public async Task DeleteCardAsync_CountsADeckOnceEvenWhenItListsTheCardTwice()
    {
        // The count is what the admin is agreeing to, so it counts decks rather than rows.
        await using var dbContext = CreateDbContext();
        var entry = await SeedCardAsync(dbContext);
        await SeedDeckAsync(dbContext, entry, quantity: 1);
        await SeedDeckAsync(dbContext, entry, quantity: 2, deckId: Guid.NewGuid());
        var art = new RecordingCardArtWriteService();

        var result = await CreateService(dbContext, art).DeleteCardAsync(CardId, force: true);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(2, result.Value.DeckCount, "two rows in two different decks is two decks");
        Assert.AreEqual(0, await dbContext.DeckCards.CountAsync());
    }

    private static CardDeletionService CreateService(ApplicationDbContext dbContext, ICardArtWriteService art)
    {
        return new CardDeletionService(dbContext, art, NullLogger<CardDeletionService>.Instance);
    }

    private static async Task<CardCatalogEntry> SeedCardAsync(ApplicationDbContext dbContext)
    {
        var entry = new CardCatalogEntry
        {
            CardId = CardId,
            Image = CardArtSourceReference.BuildLocalReference(CardId),
            DisplayName = "Test Card",
            Type = CardType.Character,
            Color = CardColor.Red,
            Description = string.Empty,
            NameJson = "[]",
            TraitsJson = "[]",
            ConditionsJson = "[]",
            EffectsJson = "[]",
            Health = 3,
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow,
        };

        dbContext.CardCatalogEntries.Add(entry);
        await dbContext.SaveChangesAsync();

        return entry;
    }

    private static async Task SeedDeckAsync(
        ApplicationDbContext dbContext,
        CardCatalogEntry entry,
        int quantity,
        Guid? deckId = null)
    {
        var deck = new Deck
        {
            Id = deckId ?? Guid.NewGuid(),
            Type = DeckType.Public,
            UserId = null,
        };

        dbContext.Decks.Add(deck);
        dbContext.DeckCards.Add(new DeckCard
        {
            DeckId = deck.Id,
            CardCatalogEntryId = entry.Id,
            Quantity = quantity,
        });

        await dbContext.SaveChangesAsync();
    }

    private static async Task SeedSavedDeckAsync(ApplicationDbContext dbContext, string cardId)
    {
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = "saved-deck-owner@hiddenvillage.local",
            Username = "saved-deck-owner",
            PasswordHash = "not-a-real-hash",
        };

        var savedDeck = new SavedDeck
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            User = user,
            Name = "Saved Deck",
        };

        dbContext.Users.Add(user);
        dbContext.SavedDecks.Add(savedDeck);
        dbContext.SavedDeckCards.Add(new SavedDeckCard
        {
            SavedDeckId = savedDeck.Id,
            CardId = cardId,
            Quantity = 3,
        });

        await dbContext.SaveChangesAsync();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"card-deletion-tests-{Guid.NewGuid()}")
            .Options;

        return new ApplicationDbContext(options);
    }

    private sealed class RecordingCardArtWriteService : ICardArtWriteService
    {
        public List<string> DeletedCardIds { get; } = [];

        public Task<ErrorOr<Deleted>> DeleteUploadAsync(string cardId, CancellationToken cancellationToken)
        {
            DeletedCardIds.Add(cardId);
            return Task.FromResult<ErrorOr<Deleted>>(Result.Deleted);
        }

        public Task<ErrorOr<CardArtUploadResult>> StoreUploadAsync(
            string cardId,
            Stream content,
            string? contentType,
            CancellationToken cancellationToken)
        {
            throw new NotSupportedException("The deletion service never stores art.");
        }
    }
}
