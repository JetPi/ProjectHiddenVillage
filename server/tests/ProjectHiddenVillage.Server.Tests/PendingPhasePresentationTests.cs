using ProjectHiddenVillage.Server;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// The phase-presentation receipt: every connected participant has to acknowledge it, a repeat is a no-op, a
/// disconnect releases the requirement, and an acknowledgement for an id that is no longer pending is ignored
/// instead of becoming an error a player would see.
/// </summary>
[TestClass]
public sealed class PendingPhasePresentationTests
{
    [TestMethod]
    public void Acknowledge_WaitsForEveryRequiredPlayer()
    {
        var presentation = CreatePresentation("p1", "p2");

        Assert.IsFalse(presentation.IsSatisfied);

        presentation.Acknowledge("p1");
        Assert.IsFalse(presentation.IsSatisfied, "The engine must not resume while p2 is still presenting.");

        presentation.Acknowledge("p2");
        Assert.IsTrue(presentation.IsSatisfied);
        CollectionAssert.AreEquivalent(new[] { "p1", "p2" }, presentation.AcknowledgedPlayerIds.ToArray());
    }

    [TestMethod]
    public void Acknowledge_IgnoresRepeatsAndUnknownPlayers()
    {
        var presentation = CreatePresentation("p1");

        presentation.Acknowledge("p2");
        presentation.Acknowledge("p1");
        presentation.Acknowledge("p1");

        Assert.IsTrue(presentation.IsSatisfied);
        CollectionAssert.AreEqual(new[] { "p1" }, presentation.AcknowledgedPlayerIds.ToArray());
    }

    [TestMethod]
    public void ReleaseRequirement_DropsADisconnectedPlayer()
    {
        var presentation = CreatePresentation("p1", "p2");
        presentation.Acknowledge("p1");

        Assert.IsFalse(presentation.IsSatisfied);

        // The second tab closes before it can present the transition: the engine must not wait for it.
        Assert.IsTrue(presentation.ReleaseRequirement("p2"));

        Assert.IsTrue(presentation.IsSatisfied);
        CollectionAssert.AreEqual(new[] { "p1" }, presentation.RequiredAckPlayerIds.ToArray());
        Assert.IsFalse(presentation.ReleaseRequirement("p2"), "A player who is not required cannot be released twice.");
    }

    [TestMethod]
    public void ReleaseRequirement_OnARequirementThatCompletesThePresentation()
    {
        var presentation = CreatePresentation("p1", "p2");

        presentation.ReleaseRequirement("p1");
        presentation.ReleaseRequirement("p2");

        Assert.IsTrue(presentation.IsSatisfied);
        Assert.AreEqual(0, presentation.RequiredAckPlayerIds.Count);
    }

    [TestMethod]
    public void Constructor_DeduplicatesAndDropsBlankPlayers()
    {
        var presentation = new PendingPhasePresentation(
            "presentation-1",
            GamePhase.DrawPhase,
            PhasePresentationKind.Draw,
            turnNumber: 3,
            requiredAckPlayerIds: ["p1", "p1", " ", "p2"]);

        CollectionAssert.AreEqual(new[] { "p1", "p2" }, presentation.RequiredAckPlayerIds.ToArray());
    }

    [TestMethod]
    public void Mint_StopsOnTheCurrentTransitionAndReplacesThePreviousOne()
    {
        var instance = CreateInstance(GamePhase.DrawPhase);

        var first = instance.MintPhasePresentation(PhasePresentationKind.Draw, ["p1", "p2"]);
        var second = instance.MintPhasePresentation(PhasePresentationKind.Draw, ["p1", "p2"]);

        Assert.AreNotEqual(first.PresentationId, second.PresentationId);
        Assert.AreEqual(second.PresentationId, instance.PendingPhasePresentation!.PresentationId);
        Assert.AreEqual(GamePhase.DrawPhase, second.Phase);
        Assert.AreEqual(3, second.TurnNumber);
        Assert.AreEqual("phase_presented", instance.ActionLog.Last().ActionType);
    }

    [TestMethod]
    public void Mint_RefusesAPresentationWithNothingToShow()
    {
        var instance = CreateInstance(GamePhase.MainPhase);

        var error = Assert.ThrowsException<InvalidOperationException>(
            () => instance.MintPhasePresentation(PhasePresentationKind.None, ["p1"]));

        StringAssert.Contains(error.Message, "nothing to show");
    }

    [TestMethod]
    public void AcknowledgePhasePresentation_IgnoresExpiredIdsAndUnrequiredPlayers()
    {
        var instance = CreateInstance(GamePhase.DrawPhase);
        var presentation = instance.MintPhasePresentation(PhasePresentationKind.Draw, ["p1"]);
        var supersededId = Guid.NewGuid().ToString("N");

        Assert.IsFalse(instance.AcknowledgePhasePresentation(supersededId, "p1"), "An expired id must be ignored.");
        Assert.IsFalse(instance.AcknowledgePhasePresentation(presentation.PresentationId, "p2"), "p2 is not required.");
        Assert.IsTrue(instance.AcknowledgePhasePresentation(presentation.PresentationId, "p1"));
        Assert.IsTrue(instance.PendingPhasePresentation!.IsSatisfied);
        Assert.AreEqual("phase_presentation_acknowledged", instance.ActionLog.Last().ActionType);
    }

    [TestMethod]
    public void ClearPhasePresentation_ResumesTheAutomation()
    {
        var instance = CreateInstance(GamePhase.EndStep);
        instance.MintPhasePresentation(PhasePresentationKind.TurnEnd, ["p1", "p2"]);

        instance.ClearPhasePresentation();

        Assert.IsNull(instance.PendingPhasePresentation);
    }

    [TestMethod]
    public void ValidateInvariants_RejectsAPresentationFromAnotherPhase()
    {
        var instance = CreateInstance(GamePhase.DrawPhase);
        instance.MintPhasePresentation(PhasePresentationKind.Draw, ["p1"]);

        // A transition that ran past the acknowledgement it owed is exactly what this invariant is for.
        instance.State.Phase = GamePhase.RefreshPhase;

        var error = Assert.ThrowsException<InvalidOperationException>(() => instance.ValidateInvariants());
        StringAssert.Contains(error.Message, "belongs to");
    }

    [TestMethod]
    public void ValidateInvariants_RejectsARequiredPlayerWhoIsNotInTheGame()
    {
        var instance = CreateInstance(GamePhase.DrawPhase);
        instance.MintPhasePresentation(PhasePresentationKind.Draw, ["ghost-player"]);

        var error = Assert.ThrowsException<InvalidOperationException>(() => instance.ValidateInvariants());
        StringAssert.Contains(error.Message, "unknown player");
    }

    private static PendingPhasePresentation CreatePresentation(params string[] requiredPlayerIds)
    {
        return new PendingPhasePresentation(
            presentationId: Guid.NewGuid().ToString("N"),
            phase: GamePhase.DrawPhase,
            kind: PhasePresentationKind.Draw,
            turnNumber: 1,
            requiredAckPlayerIds: requiredPlayerIds);
    }

    private static GameInstance CreateInstance(GamePhase phase)
    {
        var state = new GameState
        {
            Phase = phase,
            TurnNumber = 3,
            ActivePlayerId = "p1",
            Players =
            [
                new PlayerState { PlayerId = "p1" },
                new PlayerState { PlayerId = "p2" }
            ]
        };

        return new GameInstance(state);
    }
}
