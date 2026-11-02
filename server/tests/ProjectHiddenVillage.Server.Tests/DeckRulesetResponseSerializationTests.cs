using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Serialization;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// Pins the wire shape the admin screen reads. The API serialises enums as numbers
/// (see <see cref="FlexibleEnumJsonConverterFactory"/>), so any response field the client compares against a name has
/// to be a string on the DTO - otherwise the client sees <c>1</c> where it expects <c>"AllowList"</c> and silently
/// falls back to the first option in a select.
/// </summary>
[TestClass]
public sealed class DeckRulesetResponseSerializationTests
{
    [TestMethod]
    public void DeckRulesetResponse_WritesThePoolModeAndRuleTypeAsNames()
    {
        var response = new DeckRulesetResponse(
            Id: Guid.Parse("20000000-0000-0000-0000-000000000002"),
            Key: "pre-release",
            Name: "Pre-Release",
            IsActive: true,
            CardPoolMode: CardPoolMode.AllowList.ToString(),
            LeaderCount: 1,
            NonLeaderCardCount: 30,
            MaxCopiesPerNonLeaderCard: 3,
            RequireLeaderColorMatch: true,
            SortOrder: 1,
            CardRestrictions:
            [
                new DeckRulesetCardRestrictionResponse(
                    MatchType: CardRestrictionMatchType.Set.ToString(),
                    Code: "SAMPLE",
                    MaxCopies: DeckRulesetCardRule.UnlimitedCopies),
            ]);

        var json = JsonSerializer.Serialize(response, CreateApiOptions());

        StringAssert.Contains(json, "\"cardPoolMode\":\"AllowList\"");
        StringAssert.Contains(json, "\"matchType\":\"Set\"");
        StringAssert.Contains(json, "\"code\":\"SAMPLE\"");
    }

    /// <summary>Mirrors the JSON options the API is configured with in <c>Program.cs</c>.</summary>
    private static JsonSerializerOptions CreateApiOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new FlexibleEnumJsonConverterFactory());
        return options;
    }
}
