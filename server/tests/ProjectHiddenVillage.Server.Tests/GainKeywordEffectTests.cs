using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class GainKeywordEffectTests
{
    [TestMethod]
    public void Execute_SourceCard_AddRush_AddsRuntimeKeyword()
    {
        var effectSpec = new EffectSpec
        {
            RuntimeEffectType = RuntimeEffects.GainEffect,
            KeywordModifications =
            [
                new KeywordModificationSpec
                {
                    TargetType = KeywordModificationTargetType.SourceCard,
                    Operation = KeywordModificationOperation.Add,
                    Keyword = EffectConditionKeywords.Rush
                }
            ]
        };

        var sourceCardInstance = CreateCardInstance("source-instance", "source-def", "p1");
        var context = CreateContext(effectSpec, sourceCardInstance, targetCard: null);
        var effect = CreateEffect(effectSpec);

        var result = effect.Execute(context, []);

        Assert.IsFalse(result.IsError);
        Assert.IsTrue(sourceCardInstance.RuntimeKeywords.Contains(EffectConditionKeywords.Rush));
    }

    [TestMethod]
    public void Execute_SelectedTargets_RemoveRush_RemovesRuntimeKeyword()
    {
        var effectSpec = new EffectSpec
        {
            RuntimeEffectType = RuntimeEffects.GainEffect,
            KeywordModifications =
            [
                new KeywordModificationSpec
                {
                    TargetType = KeywordModificationTargetType.SelectedTargets,
                    Operation = KeywordModificationOperation.Remove,
                    Keyword = EffectConditionKeywords.Rush
                }
            ]
        };

        var targetCard = CreateCardInstance("target-instance", "target-def", "p2");
        targetCard.RuntimeKeywords.Add(EffectConditionKeywords.Rush);

        var context = CreateContext(effectSpec, sourceCardInstance: null, targetCard: targetCard);
        var effect = CreateEffect(effectSpec);

        var result = effect.Execute(
            context,
            [new GameEffectTargetReference("p2", PlayerZone.CharacterField, "target-instance")]);

        Assert.IsFalse(result.IsError);
        Assert.IsFalse(targetCard.RuntimeKeywords.Contains(EffectConditionKeywords.Rush));
    }

    private static GainKeywordEffect CreateEffect(EffectSpec effectSpec)
    {
        return new GainKeywordEffect(
            effectSpecResolver: new StubEffectSpecResolver(effectSpec),
            canExecuteEvaluator: new StubCanExecuteEvaluator(),
            targetResolver: new StubTargetResolver());
    }

    private static GameCardEffectContext CreateContext(
        EffectSpec effectSpec,
        CardInstance? sourceCardInstance,
        CardInstance? targetCard)
    {
        var playerOne = new PlayerState
        {
            PlayerId = "p1",
            LeaderCardInstance = CreateLeader("leader-1", "p1")
        };

        var playerTwo = new PlayerState
        {
            PlayerId = "p2",
            LeaderCardInstance = CreateLeader("leader-2", "p2")
        };

        if (sourceCardInstance is not null)
        {
            playerOne.Battlefield.Add(sourceCardInstance);
        }

        if (targetCard is not null)
        {
            playerTwo.Battlefield.Add(targetCard);
        }

        var state = new GameState
        {
            GameId = "game-1",
            ActivePlayerId = "p1",
            PriorityPlayerId = "p1",
            Players = [playerOne, playerTwo],
            CardDefinitions =
            {
                ["source-def"] = CreateCharacterDefinition("source-def", "Source", effectSpec),
                ["target-def"] = CreateCharacterDefinition("target-def", "Target", effectSpec),
                ["leader-def"] = new LeaderCard
                {
                    Id = "leader-def",
                    DisplayName = "Leader",
                    Name = ["Leader"],
                    Type = CardType.Leader,
                    Color = CardColor.Blue,
                    Traits = ["Leader"],
                    Description = string.Empty,
                    Power = 0,
                    Damage = 0,
                    Life = 5,
                    Effects = []
                }
            }
        };

        var game = new GameInstance(state);

        return new GameCardEffectContext(
            game: game,
            actingPlayer: new Player { Id = "p1" },
            sourceCardDefinition: state.CardDefinitions["source-def"],
            sourceCardInstance: sourceCardInstance,
            arguments: new Dictionary<string, string>(),
            selectedTargets: []);
    }

    private static CharacterCard CreateCharacterDefinition(string id, string displayName, EffectSpec effectSpec)
    {
        return new CharacterCard
        {
            Id = id,
            DisplayName = displayName,
            Name = [displayName],
            Type = CardType.Character,
            Color = CardColor.Red,
            Traits = [],
            Description = string.Empty,
            Damage = 0,
            Power = 2,
            Health = 3,
            Effects = [effectSpec]
        };
    }

    private static CardInstance CreateCardInstance(string instanceId, string definitionId, string playerId)
    {
        return new CardInstance
        {
            InstanceId = instanceId,
            CardDefinitionId = definitionId,
            OwnerPlayerId = playerId,
            ControllerPlayerId = playerId,
            IsExhausted = false
        };
    }

    private static LeaderCardInstanceState CreateLeader(string instanceId, string playerId)
    {
        return new LeaderCardInstanceState
        {
            InstanceId = instanceId,
            CardDefinitionId = "leader-def",
            OwnerPlayerId = playerId,
            ControllerPlayerId = playerId,
            Name = "Leader",
            Color = CardColor.Blue,
            Traits = ["Leader"],
            Damage = 0,
            Power = 0,
            RecoveryEffect = string.Empty,
            TotalLife = 5,
            CurrentLife = 5
        };
    }

    private sealed class StubEffectSpecResolver(EffectSpec effectSpec) : IGameRuntimeEffectSpecResolver
    {
        private readonly EffectSpec effectSpec = effectSpec;

        public EffectSpec? Resolve(GameCardEffectContext context, RuntimeEffects runtimeEffect)
        {
            return runtimeEffect == RuntimeEffects.GainEffect ? effectSpec : null;
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
