using ErrorOr;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class GamePassiveEffectServiceTests
{
    [TestMethod]
    public void EvaluateAndEnqueue_ActivatesPassiveAndEnqueuesConsequence()
    {
        var passiveEffect = CreatePassiveEffectSpec(
            effectId: "passive-1",
            triggerKinds: [PassiveTriggerKind.StatsChanged],
            consequenceEffectTypeKey: DestroyCardEffect.EffectKey,
            mode: PassiveMode.Continuous);

        var game = CreateGameWithPassiveSource(passiveEffect);
        var service = new GamePassiveEffectService(
            canExecuteEvaluator: new StubCanExecuteEvaluator(["passive-1"]),
            effectRegistry: new StubEffectRegistry([DestroyCardEffect.EffectKey]));

        var result = service.EvaluateAndEnqueue(
            game,
            CreateMutationEvent(GameMutationKind.CardStatChanged),
            new PassiveChainResolutionOptions());

        Assert.IsFalse(result.IsError);

        var passiveKey = "card-1:passive-1";
        Assert.AreEqual(1, result.Value.ActivatedPassiveKeys.Count);
        Assert.AreEqual(passiveKey, result.Value.ActivatedPassiveKeys[0]);
        Assert.AreEqual(0, result.Value.DeactivatedPassiveKeys.Count);
        Assert.AreEqual(1, result.Value.EnqueuedStackEntryIds.Count);
        Assert.AreEqual(1, game.State.EffectResolutionStack.Count);
        Assert.AreEqual(DestroyCardEffect.EffectKey, game.State.EffectResolutionStack[0].EffectTypeKey);
        Assert.AreEqual(1, game.State.PassiveStates.Count);
        Assert.IsTrue(game.State.PassiveStates[0].IsActive);
    }

    [TestMethod]
    public void EvaluateAndEnqueue_DeactivatesPreviouslyActivePassive_WhenConditionFails()
    {
        var passiveEffect = CreatePassiveEffectSpec(
            effectId: "passive-2",
            triggerKinds: [PassiveTriggerKind.StatsChanged],
            consequenceEffectTypeKey: DestroyCardEffect.EffectKey,
            mode: PassiveMode.Continuous);

        var game = CreateGameWithPassiveSource(passiveEffect);
        game.State.PassiveStates.Add(new PassiveActivationState
        {
            PassiveKey = "card-1:passive-2",
            SourceCardInstanceId = "card-1",
            SourcePlayerId = "p1",
            EffectSpecId = "passive-2",
            IsActive = true,
            LastChangedAtTurn = 1,
            LastChangedAtPhase = GamePhase.MainPhase,
        });

        var service = new GamePassiveEffectService(
            canExecuteEvaluator: new StubCanExecuteEvaluator([]),
            effectRegistry: new StubEffectRegistry([DestroyCardEffect.EffectKey]));

        var result = service.EvaluateAndEnqueue(
            game,
            CreateMutationEvent(GameMutationKind.CardStatChanged),
            new PassiveChainResolutionOptions());

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(0, result.Value.ActivatedPassiveKeys.Count);
        Assert.AreEqual(1, result.Value.DeactivatedPassiveKeys.Count);
        Assert.AreEqual("card-1:passive-2", result.Value.DeactivatedPassiveKeys[0]);
        Assert.AreEqual(0, result.Value.EnqueuedStackEntryIds.Count);
        Assert.AreEqual(0, game.State.EffectResolutionStack.Count);
        Assert.AreEqual(1, game.State.PassiveStates.Count);
        Assert.IsFalse(game.State.PassiveStates[0].IsActive);
    }

    [TestMethod]
    public void EvaluateAndEnqueue_DoesNotReevaluate_WhenTriggerDoesNotMatchMutation()
    {
        var passiveEffect = CreatePassiveEffectSpec(
            effectId: "passive-3",
            triggerKinds: [PassiveTriggerKind.TurnChanged],
            consequenceEffectTypeKey: DestroyCardEffect.EffectKey,
            mode: PassiveMode.Continuous);

        var game = CreateGameWithPassiveSource(passiveEffect);
        var service = new GamePassiveEffectService(
            canExecuteEvaluator: new StubCanExecuteEvaluator(["passive-3"]),
            effectRegistry: new StubEffectRegistry([DestroyCardEffect.EffectKey]));

        var result = service.EvaluateAndEnqueue(
            game,
            CreateMutationEvent(GameMutationKind.KeywordChanged),
            new PassiveChainResolutionOptions());

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(0, result.Value.ActivatedPassiveKeys.Count);
        Assert.AreEqual(0, result.Value.DeactivatedPassiveKeys.Count);
        Assert.AreEqual(0, result.Value.EnqueuedStackEntryIds.Count);
        Assert.AreEqual(0, game.State.EffectResolutionStack.Count);
        Assert.AreEqual(1, game.State.PassiveStates.Count);
        Assert.IsFalse(game.State.PassiveStates[0].IsActive);
    }

    [TestMethod]
    public void EvaluateAndEnqueue_TranslatesTriggerTargetsAndArguments_IntoStackEntryPayload()
    {
        var passiveEffect = new EffectSpec
        {
            Id = "passive-4",
            RuntimeEffectType = RuntimeEffects.SummonCard,
            PassiveMode = PassiveMode.Triggered,
            PassiveReevaluation = new PassiveReevaluationSpec
            {
                TriggerKinds = [PassiveTriggerKind.StatsChanged],
                Scope = PassiveReevaluationScope.SourceCardOnly,
            },
            PassiveConsequences =
            [
                new PassiveConsequenceSpec
                {
                    ConsequenceEffectTypeKey = DestroyCardEffect.EffectKey,
                    TargetPolicy = PassiveConsequenceTargetPolicy.TriggerSelectedTargets,
                    ConsequenceArguments = new Dictionary<string, string>(StringComparer.Ordinal)
                    {
                        ["reason"] = "passive-chain",
                    }
                }
            ]
        };

        var targetCard = new CardInstance
        {
            InstanceId = "target-1",
            CardDefinitionId = "target-def",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
        };

        var game = CreateGameWithPassiveSource(passiveEffect, targetCard);
        var service = new GamePassiveEffectService(
            canExecuteEvaluator: new StubCanExecuteEvaluator(["passive-4"]),
            effectRegistry: new StubEffectRegistry([DestroyCardEffect.EffectKey]));

        var mutationEvent = CreateMutationEvent(GameMutationKind.CardStatChanged);
        mutationEvent.AffectedCardInstanceIds = ["target-1"];
        mutationEvent.AffectedPlayerIds = ["p1", "p2"];

        var result = service.EvaluateAndEnqueue(
            game,
            mutationEvent,
            new PassiveChainResolutionOptions());

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(1, game.State.EffectResolutionStack.Count);

        var stackEntry = game.State.EffectResolutionStack[0];
        Assert.AreEqual(1, stackEntry.SelectedTargets.Count);
        Assert.AreEqual("target-1", stackEntry.SelectedTargets[0].CardInstanceId);
        Assert.AreEqual("p2", stackEntry.SelectedTargets[0].PlayerId);
        Assert.IsTrue(stackEntry.Arguments.ContainsKey("reason"));
        Assert.AreEqual("passive-chain", stackEntry.Arguments["reason"]);
    }

    private static EffectSpec CreatePassiveEffectSpec(
        string effectId,
        IReadOnlyList<PassiveTriggerKind> triggerKinds,
        string consequenceEffectTypeKey,
        PassiveMode mode)
    {
        return new EffectSpec
        {
            Id = effectId,
            RuntimeEffectType = RuntimeEffects.SummonCard,
            PassiveMode = mode,
            PassiveReevaluation = new PassiveReevaluationSpec
            {
                TriggerKinds = triggerKinds,
                Scope = PassiveReevaluationScope.SourceCardOnly,
            },
            PassiveConsequences =
            [
                new PassiveConsequenceSpec
                {
                    ConsequenceEffectTypeKey = consequenceEffectTypeKey,
                    TargetPolicy = PassiveConsequenceTargetPolicy.SourceCard,
                }
            ]
        };
    }

    private static GameInstance CreateGameWithPassiveSource(EffectSpec passiveEffectSpec, CardInstance? optionalOpponentBattlefieldCard = null)
    {
        var playerOne = new PlayerState
        {
            PlayerId = "p1",
            Battlefield =
            [
                new CardInstance
                {
                    InstanceId = "card-1",
                    CardDefinitionId = "def-1",
                    OwnerPlayerId = "p1",
                    ControllerPlayerId = "p1",
                }
            ]
        };

        var playerTwo = new PlayerState
        {
            PlayerId = "p2",
        };

        if (optionalOpponentBattlefieldCard is not null)
        {
            playerTwo.Battlefield.Add(optionalOpponentBattlefieldCard);
        }

        var cardDefinition = new CharacterCard
        {
            Id = "def-1",
            DisplayName = "Passive Unit",
            Name = ["Passive Unit"],
            Type = CardType.Character,
            Color = CardColor.Red,
            Traits = ["Ninja"],
            Description = string.Empty,
            Damage = 1,
            Power = 1,
            Health = 1,
            Effects = [passiveEffectSpec],
        };

        var state = new GameState
        {
            GameId = "game-1",
            ActivePlayerId = "p1",
            PriorityPlayerId = "p1",
            TurnNumber = 3,
            Phase = GamePhase.MainPhase,
            Players = [playerOne, playerTwo],
            CardDefinitions =
            {
                ["def-1"] = cardDefinition,
                ["target-def"] = new CharacterCard
                {
                    Id = "target-def",
                    DisplayName = "Target",
                    Name = ["Target"],
                    Type = CardType.Character,
                    Color = CardColor.Blue,
                    Traits = ["Ninja"],
                    Description = string.Empty,
                    Damage = 1,
                    Power = 2,
                    Health = 2,
                },
            }
        };

        return new GameInstance(state);
    }

    private static GameMutationEvent CreateMutationEvent(GameMutationKind mutationKind)
    {
        return new GameMutationEvent
        {
            Kind = mutationKind,
            GameId = "game-1",
            ActingPlayerId = "p1",
            TurnNumber = 3,
            Phase = GamePhase.MainPhase,
            AffectedCardInstanceIds = [],
            AffectedPlayerIds = ["p1"],
        };
    }

    private sealed class StubCanExecuteEvaluator(IEnumerable<string> activeEffectIds) : IGameEffectCanExecuteEvaluator
    {
        private readonly HashSet<string> activeEffectIds = new(activeEffectIds, StringComparer.Ordinal);

        public CanExecuteResult Evaluate(GameCardEffectContext context, EffectSpec effectSpec, bool includeValidTargets)
        {
            return new CanExecuteResult
            {
                CanExecute = activeEffectIds.Contains(effectSpec.Id),
            };
        }
    }

    private sealed class StubEffectRegistry(IEnumerable<string> resolvableEffectKeys) : IGameCardEffectRegistry
    {
        private readonly HashSet<string> resolvableEffectKeys = new(resolvableEffectKeys, StringComparer.Ordinal);

        public bool TryResolve(string effectTypeKey, out IGameCardEffect? effect)
        {
            if (resolvableEffectKeys.Contains(effectTypeKey))
            {
                effect = new NoopGameCardEffect();
                return true;
            }

            effect = null;
            return false;
        }
    }
}