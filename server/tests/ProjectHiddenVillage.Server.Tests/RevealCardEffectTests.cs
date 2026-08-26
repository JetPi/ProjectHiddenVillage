using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class RevealCardEffectTests
{
    [TestMethod]
    public void Execute_RevealsSelectedCard_AndWritesChainArguments()
    {
        var effectSpec = CreateRevealEffectSpec(PlayerZone.Hand);
        var selectedTarget = new GameEffectTargetReference("p2", PlayerZone.Hand, "o-hand");
        var context = CreateContext(effectSpec, [selectedTarget]);

        var effect = new RevealCardEffect(
            effectSpecResolver: new StubEffectSpecResolver(effectSpec),
            canExecuteEvaluator: new StubCanExecuteEvaluator(),
            targetResolver: new StubTargetResolver([selectedTarget]));

        var result = effect.Execute(context, context.SelectedTargets);

        Assert.IsFalse(result.IsError);

        var opponentHandCard = context.Game.State.Players[1].Hand[0];
        Assert.IsTrue(opponentHandCard.IsRevealedToBothPlayers);
        Assert.AreEqual(PlayerZone.Hand, opponentHandCard.RevealedInZone);

        Assert.IsTrue(context.Arguments.TryGetValue(ReactiveEffectExecutionConstants.RevealedPrimaryTargetIdArgument, out var primaryTargetId));
        Assert.AreEqual("o-hand", primaryTargetId);

        Assert.IsTrue(context.Arguments.TryGetValue(ReactiveEffectExecutionConstants.RevealedTargetIdsArgument, out var allTargetIds));
        Assert.AreEqual("o-hand", allTargetIds);
    }

    [TestMethod]
    public void Execute_ReturnsError_WhenNoSelectedTargetsCanBeRevealed()
    {
        var effectSpec = CreateRevealEffectSpec(PlayerZone.Hand);
        var context = CreateContext(effectSpec, []);

        var effect = new RevealCardEffect(
            effectSpecResolver: new StubEffectSpecResolver(effectSpec),
            canExecuteEvaluator: new StubCanExecuteEvaluator(),
            targetResolver: new StubTargetResolver([]));

        var result = effect.Execute(context, []);

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Game.Effect.RevealCard.NoTargetsRevealed", result.FirstError.Code);
    }

    [TestMethod]
    public void Execute_RevealFirstSetsChainArguments_ForPostRevealConditionEvaluation()
    {
        var effectSpec = CreateRevealEffectSpec(PlayerZone.Hand);
        effectSpec.RevealTimingMode = RevealTimingMode.RevealFirst;

        var selectedTarget = new GameEffectTargetReference("p2", PlayerZone.Hand, "o-hand");
        var context = CreateContext(effectSpec, [selectedTarget]);

        var effect = new RevealCardEffect(
            effectSpecResolver: new StubEffectSpecResolver(effectSpec),
            canExecuteEvaluator: new StubCanExecuteEvaluator(),
            targetResolver: new StubTargetResolver([selectedTarget]));

        var result = effect.Execute(context, context.SelectedTargets);

        Assert.IsFalse(result.IsError);
        Assert.IsTrue(context.Arguments.TryGetValue(ReactiveEffectExecutionConstants.RevealedPrimaryTargetIdArgument, out var primaryTargetId));
        Assert.AreEqual("o-hand", primaryTargetId);
        Assert.IsTrue(context.Arguments.TryGetValue(ReactiveEffectExecutionConstants.RevealedTargetIdsArgument, out var targetIds));
        Assert.AreEqual("o-hand", targetIds);
    }

    private static EffectSpec CreateRevealEffectSpec(PlayerZone zone)
    {
        return new EffectSpec
        {
            Id = "reveal-1",
            RuntimeEffectType = RuntimeEffects.RevealCard,
            EffectType = EffectKind.Support,
            Timing = EffectTiming.Quick,
            TargetRange = EffectTargetRange.Any,
            ContextRules = [],
            TargetRules = new EffectTargetRuleSet
            {
                Operator = RequirementGroupOperator.Any,
                Rules =
                [
                    new EffectTargetRule
                    {
                        Scope = EffectTargetRange.Any,
                        InZone = zone,
                        Restriction = new ZoneCardRestriction { Predicates = [] }
                    }
                ]
            }
        };
    }

    private static GameCardEffectContext CreateContext(
        EffectSpec revealEffectSpec,
        IReadOnlyList<GameEffectTargetReference> selectedTargets)
    {
        var sourceCard = new CharacterCard
        {
            Id = "source-card",
            DisplayName = "Source",
            Name = ["Source"],
            Type = CardType.Character,
            Color = CardColor.Green,
            Traits = [],
            Damage = 1,
            Power = 1,
            Health = 2,
            Effects = [revealEffectSpec]
        };

        var handCardDefinition = new CharacterCard
        {
            Id = "hand-def",
            DisplayName = "Hidden Hand Card",
            Name = ["Hidden Hand Card"],
            Type = CardType.Character,
            Color = CardColor.Blue,
            Traits = ["Uchiha Clan"],
            Damage = 1,
            Power = 1,
            Health = 2,
            Effects = []
        };

        var leaderDefinition = new LeaderCard
        {
            Id = "leader-def",
            DisplayName = "Leader",
            Name = ["Leader"],
            Type = CardType.Leader,
            Color = CardColor.Blue,
            Traits = ["Leader"],
            Damage = 0,
            Power = 0,
            Life = 5,
            RecoveryEffect = string.Empty,
            Effects = []
        };

        var state = new GameState
        {
            GameId = "reveal-game",
            ActivePlayerId = "p1",
            PriorityPlayerId = "p1",
            CardDefinitions =
            {
                ["source-card"] = sourceCard,
                ["hand-def"] = handCardDefinition,
                ["leader-def"] = leaderDefinition,
            },
            Players =
            [
                new PlayerState
                {
                    PlayerId = "p1",
                    LeaderCardInstance = CreateLeader("p1"),
                    Hand =
                    [
                        new CardInstance
                        {
                            InstanceId = "p1-hand",
                            CardDefinitionId = "hand-def",
                            OwnerPlayerId = "p1",
                            ControllerPlayerId = "p1",
                        }
                    ]
                },
                new PlayerState
                {
                    PlayerId = "p2",
                    LeaderCardInstance = CreateLeader("p2"),
                    Hand =
                    [
                        new CardInstance
                        {
                            InstanceId = "o-hand",
                            CardDefinitionId = "hand-def",
                            OwnerPlayerId = "p2",
                            ControllerPlayerId = "p2",
                        }
                    ]
                }
            ]
        };

        var sourceCardInstance = new CardInstance
        {
            InstanceId = "source-inst",
            CardDefinitionId = "source-card",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
        };

        state.Players[0].Battlefield.Add(sourceCardInstance);

        return new GameCardEffectContext(
            game: new GameInstance(state),
            actingPlayer: new Player
            {
                Id = "p1",
                Name = "Player 1",
                DisplayName = "Player 1",
                Deck = []
            },
            sourceCardDefinition: sourceCard,
            sourceCardInstance: sourceCardInstance,
            arguments: new Dictionary<string, string>(StringComparer.Ordinal),
            selectedTargets: selectedTargets);
    }

    private static LeaderCardInstanceState CreateLeader(string playerId)
    {
        return new LeaderCardInstanceState
        {
            InstanceId = $"leader-{playerId}",
            CardDefinitionId = "leader-def",
            OwnerPlayerId = playerId,
            ControllerPlayerId = playerId,
            Name = "Leader",
            Color = CardColor.Blue,
            Traits = ["Leader"],
            Damage = 0,
            Power = 0,
            TotalLife = 5,
            CurrentLife = 5,
            RecoveryEffect = string.Empty,
        };
    }

    private sealed class StubEffectSpecResolver(EffectSpec effectSpec) : IGameRuntimeEffectSpecResolver
    {
        public EffectSpec? Resolve(GameCardEffectContext context, RuntimeEffects runtimeEffectType)
        {
            return runtimeEffectType == RuntimeEffects.RevealCard ? effectSpec : null;
        }
    }

    private sealed class StubCanExecuteEvaluator : IGameEffectCanExecuteEvaluator
    {
        public CanExecuteResult Evaluate(GameCardEffectContext context, EffectSpec effectSpec, bool includeValidTargets)
        {
            return new CanExecuteResult { CanExecute = true };
        }
    }

    private sealed class StubTargetResolver(IReadOnlyList<GameEffectTargetReference> targets) : IGameEffectTargetResolver
    {
        public IReadOnlyList<GameEffectTargetReference> ResolveTargets(GameCardEffectContext context, EffectSpec effectSpec)
        {
            return targets;
        }
    }
}
