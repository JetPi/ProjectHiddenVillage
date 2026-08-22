using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class SummonCardEffectTests
{
    [TestMethod]
    public void CanExecute_FiltersOutCardsThatCannotBeNormalSummoned()
    {
        var effectSpec = CreateSummonEffectSpec();
        var blockedTarget = new GameEffectTargetReference("p1", PlayerZone.Hand, "blocked-instance");
        var allowedTarget = new GameEffectTargetReference("p1", PlayerZone.Hand, "allowed-instance");

        var context = CreateContext(effectSpec);
        var effect = new SummonCardEffect(
            effectSpecResolver: new StubEffectSpecResolver(effectSpec),
            canExecuteEvaluator: new StubCanExecuteEvaluator([blockedTarget, allowedTarget]),
            targetResolver: new StubTargetResolver([]));

        var result = effect.CanExecute(context);

        Assert.IsTrue(result.CanExecute);
        Assert.AreEqual(1, result.ValidTargets.Count);
        Assert.AreEqual("allowed-instance", result.ValidTargets[0].CardInstanceId);
    }

    [TestMethod]
    public void GetValidTargets_ExcludesCardsThatCannotBeNormalSummoned()
    {
        var effectSpec = CreateSummonEffectSpec();
        var blockedTarget = new GameEffectTargetReference("p1", PlayerZone.Hand, "blocked-instance");
        var allowedTarget = new GameEffectTargetReference("p1", PlayerZone.Hand, "allowed-instance");

        var context = CreateContext(effectSpec);
        var effect = new SummonCardEffect(
            effectSpecResolver: new StubEffectSpecResolver(effectSpec),
            canExecuteEvaluator: new StubCanExecuteEvaluator([]),
            targetResolver: new StubTargetResolver([blockedTarget, allowedTarget]));

        var validTargets = effect.GetValidTargets(context);

        Assert.AreEqual(1, validTargets.Count);
        Assert.AreEqual("allowed-instance", validTargets[0].CardInstanceId);
    }

    [TestMethod]
    public void Execute_ReturnsValidationError_WhenCardCannotBeNormalSummoned()
    {
        var effectSpec = CreateSummonEffectSpec();
        var blockedTarget = new GameEffectTargetReference("p1", PlayerZone.Hand, "blocked-instance");

        var context = CreateContext(effectSpec);
        var effect = new SummonCardEffect(
            effectSpecResolver: new StubEffectSpecResolver(effectSpec),
            canExecuteEvaluator: new StubCanExecuteEvaluator([]),
            targetResolver: new StubTargetResolver([]));

        var result = effect.Execute(context, [blockedTarget]);

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Game.Effect.SummonCard.CannotBeNormalSummoned", result.FirstError.Code);
    }

    [TestMethod]
    public void Execute_SetsSuppressionFlagOnSummonedTargets_WhenConfigured()
    {
        var effectSpec = CreateSummonEffectSpec();
        effectSpec.SuppressSummonedTargetsEffectsWhileOnField = true;

        var context = CreateContext(effectSpec);
        var effect = new SummonCardEffect(
            effectSpecResolver: new StubEffectSpecResolver(effectSpec),
            canExecuteEvaluator: new StubCanExecuteEvaluator([]),
            targetResolver: new StubTargetResolver([]));

        var result = effect.Execute(context, [new GameEffectTargetReference("p1", PlayerZone.Hand, "allowed-instance")]);

        Assert.IsFalse(result.IsError);

        var summonedCard = context.Game.State.Players[0].Battlefield
            .FirstOrDefault(card => card.InstanceId == "allowed-instance");

        Assert.IsNotNull(summonedCard);
        Assert.IsTrue(summonedCard.EffectsSuppressedWhileOnField);
    }

    [TestMethod]
    public void Execute_ReturnsValidationError_WhenCardTypeIsNonInstantiable()
    {
        var effectSpec = CreateSummonEffectSpec();
        var blockedTarget = new GameEffectTargetReference("p1", PlayerZone.Hand, "blocked-instance");

        var context = CreateContext(effectSpec);
        context.Game.State.CardDefinitions["blocked-card"].Type = CardType.Chakra;
        context.Game.State.CardDefinitions["blocked-card"].CannotBeNormalSummoned = false;

        var effect = new SummonCardEffect(
            effectSpecResolver: new StubEffectSpecResolver(effectSpec),
            canExecuteEvaluator: new StubCanExecuteEvaluator([]),
            targetResolver: new StubTargetResolver([]));

        var result = effect.Execute(context, [blockedTarget]);

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Game.Effect.SummonCard.UnsupportedCardType", result.FirstError.Code);
    }

    private static EffectSpec CreateSummonEffectSpec()
    {
        return new EffectSpec
        {
            RuntimeEffectType = RuntimeEffects.SummonCard,
            EffectType = EffectKind.Activated,
            Timing = EffectTiming.ActivateMain,
            TargetRange = EffectTargetRange.Self,
            ContextRules = []
        };
    }

    private static GameCardEffectContext CreateContext(EffectSpec effectSpec)
    {
        var blockedDefinition = new CharacterCard
        {
            Id = "blocked-card",
            DisplayName = "Blocked",
            Name = ["Blocked"],
            Type = CardType.Character,
            Color = CardColor.Red,
            Traits = [],
            Description = string.Empty,
            Damage = 1,
            Power = 1,
            Health = 1,
            CannotBeNormalSummoned = true,
            Effects = []
        };

        var allowedDefinition = new CharacterCard
        {
            Id = "allowed-card",
            DisplayName = "Allowed",
            Name = ["Allowed"],
            Type = CardType.Character,
            Color = CardColor.Blue,
            Traits = [],
            Description = string.Empty,
            Damage = 1,
            Power = 1,
            Health = 1,
            CannotBeNormalSummoned = false,
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
            Description = string.Empty,
            Damage = 0,
            Power = 0,
            Life = 5,
            RecoveryEffect = string.Empty,
            Effects = []
        };

        var sourceDefinition = new CharacterCard
        {
            Id = "source-def",
            DisplayName = "Source",
            Name = ["Source"],
            Type = CardType.Character,
            Color = CardColor.Green,
            Traits = [],
            Description = string.Empty,
            Damage = 1,
            Power = 1,
            Health = 1,
            Effects = [effectSpec]
        };

        var state = new GameState
        {
            GameId = "game-1",
            TurnNumber = 1,
            ActivePlayerId = "p1",
            PriorityPlayerId = "p1",
            CardDefinitions =
            {
                ["source-def"] = sourceDefinition,
                ["blocked-card"] = blockedDefinition,
                ["allowed-card"] = allowedDefinition,
                ["leader-def"] = leaderDefinition,
            },
            Players =
            [
                new PlayerState
                {
                    PlayerId = "p1",
                    Hand =
                    [
                        new CardInstance
                        {
                            InstanceId = "blocked-instance",
                            CardDefinitionId = "blocked-card",
                            OwnerPlayerId = "p1",
                            ControllerPlayerId = "p1",
                        },
                        new CardInstance
                        {
                            InstanceId = "allowed-instance",
                            CardDefinitionId = "allowed-card",
                            OwnerPlayerId = "p1",
                            ControllerPlayerId = "p1",
                        }
                    ],
                    LeaderCardInstance = new LeaderCardInstanceState
                    {
                        InstanceId = "leader-1",
                        CardDefinitionId = "leader-def",
                        OwnerPlayerId = "p1",
                        ControllerPlayerId = "p1",
                        Name = "Leader",
                        Color = CardColor.Blue,
                        Traits = ["Leader"],
                        Damage = 0,
                        Power = 0,
                        TotalLife = 5,
                        CurrentLife = 5,
                        RecoveryEffect = string.Empty,
                    },
                },
                new PlayerState
                {
                    PlayerId = "p2",
                    LeaderCardInstance = new LeaderCardInstanceState
                    {
                        InstanceId = "leader-2",
                        CardDefinitionId = "leader-def",
                        OwnerPlayerId = "p2",
                        ControllerPlayerId = "p2",
                        Name = "Leader",
                        Color = CardColor.Blue,
                        Traits = ["Leader"],
                        Damage = 0,
                        Power = 0,
                        TotalLife = 5,
                        CurrentLife = 5,
                        RecoveryEffect = string.Empty,
                    },
                }
            ]
        };

        return new GameCardEffectContext(
            game: new GameInstance(state),
            actingPlayer: new Player { Id = "p1" },
            sourceCardDefinition: sourceDefinition,
            sourceCardInstance: null,
            arguments: new Dictionary<string, string>(),
            selectedTargets: []);
    }

    private sealed class StubEffectSpecResolver(EffectSpec effectSpec) : IGameRuntimeEffectSpecResolver
    {
        private readonly EffectSpec effectSpec = effectSpec;

        public EffectSpec? Resolve(GameCardEffectContext context, RuntimeEffects runtimeEffect)
        {
            return runtimeEffect == RuntimeEffects.SummonCard ? effectSpec : null;
        }
    }

    private sealed class StubCanExecuteEvaluator(IReadOnlyList<GameEffectTargetReference> validTargets) : IGameEffectCanExecuteEvaluator
    {
        private readonly IReadOnlyList<GameEffectTargetReference> validTargets = validTargets;

        public CanExecuteResult Evaluate(GameCardEffectContext context, EffectSpec effectSpec, bool includeValidTargets)
        {
            return new CanExecuteResult
            {
                CanExecute = true,
                ValidTargets = includeValidTargets
                    ? validTargets.Select(target => new ValidTargetResult
                    {
                        CardInstanceId = target.CardInstanceId,
                        CardZone = target.Zone,
                        CardName = target.CardInstanceId,
                        SlotId = target.CardInstanceId,
                        ExecuteMessage = target.CardInstanceId,
                    }).ToList()
                    : []
            };
        }
    }

    private sealed class StubTargetResolver(IReadOnlyList<GameEffectTargetReference> validTargets) : IGameEffectTargetResolver
    {
        private readonly IReadOnlyList<GameEffectTargetReference> validTargets = validTargets;

        public IReadOnlyList<GameEffectTargetReference> ResolveTargets(GameCardEffectContext context, EffectSpec effectSpec)
        {
            return validTargets;
        }
    }
}
