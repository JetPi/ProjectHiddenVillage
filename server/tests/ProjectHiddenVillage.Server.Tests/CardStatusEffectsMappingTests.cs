using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// The board badges every status the engine is actually playing by, so these tests pin the projection to
/// the engine's own rules: a printed "Rush" disappears while the card's effects are suppressed, "Cannot
/// Attack" reaches a leader too, and hidden zones never carry statuses.
/// </summary>
[TestClass]
public sealed class CardStatusEffectsMappingTests
{
    [TestMethod]
    public void ToGameStateResponse_PublishesRushStatus_ForOpponentBattlefieldCardWithPrintedRush()
    {
        var state = CreateState();
        var opponentCard = state.Players[1].Battlefield[0];
        opponentCard.EnteredFieldTurnNumber = state.TurnNumber;
        GetCharacterDefinition(state, opponentCard.CardDefinitionId).Conditions =
            [EffectConditionKeywords.Rush];

        var response = GameStateResponseMapper.ToGameStateResponse(state, "p1");
        var opponent = response.Players.Single(player => player.PlayerId == "p2");

        CollectionAssert.Contains(StatusKinds(opponent.CharacterField[0].StatusEffects), CardStatusEffectCodes.Rush);
    }

    [TestMethod]
    public void ToGameStateResponse_PublishesEffectsSuppressedStatus_AndDropsPrintedRush()
    {
        var state = CreateState();
        var opponentCard = state.Players[1].Battlefield[0];
        opponentCard.EffectsSuppressedWhileOnField = true;
        GetCharacterDefinition(state, opponentCard.CardDefinitionId).Conditions =
            [EffectConditionKeywords.Rush];

        var response = GameStateResponseMapper.ToGameStateResponse(state, "p1");
        var opponent = response.Players.Single(player => player.PlayerId == "p2");
        var statuses = StatusKinds(opponent.CharacterField[0].StatusEffects);

        CollectionAssert.Contains(statuses, CardStatusEffectCodes.EffectsSuppressed);
        CollectionAssert.DoesNotContain(statuses, CardStatusEffectCodes.Rush);
    }

    [TestMethod]
    public void ToGameStateResponse_PublishesRushStatus_ForTemporaryKeywordGrant()
    {
        var state = CreateState();
        var sourceCard = state.Players[0].Battlefield[0];
        var groundedCard = state.Players[0].Battlefield[0];
        AddKeywordEffect(state, sourceCard, groundedCard, EffectConditionKeywords.Rush);

        var response = GameStateResponseMapper.ToGameStateResponse(state, "p1");
        var requester = response.Players.Single(player => player.PlayerId == "p1");

        CollectionAssert.Contains(
            StatusKinds(requester.CharacterField[0].StatusEffects),
            CardStatusEffectCodes.Rush);
    }

    [TestMethod]
    public void ToGameStateResponse_PublishesCannotAttackStatus_ForFrozenCharacter()
    {
        var state = CreateState();
        var sourceCard = state.Players[0].Battlefield[0];
        var opponentCard = state.Players[1].Battlefield[0];
        AddKeywordEffect(state, sourceCard, opponentCard, FreezeCardEffect.CannotAttackKeyword);

        var response = GameStateResponseMapper.ToGameStateResponse(state, "p1");
        var opponent = response.Players.Single(player => player.PlayerId == "p2");

        CollectionAssert.Contains(
            StatusKinds(opponent.CharacterField[0].StatusEffects),
            CardStatusEffectCodes.CannotAttack);
    }

