using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class DestroyCardEffectTests
{
    private readonly EffectContextConditionEvaluator conditionEvaluator = new();

    [TestMethod]
    public void CheckConditionsAgainstInstance_AllRequirements_Minimum_RequiresEveryRequirement()
    {
        var shikamaru = CreateCard("c-001", "Shikamaru Nara", ["Shikamaru Nara"], ["Leaf"]);
        var choji = CreateCard("c-002", "Choji Akimichi", ["Choji Akimichi"], ["Leaf"]);
        var player = CreatePlayerWithBattlefield(shikamaru, choji);
        var state = CreateGameState(shikamaru, choji);

        var condition = new EffectContextCondition
        {
            InZone = PlayerZone.CharacterField,
            InZoneRequirements = new ZoneRequirementSet
            {
                Operator = RequirementGroupOperator.All,
                Requirements =
                [
                    new ZoneAmountRequirement
                    {
                        Amount = 1,
                        Comparison = ZoneAmountComparison.Minimum,
                        Restriction = new ZoneCardRestriction
                        {
                            Predicates =
                            [
                                new ZoneCardPropertyPredicate
                                {
                                    Property = "name",
                                    Operator = ZoneCardPredicateOperator.In,
                                    Values = ["Shikamaru Nara"]
                                }
                            ]
                        }
                    },
                    new ZoneAmountRequirement
                    {
                        Amount = 1,
                        Comparison = ZoneAmountComparison.Minimum,
                        Restriction = new ZoneCardRestriction
                        {
                            Predicates =
                            [
                                new ZoneCardPropertyPredicate
                                {
                                    Property = "name",
                                    Operator = ZoneCardPredicateOperator.In,
                                    Values = ["Choji Akimichi"]
                                }
                            ]
                        }
                    }
                ]
            }
        };

        var isSatisfied = conditionEvaluator.IsConditionSatisfied(condition, player, state);

        Assert.IsTrue(isSatisfied);
    }

    [TestMethod]
    public void CheckConditionsAgainstInstance_AllRequirements_FailsWhenAnyRequirementMissing()
    {
        var shikamaru = CreateCard("c-001", "Shikamaru Nara", ["Shikamaru Nara"], ["Leaf"]);
        var player = CreatePlayerWithBattlefield(shikamaru);
        var state = CreateGameState(shikamaru);

        var condition = new EffectContextCondition
        {
            InZone = PlayerZone.CharacterField,
            InZoneRequirements = new ZoneRequirementSet
            {
                Operator = RequirementGroupOperator.All,
                Requirements =
                [
                    new ZoneAmountRequirement
                    {
                        Amount = 1,
                        Comparison = ZoneAmountComparison.Minimum,
                        Restriction = new ZoneCardRestriction
                        {
                            Predicates =
                            [
                                new ZoneCardPropertyPredicate
                                {
                                    Property = "name",
                                    Operator = ZoneCardPredicateOperator.In,
                                    Values = ["Shikamaru Nara"]
                                }
                            ]
                        }
                    },
                    new ZoneAmountRequirement
                    {
                        Amount = 1,
                        Comparison = ZoneAmountComparison.Minimum,
                        Restriction = new ZoneCardRestriction
                        {
                            Predicates =
                            [
                                new ZoneCardPropertyPredicate
                                {
                                    Property = "name",
                                    Operator = ZoneCardPredicateOperator.In,
                                    Values = ["Choji Akimichi"]
                                }
                            ]
                        }
                    }
                ]
            }
        };

        var isSatisfied = conditionEvaluator.IsConditionSatisfied(condition, player, state);

        Assert.IsFalse(isSatisfied);
    }

    [TestMethod]
    public void CheckConditionsAgainstInstance_AnyRequirements_SucceedsWhenOneRequirementMatches()
    {
        var shikamaru = CreateCard("c-001", "Shikamaru Nara", ["Shikamaru Nara"], ["Leaf"]);
        var player = CreatePlayerWithBattlefield(shikamaru);
        var state = CreateGameState(shikamaru);

        var condition = new EffectContextCondition
        {
            InZone = PlayerZone.CharacterField,
            InZoneRequirements = new ZoneRequirementSet
            {
                Operator = RequirementGroupOperator.Any,
                Requirements =
                [
                    new ZoneAmountRequirement
                    {
                        Amount = 1,
                        Comparison = ZoneAmountComparison.Minimum,
                        Restriction = new ZoneCardRestriction
                        {
                            Predicates =
                            [
                                new ZoneCardPropertyPredicate
                                {
                                    Property = "name",
                                    Operator = ZoneCardPredicateOperator.In,
                                    Values = ["Choji Akimichi"]
                                }
                            ]
                        }
                    },
                    new ZoneAmountRequirement
                    {
                        Amount = 1,
                        Comparison = ZoneAmountComparison.Minimum,
                        Restriction = new ZoneCardRestriction
                        {
                            Predicates =
                            [
                                new ZoneCardPropertyPredicate
                                {
                                    Property = "name",
                                    Operator = ZoneCardPredicateOperator.In,
                                    Values = ["Shikamaru Nara"]
                                }
                            ]
                        }
                    }
                ]
            }
        };

        var isSatisfied = conditionEvaluator.IsConditionSatisfied(condition, player, state);

        Assert.IsTrue(isSatisfied);
    }

    [TestMethod]
    public void CheckConditionsAgainstInstance_DistinctCardsAcrossRequirements_RequiresDifferentCards()
    {
        var shikamaru = CreateCard("c-001", "Shikamaru Nara", ["Shikamaru Nara"], ["Leaf", "Team10"]);
        var player = CreatePlayerWithBattlefield(shikamaru);
        var state = CreateGameState(shikamaru);

        var condition = new EffectContextCondition
        {
            InZone = PlayerZone.CharacterField,
            InZoneRequirements = new ZoneRequirementSet
            {
                Operator = RequirementGroupOperator.All,
                DistinctCardsAcrossRequirements = true,
                Requirements =
                [
                    new ZoneAmountRequirement
                    {
                        Amount = 1,
                        Comparison = ZoneAmountComparison.Minimum,
                        Restriction = new ZoneCardRestriction
                        {
                            Predicates =
                            [
                                new ZoneCardPropertyPredicate
                                {
                                    Property = "name",
                                    Operator = ZoneCardPredicateOperator.In,
                                    Values = ["Shikamaru Nara"]
                                }
                            ]
                        }
                    },
                    new ZoneAmountRequirement
                    {
                        Amount = 1,
                        Comparison = ZoneAmountComparison.Minimum,
                        Restriction = new ZoneCardRestriction
                        {
                            Predicates =
                            [
                                new ZoneCardPropertyPredicate
                                {
                                    Property = "traits",
                                    Operator = ZoneCardPredicateOperator.In,
                                    Values = ["Team10"]
                                }
                            ]
                        }
                    }
                ]
            }
        };

        var isSatisfied = conditionEvaluator.IsConditionSatisfied(condition, player, state);

        Assert.IsFalse(isSatisfied);
    }

    private static PlayerState CreatePlayerWithBattlefield(params Card[] cards)
    {
        var playerState = new PlayerState { PlayerId = "p1" };

        foreach (var card in cards)
        {
            playerState.Battlefield.Add(new CardInstance
            {
                CardDefinitionId = card.Id,
                OwnerPlayerId = "p1",
                ControllerPlayerId = "p1",
            });
        }

        return playerState;
    }

    private static GameState CreateGameState(params Card[] cards)
    {
        var state = new GameState();

        foreach (var card in cards)
        {
            state.CardDefinitions[card.Id] = card;
        }

        return state;
    }

    private static Card CreateCard(string id, string displayName, IReadOnlyList<string>? names = null, IReadOnlyList<string>? traits = null)
    {
        return new Card
        {
            Id = id,
            DisplayName = displayName,
            Name = names?.ToList() ?? [displayName],
            Traits = traits?.ToList() ?? [],
            Type = CardType.Character,
            Color = CardColor.Green,
        };
    }
}
