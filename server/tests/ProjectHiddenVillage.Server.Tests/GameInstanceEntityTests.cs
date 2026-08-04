using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using GameInstanceEntity = ProjectHiddenVillage.Server.Data.Entities.GameInstance;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class GameInstanceEntityTests
{
    [TestMethod]
    public void NewEntity_InitializesAllRuntimeCardCollections()
    {
        var entity = new GameInstanceEntity();

        Assert.IsNotNull(entity.Player1RuntimeDeckCards);
        Assert.IsNotNull(entity.Player1CharacterFieldCards);
        Assert.IsNotNull(entity.Player1SupportAreaCards);
        Assert.IsNotNull(entity.Player1TrashCards);
        Assert.IsNotNull(entity.Player2RuntimeDeckCards);
        Assert.IsNotNull(entity.Player2CharacterFieldCards);
        Assert.IsNotNull(entity.Player2SupportAreaCards);
        Assert.IsNotNull(entity.Player2TrashCards);
        Assert.AreEqual(0, entity.Player1CharacterFieldCards.Count);
        Assert.AreEqual(0, entity.Player1SupportAreaCards.Count);
        Assert.AreEqual(0, entity.Player2CharacterFieldCards.Count);
        Assert.AreEqual(0, entity.Player2SupportAreaCards.Count);
    }

    [TestMethod]
    public void Serialize_ExposesNewRuntimeCardAreas()
    {
        var entity = new GameInstanceEntity();
        var json = JsonSerializer.Serialize(entity, new JsonSerializerOptions(JsonSerializerDefaults.Web));

        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        Assert.IsTrue(root.TryGetProperty("player1CharacterFieldCards", out _));
        Assert.IsTrue(root.TryGetProperty("player1SupportAreaCards", out _));
        Assert.IsTrue(root.TryGetProperty("player2CharacterFieldCards", out _));
        Assert.IsTrue(root.TryGetProperty("player2SupportAreaCards", out _));
    }
}