    [TestMethod]
    public void ToGameStateResponse_PublishesCannotAttackReasonCode_ForOpponentFrozenCard()
    {
        var state = CreateState();
        var sourceCard = state.Players[0].Battlefield[0];
        var opponentCard = state.Players[1].Battlefield[0];
        AddKeywordEffect(state, sourceCard, opponentCard, FreezeCardEffect.CannotAttackKeyword);

        var response = GameStateResponseMapper.ToGameStateResponse(state, "p1");
        var opponent = response.Players.Single(player => player.PlayerId == "p2");
        var cannotAttack = opponent.CharacterField[0].StatusEffects
            .Single(status => status.Kind == CardStatusEffectCodes.CannotAttack);

        // The opponent's board receives no action options, so the reason has to travel on the status itself:
        // that is what lets their client name the cause instead of only saying "cannot attack".
        Assert.AreEqual("BattleAction.RestrictedByEffect", cannotAttack.ReasonCode);
        Assert.IsFalse(string.IsNullOrWhiteSpace(cannotAttack.Reason));
    }

    [TestMethod]
    public void ToGameStateResponse_PublishesCannotAttackStatus_ForFrozenLeader()
    {
        var state = CreateState();
        var sourceCard = state.Players[0].Battlefield[0];
        var opponentLeader = state.Players[1].LeaderCardInstance!;
        AddKeywordEffect(state, sourceCard, opponentLeader, FreezeCardEffect.CannotAttackKeyword);

        var response = GameStateResponseMapper.ToGameStateResponse(state, "p1");
        var opponent = response.Players.Single(player => player.PlayerId == "p2");

        CollectionAssert.Contains(StatusKinds(opponent.Leader.StatusEffects), CardStatusEffectCodes.CannotAttack);
    }

    [TestMethod]
    public void ToGameStateResponse_PublishesImmunityStatus_ForKeywordGrant()
    {
        var state = CreateState();
        var sourceCard = state.Players[0].Battlefield[0];
        var opponentCard = state.Players[1].Battlefield[0];
        AddKeywordEffect(state, sourceCard, opponentCard, EffectConditionKeywords.NotAffectedByOpponentSupportEffects);

        var response = GameStateResponseMapper.ToGameStateResponse(state, "p1");
        var opponent = response.Players.Single(player => player.PlayerId == "p2");

        CollectionAssert.Contains(
            StatusKinds(opponent.CharacterField[0].StatusEffects),
            CardStatusEffectCodes.ImmuneToOpponentSupportEffects);
    }

    [TestMethod]
    public void ToGameStateResponse_LeavesStatusesEmpty_ForHandSupportAndTrashCards()
    {
        var state = CreateState();
        var handCard = CreateCardInstance("hand-1", "card-hand", "p1");
        handCard.RuntimeKeywords.Add(EffectConditionKeywords.Rush);
        handCard.RuntimeKeywords.Add(FreezeCardEffect.CannotAttackKeyword);
        var supportCard = CreateCardInstance("support-1", "card-support", "p1");
        supportCard.RuntimeKeywords.Add(EffectConditionKeywords.Rush);
        var trashCard = CreateCardInstance("trash-1", "card-hand", "p1");
        trashCard.RuntimeKeywords.Add(EffectConditionKeywords.Rush);

        state.Players[0].Hand = [handCard];
        state.Players[0].SupportZone = [supportCard];
        state.Players[0].DiscardPile = [trashCard];

        var response = GameStateResponseMapper.ToGameStateResponse(state, "p1");
        var requester = response.Players.Single(player => player.PlayerId == "p1");

        Assert.AreEqual(0, requester.Hand[0].StatusEffects.Count);
        Assert.AreEqual(0, requester.SupportZone[0].StatusEffects.Count);
        Assert.AreEqual(0, requester.Trash[0].StatusEffects.Count);
    }

    [TestMethod]
    public void ToGameStateResponse_PublishesNoStatuses_ForACleanCard()
    {
        var state = CreateState();

        var response = GameStateResponseMapper.ToGameStateResponse(state, "p1");
        var opponent = response.Players.Single(player => player.PlayerId == "p2");

        Assert.AreEqual(0, opponent.CharacterField[0].StatusEffects.Count);
        Assert.AreEqual(0, opponent.Leader.StatusEffects.Count);
    }

