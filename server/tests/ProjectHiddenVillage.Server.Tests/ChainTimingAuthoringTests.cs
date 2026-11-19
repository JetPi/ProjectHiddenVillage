using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// A chain starts once and runs as one trigger, so every effect reached through <c>OnSuccessEffectId</c> /
/// <c>OnFailureEffectId</c> keeps the timing of the effect that branches to it. Effects that nothing branches
/// to stay independent and may still share a timing (N-016 declares two <c>SupportActivated</c> roots), and the
/// summon procedure's hand-off to the summoned card's "[On Summon]" chain (N-003/N-005/N-014/N-022) is the one
/// documented timing change the contract allows.
/// </summary>
[TestClass]
public sealed class ChainTimingAuthoringTests
{
    private const string ChainTimingMessage =
        "An effect reached through OnSuccessEffectId or OnFailureEffectId must use the same timing as the effect that branches to it";

    [TestMethod]
    public void Validate_AllowsChainStepsSharingTheStartersTiming_AndIndependentRootsWithTheSameTiming()
    {
        var request = CreateRequest(
            CreateEffect("starter", EffectTiming.OnSummon, onSuccessEffectId: "chain-step"),
            CreateEffect("chain-step", EffectTiming.OnSummon, isSubordinate: true),
            CreateEffect("independent-root", EffectTiming.OnSummon));

        var result = new UpdateCardEffectsRequestValidator().Validate(request);

        Assert.IsTrue(result.IsValid, Describe(result.Errors.Select(error => error.ErrorMessage)));
    }

    [TestMethod]
    public void Validate_ReturnsError_WhenAChainStepUsesADifferentTimingThanItsStarter()
    {
        var request = CreateRequest(
            CreateEffect("starter", EffectTiming.OnSummon, onSuccessEffectId: "chain-step"),
            CreateEffect("chain-step", EffectTiming.DuringYourMain, isSubordinate: true));

        var result = new UpdateCardEffectsRequestValidator().Validate(request);

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(
            result.Errors.Any(error => error.ErrorMessage.Contains(ChainTimingMessage, StringComparison.Ordinal)),
            Describe(result.Errors.Select(error => error.ErrorMessage)));
    }

    [TestMethod]
    public void Validate_ReturnsError_WhenAFailureBranchStepUsesADifferentTimingThanItsStarter()
    {
        var request = CreateRequest(
            CreateEffect("starter", EffectTiming.WhenAttacking, onFailureEffectId: "fallback-step"),
            CreateEffect("fallback-step", EffectTiming.Quick, isSubordinate: true));

        var result = new UpdateCardEffectsRequestValidator().Validate(request);

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(
            result.Errors.Any(error => error.ErrorMessage.Contains(ChainTimingMessage, StringComparison.Ordinal)),
            Describe(result.Errors.Select(error => error.ErrorMessage)));
    }

    [TestMethod]
    public void Validate_AllowsTheSummonProcedureHandOff_ToTheSummonedCardsTriggerChain()
    {
        // The requirement resolves the summon, so the summoned card's own chain is the one that carries the
        // trigger timing; the requirement itself stays in its MainPhase window.
        var request = CreateRequest(
            new EffectSpec
            {
                Id = "summon-requirements",
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                EffectType = EffectKind.SummonRequirement,
                Timing = EffectTiming.DuringYourMain,
                DurationMode = EffectDurationMode.Instant,
                OnSuccessEffectId = "on-summon",
                ContextRules = [],
                TargetRules = new EffectTargetRuleSet { Rules = [] },
            },
            CreateEffect("on-summon", EffectTiming.OnSummon, isSubordinate: true));

        var result = new UpdateCardEffectsRequestValidator().Validate(request);

        Assert.IsTrue(result.IsValid, Describe(result.Errors.Select(error => error.ErrorMessage)));
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

    private static EffectSpec CreateEffect(
        string id,
        EffectTiming timing,
        bool isSubordinate = false,
        string? onSuccessEffectId = null,
        string? onFailureEffectId = null)
    {
        return new EffectSpec
        {
            Id = id,
            RuntimeEffectType = RuntimeEffects.ChangeValues,
            EffectType = EffectKind.Activated,
            Timing = timing,
            DurationMode = EffectDurationMode.Instant,
            IsSubordinate = isSubordinate,
            OnSuccessEffectId = onSuccessEffectId,
            OnFailureEffectId = onFailureEffectId,
            ContextRules = [],
            TargetRules = new EffectTargetRuleSet { Rules = [] },
        };
    }
}
