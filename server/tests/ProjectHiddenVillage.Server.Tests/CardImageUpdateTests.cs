using Microsoft.EntityFrameworkCore;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.CardArt;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class CardImageUpdateTests
{
    private const string CardId = "N-001";
    private const string OtherCardId = "N-002";

    [TestMethod]
    public async Task UpdateCardImage_StoresAnExternalUrlAndMovesTheVersion()
    {
        await using var dbContext = CreateDbContext();
        var entry = await SeedCardAsync(dbContext, image: "local:card-art/N-001.webp");
        var previousVersion = entry.UpdatedAtUtc;

        var result = await new CardMappingService(dbContext).UpdateCardImageByCardId(
            CardId,
            new UpdateCardImageRequest("https://example.test/art/n-001.png"));

        Assert.IsFalse(result.IsError);
        Assert.AreEqual("https://example.test/art/n-001.png", result.Value.Image);

        var persisted = await dbContext.CardCatalogEntries.SingleAsync(candidate => candidate.CardId == CardId);
        Assert.AreEqual("https://example.test/art/n-001.png", persisted.Image);

        // The response's image version comes from this timestamp, so it has to move or every client keeps
        // painting the old art from cache.
        Assert.IsTrue(
            persisted.UpdatedAtUtc > previousVersion,
            "replacing art must move the card's updated timestamp");
        Assert.IsTrue(result.Value.ImageVersion > previousVersion.ToUnixTimeMilliseconds());
    }

    [TestMethod]
    public async Task UpdateCardImage_AcceptsTheLocalReferenceTheCardOwns()
    {
        await using var dbContext = CreateDbContext();
        await SeedCardAsync(dbContext, image: string.Empty);

        var result = await new CardMappingService(dbContext).UpdateCardImageByCardId(
            CardId,
            new UpdateCardImageRequest(CardArtSourceReference.BuildLocalReference(CardId)));

        Assert.IsFalse(result.IsError);
        Assert.AreEqual($"local:card-art/{CardId}.webp", result.Value.Image);
    }

    [TestMethod]
    public async Task UpdateCardImage_RefusesALocalReferenceThatBelongsToAnotherCard()
    {
        await using var dbContext = CreateDbContext();
        await SeedCardAsync(dbContext, image: string.Empty);

        var result = await new CardMappingService(dbContext).UpdateCardImageByCardId(
            CardId,
            new UpdateCardImageRequest(CardArtSourceReference.BuildLocalReference(OtherCardId)));

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Card.Image.BelongsToAnotherCard", result.Errors[0].Code);

        var persisted = await dbContext.CardCatalogEntries.SingleAsync(candidate => candidate.CardId == CardId);
        Assert.AreEqual(string.Empty, persisted.Image);
    }

    [TestMethod]
    public async Task UpdateCardImage_RefusesSomethingThatIsNeitherAUrlNorALocalReference()
    {
        await using var dbContext = CreateDbContext();
        await SeedCardAsync(dbContext, image: string.Empty);

        var result = await new CardMappingService(dbContext).UpdateCardImageByCardId(
            CardId,
            new UpdateCardImageRequest("card-art/N-001.webp"));

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Card.Image.InvalidSource", result.Errors[0].Code);
    }

    [TestMethod]
    public async Task UpdateCardImage_ClearingEmptiesTheStoredReference()
    {
        await using var dbContext = CreateDbContext();
        await SeedCardAsync(dbContext, image: CardArtSourceReference.BuildLocalReference(CardId));

        var result = await new CardMappingService(dbContext).UpdateCardImageByCardId(
            CardId,
            new UpdateCardImageRequest(null));

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(string.Empty, result.Value.Image);
    }

    [TestMethod]
    public async Task UpdateCardImage_ReportsAnUnknownCard()
    {
        await using var dbContext = CreateDbContext();

        var result = await new CardMappingService(dbContext).UpdateCardImageByCardId(
            "N-404",
            new UpdateCardImageRequest("https://example.test/art/n-404.png"));

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Card.Image.NotFound", result.Errors[0].Code);
    }

    [DataTestMethod]
    [DataRow(null)]
    [DataRow("")]
    [DataRow("   ")]
    [DataRow("https://example.test/art.png")]
    [DataRow("local:card-art/N-001.webp")]
    public void Validate_AcceptsEmptyArtAUrlAndALocalReference(string? image)
    {
        var result = new UpdateCardImageRequestValidator().Validate(new UpdateCardImageRequest(image));

        Assert.IsTrue(result.IsValid, Describe(result));
    }

    [DataTestMethod]
    [DataRow("card-art/N-001.webp")]
    [DataRow("not a url")]
    [DataRow("local:")]
    public void Validate_RejectsAnythingElse(string image)
    {
        var result = new UpdateCardImageRequestValidator().Validate(new UpdateCardImageRequest(image));

        Assert.IsFalse(result.IsValid);
    }

    [TestMethod]
    public void Validate_RejectsAReferenceOverTheColumnLength()
    {
        var result = new UpdateCardImageRequestValidator().Validate(
            new UpdateCardImageRequest($"https://example.test/{new string('a', 1024)}.png"));

        Assert.IsFalse(result.IsValid);
    }

    private static async Task<CardCatalogEntry> SeedCardAsync(ApplicationDbContext dbContext, string image)
    {
        var entry = new CardCatalogEntry
        {
            CardId = CardId,
            Image = image,
            OriginalId = CardId,
            DisplayName = "Test Card",
            Type = CardType.Character,
            Color = CardColor.Red,
            Description = string.Empty,
            Damage = 1,
            Power = 1,
            NameJson = "[]",
            TraitsJson = "[]",
            ConditionsJson = "[]",
            EffectsJson = "[]",
            Health = 3,

            // Backdated so a version bump is observable even when the update lands in the same millisecond.
            CreatedAtUtc = DateTimeOffset.UtcNow.AddHours(-1),
            UpdatedAtUtc = DateTimeOffset.UtcNow.AddHours(-1),
        };

        dbContext.CardCatalogEntries.Add(entry);
        await dbContext.SaveChangesAsync();

        return entry;
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"card-image-tests-{Guid.NewGuid()}")
            .Options;

        return new ApplicationDbContext(options);
    }

    private static string Describe(FluentValidation.Results.ValidationResult result)
    {
        return string.Join(" | ", result.Errors.Select(failure => $"{failure.PropertyName}: {failure.ErrorMessage}"));
    }
}
