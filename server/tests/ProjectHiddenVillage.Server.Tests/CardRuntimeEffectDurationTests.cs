using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Games;
using ProjectHiddenVillage.Server.Engine;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class CardRuntimeEffectDurationTests
{
    private readonly GamePhaseStateService phaseStateService = new();

    [TestMethod]
    public void ToGameStateResponse_AppliesTemporaryTurnPowerModifier_AndExpiresOnCompleteEndStep()
    {
        var state = CreateState();
        var source = state.Players[0].Battlefield[0];
        var target = state.Players[1].Battlefield[0];

        state.AppliedCardEffects.Add(new AppliedCardEffectState
        {
            SourceCardInstanceId = source.InstanceId,
            EffectSpecId = "effect-turn-power",
            TargetCardInstanceId = target.InstanceId,
            ModifierKind = AppliedCardModifierKind.Attribute,
            DurationMode = EffectDurationMode.DuringThisTurn,
            AttributeType = EffectAttributeType.CardPower,
            AttributeOperation = AttributeModificationOperation.Add,
            AttributeValue = 3,
            AppliedTurnNumber = state.TurnNumber,
        });

        var beforeResponse = GameStateResponseMapper.ToGameStateResponse(state, "p1");
        var beforeTarget = beforeResponse.Players.Single(player => player.PlayerId == "p2").CharacterField[0] as EnrichedCardInstanceResponse;

        Assert.IsNotNull(beforeTarget);
        Assert.AreEqual(5, beforeTarget.Power);

        state.Phase = GamePhase.EndStep;
        phaseStateService.CompleteEndStep(state);

        var afterResponse = GameStateResponseMapper.ToGameStateResponse(state, "p1");
        var afterTarget = afterResponse.Players.Single(player => player.PlayerId == "p2").CharacterField[0] as EnrichedCardInstanceResponse;

        Assert.IsNotNull(afterTarget);
        Assert.AreEqual(2, afterTarget.Power);
        Assert.AreEqual(0, state.AppliedCardEffects.Count);
    }

    [TestMethod]
    public void AdvancePhase_RemovesTemporaryBattleEffects_OnBattleEndStepEntry()
    {
        var state = CreateState();
        var source = state.Players[0].Battlefield[0];
        var target = state.Players[1].Battlefield[0];

        state.Phase = GamePhase.AttackResolution;
        state.AppliedCardEffects.Add(new AppliedCardEffectState
        {
            SourceCardInstanceId = source.InstanceId,
            EffectSpecId = "effect-battle-keyword",
            TargetCardInstanceId = target.InstanceId,
            ModifierKind = AppliedCardModifierKind.Keyword,
            DurationMode = EffectDurationMode.DuringThisBattle,
            KeywordOperation = KeywordModificationOperation.Add,
            Keyword = EffectConditionKeywords.Rush,
            AppliedTurnNumber = state.TurnNumber,
        });

        var beforeResponse = GameStateResponseMapper.ToGameStateResponse(state, "p1");
        var beforeTarget = beforeResponse.Players.Single(player => player.PlayerId == "p2").CharacterField[0] as EnrichedCardInstanceResponse;

        Assert.IsNotNull(beforeTarget);
        Assert.AreEqual(1, state.AppliedCardEffects.Count);

        phaseStateService.AdvancePhase(state);

        Assert.AreEqual(GamePhase.BattleEndStep, state.Phase);
        Assert.AreEqual(0, state.AppliedCardEffects.Count);
    }

    [TestMethod]
    public void ToGameStateResponse_AppliesTemporaryKeyword_ForRushAttackRule()
    {
        var state = CreateState();
        var source = state.Players[0].Battlefield[0];
        var requesterCard = state.Players[0].Battlefield[0];
        requesterCard.EnteredFieldTurnNumber = state.TurnNumber;

        state.AppliedCardEffects.Add(new AppliedCardEffectState
        {
            SourceCardInstanceId = source.InstanceId,
            EffectSpecId = "effect-turn-rush",
            TargetCardInstanceId = requesterCard.InstanceId,
            ModifierKind = AppliedCardModifierKind.Keyword,
            DurationMode = EffectDurationMode.DuringThisTurn,
            KeywordOperation = KeywordModificationOperation.Add,
            Keyword = EffectConditionKeywords.Rush,
            AppliedTurnNumber = state.TurnNumber,
        });

        var response = GameStateResponseMapper.ToGameStateResponse(state, "p1");
        var requester = response.Players.Single(player => player.PlayerId == "p1");

        Assert.AreEqual(1, requester.CharacterField[0].AvailableActions.Count);
        Assert.AreEqual("battle-action:source-1", requester.CharacterField[0].AvailableActions[0].ActionId);
    }

    [TestMethod]
    public void ToGameStateResponse_AppliesTemporaryLeaderPowerModifier_AndExpiresOnCompleteEndStep()
    {
        var state = CreateState();
        var source = state.Players[0].Battlefield[0];
        var targetLeader = state.Players[1].LeaderCardInstance!;

        state.AppliedCardEffects.Add(new AppliedCardEffectState
        {
            SourceCardInstanceId = source.InstanceId,
            EffectSpecId = "effect-turn-leader-power",
            TargetCardInstanceId = targetLeader.InstanceId,
            ModifierKind = AppliedCardModifierKind.Attribute,
            DurationMode = EffectDurationMode.DuringThisTurn,
            AttributeType = EffectAttributeType.LeaderPower,
            AttributeOperation = AttributeModificationOperation.Add,
            AttributeValue = 2,
            AppliedTurnNumber = state.TurnNumber,
        });

        var beforeResponse = GameStateResponseMapper.ToGameStateResponse(state, "p1");
        var beforeLeader = beforeResponse.Players.Single(player => player.PlayerId == "p2").Leader;

        Assert.AreEqual(2, beforeLeader.Power);
        Assert.AreEqual(1, beforeResponse.ActiveTemporaryEffects.Count);

        state.Phase = GamePhase.EndStep;
        phaseStateService.CompleteEndStep(state);

        var afterResponse = GameStateResponseMapper.ToGameStateResponse(state, "p1");
        var afterLeader = afterResponse.Players.Single(player => player.PlayerId == "p2").Leader;

        Assert.AreEqual(0, afterLeader.Power);
        Assert.AreEqual(0, afterResponse.ActiveTemporaryEffects.Count);
    }

    [TestMethod]
    public void ToGameStateResponse_ExposesActiveTemporaryEffectDetails()
    {
        var state = CreateState();
        var source = state.Players[0].Battlefield[0];
        var target = state.Players[1].Battlefield[0];

        state.AppliedCardEffects.Add(new AppliedCardEffectState
        {
            SourceCardInstanceId = source.InstanceId,
            EffectSpecId = "effect-turn-power",
            TargetCardInstanceId = target.InstanceId,
            ModifierKind = AppliedCardModifierKind.Attribute,
            DurationMode = EffectDurationMode.DuringThisTurn,
            AttributeType = EffectAttributeType.CardPower,
            AttributeOperation = AttributeModificationOperation.Add,
            AttributeValue = 3,
            AppliedTurnNumber = state.TurnNumber,
        });

        var response = GameStateResponseMapper.ToGameStateResponse(state, "p1");
        var activeEffect = response.ActiveTemporaryEffects.Single();

        Assert.AreEqual("effect-turn-power", activeEffect.EffectId);
        Assert.AreEqual(source.InstanceId, activeEffect.SourceCardInstanceId);
        Assert.AreEqual(target.InstanceId, activeEffect.TargetCardInstanceId);
        Assert.AreEqual("Attribute", activeEffect.ModifierKind);
        Assert.AreEqual("DuringThisTurn", activeEffect.DurationMode);
        Assert.AreEqual("CardPower", activeEffect.Attribute);
        Assert.AreEqual("Add", activeEffect.Operation);
        Assert.AreEqual(3, activeEffect.Value);
        Assert.IsNull(activeEffect.Keyword);
    }

    private static GameState CreateState()
    {
        var requesterId = "p1";
        var opponentId = "p2";

        var sourceCard = new CardInstance
        {
            InstanceId = "source-1",
            CardDefinitionId = "card-source",
            OwnerPlayerId = requesterId,
            ControllerPlayerId = requesterId,
            EnteredFieldTurnNumber = null,
        };

        var targetCard = new CardInstance
        {
            InstanceId = "target-1",
            CardDefinitionId = "card-target",
            OwnerPlayerId = opponentId,
            ControllerPlayerId = opponentId,
        };

        return new GameState
        {
            GameId = "game-1",
            Phase = GamePhase.ActionStep,
            TurnNumber = 3,
            ActivePlayerId = requesterId,
            PriorityPlayerId = requesterId,
            CardDefinitions = new Dictionary<string, Card>(StringComparer.Ordinal)
            {
                ["leader-def"] = new LeaderCard
                {
                    Id = "leader-def",
                    DisplayName = "Leader",
                    Name = ["Leader"],
                    Traits = ["Leader"],
                    Type = CardType.Leader,
                    Color = CardColor.Blue,
                    Life = 5,
                    RecoveryEffect = "Recover 1"
                },
                ["card-source"] = CreateCharacterDefinition("card-source", "Source", power: 2),
                ["card-target"] = CreateCharacterDefinition("card-target", "Target", power: 2),
            },
            Players =
            [
                new PlayerState
                {
                    PlayerId = requesterId,
                    LeaderCardInstance = CreateLeader(requesterId),
                    Battlefield = [sourceCard]
                },
                new PlayerState
                {
                    PlayerId = opponentId,
                    LeaderCardInstance = CreateLeader(opponentId),
                    Battlefield = [targetCard]
                }
            ]
        };
    }

    private static CharacterCard CreateCharacterDefinition(string id, string displayName, int power)
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
            Power = power,
            Health = 3,
            Effects = []
        };
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
            RecoveryEffect = "Recover 1"
        };
    }
}
