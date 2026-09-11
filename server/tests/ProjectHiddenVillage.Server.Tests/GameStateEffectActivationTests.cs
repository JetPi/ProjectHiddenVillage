using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class GameStateEffectActivationTests
{
    [TestMethod]
    public void IsEffectUsedThisTurn_IsScopedToPlayerSourceEffectAndTurn()
    {
        var state = CreateState();

        state.MarkEffectUsedThisTurn("p1", "leader-1", "leader-main");

        Assert.IsTrue(state.IsEffectUsedThisTurn("p1", "leader-1", "leader-main"));
        Assert.IsFalse(state.IsEffectUsedThisTurn("p2", "leader-1", "leader-main"));
        Assert.IsFalse(state.IsEffectUsedThisTurn("p1", "leader-2", "leader-main"));
        Assert.IsFalse(state.IsEffectUsedThisTurn("p1", "leader-1", "leader-other"));
    }

    [TestMethod]
    public void IsEffectUsedThisTurn_IgnoresActivationsFromEarlierTurns()
    {
        var state = CreateState();
        state.MarkEffectUsedThisTurn("p1", "leader-1", "leader-main");

        state.TurnNumber = 5;

        Assert.IsFalse(state.IsEffectUsedThisTurn("p1", "leader-1", "leader-main"));

        state.MarkEffectUsedThisTurn("p1", "leader-1", "leader-main");

        Assert.AreEqual(1, state.EffectActivations.Count);
        Assert.IsTrue(state.IsEffectUsedThisTurn("p1", "leader-1", "leader-main"));
    }

    private static GameState CreateState()
    {
        return new GameState
        {
            GameId = "game-effects-1",
            TurnNumber = 4,
            Players =
            [
                new PlayerState { PlayerId = "p1" },
                new PlayerState { PlayerId = "p2" },
            ],
        };
    }
}
