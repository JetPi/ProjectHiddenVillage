using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// The shape half of the card-ability contract: which authored nodes are abilities the card's controller
/// activates on its own. The response mapper publishes a chip for exactly these shapes and the engine accepts a
/// submit for exactly these shapes, so this predicate is the agreement between the two. N-022's
/// summon-requirement node (a non-subordinate root with <c>timing: During Your Main</c>) used to qualify, which
/// put a "During Your Main" chip on a special-summon card sitting on the battlefield - and a direct submit of it
/// re-ran the whole reveal + summon chain.
/// </summary>
[TestClass]
public sealed class CardAbilityTimingRulesTests
{
    [TestMethod]
    public void IsIndependentlyActivatableAbility_AllowsAMainPhaseAbility()
    {
        var effect = new EffectSpec
        {
            Id = "team-10-boost",
            EffectType = EffectKind.Activated,
            Timing = EffectTiming.ActivateMain,
            RuntimeEffectType = RuntimeEffects.GainEffect,
        };

        Assert.IsTrue(CardAbilityTimingRules.IsIndependentlyActivatableAbility(effect));
    }

    [TestMethod]
    public void IsIndependentlyActivatableAbility_RejectsASubordinateChainStep()
    {
        var effect = new EffectSpec
        {
            Id = "place-one-on-deck",
            EffectType = EffectKind.Activated,
            Timing = EffectTiming.DuringYourMain,
            RuntimeEffectType = RuntimeEffects.MoveCard,
            IsSubordinate = true,
        };

        Assert.IsFalse(CardAbilityTimingRules.IsIndependentlyActivatableAbility(effect));
    }

    [TestMethod]
    public void IsIndependentlyActivatableAbility_RejectsAPassiveNode()
    {
        var effect = new EffectSpec
        {
            Id = "conditional-rush",
            EffectType = EffectKind.Rush,
            Timing = EffectTiming.DuringYourMain,
            RuntimeEffectType = RuntimeEffects.GainEffect,
            PassiveMode = PassiveMode.Continuous,
        };

        Assert.IsFalse(CardAbilityTimingRules.IsIndependentlyActivatableAbility(effect));
    }

    [TestMethod]
    public void IsIndependentlyActivatableAbility_RejectsTheSummonRequirementTributeNode()
    {
        // N-022/N-014/N-005's shape: the summon requirement is authored as a root node carrying a MainPhase
        // timing, so the timing window alone cannot tell it apart from an ability.
        var effect = new EffectSpec
        {
            Id = "tribute-requirement",
            EffectType = EffectKind.SummonRequirement,
            Timing = EffectTiming.DuringYourMain,
            RuntimeEffectType = RuntimeEffects.Tribute,
        };

        Assert.IsFalse(CardAbilityTimingRules.IsIndependentlyActivatableAbility(effect));
    }

    [TestMethod]
    public void IsIndependentlyActivatableAbility_RejectsASummonRequirementEffectKind()
    {
        // The authoring vocabulary is the second marker: a node the author typed "Summon Requirement" is never
        // an ability, whatever runtime effect it carries (the ingestion has left the runtime type off before).
        var effect = new EffectSpec
        {
            Id = "summon-requirements",
            EffectType = EffectKind.SummonRequirement,
            Timing = EffectTiming.DuringYourMain,
            RuntimeEffectType = RuntimeEffects.MoveCard,
        };

        Assert.IsFalse(CardAbilityTimingRules.IsIndependentlyActivatableAbility(effect));
    }

    [TestMethod]
    public void IsIndependentlyActivatableAbility_RejectsASupportEffect()
    {
        // N-015's shape: a support effect authored as a non-subordinate root with a MainPhase timing
        // (`effectType: Support`, "[During Your Main] K.O. all Characters"). A support is activated from the
        // hand or from the support area, never as an ability, so it must not be published as a
        // `character-ability:` chip once the card is normal-summoned onto the character field.
        var effect = new EffectSpec
        {
            Id = "KO-all-targets",
            EffectType = EffectKind.Support,
            Timing = EffectTiming.DuringYourMain,
            RuntimeEffectType = RuntimeEffects.DestroyCard,
            TargetRange = EffectTargetRange.Any,
            ChakraCost = 2,
            ExecutionTargetSource = EffectExecutionTargetSource.SelectedTargets,
        };

        Assert.IsFalse(CardAbilityTimingRules.IsIndependentlyActivatableAbility(effect));
    }

    [TestMethod]
    public void IsIndependentlyActivatableAbility_RejectsANullEffect()
    {
        Assert.IsFalse(CardAbilityTimingRules.IsIndependentlyActivatableAbility(null));
    }
}
