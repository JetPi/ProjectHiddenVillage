using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class EffectTargetResolverTests
{
    private readonly EffectTargetResolver resolver = new();

    [TestMethod]
    public void ResolveTargets_AnyRule_ReturnsUnionOfMatchingTargets()
    {
        var (context, effectSpec) = CreateContext(
            playerFieldCards:
            [
                CreateCardOnField("p1-ino", "p1", "Ino Yamanaka"),
                CreateCardOnField("p1-shika", "p1", "Shikamaru Nara"),
                CreateCardOnField("p1-choji", "p1", "Choji Akimichi")
            ],
            opponentFieldCards:
            [
                CreateCardOnField("p2-kiba", "p2", "Kiba Inuzuka")
            ],
            targetRules: new EffectTargetRuleSet
            {
                Operator = RequirementGroupOperator.Any,
                Rules =
                [
                    new EffectTargetRule
                    {
                            Scope = EffectTargetRange.Self,
                        InZone = PlayerZone.CharacterField,
                        Restriction = new ZoneCardRestriction { HasName = ["Ino Yamanaka"] }
                    },
                    new EffectTargetRule
                    {
                            Scope = EffectTargetRange.Self,
                        InZone = PlayerZone.CharacterField,
                        Restriction = new ZoneCardRestriction { HasName = ["Shikamaru Nara", "Choji Akimichi"] }
                    }
                ]
            });

        var targets = resolver.ResolveTargets(context, effectSpec);

        Assert.AreEqual(3, targets.Count);
        CollectionAssert.AreEquivalent(
            new[] { "p1-ino-inst", "p1-shika-inst", "p1-choji-inst" },
            targets.Select(target => target.CardInstanceId).ToList());
    }

    [TestMethod]
    public void ResolveTargets_AllRule_ReturnsIntersectionOfMatchingTargets()
    {
        var (context, effectSpec) = CreateContext(
            playerFieldCards:
            [
                CreateCardOnField("p1-shika", "p1", "Shikamaru Nara", traits: ["Team10"]),
                CreateCardOnField("p1-choji", "p1", "Choji Akimichi", traits: ["Team10"]),
                CreateCardOnField("p1-random", "p1", "Random Ninja", traits: ["Leaf"])
            ],
            opponentFieldCards: [],
            targetRules: new EffectTargetRuleSet
            {
                Operator = RequirementGroupOperator.All,
                Rules =
                [
                    new EffectTargetRule
                    {
                        Scope = EffectTargetRange.Self,
                        InZone = PlayerZone.CharacterField,
                        Restriction = new ZoneCardRestriction { HasTrait = ["Team10"] }
                    },
                    new EffectTargetRule
                    {
                        Scope = EffectTargetRange.Self,
                        InZone = PlayerZone.CharacterField,
                        Restriction = new ZoneCardRestriction { HasType = [CardType.Character] }
                    }
                ]
            });

        var targets = resolver.ResolveTargets(context, effectSpec);

        Assert.AreEqual(2, targets.Count);
        CollectionAssert.AreEquivalent(
            new[] { "p1-shika-inst", "p1-choji-inst" },
            targets.Select(target => target.CardInstanceId).ToList());
    }

    [TestMethod]
    public void ResolveTargets_OpponentScope_TargetsOpponentFieldOnly()
    {
        var (context, effectSpec) = CreateContext(
            playerFieldCards:
            [
                CreateCardOnField("p1-shika", "p1", "Shikamaru Nara")
            ],
            opponentFieldCards:
            [
                CreateCardOnField("p2-kiba", "p2", "Kiba Inuzuka"),
                CreateCardOnField("p2-akamaru", "p2", "Akamaru")
            ],
            targetRules: new EffectTargetRuleSet
            {
                Operator = RequirementGroupOperator.Any,
                Rules =
                [
                    new EffectTargetRule
                    {
                            Scope = EffectTargetRange.Opponent,
                        InZone = PlayerZone.CharacterField,
                        Restriction = new ZoneCardRestriction { HasType = [CardType.Character] }
                    }
                ]
            });

        var targets = resolver.ResolveTargets(context, effectSpec);

        Assert.AreEqual(2, targets.Count);
        Assert.IsTrue(targets.All(target => target.PlayerId == "p2"));
    }

    private static (GameCardEffectContext Context, EffectSpec EffectSpec) CreateContext(
        IReadOnlyList<(Card Card, CardInstance Instance)> playerFieldCards,
        IReadOnlyList<(Card Card, CardInstance Instance)> opponentFieldCards,
        EffectTargetRuleSet targetRules)
    {
        var sourceEffect = new EffectSpec
        {
            Id = "destroy-1",
            RuntimeEffectType = RuntimeEffects.DestroyCard,
            EffectType = EffectKind.Support,
            Timing = EffectTiming.ActivateMain,
            TargetRange = EffectTargetRange.Any,
            ContextRules = [],
            TargetRules = targetRules,
        };

        var sourceCard = new Card
        {
            Id = "source-card",
            DisplayName = "Source Card",
            Name = ["Source Card"],
            Type = CardType.Character,
            Color = CardColor.Green,
            Effects = [sourceEffect]
        };

        var state = new GameState
        {
            Players =
            [
                new PlayerState
                {
                    PlayerId = "p1",
                    Battlefield = playerFieldCards.Select(entry => entry.Instance).ToList()
                },
                new PlayerState
                {
                    PlayerId = "p2",
                    Battlefield = opponentFieldCards.Select(entry => entry.Instance).ToList()
                }
            ]
        };

        state.CardDefinitions[sourceCard.Id] = sourceCard;

        foreach (var (card, _) in playerFieldCards)
        {
            state.CardDefinitions[card.Id] = card;
        }

        foreach (var (card, _) in opponentFieldCards)
        {
            state.CardDefinitions[card.Id] = card;
        }

        var context = new GameCardEffectContext(
            game: new GameInstance(state),
            actingPlayer: new Player { Id = "p1", Name = "P1", DisplayName = "P1" },
            sourceCardDefinition: sourceCard,
            sourceCardInstance: null,
            arguments: new Dictionary<string, string>(),
            selectedTargets: []);

        return (context, sourceEffect);
    }

    private static (Card Card, CardInstance Instance) CreateCardOnField(
        string cardId,
        string controllerPlayerId,
        string displayName,
        IReadOnlyList<string>? traits = null)
    {
        var card = new Card
        {
            Id = cardId,
            DisplayName = displayName,
            Name = [displayName],
            Traits = traits?.ToList() ?? [],
            Type = CardType.Character,
            Color = CardColor.Green,
        };

        var instance = new CardInstance
        {
            InstanceId = $"{cardId}-inst",
            CardDefinitionId = cardId,
            OwnerPlayerId = controllerPlayerId,
            ControllerPlayerId = controllerPlayerId,
        };

        return (card, instance);
    }
}
