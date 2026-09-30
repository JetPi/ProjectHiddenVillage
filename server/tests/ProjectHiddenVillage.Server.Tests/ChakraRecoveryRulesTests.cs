using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

// ChakraRecoveryRules is the single home for the leader Recovery gate: the response mapper publishes it as
// the leader option's availability and the registry refuses a direct submit with the same reason, so both
// sides are pinned here.
[TestClass]
public sealed class ChakraRecoveryRulesTests
{
    [TestMethod]
    public void CanActivateLeaderRecovery_RefusesTheFirstTurn()
    {
        var state = new GameState();
        var player = BuildPlayer(turnCount: 1, resourcePool: 0);

        var canActivate = ChakraRecoveryRules.CanActivateLeaderRecovery(state, player, out var disabledReason);

        Assert.IsFalse(canActivate);
        Assert.AreEqual("Recovery can only be activated starting from your second turn.", disabledReason);
    }

    [TestMethod]
    public void CanActivateLeaderRecovery_Refuses_WhenAllChakraCardsAreFaceUp()
    {
        var state = new GameState();
        var player = BuildPlayer(turnCount: 2, resourcePool: PlayerState.ChakraCardCount);

        var canActivate = ChakraRecoveryRules.CanActivateLeaderRecovery(state, player, out var disabledReason);

        Assert.IsFalse(canActivate);
        Assert.AreEqual("All chakra cards are already face up.", disabledReason);
    }

    [TestMethod]
    public void CanActivateLeaderRecovery_Refuses_WhileChakraRecoveryIsLocked()
    {
        var state = new GameState();
        state.AppliedCardEffects.Add(new AppliedCardEffectState
        {
            SourceCardInstanceId = "lock-source",
            EffectSpecId = "chakra-freeze",
            ModifierKind = AppliedCardModifierKind.ChakraRecoveryLock,
            DurationMode = EffectDurationMode.UntilTheEndOfYourNextTurn,
            TargetPlayerId = "p1",
            AppliedByPlayerId = "p2",
            AppliedTurnNumber = state.TurnNumber,
        });

        var player = BuildPlayer(turnCount: 2, resourcePool: 3);

        var canActivate = ChakraRecoveryRules.CanActivateLeaderRecovery(state, player, out var disabledReason);

        Assert.IsFalse(canActivate);
        Assert.AreEqual("Your chakra is locked and cannot be turned face-up.", disabledReason);
    }

    [TestMethod]
    public void CanActivateLeaderRecovery_Allows_FromTheSecondTurn_WithFaceDownChakra()
    {
        var state = new GameState();
        var player = BuildPlayer(turnCount: 2, resourcePool: 2);

        var canActivate = ChakraRecoveryRules.CanActivateLeaderRecovery(state, player, out var disabledReason);

        Assert.IsTrue(canActivate);
        Assert.IsNull(disabledReason);
    }

    [TestMethod]
    public void ClampRecoveryAmount_NeverPushesThePoolPastTheChakraCardCount()
    {
        var player = BuildPlayer(turnCount: 3, resourcePool: 3);

        Assert.AreEqual(2, ChakraRecoveryRules.ClampRecoveryAmount(player, 5));
        Assert.AreEqual(2, ChakraRecoveryRules.ClampRecoveryAmount(player, 2));

        player.ResourcePool = PlayerState.ChakraCardCount;
        Assert.AreEqual(0, ChakraRecoveryRules.ClampRecoveryAmount(player, 5));
    }

    private static PlayerState BuildPlayer(int turnCount, int resourcePool)
    {
        return new PlayerState
        {
            PlayerId = "p1",
            TurnCount = turnCount,
            ResourcePool = resourcePool,
        };
    }
}
