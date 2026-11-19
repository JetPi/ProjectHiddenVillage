using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// "Choose 1 Leader or Character" as its own chain step (<see cref="RuntimeEffects.SelectTargets"/>), and the
/// follow-up step that executes against that choice (<see cref="EffectExecutionTargetSource.ChainTargets"/>).
/// This is the N-013 (Itachi Uchiha) shape: the player commits to a card before the reveal, and the chain only
/// resolves the card if the reveal matched.
/// </summary>
[TestClass]
public sealed class ChainTargetSourceAuthoringTests
{
    [TestMethod]
    public void Validate_AllowsAChainThatChoosesFirstAndResolvesLater()
    {
        var request = CreateRequest(
            CreateChooseTargetEffect(),
            CreateChainTargetsEffect());

        var result = new UpdateCardEffectsRequestValidator().Validate(request);

        Assert.IsTrue(result.IsValid, Describe(result.Errors.Select(error => error.ErrorMessage)));
    }

    [TestMethod]
    public void Validate_ReturnsError_WhenChainTargetsIsUsedByANonSubordinateNode()
    {
        var chainTargetsEffect = CreateChainTargetsEffect();
        chainTargetsEffect.IsSubordinate = false;

        var request = CreateRequest(
            CreateChooseTargetEffect(),
            chainTargetsEffect);

        var result = new UpdateCardEffectsRequestValidator().Validate(request);

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(
            result.Errors.Any(error => error.ErrorMessage.Contains("mark it subordinate", StringComparison.Ordinal)),
            Describe(result.Errors.Select(error => error.ErrorMessage)));
    }

    [TestMethod]
    public void Validate_ReturnsError_WhenChainTargetsAsksForItsOwnSelection()
    {
        var chainTargetsEffect = CreateChainTargetsEffect();
        chainTargetsEffect.SelectionTiming = EffectSelectionTiming.Prompted;

        var request = CreateRequest(
            CreateChooseTargetEffect(),
            chainTargetsEffect);

        var result = new UpdateCardEffectsRequestValidator().Validate(request);

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(
            result.Errors.Any(error => error.ErrorMessage.Contains("must not ask again", StringComparison.Ordinal)),
            Describe(result.Errors.Select(error => error.ErrorMessage)));
    }

    [TestMethod]
    public void Validate_ReturnsError_WhenSelectTargetsDoesNotUseSelectedTargets()
    {
        var chooseEffect = CreateChooseTargetEffect();
        chooseEffect.ExecutionTargetSource = EffectExecutionTargetSource.None;

        var request = CreateRequest(chooseEffect);

        var result = new UpdateCardEffectsRequestValidator().Validate(request);

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(
            result.Errors.Any(error => error.ErrorMessage.Contains("Select Targets collects the player's choice", StringComparison.Ordinal)),
            Describe(result.Errors.Select(error => error.ErrorMessage)));
    }

    [TestMethod]
    public void Validate_ReturnsError_WhenARevealFirstBranchTargetReliesOnTheRevealedCards()
    {
        // The old implicit shape: the summon step carries no targets of its own and expected the executor to
        // hand it whatever the reveal turned over. That inference is gone, so authoring must name the slot.
        var request = CreateRequest(
            CreateRevealFirstEffect(readsSlot: false),
            CreateRevealedSummonEffect(readsSlot: false));

        var result = new UpdateCardEffectsRequestValidator().Validate(request);

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(
            result.Errors.Any(error => error.ErrorMessage.Contains("no longer infers the revealed cards", StringComparison.Ordinal)),
            Describe(result.Errors.Select(error => error.ErrorMessage)));
    }

    [TestMethod]
    public void Validate_AllowsARevealChainThatReadsTheRevealsSlot()
    {
        var request = CreateRequest(
            CreateRevealFirstEffect(readsSlot: true),
            CreateRevealedSummonEffect(readsSlot: true));

        var result = new UpdateCardEffectsRequestValidator().Validate(request);

        Assert.IsTrue(result.IsValid, Describe(result.Errors.Select(error => error.ErrorMessage)));
    }

    private static EffectSpec CreateRevealFirstEffect(bool readsSlot)
    {
        return new EffectSpec
        {
            Id = "reveal-top",
            IsSubordinate = true,
            RuntimeEffectType = RuntimeEffects.RevealCard,
            EffectType = EffectKind.Activated,
            Timing = EffectTiming.OnSummon,
            DurationMode = EffectDurationMode.Instant,
            RevealTimingMode = RevealTimingMode.RevealFirst,
            OnSuccessEffectId = "summon-revealed-card",
            ExecutionTargetSource = EffectExecutionTargetSource.SelectedTargets,
            TargetSlotName = readsSlot ? "revealed" : null,
            ExecutionFlowMode = EffectExecutionFlowMode.PerStep,
            ContextRules = [],
            TargetRules = new EffectTargetRuleSet
            {
                AutoSelectAllValidTargets = true,
                Rules = [],
            },
        };
    }

