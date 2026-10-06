using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class TributeSummonCardEffectTests
{
    [TestMethod]
    public void Execute_ReturnsValidationError_WhenSelectedTargetsViolateComposition()
    {
        var effectSpec = CreateEffectSpec();
        var context = CreateContext(effectSpec);

        var effect = new TributeSummonCardEffect(
            effectSpecResolver: new StubEffectSpecResolver(effectSpec),
            canExecuteEvaluator: new StubCanExecuteEvaluator(),
            targetResolver: new StubTargetResolver());

        var result = effect.Execute(
            context,
            [
                new GameEffectTargetReference("p1", PlayerZone.CharacterField, "ninja-a-inst"),
                new GameEffectTargetReference("p1", PlayerZone.CharacterField, "source-inst"),
            ]);

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Game.Effect.TributeSummon.InvalidTargetComposition", result.FirstError.Code);
    }

    [TestMethod]
    public void Execute_SummonsTargetThatCannotBeNormalSummoned()
    {
        var effectSpec = CreateEffectSpec();
        effectSpec.TargetRules.TributeComposition = null;

        var context = CreateContext(effectSpec);
        context.Game.State.TurnNumber = 3;
        context.Game.State.CardDefinitions["ninja-a-def"].CannotBeNormalSummoned = true;
        context.Game.State.Players[0].Hand.Add(new CardInstance
        {
            InstanceId = "ninja-hand-inst",
            CardDefinitionId = "ninja-a-def",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
        });

        var effect = new TributeSummonCardEffect(
            effectSpecResolver: new StubEffectSpecResolver(effectSpec),
            canExecuteEvaluator: new StubCanExecuteEvaluator(),
            targetResolver: new StubTargetResolver());

        var result = effect.Execute(
            context,
            [new GameEffectTargetReference("p1", PlayerZone.Hand, "ninja-hand-inst")]);

        // A [Summon Requirements] tribute summon is a special summon, so the "No Normal Summon" flag of the
        // card being placed must not refuse it: the flag gates the normal summon (resting the summon card)
        // only, and it is exactly what N-003/N-005/N-014/N-022 carry.
        Assert.IsFalse(result.IsError);

        var summonedCard = context.Game.State.Players[0].Battlefield
            .Single(card => card.InstanceId == "ninja-hand-inst");
        Assert.AreEqual(3, summonedCard.EnteredFieldTurnNumber);
        Assert.AreEqual(0, context.Game.State.Players[0].Hand.Count);
    }

    private static EffectSpec CreateEffectSpec()
    {
        return new EffectSpec
        {
            Id = "tribute-1",
            RuntimeEffectType = RuntimeEffects.Tribute,
            EffectType = EffectKind.Activated,
            Timing = EffectTiming.ActivateMain,
            TargetRange = EffectTargetRange.Self,
            ContextRules = [],
            TargetRules = new EffectTargetRuleSet
            {
                Rules =
                [
                    new EffectTargetRule
                    {
                        Scope = EffectTargetRange.Self,
                        InZone = PlayerZone.CharacterField,
                        TributeRole = TributeTargetRole.SummonCandidate,
                        Restriction = new ZoneCardRestriction
                        {
                            Predicates =
                            [
                                new ZoneCardPropertyPredicate
                                {
                                    Property = ZoneCardProperty.Name,
                                    Operator = ZoneCardPredicateOperator.In,
                                    Values = ["Ninja A"]
                                }
                            ]
                        }
                    },
                    new EffectTargetRule
                    {
                        Scope = EffectTargetRange.Self,
                        InZone = PlayerZone.CharacterField,
                        TributeRole = TributeTargetRole.TributeMaterial,
                        Restriction = new ZoneCardRestriction
                        {
                            Predicates =
                            [
                                new ZoneCardPropertyPredicate
                                {
                                    Property = ZoneCardProperty.Name,
                                    Operator = ZoneCardPredicateOperator.In,
                                    Values = ["Ninja A"]
                                }
                            ]
                        }
                    }
                ],
                TributeComposition = new TributeTargetComposition
                {
                    ExactTributeCount = 1,
                    RequireSingleSummonTarget = true,
                    RequireDistinctSummonAndTributes = true,
                }
            }
        };
    }

    private static GameCardEffectContext CreateContext(EffectSpec effectSpec)
    {
        var sourceDefinition = new CharacterCard
        {
            Id = "source-def",
            DisplayName = "Source",
            Name = ["Source"],
            Type = CardType.Character,
            Color = CardColor.Green,
            Traits = ["Ninja"],
            Description = string.Empty,
            Damage = 0,
            Power = 2,
            Health = 2,
            Effects = [effectSpec],
        };

        var ninjaCard = new CharacterCard
        {
            Id = "ninja-a-def",
            DisplayName = "Ninja A",
            Name = ["Ninja A"],
            Type = CardType.Character,
            Color = CardColor.Blue,
            Traits = ["Ninja"],
            Description = string.Empty,
            Damage = 0,
            Power = 2,
            Health = 2,
            Effects = [],
        };

        var sourceInstance = new CardInstance
        {
            InstanceId = "source-inst",
            CardDefinitionId = sourceDefinition.Id,
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
        };

        var ninjaInstance = new CardInstance
        {
            InstanceId = "ninja-a-inst",
            CardDefinitionId = ninjaCard.Id,
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
        };

        var state = new GameState
        {
            GameId = "game-tribute-1",
            ActivePlayerId = "p1",
            PriorityPlayerId = "p1",
            Players =
            [
                new PlayerState
                {
                    PlayerId = "p1",
                    Battlefield = [sourceInstance, ninjaInstance],
                },
                new PlayerState
                {
                    PlayerId = "p2",
                }
            ],
            CardDefinitions =
            {
                [sourceDefinition.Id] = sourceDefinition,
                [ninjaCard.Id] = ninjaCard,
            }
        };

        return new GameCardEffectContext(
            game: new GameInstance(state),
            actingPlayer: new Player { Id = "p1" },
            sourceCardDefinition: sourceDefinition,
            sourceCardInstance: sourceInstance,
            arguments: new Dictionary<string, string>(),
            selectedTargets: []);
    }

    private sealed class StubEffectSpecResolver(EffectSpec effectSpec) : IGameRuntimeEffectSpecResolver
    {
        private readonly EffectSpec effectSpec = effectSpec;

        public EffectSpec? Resolve(GameCardEffectContext context, RuntimeEffects runtimeEffect)
        {
            return runtimeEffect == RuntimeEffects.Tribute ? effectSpec : null;
        }
    }

    private sealed class StubCanExecuteEvaluator : IGameEffectCanExecuteEvaluator
    {
        public CanExecuteResult Evaluate(GameCardEffectContext context, EffectSpec effectSpec, bool includeValidTargets)
        {
            return new CanExecuteResult { CanExecute = true };
        }
    }

    private sealed class StubTargetResolver : IGameEffectTargetResolver
    {
        public IReadOnlyList<GameEffectTargetReference> ResolveTargets(GameCardEffectContext context, EffectSpec effectSpec)
        {
            return [];
        }
    }
}
