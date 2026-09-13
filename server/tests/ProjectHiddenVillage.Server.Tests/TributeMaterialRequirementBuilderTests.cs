using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class TributeMaterialRequirementBuilderTests
{
    private const string GenericLabel = TributeRequirementDescription.GenericMaterialLabel;

    [TestMethod]
    public void BuildGroups_ReportsSingleGenericMaterial_ForUnrestrictedRule()
    {
        var groups = TributeMaterialRequirementBuilder.BuildGroups(
            Rules(1, MaterialRule(exactSelectedTargetCount: 1)));

        Assert.IsNotNull(groups);
        Assert.AreEqual(1, groups!.Count);
        Assert.AreEqual(GenericLabel, groups[0].Label);
        Assert.AreEqual(1, groups[0].RequiredCount);
        Assert.IsTrue(groups[0].IsGeneric);
    }

    [TestMethod]
    public void BuildGroups_MergesRulesThatShareALabel_InsteadOfInventingAGenericSlot()
    {
        // Two "Toad" rules must read as Toad x2 and never as "Toad x1 + any x1": the per-candidate
        // labels alone cannot tell those apart, the rules can (this is the regression the builder fixes).
        var groups = TributeMaterialRequirementBuilder.BuildGroups(Rules(
            2,
            MaterialRule(exactSelectedTargetCount: 1, trait: "Toad"),
            MaterialRule(exactSelectedTargetCount: 1, trait: "Toad")));

        Assert.IsNotNull(groups);
        Assert.AreEqual(1, groups!.Count);
        Assert.AreEqual("Toad", groups[0].Label);
        Assert.AreEqual(2, groups[0].RequiredCount);
        Assert.IsFalse(groups[0].IsGeneric);
    }

    [TestMethod]
    public void BuildGroups_KeepsNamedAndGenericRulesApart()
    {
        var groups = TributeMaterialRequirementBuilder.BuildGroups(Rules(
            2,
            MaterialRule(exactSelectedTargetCount: 1, trait: "Toad"),
            MaterialRule(exactSelectedTargetCount: 1)));

        Assert.IsNotNull(groups);
        Assert.AreEqual(2, groups!.Count);
        Assert.AreEqual("Toad", groups[0].Label);
        Assert.AreEqual(1, groups[0].RequiredCount);
        Assert.IsFalse(groups[0].IsGeneric);
        Assert.AreEqual(GenericLabel, groups[1].Label);
        Assert.AreEqual(1, groups[1].RequiredCount);
        Assert.IsTrue(groups[1].IsGeneric);
    }

    [TestMethod]
    public void BuildGroups_AssignsLeftoverSlots_ToTheOnlyMaterialWithHeadroom()
    {
        // The Toad rule accepts 1..3 cards while the summon consumes 2, so both cards must be Toad.
        var groups = TributeMaterialRequirementBuilder.BuildGroups(Rules(
            2,
            MaterialRule(minimumSelectedTargetCount: 1, maximumSelectedTargetCount: 3, trait: "Toad")));

        Assert.IsNotNull(groups);
        Assert.AreEqual(1, groups!.Count);
        Assert.AreEqual("Toad", groups[0].Label);
        Assert.AreEqual(2, groups[0].RequiredCount);
    }

    [TestMethod]
    public void BuildGroups_FallsBackToGenericLeftover_WhenSeveralMaterialsHaveHeadroom()
    {
        // With two materials able to absorb the third card, only the total is knowable.
        var groups = TributeMaterialRequirementBuilder.BuildGroups(Rules(
            3,
            MaterialRule(minimumSelectedTargetCount: 1, maximumSelectedTargetCount: 3, trait: "Toad"),
            MaterialRule(minimumSelectedTargetCount: 1, maximumSelectedTargetCount: 3, trait: "Dragon")));

        Assert.IsNotNull(groups);
        Assert.AreEqual(3, groups!.Count);
        Assert.AreEqual("Toad", groups[0].Label);
        Assert.AreEqual(1, groups[0].RequiredCount);
        Assert.AreEqual("Dragon", groups[1].Label);
        Assert.AreEqual(1, groups[1].RequiredCount);
        Assert.AreEqual(GenericLabel, groups[2].Label);
        Assert.AreEqual(1, groups[2].RequiredCount);
        Assert.IsTrue(groups[2].IsGeneric);
    }

    [TestMethod]
    public void BuildGroups_SumsToTheDeclaredTargetCount()
    {
        var rules = Rules(
            3,
            MaterialRule(exactSelectedTargetCount: 1, trait: "Toad"),
            MaterialRule(exactSelectedTargetCount: 1, trait: "Dragon"),
            MaterialRule(exactSelectedTargetCount: 1));

        var groups = TributeMaterialRequirementBuilder.BuildGroups(rules);

        Assert.IsNotNull(groups);
        Assert.AreEqual(3, groups!.Sum(group => group.RequiredCount));
        Assert.AreEqual(3, TributeMaterialRequirementBuilder.ResolveExactTargetCount(rules));
    }

    [TestMethod]
    public void BuildGroups_ReturnsNull_WithoutTributeComposition()
    {
        var ruleSet = new EffectTargetRuleSet
        {
            Rules = [MaterialRule(exactSelectedTargetCount: 1)],
        };

        Assert.IsNull(TributeMaterialRequirementBuilder.BuildGroups(ruleSet));
    }

    [TestMethod]
    public void BuildGroups_ReturnsNull_WhenOnlyTheSummonCandidateRuleIsDeclared()
    {
        var ruleSet = new EffectTargetRuleSet
        {
            TributeComposition = new TributeTargetComposition { ExactTributeCount = 1 },
            Rules =
            [
                new EffectTargetRule
                {
                    Scope = EffectTargetRange.Self,
                    InZone = PlayerZone.CharacterField,
                    TributeRole = TributeTargetRole.SummonCandidate,
                    ExactSelectedTargetCount = 1,
                },
            ],
        };

        Assert.IsNull(TributeMaterialRequirementBuilder.BuildGroups(ruleSet));
    }

    private static EffectTargetRule MaterialRule(
        int? exactSelectedTargetCount = null,
        int? minimumSelectedTargetCount = null,
        int? maximumSelectedTargetCount = null,
        string? trait = null)
    {
        return new EffectTargetRule
        {
            Scope = EffectTargetRange.Self,
            InZone = PlayerZone.CharacterField,
            TributeRole = TributeTargetRole.TributeMaterial,
            ExactSelectedTargetCount = exactSelectedTargetCount,
            MinimumSelectedTargetCount = minimumSelectedTargetCount,
            MaximumSelectedTargetCount = maximumSelectedTargetCount,
            Restriction = trait is null
                ? new ZoneCardRestriction()
                : new ZoneCardRestriction
                {
                    Predicates =
                    [
                        new ZoneCardPropertyPredicate
                        {
                            Property = ZoneCardProperty.Trait,
                            Operator = ZoneCardPredicateOperator.In,
                            Values = [trait],
                        },
                    ],
                    MatchMode = ZoneRestrictionMatchMode.All,
                },
        };
    }

    private static EffectTargetRuleSet Rules(int exactTributeCount, params EffectTargetRule[] materialRules)
    {
        return new EffectTargetRuleSet
        {
            TributeComposition = new TributeTargetComposition
            {
                ExactTributeCount = exactTributeCount,
                RequireSingleSummonTarget = false,
                RequireDistinctSummonAndTributes = true,
            },
            Rules = materialRules,
        };
    }
}
