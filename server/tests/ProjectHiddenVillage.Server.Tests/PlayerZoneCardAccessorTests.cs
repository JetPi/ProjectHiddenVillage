using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

// The leader is the one zone the accessor projects into a copy, so any effect that mutates a selected target
// (N-013's freeze adds a runtime keyword) has to go through ResolveLiveCard - writing to the projection would
// silently change nothing.
[TestClass]
public sealed class PlayerZoneCardAccessorTests
{
    [TestMethod]
    public void ResolveLiveCard_ReturnsTheStoredLeaderInstance_NotTheProjection()
    {
        var player = CreatePlayer();

        var liveLeader = PlayerZoneCardAccessor.ResolveLiveCard(PlayerZone.Leader, player, "leader-1");

        Assert.IsNotNull(liveLeader);
        Assert.AreSame(player.LeaderCardInstance, liveLeader);
        // The projection GetCards returns is a different object, which is exactly why the helper exists.
        Assert.AreNotSame(
            PlayerZoneCardAccessor.GetCards(PlayerZone.Leader, player)[0],
            liveLeader);
    }

    [TestMethod]
    public void ResolveLiveCard_ReturnsTheStoredBattlefieldInstance()
    {
        var player = CreatePlayer();
        var battlefieldCard = new CardInstance
        {
            InstanceId = "char-1",
            CardDefinitionId = "char-def",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
        };
        player.Battlefield.Add(battlefieldCard);

        Assert.AreSame(
            battlefieldCard,
            PlayerZoneCardAccessor.ResolveLiveCard(PlayerZone.CharacterField, player, "char-1"));
    }

    [TestMethod]
    public void ResolveLiveCard_ReturnsNull_ForAnUnknownOrMissingId()
    {
        var player = CreatePlayer();

        Assert.IsNull(PlayerZoneCardAccessor.ResolveLiveCard(PlayerZone.Leader, player, "other-card"));
        Assert.IsNull(PlayerZoneCardAccessor.ResolveLiveCard(PlayerZone.Leader, player, null));
        Assert.IsNull(PlayerZoneCardAccessor.ResolveLiveCard(PlayerZone.Leader, player, "  "));
        Assert.IsNull(PlayerZoneCardAccessor.ResolveLiveCard(PlayerZone.Hand, player, "char-1"));
    }

    private static PlayerState CreatePlayer()
    {
        return new PlayerState
        {
            PlayerId = "p1",
            LeaderCardInstance = new LeaderCardInstanceState
            {
                InstanceId = "leader-1",
                CardDefinitionId = "leader-def",
                OwnerPlayerId = "p1",
                ControllerPlayerId = "p1",
                Name = "Leader",
                Color = CardColor.Blue,
                Traits = ["Leader"],
                Damage = 0,
                Power = 0,
                TotalLife = 5,
                CurrentLife = 5,
                RecoveryEffect = string.Empty,
            },
        };
    }
}