    private static EffectSpec CreateRevealedSummonEffect(bool readsSlot)
    {
        return new EffectSpec
        {
            Id = "summon-revealed-card",
            IsSubordinate = true,
            RuntimeEffectType = RuntimeEffects.SummonCard,
            EffectType = EffectKind.Activated,
            Timing = EffectTiming.OnSummon,
            DurationMode = EffectDurationMode.Instant,
            ExecutionTargetSource = readsSlot
                ? EffectExecutionTargetSource.ChainTargets
                : EffectExecutionTargetSource.SelectedTargets,
            ChainTargetSlotName = readsSlot ? "revealed" : null,
            ExecutionFlowMode = EffectExecutionFlowMode.PerStep,
            ContextRules = [],
            TargetRules = new EffectTargetRuleSet { Rules = [] },
        };
    }

    [TestMethod]
    public void Validate_ReturnsError_WhenTwoProducersPublishTheSameSlotName()
    {
        // One slot is one set of targets; a second publisher would make the consumer ambiguous.
        var secondChooseEffect = CreateChooseTargetEffect();
        secondChooseEffect.Id = "choose-again";
        secondChooseEffect.OnSuccessEffectId = null;

        var request = CreateRequest(CreateChooseTargetEffect(), secondChooseEffect, CreateChainTargetsEffect());

        var result = new UpdateCardEffectsRequestValidator().Validate(request);

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(
            result.Errors.Any(error => error.ErrorMessage.Contains("must be unique on the card", StringComparison.Ordinal)),
            Describe(result.Errors.Select(error => error.ErrorMessage)));
    }

    [TestMethod]
    public void Validate_ReturnsError_WhenTheSlotIsOnlyPublishedByALaterStep()
    {
        // The publisher sits behind the reader, so its slot can never be populated when the reader executes.
        var consumerEffect = CreateChainTargetsEffect();
        consumerEffect.OnSuccessEffectId = "late-producer";

        var lateProducer = CreateChooseTargetEffect();
        lateProducer.Id = "late-producer";
        lateProducer.OnSuccessEffectId = null;

        var request = CreateRequest(consumerEffect, lateProducer);

        var result = new UpdateCardEffectsRequestValidator().Validate(request);

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(
            result.Errors.Any(error => error.ErrorMessage.Contains("earlier in the same chain", StringComparison.Ordinal)),
            Describe(result.Errors.Select(error => error.ErrorMessage)));
    }

    [TestMethod]
    public void Validate_ReturnsError_WhenNoStepPublishesTheNamedSlot()
    {
        var consumerEffect = CreateChainTargetsEffect();
        consumerEffect.ChainTargetSlotName = "not-published";
        consumerEffect.IsSubordinate = false;

        var request = CreateRequest(CreateChooseTargetEffect(), consumerEffect);

        var result = new UpdateCardEffectsRequestValidator().Validate(request);

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(
            result.Errors.Any(error => error.ErrorMessage.Contains("earlier in the same chain", StringComparison.Ordinal)),
            Describe(result.Errors.Select(error => error.ErrorMessage)));
    }

    [TestMethod]
    public void Validate_ReturnsError_WhenASlotConsumerIsNotAChainTargetsStep()
    {
        var consumerEffect = CreateChainTargetsEffect();
        consumerEffect.ExecutionTargetSource = EffectExecutionTargetSource.SelectedTargets;

        var request = CreateRequest(CreateChooseTargetEffect(), consumerEffect);

        var result = new UpdateCardEffectsRequestValidator().Validate(request);

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(
            result.Errors.Any(error => error.ErrorMessage.Contains("Chain Target Slot is only meaningful", StringComparison.Ordinal)),
            Describe(result.Errors.Select(error => error.ErrorMessage)));
    }

    [TestMethod]
    public void Validate_ReturnsError_WhenAProducerDoesNotResolveItsOwnTargets()
    {
        var producerEffect = CreateChooseTargetEffect();
        producerEffect.ExecutionTargetSource = EffectExecutionTargetSource.None;
        producerEffect.SelectionTiming = EffectSelectionTiming.Upfront;

        var request = CreateRequest(producerEffect, CreateChainTargetsEffect());

        var result = new UpdateCardEffectsRequestValidator().Validate(request);

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(
            result.Errors.Any(error => error.ErrorMessage.Contains("Only a step that resolves its own targets can publish a target slot", StringComparison.Ordinal)),
            Describe(result.Errors.Select(error => error.ErrorMessage)));
    }

    [TestMethod]
    public void Validate_ReturnsError_WhenAnAutomaticTriggerCollectsAnUpfrontSelection()
    {
        // The automatic triggers run with no activation payload, so an upfront Select Targets step would resolve
        // zero targets and end the chain without asking anything - the mistake that made N-013 do nothing.
        var chooseEffect = CreateChooseTargetEffect();
        chooseEffect.SelectionTiming = EffectSelectionTiming.Upfront;

        var request = CreateRequest(chooseEffect, CreateChainTargetsEffect());

        var result = new UpdateCardEffectsRequestValidator().Validate(request);

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(
            result.Errors.Any(error => error.ErrorMessage.Contains("cannot receive an upfront selection", StringComparison.Ordinal)),
            Describe(result.Errors.Select(error => error.ErrorMessage)));
    }

