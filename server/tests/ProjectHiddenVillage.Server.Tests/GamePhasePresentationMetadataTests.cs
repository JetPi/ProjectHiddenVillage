using ProjectHiddenVillage.Server;
using ProjectHiddenVillage.Server.Engine;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// Pins the phase metadata the phase-presentation handshake reads: which phases the engine ends on its own
/// and what a client has to present for each of them. A wrong entry here either strands an interactive phase
/// (a decision the players never get asked) or stops the engine on a transition with nothing to show.
/// </summary>
[TestClass]
public sealed class GamePhasePresentationMetadataTests
{
    private readonly GamePhaseStateService service = new();

    [TestMethod]
    public void AutoAdvancedPhases_AreTheNonInteractiveOnes()
    {
        GamePhase[] expectedAutoAdvanced =
        [
            GamePhase.DrawInitialHand,
            GamePhase.RefreshPhase,
            GamePhase.StartOfMainPhase,
            GamePhase.DrawPhase,
            // A pass-through stage: the engine enters it only to leave it, and nothing publishes an action for it.
            GamePhase.BlockerDeclaration,
            GamePhase.AttackResolution,
            GamePhase.BattleEndStep,
            GamePhase.EndStep,
        ];

        foreach (var phase in Enum.GetValues<GamePhase>())
        {
            Assert.AreEqual(
                expectedAutoAdvanced.Contains(phase),
                service.GetPhaseData(phase).ShouldAutoAdvance,
                $"Unexpected auto-advance flag for {phase}.");
        }
    }

    [TestMethod]
    public void InteractivePhases_NeverPresentAnything()
    {
        GamePhase[] interactive =
        [
            GamePhase.ChooseStartingPlayer,
            GamePhase.Mulligan,
            GamePhase.MainPhase,
            // Entered only when the attacker owes an optional On Attack choice, so it always asks something.
            GamePhase.AttackDeclaration,
            GamePhase.ActionStep,
        ];

        foreach (var phase in interactive)
        {
            var phaseData = service.GetPhaseData(phase);
            Assert.IsFalse(phaseData.ShouldAutoAdvance, $"{phase} must never be drained by the engine.");
            Assert.AreEqual(PhasePresentationKind.None, phaseData.PresentationKind, $"{phase} must present nothing.");
        }
    }

    [TestMethod]
    public void PresentationKinds_DescribeWhatEachTransitionsShows()
    {
        Assert.AreEqual(PhasePresentationKind.InitialDeal, service.GetPhaseData(GamePhase.DrawInitialHand).PresentationKind);
        Assert.AreEqual(PhasePresentationKind.Ready, service.GetPhaseData(GamePhase.RefreshPhase).PresentationKind);
        Assert.AreEqual(PhasePresentationKind.Draw, service.GetPhaseData(GamePhase.DrawPhase).PresentationKind);
        Assert.AreEqual(PhasePresentationKind.Damage, service.GetPhaseData(GamePhase.AttackResolution).PresentationKind);
        Assert.AreEqual(PhasePresentationKind.BattleEnd, service.GetPhaseData(GamePhase.BattleEndStep).PresentationKind);
        Assert.AreEqual(PhasePresentationKind.TurnEnd, service.GetPhaseData(GamePhase.EndStep).PresentationKind);
        // Nothing moves when the main phase starts, so the engine walks straight through it.
        Assert.AreEqual(PhasePresentationKind.None, service.GetPhaseData(GamePhase.StartOfMainPhase).PresentationKind);
    }

    [TestMethod]
    public void AutoAdvancedPhases_OfferNothingButTheEngineStep()
    {
        // A published phase option would be a decision the drain must not walk past, which is also why the
        // mapper only ever adds the system action for a phase whose option list is empty.
        foreach (var phase in Enum.GetValues<GamePhase>())
        {
            var phaseData = service.GetPhaseData(phase);
            if (phaseData.ShouldAutoAdvance)
            {
                Assert.AreEqual(0, phaseData.AvailablePhaseOptions.Count, $"{phase} publishes phase options.");
                Assert.IsFalse(phaseData.HasPlayerInteraction, $"{phase} asks the players something.");
            }
        }
    }
}
