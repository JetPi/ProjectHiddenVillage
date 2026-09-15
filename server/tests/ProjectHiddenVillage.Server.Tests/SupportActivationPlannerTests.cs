using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class SupportActivationPlannerTests
{
    [TestMethod]
    public void PlanActivationNodes_StartsAtNegate_WhenAnotherEffectBranchesToTheListedFirstEffect()
    {
        // N-009 (Kakashi, Lightning Blade) shape: the array lists the follow-up life cost first, while
        // the negate branches to it. "Negate that card. Then, reduce your life by 2."
        var definition = BuildDefinition(
            new EffectSpec
            {
                Id = "reduce-self-life",
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                Timing = EffectTiming.SupportActivated,
                ChakraCost = 1,
            },
            new EffectSpec
            {
                Id = "negate-effect",
                RuntimeEffectType = RuntimeEffects.NegateEffect,
                Timing = EffectTiming.SupportActivated,
                ChakraCost = 1,
                OnSuccessEffectId = "reduce-self-life",
            });

        var plan = SupportActivationPlanner.PlanActivationNodes(definition);
        var entry = SupportActivationPlanner.ResolveEntry(definition);

        CollectionAssert.AreEqual(
            new[] { "negate-effect", "reduce-self-life" },
            plan.Select(effect => effect.Id).ToArray());
        Assert.AreEqual("negate-effect", entry?.Id);
        Assert.AreEqual(1, SupportActivationPlanner.ResolveActivationCost(entry));
    }

    [TestMethod]
    public void PlanActivationNodes_ResolvesNegateFirst_WhenRootsAreUnlinked()
    {
        // N-016 (Shisui, Koto Amatsukami) shape: two unlinked roots, printed "Negate that card. Then,
        // from this turn until the end of your next turn's End Phase, you cannot turn your CHAKRA face-up."
        var definition = BuildDefinition(
            new EffectSpec
            {
                Id = "chakra-freeze",
                RuntimeEffectType = RuntimeEffects.AlterResources,
                Timing = EffectTiming.SupportActivated,
                DurationMode = EffectDurationMode.UntilTheEndOfYourNextTurn,
            },
            new EffectSpec
            {
                Id = "negate-effect",
                RuntimeEffectType = RuntimeEffects.NegateEffect,
                Timing = EffectTiming.SupportActivated,
                ChakraCost = 1,
            });

        var plan = SupportActivationPlanner.PlanActivationNodes(definition);

        // Both roots still run: the negate resolves first, then the chakra lock.
        CollectionAssert.AreEqual(
            new[] { "negate-effect", "chakra-freeze" },
            plan.Select(effect => effect.Id).ToArray());
        Assert.AreEqual(
            1,
            SupportActivationPlanner.ResolveActivationCost(SupportActivationPlanner.ResolveEntry(definition)));
    }

    [TestMethod]
    public void PlanActivationNodes_FollowsSuccessBranch_ForSummonThenBoostChain()
    {
        // N-002 (Choji, Expansion Jutsu): summon this card, then double the chosen character's power.
        var definition = BuildDefinition(
            new EffectSpec
            {
                Id = "summon-self",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                Timing = EffectTiming.Quick,
                ChakraCost = 1,
                OnSuccessEffectId = "double-target-character-power",
            },
            new EffectSpec
            {
                Id = "double-target-character-power",
                IsSubordinate = true,
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                Timing = EffectTiming.Quick,
            });

        var plan = SupportActivationPlanner.PlanActivationNodes(definition);

        CollectionAssert.AreEqual(
            new[] { "summon-self", "double-target-character-power" },
            plan.Select(effect => effect.Id).ToArray());
        Assert.AreEqual(
            1,
            SupportActivationPlanner.ResolveActivationCost(SupportActivationPlanner.ResolveEntry(definition)));
    }

    [TestMethod]
    public void PlanActivationNodes_ResolvesImmunityBeforeSelfSummon_WhenImmunityBranchesToIt()
    {
        // N-021 (Suigetsu, Water Transformation Jutsu): the non-subordinate root is the immunity and the
        // summon is its branch target, so the summon still happens after it.
        var definition = BuildDefinition(
            new EffectSpec
            {
                Id = "summon-self",
                IsSubordinate = true,
                RuntimeEffectType = RuntimeEffects.SummonCard,
                Timing = EffectTiming.Quick,
            },
            new EffectSpec
            {
                Id = "grant-immunity",
                RuntimeEffectType = RuntimeEffects.GainEffect,
                Timing = EffectTiming.Quick,
                OnSuccessEffectId = "summon-self",
            });

        var plan = SupportActivationPlanner.PlanActivationNodes(definition);

        CollectionAssert.AreEqual(
            new[] { "grant-immunity", "summon-self" },
            plan.Select(effect => effect.Id).ToArray());
        Assert.AreEqual(
            0,
            SupportActivationPlanner.ResolveActivationCost(SupportActivationPlanner.ResolveEntry(definition)));
    }

    [TestMethod]
    public void PlanActivationNodes_ReturnsSingleRoot_ForSimpleSupportEffects()
    {
        // N-018 (Hinata) / N-020 (Sakura) style single-effect supports.
        var definition = BuildDefinition(new EffectSpec
        {
            Id = "KO-non-EX",
            RuntimeEffectType = RuntimeEffects.DestroyCard,
            Timing = EffectTiming.DuringOpponentAttack,
            ChakraCost = 1,
        });

        var plan = SupportActivationPlanner.PlanActivationNodes(definition);

        Assert.AreEqual(1, plan.Count);
        Assert.AreEqual("KO-non-EX", plan[0].Id);
    }

    [TestMethod]
    public void PlanActivationNodes_FallsBackToDeclaredOrder_WhenEveryEffectIsSubordinate()
    {
        var definition = BuildDefinition(
            new EffectSpec
            {
                Id = "first",
                IsSubordinate = true,
                RuntimeEffectType = RuntimeEffects.ChangeValues,
            },
            new EffectSpec
            {
                Id = "second",
                IsSubordinate = true,
                RuntimeEffectType = RuntimeEffects.ChangeValues,
            });

        var plan = SupportActivationPlanner.PlanActivationNodes(definition);

        CollectionAssert.AreEqual(new[] { "first", "second" }, plan.Select(effect => effect.Id).ToArray());
    }

    [TestMethod]
    public void PlanActivationNodes_AppendsUnreachableEffects_AfterRootGroups()
    {
        var definition = BuildDefinition(
            new EffectSpec
            {
                Id = "root",
                RuntimeEffectType = RuntimeEffects.DestroyCard,
                OnSuccessEffectId = "missing-branch",
            },
            new EffectSpec
            {
                Id = "orphan",
                IsSubordinate = true,
                RuntimeEffectType = RuntimeEffects.ChangeValues,
            });

        var plan = SupportActivationPlanner.PlanActivationNodes(definition);

        CollectionAssert.AreEqual(new[] { "root", "orphan" }, plan.Select(effect => effect.Id).ToArray());
    }

    [TestMethod]
    public void PlanActivationNodes_ReturnsEmpty_ForEffectlessCard()
    {
        var definition = BuildDefinition();

        Assert.AreEqual(0, SupportActivationPlanner.PlanActivationNodes(definition).Count);
        Assert.IsNull(SupportActivationPlanner.ResolveEntry(definition));
        Assert.AreEqual(0, SupportActivationPlanner.ResolveActivationCost(null));
    }

    private static CharacterCard BuildDefinition(params EffectSpec[] effects)
    {
        return new CharacterCard
        {
            Id = "card-1",
            DisplayName = "Test Support",
            Type = CardType.Character,
            SupportName = "Test Jutsu",
            SupportEffect = "[Support] Test",
            Effects = [.. effects],
        };
    }
}