    [TestMethod]
    public void Validate_ReturnsError_WhenARevealFirstStepResolvesTheChainsChoice()
    {
        // A Reveal First step's post-condition is evaluated on the cards it turns over, so it must name them
        // itself: taking the chain's earlier choice revealed the picked Leader/Character instead of the deck top.
        var revealEffect = new EffectSpec
        {
            Id = "reveal-top",
            IsSubordinate = true,
            RuntimeEffectType = RuntimeEffects.RevealCard,
            EffectType = EffectKind.Activated,
            Timing = EffectTiming.OnSummon,
            DurationMode = EffectDurationMode.Instant,
            RevealTimingMode = RevealTimingMode.RevealFirst,
            ExecutionTargetSource = EffectExecutionTargetSource.ChainTargets,
            ExecutionFlowMode = EffectExecutionFlowMode.PerStep,
            SelectionTiming = EffectSelectionTiming.Upfront,
            ContextRules = [],
            TargetRules = new EffectTargetRuleSet { Rules = [] },
        };

        var request = CreateRequest(CreateChooseTargetEffect(), revealEffect);

        var result = new UpdateCardEffectsRequestValidator().Validate(request);

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(
            result.Errors.Any(error => error.ErrorMessage.Contains("A Reveal First step reveals the cards its post-condition checks", StringComparison.Ordinal)),
            Describe(result.Errors.Select(error => error.ErrorMessage)));
    }

    [TestMethod]
    public void Validate_ReturnsError_WhenSelectTargetsDeclaresNoCandidates()
    {
        var chooseEffect = CreateChooseTargetEffect();
        chooseEffect.TargetRules = new EffectTargetRuleSet { Rules = [] };

        var request = CreateRequest(chooseEffect);

        var result = new UpdateCardEffectsRequestValidator().Validate(request);

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(
            result.Errors.Any(error => error.ErrorMessage.Contains("Select Targets must describe what may be chosen", StringComparison.Ordinal)),
            Describe(result.Errors.Select(error => error.ErrorMessage)));
    }

    private static string Describe(IEnumerable<string> messages)
    {
        return string.Join("; ", messages);
    }

    private static UpdateCardEffectsRequest CreateRequest(params EffectSpec[] effects)
    {
        return new UpdateCardEffectsRequest(
            Conditions: null,
            Effects: effects,
            Description: null,
            SupportEffect: null,
            CannotBeNormalSummoned: null);
    }

    private static EffectSpec CreateChooseTargetEffect()
    {
        return new EffectSpec
        {
            Id = "choose-target",
            RuntimeEffectType = RuntimeEffects.SelectTargets,
            EffectType = EffectKind.Activated,
            Timing = EffectTiming.OnSummon,
            DurationMode = EffectDurationMode.Instant,
            OnSuccessEffectId = "freeze-target",
            ExecutionTargetSource = EffectExecutionTargetSource.SelectedTargets,
            TargetSlotName = "chosen",
            ExecutionFlowMode = EffectExecutionFlowMode.PerStep,
            SelectionTiming = EffectSelectionTiming.Prompted,
            SelectionPromptKind = EffectSelectionPromptKind.FreezeFromZone,
            ContextRules = [],
            TargetRules = new EffectTargetRuleSet
            {
                Operator = RequirementGroupOperator.Any,
                ExactTargetCount = 1,
                AutoSelectAllValidTargets = false,
                Rules =
                [
                    new EffectTargetRule
                    {
                        Scope = EffectTargetRange.Any,
                        InZone = PlayerZone.Leader,
                        ExactSelectedTargetCount = 1,
                        Restriction = new ZoneCardRestriction(),
                    },
                ],
            },
        };
    }

    private static EffectSpec CreateChainTargetsEffect()
    {
        return new EffectSpec
        {
            Id = "freeze-target",
            IsSubordinate = true,
            RuntimeEffectType = RuntimeEffects.FreezeCard,
            EffectType = EffectKind.Activated,
            Timing = EffectTiming.OnSummon,
            DurationMode = EffectDurationMode.DuringOpponentNextTurn,
            ExecutionTargetSource = EffectExecutionTargetSource.ChainTargets,
            ChainTargetSlotName = "chosen",
            ExecutionFlowMode = EffectExecutionFlowMode.PerStep,
            SelectionTiming = EffectSelectionTiming.Upfront,
            ContextRules = [],
            TargetRules = new EffectTargetRuleSet
            {
                Operator = RequirementGroupOperator.Any,
                ExactTargetCount = 1,
                AutoSelectAllValidTargets = false,
                Rules =
                [
                    new EffectTargetRule
                    {
                        Scope = EffectTargetRange.Any,
                        InZone = PlayerZone.Leader,
                        ExactSelectedTargetCount = 1,
                        Restriction = new ZoneCardRestriction(),
                    },
                ],
            },
        };
    }
}
