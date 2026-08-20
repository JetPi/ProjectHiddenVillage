using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class CardDataSourceMapperTests
{
    [TestMethod]
    public void ToCard_MapsLeaderPayload_IntoLeaderCard()
    {
        var source = new CardDataSourceRecord
        {
            CardNo = " N-001 ",
            Name = " Naruto Uzumaki ",
            Image = "https://example.com/N-001.webp",
            Color = "Red",
            CategoryData = "LEADER",
            Rarity = "L",
            Cost = null,
            Power = "3",
            Attribute = " ",
            Effect = "[Activate: Main] Example.<br>[Recovery] If it is the second turn or later.",
            OriginalId = "N-001",
            Series = "TBA",
            SeriesName = "NARUTO CARD GAME 2027",
            MainAlternate = true,
            Abbreviation = null,
            CreatedAt = new DateTimeOffset(2026, 7, 29, 14, 31, 38, TimeSpan.Zero),
            Damage = 1,
            Health = null,
            Trait = "Wind/Jinchuriki/Hidden Leaf Village/Team 7"
        };

        var result = CardDataSourceMapper.ToCard(source);
        var leader = result as LeaderCard;

        Assert.AreEqual("N-001", result.Id);
        Assert.AreEqual("https://example.com/N-001.webp", result.Image);
        Assert.AreEqual("N-001", result.OriginalId);
        Assert.IsTrue(result.MainAlternate);
        Assert.IsNull(result.Attribute);
        Assert.AreEqual("Naruto Uzumaki", result.DisplayName);
        CollectionAssert.AreEqual(new List<string> { "Naruto Uzumaki" }, result.Name);
        CollectionAssert.AreEqual(new List<string> { "Wind", "Jinchuriki", "Hidden Leaf Village", "Team 7" }, result.Traits);
        Assert.AreEqual(CardType.Leader, result.Type);
        Assert.AreEqual(CardColor.Red, result.Color);
        Assert.AreEqual(3, result.Power);
        Assert.AreEqual(1, result.Damage);
        Assert.AreEqual(2, result.Conditions.Count);
        CollectionAssert.AreEqual(
            new List<string> { EffectConditionKeywords.ActivateMain, EffectConditionKeywords.Recovery },
            result.Conditions.ToList());
        Assert.AreEqual("[Activate: Main] Example.", result.MainEffect);
        Assert.IsNotNull(leader);
        Assert.AreEqual("If it is the second turn or later.", leader.RecoveryEffect);
    }

    [TestMethod]
    public void ToCard_MapsCharacterPayload_IntoCharacterCard()
    {
        var source = new CardDataSourceRecord
        {
            CardNo = "C-007",
            Name = "Sasuke Uchiha",
            Image = "https://example.com/C-007.webp",
            Color = "Blue",
            CategoryData = "CHARACTER",
            Rarity = "R",
            Cost = 2,
            Power = "not-an-int",
            OriginalId = "C-007",
            Series = "TBA",
            SeriesName = "NARUTO CARD GAME 2027"
        };

        var result = CardDataSourceMapper.ToCard(source);
        var character = result as CharacterCard;

        Assert.AreEqual("C-007", result.Id);
        Assert.AreEqual("https://example.com/C-007.webp", result.Image);
        Assert.AreEqual("C-007", result.OriginalId);
        Assert.IsFalse(result.MainAlternate);
        Assert.IsNull(result.Attribute);
        Assert.AreEqual(CardType.Character, result.Type);
        Assert.AreEqual(CardColor.Blue, result.Color);
        Assert.AreEqual(0, result.Power);
        Assert.AreEqual(0, result.Conditions.Count);
        Assert.IsNotNull(character);
    }

    [TestMethod]
    public void ToCard_ExtractsSupportName_WithoutNamedCardReferenceCondition()
    {
        var source = new CardDataSourceRecord
        {
            CardNo = "C-015",
            Name = "Hinata Hyuga",
            Image = "https://example.com/C-015.webp",
            Color = "Green",
            CategoryData = "CHARACTER",
            Rarity = "R",
            Cost = 3,
            Power = "2",
            OriginalId = "C-015",
            Series = "TBA",
            SeriesName = "NARUTO CARD GAME 2027",
            Effect = "[Support] [8-Trigram] Air Palm<br>Choose 1 of your [Naruto Uzumaki]: It gets +2 power this turn."
        };

        var result = CardDataSourceMapper.ToCard(source);
        var character = result as CharacterCard;

        Assert.IsNotNull(character);
        Assert.AreEqual("[8-Trigram] Air Palm", character.SupportName);
        Assert.AreEqual("Choose 1 of your [Naruto Uzumaki]: It gets +2 power this turn.", character.SupportEffect);
        Assert.AreEqual(string.Empty, result.MainEffect);
        Assert.AreEqual(1, result.Conditions.Count);
        Assert.AreEqual(EffectConditionKeywords.Support, result.Conditions[0]);
    }

    [TestMethod]
    public void ToCard_ExtractsSupportEffect_BetweenFirstAndSecondBr()
    {
        var source = new CardDataSourceRecord
        {
            CardNo = "C-099",
            Name = "Jiraiya",
            Image = "https://example.com/C-099.webp",
            Color = "Red",
            CategoryData = "CHARACTER",
            Cost = 3,
            OriginalId = "C-099",
            Effect = "[Support] Fire Style: Toad Flame Bombs<br>[During Your Opponent's Attack] Choose up to 2 rested Characters: K.O. the chosen cards.<br>[Flavor] text"
        };

        var result = CardDataSourceMapper.ToCard(source);
        var character = result as CharacterCard;

        Assert.IsNotNull(character);
        Assert.AreEqual("Fire Style: Toad Flame Bombs", character.SupportName);
        Assert.AreEqual("[During Your Opponent's Attack] Choose up to 2 rested Characters: K.O. the chosen cards.", character.SupportEffect);
        Assert.AreEqual(string.Empty, result.MainEffect);
    }

    [TestMethod]
    public void ToCard_ExtractsMainEffect_UntilSupportOrRecovery_AndStripsBrTags()
    {
        var source = new CardDataSourceRecord
        {
            CardNo = "L-010",
            Name = "Shikamaru Nara",
            Image = "https://example.com/L-010.webp",
            Color = "Green",
            CategoryData = "LEADER",
            OriginalId = "L-010",
            Effect = "[Activate: Main] Flip 1 of your CHAKRA face-down and choose 1 Character: The chosen card gets +3 power during this turn.<br>[Recovery] If it is the second turn or later, rest this card and flip all of your CHAKRA face-up."
        };

        var result = CardDataSourceMapper.ToCard(source);

        Assert.AreEqual(
            "[Activate: Main] Flip 1 of your CHAKRA face-down and choose 1 Character: The chosen card gets +3 power during this turn.",
            result.MainEffect);
    }

    [TestMethod]
    public void ToCard_SetsCannotBeNormalSummoned_WhenDescriptionContainsMarker()
    {
        var source = new CardDataSourceRecord
        {
            CardNo = "C-321",
            Name = "Gaara",
            Image = "https://example.com/C-321.webp",
            Color = "Red",
            CategoryData = "CHARACTER",
            OriginalId = "C-321",
            Effect = "[Summon Requirements] This card cannot be summoned normally."
        };

        var result = CardDataSourceMapper.ToCard(source);

        Assert.IsTrue(result.CannotBeNormalSummoned);
    }
}