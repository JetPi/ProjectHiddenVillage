using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class TributeRequirementDescriptionTests
{
    private static EffectTargetRule Rule(params ZoneCardPropertyPredicate[] predicates)
    {
        return new EffectTargetRule
        {
            Restriction = new ZoneCardRestriction
            {
                Predicates = predicates,
                MatchMode = ZoneRestrictionMatchMode.All,
            },
        };
    }

    [TestMethod]
    public void BuildShortLabel_ReturnsNull_ForUnrestrictedTributeRule()
    {
        var label = TributeRequirementDescription.BuildShortLabel(Rule());
        Assert.IsNull(label);
    }

    [TestMethod]
    public void BuildShortLabel_ReturnsNull_WhenOnlySelfIdentityPredicate()
    {
        var label = TributeRequirementDescription.BuildShortLabel(Rule(new ZoneCardPropertyPredicate
        {
            Property = ZoneCardProperty.Self,
            Operator = ZoneCardPredicateOperator.Equals,
            Value = bool.TrueString,
        }));
        Assert.IsNull(label);
    }

    [TestMethod]
    public void BuildShortLabel_FormatsSingleTraitRequirement()
    {
        var label = TributeRequirementDescription.BuildShortLabel(Rule(new ZoneCardPropertyPredicate
        {
            Property = ZoneCardProperty.Trait,
            Operator = ZoneCardPredicateOperator.In,
            Values = ["Toad"],
        }));
        Assert.AreEqual("Toad", label);
    }

    [TestMethod]
    public void BuildShortLabel_JoinsMultipleTraitValues_WithOr()
    {
        var label = TributeRequirementDescription.BuildShortLabel(Rule(new ZoneCardPropertyPredicate
        {
            Property = ZoneCardProperty.Trait,
            Operator = ZoneCardPredicateOperator.In,
            Values = ["Toad", "Snake"],
        }));
        Assert.AreEqual("Toad or Snake", label);
    }

    [TestMethod]
    public void BuildShortLabel_FormatsNumericComparison()
    {
        var label = TributeRequirementDescription.BuildShortLabel(Rule(new ZoneCardPropertyPredicate
        {
            Property = ZoneCardProperty.Power,
            Operator = ZoneCardPredicateOperator.GreaterThanOrEqual,
            Value = "5",
        }));
        Assert.AreEqual("Power ≥ 5", label);
    }

    [TestMethod]
    public void BuildShortLabel_JoinsMultiplePredicates_WithAmpersand()
    {
        var label = TributeRequirementDescription.BuildShortLabel(Rule(
            new ZoneCardPropertyPredicate
            {
                Property = ZoneCardProperty.Color,
                Operator = ZoneCardPredicateOperator.Equals,
                Value = "Green",
            },
            new ZoneCardPropertyPredicate
            {
                Property = ZoneCardProperty.Trait,
                Operator = ZoneCardPredicateOperator.In,
                Values = ["Toad"],
            }));
        Assert.AreEqual("Green & Toad", label);
    }

    [TestMethod]
    public void BuildShortLabel_ReturnsNull_ForUnconstrainedTypeIn()
    {
        var label = TributeRequirementDescription.BuildShortLabel(Rule(new ZoneCardPropertyPredicate
        {
            Property = ZoneCardProperty.Type,
            Operator = ZoneCardPredicateOperator.In,
            Values = [],
        }));
        Assert.IsNull(label);
    }
}