    [TestMethod]
    public void ToGameStateResponse_PublishesCannotAttackStatus_ForSummonedThisTurnCard()
    {
        var state = CreateState();
        var requesterCard = state.Players[0].Battlefield[0];
        requesterCard.EnteredFieldTurnNumber = state.TurnNumber;

        var response = GameStateResponseMapper.ToGameStateResponse(state, "p1");
        var requester = response.Players.Single(player => player.PlayerId == "p1");
        var battleAction = requester.CharacterField[0].AvailableActions
            .Single(action => action.ActionId == "battle-action:battle-1");

        // The board no longer draws the unusable Battle chip, so the badge is what explains the missing chip.
        var cannotAttack = requester.CharacterField[0].StatusEffects
            .Single(status => status.Kind == CardStatusEffectCodes.CannotAttack);

        Assert.AreEqual("BattleAction.SummonedThisTurn", cannotAttack.ReasonCode);
        Assert.IsFalse(battleAction.IsEnabled);
        Assert.IsNotNull(battleAction.DisabledReason);
    }

    [TestMethod]
    public void ToGameStateResponse_DoesNotFlagOpponentCards_ForTurnScopedRestrictions()
    {
        var state = CreateState();
        // Rested only blocks attacking on that card's own turn, so the opponent's board must stay clean while
        // the requester is the acting player.
        state.Players[1].Battlefield[0].IsRested = true;

        var response = GameStateResponseMapper.ToGameStateResponse(state, "p1");
        var opponent = response.Players.Single(player => player.PlayerId == "p2");

        Assert.AreEqual(0, opponent.CharacterField[0].StatusEffects.Count);
    }

    private static List<string> StatusKinds(IReadOnlyList<CardStatusEffectResponse> statuses)
    {
        return statuses.Select(status => status.Kind).ToList();
    }

    private static void AddKeywordEffect(
        GameState state,
        CardInstance sourceCard,
        CardInstance targetCard,
        string keyword)
    {
        state.AppliedCardEffects.Add(new AppliedCardEffectState
        {
            SourceCardInstanceId = sourceCard.InstanceId,
            EffectSpecId = $"keyword-{keyword}",
            TargetCardInstanceId = targetCard.InstanceId,
            ModifierKind = AppliedCardModifierKind.Keyword,
            DurationMode = EffectDurationMode.DuringThisTurn,
            KeywordOperation = KeywordModificationOperation.Add,
            Keyword = keyword,
            AppliedTurnNumber = state.TurnNumber,
        });
    }

    private static CharacterCard GetCharacterDefinition(GameState state, string definitionId)
    {
        return (CharacterCard)state.CardDefinitions[definitionId];
    }

    private static GameState CreateState()
    {
        var requesterId = "p1";
        var opponentId = "p2";

        var requesterCard = CreateCardInstance("battle-1", "card-battle", requesterId);
        var opponentCard = CreateCardInstance("battle-2", "card-opponent", opponentId);

        return new GameState
        {
            GameId = "game-1",
            Phase = GamePhase.MainPhase,
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
                ["card-battle"] = CreateCharacterDefinition("card-battle", "Battle", power: 2),
                ["card-opponent"] = CreateCharacterDefinition("card-opponent", "Opponent", power: 2),
                ["card-hand"] = CreateCharacterDefinition("card-hand", "Hand", power: 1),
                ["card-support"] = CreateCharacterDefinition("card-support", "Support", power: 1),
            },
            Players =
            [
                new PlayerState
                {
                    PlayerId = requesterId,
                    LeaderCardInstance = CreateLeader(requesterId),
                    Battlefield = [requesterCard]
                },
                new PlayerState
                {
                    PlayerId = opponentId,
                    LeaderCardInstance = CreateLeader(opponentId),
                    Battlefield = [opponentCard]
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

    private static CardInstance CreateCardInstance(string instanceId, string definitionId, string playerId)
    {
        return new CardInstance
        {
            InstanceId = instanceId,
            CardDefinitionId = definitionId,
            OwnerPlayerId = playerId,
            ControllerPlayerId = playerId,
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
