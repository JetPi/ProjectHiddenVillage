using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class GameInstanceSerializationTests
{
    private readonly GameInstanceFactory factory = new();

    [TestMethod]
    public void Serialize_ExposesSummonCardFlagsInState()
    {
        var game = factory.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] },
                new Player { Id = "p2", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildDefinitions("card-1"),
            random: new FixedIndexRandom(0));

        var json = JsonSerializer.Serialize(game, new JsonSerializerOptions(JsonSerializerDefaults.Web));

        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        var state = root.GetProperty("state");

        Assert.IsTrue(state.GetProperty("player1SummonCard").GetBoolean());
        Assert.IsTrue(state.GetProperty("player2SummonCard").GetBoolean());
    }

    private static Dictionary<string, Card> BuildDefinitions(params string[] ids)
    {
        return ids.ToDictionary(
            keySelector: id => id,
            elementSelector: id => new Card
            {
                Id = id,
                DisplayName = id,
                Name = [id],
                Type = CardType.Character,
                Traits = [],
                Color = CardColor.Red,
                Description = string.Empty,
                Conditions = [],
                Effects = []
            },
            comparer: StringComparer.Ordinal);
    }

    private sealed class FixedIndexRandom(int fixedIndex) : Random
    {
        public override int Next(int maxValue)
        {
            if (maxValue <= 0)
            {
                throw new ArgumentOutOfRangeException(nameof(maxValue), "maxValue must be positive.");
            }

            return fixedIndex % maxValue;
        }
    }
}
