using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class GameStateResponseMapperCardActionsTests
{
    [TestMethod]
    public void ToGameStateResponse_MapsCardActions_ForRequestingPlayerZones()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var requesterHandCard = CreateCardInstance("hand-1", "card-hand", requesterId);
        var requesterSupportCard = CreateCardInstance("support-1", "card-support", requesterId);
        var requesterBattleCard = CreateCardInstance("battle-1", "card-battle", requesterId);

        var state = BuildState(
            requesterId,
            opponentId,
            handCards: [requesterHandCard],
            supportCards: [requesterSupportCard],
            battlefieldCards: [requesterBattleCard]);
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);

        Assert.AreEqual(1, requester.Hand[0].AvailableActions.Count);
        Assert.AreEqual("summon-to-field:hand-1", requester.Hand[0].AvailableActions[0].ActionId);

        Assert.AreEqual(1, requester.SupportZone[0].AvailableActions.Count);
        Assert.AreEqual("activate-support:support-1", requester.SupportZone[0].AvailableActions[0].ActionId);
        Assert.AreEqual("Support", requester.SupportZone[0].AvailableActions[0].Label);

        Assert.AreEqual(1, requester.CharacterField[0].AvailableActions.Count);
        Assert.AreEqual("battle-action:battle-1", requester.CharacterField[0].AvailableActions[0].ActionId);
        Assert.IsTrue(requester.IsSummonCardReady);
    }

    [TestMethod]
    public void ToGameStateResponse_DoesNotMapCardActions_ForOpponentZones()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var opponentSupportCard = CreateCardInstance("support-opponent", "card-support", opponentId);
        var opponentBattleCard = CreateCardInstance("battle-opponent", "card-battle", opponentId);

        var state = BuildState(
            requesterId,
            opponentId,
            opponentSupportCards: [opponentSupportCard],
            opponentBattlefieldCards: [opponentBattleCard]);

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var opponent = response.Players.Single(player => player.PlayerId == opponentId);

        Assert.AreEqual(0, opponent.SupportZone[0].AvailableActions.Count);
        Assert.AreEqual(0, opponent.CharacterField[0].AvailableActions.Count);
    }

    [TestMethod]
    public void ToGameStateResponse_DisablesSupportEffectAction_WhenNoValidTargetsExist()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var requesterSupportCard = CreateCardInstance("support-1", "card-support", requesterId);
        var state = BuildState(requesterId, opponentId, supportCards: [requesterSupportCard]);
        state.Phase = GamePhase.ActionStep;
        state.ActivePlayerId = opponentId;
        state.PriorityPlayerId = requesterId;
        state.HasPendingAttack = true;

        var supportDefinition = (CharacterCard)state.CardDefinitions["card-support"];
        supportDefinition.Effects =
        [
            new EffectSpec
            {
                Id = "support-needs-target",
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                TargetRules = new EffectTargetRuleSet
                {
                    ExactTargetCount = 1,
                    Rules =
                    [
                        new EffectTargetRule
                        {
                            Scope = EffectTargetRange.Any,
                            InZone = PlayerZone.CharacterField,
                            Restriction = new ZoneCardRestriction(),
                        }
                    ]
                }
            }
        ];

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);

        Assert.AreEqual(1, requester.SupportZone[0].AvailableActions.Count);
        Assert.IsFalse(requester.SupportZone[0].AvailableActions[0].IsEnabled);
        Assert.AreEqual("No valid targets available.", requester.SupportZone[0].AvailableActions[0].DisabledReason);
    }

    [TestMethod]
    public void ToGameStateResponse_DoesNotMapCardActions_WhilePromptIsPending()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var requesterHandCard = CreateCardInstance("hand-1", "card-hand", requesterId);
        var state = BuildState(requesterId, opponentId, handCards: [requesterHandCard]);

        var game = new GameInstance(state);
        game.EnqueuePrompt(new GamePrompt
        {
            RequestedPlayerId = requesterId,
            Type = GamePromptType.ChooseStartingPlayer,
            Options = ["goFirst", "goSecond"]
        });

        var response = GameStateResponseMapper.ToGameStateResponse(game, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);

        Assert.AreEqual(0, requester.Hand[0].AvailableActions.Count);
    }

    [TestMethod]
    public void ToGameStateResponse_MapsBattleAction_ForCardSummonedThisTurnWithRuntimeRush()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var summonedCard = CreateCardInstance("battle-1", "card-battle", requesterId);
        summonedCard.EnteredFieldTurnNumber = 2;
        summonedCard.RuntimeKeywords.Add(EffectConditionKeywords.Rush);

        var state = BuildState(
            requesterId,
            opponentId,
            battlefieldCards: [summonedCard]);
        state.TurnNumber = 3;
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);

        Assert.AreEqual(1, requester.CharacterField[0].AvailableActions.Count);
        Assert.AreEqual("battle-action:battle-1", requester.CharacterField[0].AvailableActions[0].ActionId);
    }

    [TestMethod]
    public void ToGameStateResponse_DisablesBattleAction_WithCannotAttackReason_ForFrozenCard()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var frozenCard = CreateCardInstance("battle-1", "card-battle", requesterId);
        frozenCard.RuntimeKeywords.Add(FreezeCardEffect.CannotAttackKeyword);
        frozenCard.EnteredFieldTurnNumber = null;

        var state = BuildState(
            requesterId,
            opponentId,
            battlefieldCards: [frozenCard]);
        state.TurnNumber = 3;
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;
        state.Players.Single(player => player.PlayerId == requesterId).TurnCount = 3;

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);
        var battleAction = requester.CharacterField[0].AvailableActions.Single();

        Assert.AreEqual("battle-action:battle-1", battleAction.ActionId);
        Assert.IsFalse(battleAction.IsEnabled);
        Assert.AreEqual(
            "Cannot declare battle action because the card is under an effect that restricts it.",
            battleAction.DisabledReason);
    }

    [TestMethod]
    public void ToGameStateResponse_DisablesBattleAction_WithRestedReason_ForRestedCardInMainPhase()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var restedCard = CreateCardInstance("battle-1", "card-battle", requesterId);
        restedCard.EnteredFieldTurnNumber = 1;
        restedCard.IsRested = true;

        var state = BuildState(
            requesterId,
            opponentId,
            battlefieldCards: [restedCard]);
        state.TurnNumber = 3;
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;
        state.Players.Single(player => player.PlayerId == requesterId).TurnCount = 3;

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);
        var battleAction = requester.CharacterField[0].AvailableActions.Single();

        Assert.AreEqual("battle-action:battle-1", battleAction.ActionId);
        Assert.IsFalse(battleAction.IsEnabled);
        Assert.AreEqual("Cannot declare battle action because the card is rested.", battleAction.DisabledReason);
    }

    [TestMethod]
    public void ToGameStateResponse_DisablesBattleAction_WithSummonedThisTurnReason_ForCardEnteredThisTurn()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var summonedCard = CreateCardInstance("battle-1", "card-battle", requesterId);
        summonedCard.EnteredFieldTurnNumber = 3;

        var state = BuildState(
            requesterId,
            opponentId,
            battlefieldCards: [summonedCard]);
        state.TurnNumber = 3;
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;
        state.Players.Single(player => player.PlayerId == requesterId).TurnCount = 3;

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);
        var battleAction = requester.CharacterField[0].AvailableActions.Single();

        Assert.IsFalse(battleAction.IsEnabled);
        Assert.AreEqual(
            "Cannot declare battle action the turn that the card entered the field.",
            battleAction.DisabledReason);
    }

    [TestMethod]
    public void ToGameStateResponse_MapsBattleAction_WhenFieldEntryTurnIsUnknown()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var unknownEntryCard = CreateCardInstance("battle-1", "card-battle", requesterId);
        unknownEntryCard.EnteredFieldTurnNumber = null;

        var state = BuildState(
            requesterId,
            opponentId,
            battlefieldCards: [unknownEntryCard]);
        state.TurnNumber = 3;
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;
        state.Players.Single(player => player.PlayerId == requesterId).TurnCount = 3;

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);
        var battleAction = requester.CharacterField[0].AvailableActions.Single();

        Assert.IsTrue(battleAction.IsEnabled, battleAction.DisabledReason ?? string.Empty);
        Assert.IsNull(battleAction.DisabledReason);
    }

    [TestMethod]
    public void ToGameStateResponse_MapsOffFieldCardActions_WithoutFieldEntryState()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var handCard = CreateCardInstance("hand-1", "card-hand", requesterId);
        var supportCard = CreateCardInstance("support-1", "card-support", requesterId);

        var state = BuildState(
            requesterId,
            opponentId,
            handCards: [handCard],
            supportCards: [supportCard]);
        state.TurnNumber = 3;
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;
        state.Players.Single(player => player.PlayerId == requesterId).TurnCount = 3;

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);

        Assert.AreEqual("summon-to-field:hand-1", requester.Hand[0].AvailableActions[0].ActionId);
        Assert.AreEqual("activate-support:support-1", requester.SupportZone[0].AvailableActions[0].ActionId);
    }


    [TestMethod]
    public void ToGameStateResponse_MapsBothSummonAndSetSupport_ForSupportCapableHandCard()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var requesterHandCard = CreateCardInstance("hand-1", "card-support-capable", requesterId);
        var state = BuildState(requesterId, opponentId, handCards: [requesterHandCard]);
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);

        Assert.AreEqual(3, requester.Hand[0].AvailableActions.Count);
        CollectionAssert.AreEquivalent(
            new[] { "summon-to-field:hand-1", "set-support:hand-1", "activate-support:hand-1" },
            requester.Hand[0].AvailableActions.Select(action => action.ActionId).ToArray());
    }

    [TestMethod]
    public void ToGameStateResponse_DisablesNormalSummon_WhenSummonCardIsRested()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var requesterHandCard = CreateCardInstance("hand-1", "card-hand", requesterId);
        var state = BuildState(requesterId, opponentId, handCards: [requesterHandCard]);
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;
        state.SetSummonCardReady(requesterId, false);

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);
        var summonAction = requester.Hand[0].AvailableActions.Single(action => action.ActionId == "summon-to-field:hand-1");

        Assert.IsFalse(summonAction.IsEnabled);
        Assert.AreEqual("Your summon card is rested.", summonAction.DisabledReason);
    }

    [TestMethod]
    public void ToGameStateResponse_DisablesSummonRequirementSummon_WhenTributeRequirementsAreUnsatisfied()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var requesterHandCard = CreateCardInstance("hand-1", "card-tribute-hand", requesterId);
        var state = BuildState(requesterId, opponentId, handCards: [requesterHandCard]);
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;

        var tributeCard = (CharacterCard)state.CardDefinitions["card-tribute-hand"];
        tributeCard.CannotBeNormalSummoned = true;
        tributeCard.Conditions = [EffectConditionKeywords.SummonRequirements];
        tributeCard.Effects =
        [
            CreateTributeRequirementEffectSpec("tribute-need-target")
        ];

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);
        var summonAction = requester.Hand[0].AvailableActions.Single(action => action.ActionId == "summon-to-field:hand-1");

        Assert.IsFalse(summonAction.IsEnabled);
        Assert.AreEqual("No valid tribute targets available.", summonAction.DisabledReason);
    }

    [TestMethod]
    public void ToGameStateResponse_EnablesSummonRequirementSummon_WhenTributeRequirementsAreSatisfied()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var requesterHandCard = CreateCardInstance("hand-1", "card-tribute-hand", requesterId);
        var tributeMaterial = CreateCardInstance("battle-tribute-1", "card-battle", requesterId);
        var state = BuildState(requesterId, opponentId, handCards: [requesterHandCard], battlefieldCards: [tributeMaterial]);
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;

        var tributeCard = (CharacterCard)state.CardDefinitions["card-tribute-hand"];
        tributeCard.CannotBeNormalSummoned = true;
        tributeCard.Conditions = [EffectConditionKeywords.SummonRequirements];
        tributeCard.Effects =
        [
            CreateTributeRequirementEffectSpec("tribute-need-target")
        ];

        var battleCard = (CharacterCard)state.CardDefinitions["card-battle"];
        battleCard.Name = ["Battle Card"];

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);
        var summonAction = requester.Hand[0].AvailableActions.Single(action => action.ActionId == "summon-to-field:hand-1");

        Assert.IsTrue(summonAction.IsEnabled);
        Assert.IsNull(summonAction.DisabledReason);
    }

    [TestMethod]
    public void ToGameStateResponse_MapsHandActions_InMainPhase_ForActivePlayer()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var requesterHandCard = CreateCardInstance("hand-1", "card-hand", requesterId);
        var state = BuildState(requesterId, opponentId, handCards: [requesterHandCard]);
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;
        state.PriorityPlayerId = opponentId;

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);

        Assert.AreEqual(1, requester.Hand[0].AvailableActions.Count);
        Assert.AreEqual("summon-to-field:hand-1", requester.Hand[0].AvailableActions[0].ActionId);
    }

    [TestMethod]
    public void ToGameStateResponse_MapsActivateSupport_ForSupportCapableHandCardInMainPhase()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var requesterHandCard = CreateCardInstance("hand-1", "card-support-capable", requesterId);
        var state = BuildState(requesterId, opponentId, handCards: [requesterHandCard]);
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);

        Assert.IsTrue(requester.Hand[0].AvailableActions.Any(action => action.ActionId == "activate-support:hand-1"));
    }

    [TestMethod]
    public void ToGameStateResponse_DisablesOpponentSupportActions_InAttackDeclaration()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var opponentSupportCard = CreateCardInstance("support-opponent", "card-support", opponentId);
        var state = BuildState(
            requesterId,
            opponentId,
            opponentSupportCards: [opponentSupportCard]);
        state.Phase = GamePhase.AttackDeclaration;
        state.ActivePlayerId = requesterId;

        var response = GameStateResponseMapper.ToGameStateResponse(state, opponentId);
        var opponent = response.Players.Single(player => player.PlayerId == opponentId);

        Assert.AreEqual(1, opponent.SupportZone[0].AvailableActions.Count);
        Assert.AreEqual("activate-support:support-opponent", opponent.SupportZone[0].AvailableActions[0].ActionId);
        Assert.IsFalse(opponent.SupportZone[0].AvailableActions[0].IsEnabled);
        Assert.AreEqual("Support timing is not available right now.", opponent.SupportZone[0].AvailableActions[0].DisabledReason);
    }

    [TestMethod]
    public void ToGameStateResponse_DoesNotMapHandActions_InActionStep()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var requesterHandCard = CreateCardInstance("hand-1", "card-hand", requesterId);
        var state = BuildState(requesterId, opponentId, handCards: [requesterHandCard]);
        state.Phase = GamePhase.ActionStep;
        state.ActivePlayerId = requesterId;
        state.PriorityPlayerId = requesterId;

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);

        Assert.AreEqual(0, requester.Hand[0].AvailableActions.Count);
    }

    [TestMethod]
    public void ToGameStateResponse_EnablesOpponentQuickSupport_InActionStepCutInWindow()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var opponentSupportCard = CreateCardInstance("support-opponent", "card-support", opponentId);
        var state = BuildState(
            requesterId,
            opponentId,
            opponentSupportCards: [opponentSupportCard]);
        state.Phase = GamePhase.ActionStep;
        state.ActivePlayerId = requesterId;
        state.PriorityPlayerId = opponentId;
        state.HasPendingAttack = true;

        var supportDefinition = (CharacterCard)state.CardDefinitions["card-support"];
        supportDefinition.Effects =
        [
            new EffectSpec
            {
                Id = "support-quick",
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                RuntimeEffectType = RuntimeEffects.ChangeValues,
            }
        ];

        var response = GameStateResponseMapper.ToGameStateResponse(state, opponentId);
        var opponent = response.Players.Single(player => player.PlayerId == opponentId);

        Assert.AreEqual(1, opponent.SupportZone[0].AvailableActions.Count);
        Assert.IsTrue(opponent.SupportZone[0].AvailableActions[0].IsEnabled);
    }

    [TestMethod]
    public void ToGameStateResponse_EnablesSummonSelfSupport_FromSupportZone_InOwnMainPhase()
    {
        // N-002 (Choji, Expansion Jutsu) activated from the support area: the authored "summon this card"
        // rule points at the hand, so the raw shape resolved no valid target and the published chip read
        // "No valid targets available." even though the engine (SupportActivationNormalizer) executes it.
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var requesterSupportCard = CreateCardInstance("support-1", "card-support", requesterId);
        var state = BuildState(requesterId, opponentId, supportCards: [requesterSupportCard]);
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;
        state.PriorityPlayerId = requesterId;
        state.Players.Single(player => player.PlayerId == requesterId).ResourcePool = 5;

        UseSummonSelfSupportEffects(state);

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);
        var action = requester.SupportZone[0].AvailableActions.Single();

        Assert.AreEqual("activate-support:support-1", action.ActionId);
        Assert.IsTrue(action.IsEnabled, action.DisabledReason ?? string.Empty);
    }

    [TestMethod]
    public void ToGameStateResponse_EnablesOpponentQuickSummonSelfSupport_InMainPhaseReactionWindow()
    {
        // The same card on the opponent's turn, answering a queued MainPhase activation: a support cut-in
        // response window (SupportTimingRules), from the support area only, and with the same
        // normalised "summon this card" shape the engine executes.
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var requesterSupportCard = CreateCardInstance("support-1", "card-support", requesterId);
        var state = BuildState(requesterId, opponentId, supportCards: [requesterSupportCard]);
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = opponentId;
        state.PriorityPlayerId = requesterId;
        state.Players.Single(player => player.PlayerId == requesterId).ResourcePool = 5;
        state.EffectResolutionStack.Add(new EffectResolutionStackEntry
        {
            SourcePlayerId = opponentId,
            SourceZone = PlayerZone.SupportZone,
            SourceCardInstanceId = "opponent-pending-support",
            EffectTypeKey = "ChangeValues",
            ActivatedEffectId = "opponent-support-effect",
        });

        UseSummonSelfSupportEffects(state);

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);
        var action = requester.SupportZone[0].AvailableActions.Single();

        Assert.AreEqual("activate-support:support-1", action.ActionId);
        Assert.IsTrue(action.IsEnabled, action.DisabledReason ?? string.Empty);
    }

    [TestMethod]
    public void ToGameStateResponse_EnablesInterruptAttackSupport_InOpponentAttackCutInWindow()
    {
        // N-008 (Shikamaru, Shadow Possession Jutsu) is the defender's "[During Your Opponent's Attack] Summon
        // this card and interrupt that attack." support. Its entry resolves the pending attack itself
        // (Execution Target Source: None) while carrying a leftover exactTargetCount, and treating that count
        // as a target requirement disabled the whole activation with "No valid targets available.".
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var defenderSupportCard = CreateCardInstance("support-1", "card-support", opponentId);
        var state = BuildState(requesterId, opponentId, opponentSupportCards: [defenderSupportCard]);
        state.Phase = GamePhase.ActionStep;
        state.ActivePlayerId = requesterId;
        state.PriorityPlayerId = opponentId;
        state.HasPendingAttack = true;
        state.Players.Single(player => player.PlayerId == opponentId).ResourcePool = 5;

        UseInterruptAttackSupportEffects(state);

        var response = GameStateResponseMapper.ToGameStateResponse(state, opponentId);
        var defender = response.Players.Single(player => player.PlayerId == opponentId);
        var action = defender.SupportZone[0].AvailableActions.Single();

        Assert.AreEqual("activate-support:support-1", action.ActionId);
        Assert.IsTrue(action.IsEnabled, action.DisabledReason ?? string.Empty);
    }

    [TestMethod]
    public void ToGameStateResponse_DoesNotMapManualWhenAttackingLeaderEffectAction()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var state = BuildState(requesterId, opponentId);
        state.Phase = GamePhase.ActionStep;
        state.ActivePlayerId = requesterId;
        state.HasPendingAttack = true;

        var leaderCard = (LeaderCard)state.CardDefinitions["leader-def"];
        leaderCard.Effects =
        [
            new EffectSpec
            {
                Id = "leader-when-attacking",
                EffectType = EffectKind.Activated,
                Timing = EffectTiming.WhenAttacking,
                RuntimeEffectType = RuntimeEffects.AlterResources,
            }
        ];

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);

        Assert.AreEqual(0, GetLeaderEffectActions(requester.Leader).Count);
    }

    [TestMethod]
    public void ToGameStateResponse_DisablesWhenAttackingLeaderEffect_WithoutPendingAttack()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var state = BuildState(requesterId, opponentId);
        state.Phase = GamePhase.ActionStep;
        state.ActivePlayerId = requesterId;
        state.HasPendingAttack = false;

        var leaderCard = (LeaderCard)state.CardDefinitions["leader-def"];
        leaderCard.Effects =
        [
            new EffectSpec
            {
                Id = "leader-when-attacking",
                EffectType = EffectKind.Activated,
                Timing = EffectTiming.WhenAttacking,
                RuntimeEffectType = RuntimeEffects.AlterResources,
            }
        ];

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);

        Assert.AreEqual(0, GetLeaderEffectActions(requester.Leader).Count);
    }

    [TestMethod]
    public void ToGameStateResponse_MapsWhenAttackingLeaderEffect_DuringAttackDeclaration()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var state = BuildState(requesterId, opponentId);
        state.Phase = GamePhase.AttackDeclaration;
        state.ActivePlayerId = requesterId;
        state.PriorityPlayerId = string.Empty;
        state.HasPendingAttack = true;

        var leaderCard = (LeaderCard)state.CardDefinitions["leader-def"];
        leaderCard.Effects =
        [
            new EffectSpec
            {
                Id = "leader-when-attacking",
                EffectType = EffectKind.Activated,
                Timing = EffectTiming.WhenAttacking,
                RuntimeEffectType = RuntimeEffects.AlterResources,
            }
        ];

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);

        // AttackDeclaration is the attack window the engine actually enters, so When Attacking effects
        // must be reachable there instead of only during the unused BlockerDeclaration stage.
        Assert.AreEqual(1, GetLeaderEffectActions(requester.Leader).Count);
        Assert.IsTrue(GetLeaderEffectActions(requester.Leader)[0].ActionId.StartsWith("leader-effect:", StringComparison.Ordinal));
    }

    [TestMethod]
    public void ToGameStateResponse_MapsLeaderEffectActions_WithLeaderEffectPrefix()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var state = BuildState(requesterId, opponentId);
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;
        state.PriorityPlayerId = opponentId;

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);

        Assert.AreEqual(1, GetLeaderEffectActions(requester.Leader).Count);
        StringAssert.StartsWith(
            GetLeaderEffectActions(requester.Leader)[0].ActionId,
            $"leader-effect:{requester.Leader.InstanceId}:leader-main");
        Assert.AreEqual("Activate Main", GetLeaderEffectActions(requester.Leader)[0].Label);
    }

    [TestMethod]
    public void ToGameStateResponse_UsesRecoveryLabel_ForLeaderRecoveryEffects()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var state = BuildState(requesterId, opponentId);
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;
        state.PriorityPlayerId = opponentId;
        state.Players[0].TurnCount = 1;
        var leaderCard = (LeaderCard)state.CardDefinitions["leader-def"];
        leaderCard.Effects =
        [
            new EffectSpec
            {
                Id = "leader-recovery",
                EffectType = EffectKind.Recovery,
                Timing = EffectTiming.DuringYourMain,
                RuntimeEffectType = RuntimeEffects.AlterResources,
            }
        ];

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);

        Assert.AreEqual(1, GetLeaderEffectActions(requester.Leader).Count);
        Assert.AreEqual("Recovery", GetLeaderEffectActions(requester.Leader)[0].Label);
        Assert.IsFalse(GetLeaderEffectActions(requester.Leader)[0].IsEnabled);
    Assert.AreEqual("Recovery can only be activated starting from your second turn.", GetLeaderEffectActions(requester.Leader)[0].DisabledReason);
    }

    [TestMethod]
    public void ToGameStateResponse_DisablesRecoveryLeaderEffect_WhenAllChakraCardsAreFaceUp()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var state = BuildState(requesterId, opponentId);
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;
        state.PriorityPlayerId = opponentId;
        state.TurnNumber = 2;
        state.Players[0].TurnCount = 2;
        // ResourcePool is the map's chakra face-state: five face-up chakra means nothing left to recover.
        state.Players[0].ResourcePool = 5;

        var leaderCard = (LeaderCard)state.CardDefinitions["leader-def"];
        leaderCard.Effects =
        [
            new EffectSpec
            {
                Id = "leader-recovery",
                EffectType = EffectKind.Recovery,
                Timing = EffectTiming.DuringYourMain,
                RuntimeEffectType = RuntimeEffects.AlterResources,
            }
        ];

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);

        Assert.AreEqual(1, GetLeaderEffectActions(requester.Leader).Count);
        Assert.IsFalse(GetLeaderEffectActions(requester.Leader)[0].IsEnabled);
        Assert.AreEqual("All chakra cards are already face up.", GetLeaderEffectActions(requester.Leader)[0].DisabledReason);
    }

    [TestMethod]
    public void ToGameStateResponse_EnablesRecoveryLeaderEffect_ForTheAuthoredRecoverNode()
    {
        // N-012's recovery node is authored as "Selected Targets" with no target rules ("recover 5 chakra",
        // whose audience is its Target Range), which used to make Recovery unplayable with
        // "No valid targets available." while face-down chakra was waiting to be turned up.
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var state = BuildState(requesterId, opponentId);
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;
        state.PriorityPlayerId = requesterId;
        state.TurnNumber = 3;
        state.Players[0].TurnCount = 3;
        // Two face-up chakra: there is something to recover.
        state.Players[0].ResourcePool = 2;

        var leaderCard = (LeaderCard)state.CardDefinitions["leader-def"];
        leaderCard.Effects =
        [
            new EffectSpec
            {
                Id = "recovery",
                EffectType = EffectKind.Recovery,
                Timing = EffectTiming.ActivateMain,
                RuntimeEffectType = RuntimeEffects.AlterResources,
                ExecutionTargetSource = EffectExecutionTargetSource.SelectedTargets,
                ChakraAdjustments =
                [
                    new ChakraAdjustmentSpec
                    {
                        TargetRange = EffectTargetRange.Self,
                        Operation = ChakraAdjustmentOperation.Recover,
                        Amount = 5,
                    }
                ],
            }
        ];

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);
        var recoveryAction = GetLeaderEffectActions(requester.Leader).Single();

        Assert.AreEqual("Recovery", recoveryAction.Label);
        Assert.IsTrue(recoveryAction.IsEnabled, recoveryAction.DisabledReason ?? string.Empty);
    }

    [TestMethod]
    public void ToGameStateResponse_DisablesRecoveryLeaderEffect_WhenChakraRecoveryIsLocked()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var state = BuildState(requesterId, opponentId);
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;
        state.PriorityPlayerId = opponentId;
        state.TurnNumber = 4;
        state.Players[0].TurnCount = 2;
        // There is face-down chakra to recover, so only the lock can keep Recovery disabled.
        state.Players[0].ResourcePool = 3;

        var leaderCard = (LeaderCard)state.CardDefinitions["leader-def"];
        leaderCard.Effects =
        [
            new EffectSpec
            {
                Id = "leader-recovery",
                EffectType = EffectKind.Recovery,
                Timing = EffectTiming.DuringYourMain,
                RuntimeEffectType = RuntimeEffects.AlterResources,
            }
        ];

        state.AppliedCardEffects.Add(new AppliedCardEffectState
        {
            SourceCardInstanceId = "lock-source",
            EffectSpecId = "chakra-freeze",
            ModifierKind = AppliedCardModifierKind.ChakraRecoveryLock,
            DurationMode = EffectDurationMode.UntilTheEndOfYourNextTurn,
            TargetPlayerId = requesterId,
            AppliedByPlayerId = opponentId,
            AppliedTurnNumber = state.TurnNumber,
        });

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);

        Assert.AreEqual(1, GetLeaderEffectActions(requester.Leader).Count);
        Assert.IsFalse(GetLeaderEffectActions(requester.Leader)[0].IsEnabled);
        Assert.AreEqual(
            "Your chakra is locked and cannot be turned face-up.",
            GetLeaderEffectActions(requester.Leader)[0].DisabledReason);
    }

    [TestMethod]
    public void ToGameStateResponse_DisablesActivateMainLeaderEffect_WhenNoValidTargetsExist()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var state = BuildState(requesterId, opponentId);
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;
        state.PriorityPlayerId = opponentId;
        state.TurnNumber = 2;

        var leaderCard = (LeaderCard)state.CardDefinitions["leader-def"];
        leaderCard.Effects =
        [
            new EffectSpec
            {
                Id = "leader-main-no-target",
                EffectType = EffectKind.Activated,
                Timing = EffectTiming.ActivateMain,
                RuntimeEffectType = RuntimeEffects.AlterResources,
                TargetRules = new EffectTargetRuleSet
                {
                    Rules =
                    [
                        new EffectTargetRule
                        {
                            Scope = EffectTargetRange.Opponent,
                            InZone = PlayerZone.CharacterField,
                            Restriction = new ZoneCardRestriction(),
                        }
                    ]
                }
            }
        ];

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);

        Assert.AreEqual(1, GetLeaderEffectActions(requester.Leader).Count);
        Assert.AreEqual("Activate Main", GetLeaderEffectActions(requester.Leader)[0].Label);
        Assert.IsFalse(GetLeaderEffectActions(requester.Leader)[0].IsEnabled);
        Assert.AreEqual("No valid targets available.", GetLeaderEffectActions(requester.Leader)[0].DisabledReason);
    }

    [TestMethod]
    public void ToGameStateResponse_DisablesActivateMainLeaderEffect_WithSelfCharacterFieldRule_WhenBothBattlefieldsAreEmpty()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var state = BuildState(requesterId, opponentId);
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;
        state.PriorityPlayerId = opponentId;

        var leaderCard = (LeaderCard)state.CardDefinitions["leader-def"];
        leaderCard.Effects =
        [
            new EffectSpec
            {
                Id = "power-up-card",
                EffectType = EffectKind.Activated,
                Timing = EffectTiming.ActivateMain,
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                ChakraCost = 1,
                AttributeModifications =
                [
                    new AttributeModificationSpec
                    {
                        TargetType = AttributeModificationTargetType.SelectedTargets,
                        TargetRange = EffectTargetRange.Self,
                        Attribute = EffectAttributeType.CardPower,
                        Operation = AttributeModificationOperation.Add,
                        Value = 3,
                    }
                ],
                TargetRules = new EffectTargetRuleSet
                {
                    Operator = RequirementGroupOperator.Any,
                    ExactTargetCount = 1,
                    Rules =
                    [
                        new EffectTargetRule
                        {
                            Scope = EffectTargetRange.Self,
                            InZone = PlayerZone.CharacterField,
                            ExactSelectedTargetCount = 1,
                            Restriction = new ZoneCardRestriction
                            {
                                Predicates = [],
                                MatchMode = ZoneRestrictionMatchMode.Any,
                            },
                        }
                    ]
                }
            }
        ];

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);

        Assert.AreEqual(1, GetLeaderEffectActions(requester.Leader).Count);
        Assert.IsFalse(GetLeaderEffectActions(requester.Leader)[0].IsEnabled);
        Assert.AreEqual("No valid targets available.", GetLeaderEffectActions(requester.Leader)[0].DisabledReason);
    }

    [TestMethod]
    public void ToGameStateResponse_DisablesLeaderEffect_WhenRequiredSupportZoneIsEmpty()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var state = BuildState(requesterId, opponentId);
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;
        state.PriorityPlayerId = opponentId;

        var leaderCard = (LeaderCard)state.CardDefinitions["leader-def"];
        leaderCard.Effects =
        [
            new EffectSpec
            {
                Id = "support-zone-target-check",
                EffectType = EffectKind.Activated,
                Timing = EffectTiming.ActivateMain,
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                TargetRules = new EffectTargetRuleSet
                {
                    Operator = RequirementGroupOperator.Any,
                    ExactTargetCount = 1,
                    Rules =
                    [
                        new EffectTargetRule
                        {
                            Scope = EffectTargetRange.Any,
                            InZone = PlayerZone.SupportZone,
                            Restriction = new ZoneCardRestriction(),
                        }
                    ]
                }
            }
        ];

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);

        Assert.AreEqual(1, GetLeaderEffectActions(requester.Leader).Count);
        Assert.IsFalse(GetLeaderEffectActions(requester.Leader)[0].IsEnabled);
        Assert.AreEqual("No valid targets available.", GetLeaderEffectActions(requester.Leader)[0].DisabledReason);
    }

    [TestMethod]
    public void ToGameStateResponse_DisablesSelectedTargetLeaderEffect_WhenTargetRulesAreMissing()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var state = BuildState(requesterId, opponentId);
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;
        state.PriorityPlayerId = opponentId;

        var leaderCard = (LeaderCard)state.CardDefinitions["leader-def"];
        leaderCard.Effects =
        [
            new EffectSpec
            {
                Id = "selected-target-no-rules",
                EffectType = EffectKind.Activated,
                Timing = EffectTiming.ActivateMain,
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                AttributeModifications =
                [
                    new AttributeModificationSpec
                    {
                        TargetType = AttributeModificationTargetType.SelectedTargets,
                        TargetRange = EffectTargetRange.Self,
                        Attribute = EffectAttributeType.CardPower,
                        Operation = AttributeModificationOperation.Add,
                        Value = 1,
                    }
                ],
                TargetRules = new EffectTargetRuleSet()
            }
        ];

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);

        Assert.AreEqual(1, GetLeaderEffectActions(requester.Leader).Count);
        Assert.IsFalse(GetLeaderEffectActions(requester.Leader)[0].IsEnabled);
        Assert.AreEqual("No valid targets available.", GetLeaderEffectActions(requester.Leader)[0].DisabledReason);
    }

    [TestMethod]
    public void ToGameStateResponse_SeparatesDuplicateActivateMainLeaderLabels()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var state = BuildState(requesterId, opponentId);
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;
        state.PriorityPlayerId = opponentId;

        var leaderCard = (LeaderCard)state.CardDefinitions["leader-def"];
        leaderCard.Effects =
        [
            new EffectSpec
            {
                Id = "leader-main-a",
                EffectType = EffectKind.Activated,
                Timing = EffectTiming.ActivateMain,
                RuntimeEffectType = RuntimeEffects.AlterResources,
            },
            new EffectSpec
            {
                Id = "leader-main-b",
                EffectType = EffectKind.Activated,
                Timing = EffectTiming.ActivateMain,
                RuntimeEffectType = RuntimeEffects.MoveCard,
            }
        ];

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);

        Assert.AreEqual(2, GetLeaderEffectActions(requester.Leader).Count);
        CollectionAssert.AreEqual(
            new[] { "Activate Main (1)", "Activate Main (2)" },
            GetLeaderEffectActions(requester.Leader).Select(action => action.Label).ToArray());
    }

    [TestMethod]
    public void ToGameStateResponse_DoesNotMapLeaderEffectActions_WhenTimingDoesNotMatchPhase()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var state = BuildState(requesterId, opponentId);
        state.Phase = GamePhase.ActionStep;
        state.ActivePlayerId = requesterId;
        state.PriorityPlayerId = requesterId;

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);

        Assert.AreEqual(0, GetLeaderEffectActions(requester.Leader).Count);
    }

    [TestMethod]
    public void ToGameStateResponse_DisablesLeaderEffect_WhenOncePerTurnEffectWasAlreadyUsed()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var state = BuildState(requesterId, opponentId);
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;
        state.PriorityPlayerId = opponentId;
        state.TurnNumber = 4;
        SetLeaderEffectRestriction(state, EffectRestrictions.OncePerTurn);

        state.MarkEffectUsedThisTurn(requesterId, $"leader-{requesterId}", "leader-main");

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);

        Assert.AreEqual(1, GetLeaderEffectActions(requester.Leader).Count);
        Assert.IsFalse(GetLeaderEffectActions(requester.Leader)[0].IsEnabled);
        Assert.AreEqual(EffectRestrictionMessages.OncePerTurn, GetLeaderEffectActions(requester.Leader)[0].DisabledReason);
    }

    [TestMethod]
    public void ToGameStateResponse_KeepsLeaderEffectEnabled_WhenOncePerTurnEffectBelongsToAnEarlierTurn()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var state = BuildState(requesterId, opponentId);
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;
        state.PriorityPlayerId = opponentId;
        state.TurnNumber = 3;
        SetLeaderEffectRestriction(state, EffectRestrictions.OncePerTurn);

        state.MarkEffectUsedThisTurn(requesterId, $"leader-{requesterId}", "leader-main");
        state.TurnNumber = 4;

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);

        Assert.AreEqual(1, GetLeaderEffectActions(requester.Leader).Count);
        Assert.IsTrue(GetLeaderEffectActions(requester.Leader)[0].IsEnabled);
        Assert.IsNull(GetLeaderEffectActions(requester.Leader)[0].DisabledReason);
    }

    private static void SetLeaderEffectRestriction(GameState state, EffectRestrictions restriction)
    {
        var leaderCard = (LeaderCard)state.CardDefinitions["leader-def"];
        leaderCard.Effects =
        [
            new EffectSpec
            {
                Id = "leader-main",
                EffectType = EffectKind.Activated,
                Timing = EffectTiming.ActivateMain,
                RuntimeEffectType = RuntimeEffects.AlterResources,
                GlobalRestrictions = restriction,
                TargetRules = new EffectTargetRuleSet
                {
                    Rules =
                    [
                        new EffectTargetRule
                        {
                            Scope = EffectTargetRange.Opponent,
                            InZone = PlayerZone.Leader,
                            LocationSelector = new EffectTargetLocationSelector
                            {
                                Kind = EffectTargetLocationSelectorKind.Any,
                            }
                        }
                    ]
                }
            }
        ];
    }


    [TestMethod]
    public void ToGameStateResponse_ProjectsSupportChain_WithNegateLinkAndTargets()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var requesterSupport = CreateCardInstance("support-1", "card-support", requesterId);
        var opponentSupport = CreateCardInstance("support-2", "card-support-capable", opponentId);
        var opponentCharacter = CreateCardInstance("enemy-1", "card-battle", opponentId);

        var state = BuildState(
            requesterId,
            opponentId,
            supportCards: [requesterSupport],
            opponentSupportCards: [opponentSupport],
            opponentBattlefieldCards: [opponentCharacter]);
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;

        state.EffectResolutionStack.Add(new EffectResolutionStackEntry
        {
            EntryId = "entry-1",
            SourcePlayerId = requesterId,
            SourceZone = PlayerZone.SupportZone,
            SourceCardInstanceId = "support-1",
            EffectTypeKey = "DestroyCard",
            ActivatedEffectId = "support-primary",
            SelectedTargets = [new GameEffectTargetReference(opponentId, PlayerZone.CharacterField, "enemy-1")],
        });

        // The opponent answers with a [Support Activated] negate: the target is the queued activation.
        state.EffectResolutionStack.Add(new EffectResolutionStackEntry
        {
            EntryId = "entry-2",
            SourcePlayerId = opponentId,
            SourceZone = PlayerZone.SupportZone,
            SourceCardInstanceId = "support-2",
            EffectTypeKey = "NegateEffect",
            ActivatedEffectId = "negate-effect",
            SelectedTargets =
            [
                new GameEffectTargetReference(
                    requesterId,
                    PlayerZone.SupportZone,
                    "support-1",
                    IsEffectResolutionStackTarget: true,
                    EffectResolutionEntryId: "entry-1")
            ],
        });

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);

        Assert.IsTrue(response.IsSupportResponseWindowOpen);
        Assert.IsNotNull(response.SupportChain);
        var chain = response.SupportChain!;
        Assert.AreEqual(2, chain.Count);

        Assert.AreEqual(1, chain[0].Sequence);
        Assert.AreEqual(requesterId, chain[0].PlayerId);
        Assert.AreEqual("support-1", chain[0].SourceCardInstanceId);
        Assert.AreEqual("Support Card", chain[0].SourceCardDisplayName);
        Assert.AreEqual(1, chain[0].Targets.Count);
        Assert.AreEqual("enemy-1", chain[0].Targets[0].CardInstanceId);
        Assert.AreEqual("Battle Card", chain[0].Targets[0].DisplayName);
        Assert.IsFalse(chain[0].Targets[0].IsChainEntry);

        Assert.AreEqual(2, chain[1].Sequence);
        Assert.AreEqual(opponentId, chain[1].PlayerId);
        Assert.AreEqual("Support Capable Card", chain[1].SourceCardDisplayName);
        Assert.AreEqual(1, chain[1].Targets.Count);
        Assert.IsTrue(chain[1].Targets[0].IsChainEntry);
        Assert.AreEqual("entry-1", chain[1].Targets[0].ChainEntryId);
        // A chain-entry target is the source card of the activation it answers.
        Assert.AreEqual("Support Card", chain[1].Targets[0].DisplayName);
    }

    [TestMethod]
    public void ToGameStateResponse_RecordsNoSupportChain_WhenNothingIsActivated()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var state = BuildState(
            requesterId,
            opponentId,
            supportCards: [CreateCardInstance("support-1", "card-support", requesterId)]);
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);

        Assert.IsNotNull(response.SupportChain);
        Assert.AreEqual(0, response.SupportChain!.Count);
    }

    [TestMethod]
    public void ToGameStateResponse_StopsPublishingSupportAction_ForACardAlreadyInTheChain()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var chainedSupport = CreateCardInstance("support-1", "card-support", requesterId);
        var freeSupport = CreateCardInstance("support-2", "card-support", requesterId);

        var state = BuildState(
            requesterId,
            opponentId,
            supportCards: [chainedSupport, freeSupport]);
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;

        state.EffectResolutionStack.Add(new EffectResolutionStackEntry
        {
            EntryId = "entry-1",
            SourcePlayerId = requesterId,
            SourceZone = PlayerZone.SupportZone,
            SourceCardInstanceId = "support-1",
            EffectTypeKey = "AlterResources",
            ActivatedEffectId = "support-primary",
        });

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);

        // The card is already part of the chain: no support action at all, so the client renders no button.
        var chainedCard = requester.SupportZone.Single(card => card.InstanceId == "support-1");
        Assert.AreEqual(0, chainedCard.AvailableActions.Count);

        // Another support card is unaffected.
        var freeCard = requester.SupportZone.Single(card => card.InstanceId == "support-2");
        Assert.IsTrue(freeCard.AvailableActions.Any(action => action.ActionId == "activate-support:support-2"));
    }

    [TestMethod]
    public void ToGameStateResponse_PublishesCharacterAbilityActions_ForBattlefieldCards()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        // N-011's shape: a battlefield character with an "[Activate: Main]" ability of its own.
        var state = BuildState(
            requesterId,
            opponentId,
            battlefieldCards: [CreateCardInstance("ability-1", "card-ability", requesterId)]);
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;
        state.PriorityPlayerId = requesterId;

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);
        var battlefieldCard = requester.CharacterField.Single();

        var abilityActions = battlefieldCard.AvailableActions
            .Where(action => action.ActionId.StartsWith("character-ability:", StringComparison.Ordinal))
            .ToList();

        Assert.AreEqual(1, abilityActions.Count);
        Assert.AreEqual("character-ability:ability-1:team-10-boost", abilityActions[0].ActionId);
        Assert.AreEqual("Activate Main", abilityActions[0].Label);
        Assert.IsTrue(abilityActions[0].IsEnabled, abilityActions[0].DisabledReason ?? string.Empty);
        // The Battle action stays published next to the ability (it is always offered, enabled or not).
        Assert.AreEqual(1, battlefieldCard.AvailableActions.Count(action =>
            action.ActionId.StartsWith("battle-action:", StringComparison.Ordinal)));
    }

    [TestMethod]
    public void ToGameStateResponse_HidesCharacterAbilityActions_OutsideTheOwnersMainPhase()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var state = BuildState(
            requesterId,
            opponentId,
            battlefieldCards: [CreateCardInstance("ability-1", "card-ability", requesterId)]);
        // BuildState's default: ActionStep, requester holds priority but is not the active player.
        state.ActivePlayerId = opponentId;
        state.PriorityPlayerId = requesterId;

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);
        var battlefieldCard = requester.CharacterField.Single();

        Assert.AreEqual(0, battlefieldCard.AvailableActions.Count(action =>
            action.ActionId.StartsWith("character-ability:", StringComparison.Ordinal)));
        // Battle is still published (disabled with its own reason) - the ability gate only removes the ability.
        Assert.AreEqual(1, battlefieldCard.AvailableActions.Count(action =>
            action.ActionId.StartsWith("battle-action:", StringComparison.Ordinal)));
    }

    [TestMethod]
    public void ToGameStateResponse_DisablesCharacterAbilityActions_WhenOncePerTurnWasSpent()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var state = BuildState(
            requesterId,
            opponentId,
            battlefieldCards: [CreateCardInstance("ability-1", "card-ability", requesterId)]);
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;
        state.PriorityPlayerId = requesterId;
        state.MarkEffectUsedThisTurn(requesterId, "ability-1", "team-10-boost");

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);
        var abilityAction = requester.CharacterField.Single().AvailableActions
            .Single(action => action.ActionId.StartsWith("character-ability:", StringComparison.Ordinal));

        Assert.IsFalse(abilityAction.IsEnabled);
        Assert.AreEqual(EffectRestrictionMessages.OncePerTurn, abilityAction.DisabledReason);
    }

    private static GameState BuildState(
        string requesterId,
        string opponentId,
        List<CardInstance>? handCards = null,
        List<CardInstance>? supportCards = null,
        List<CardInstance>? battlefieldCards = null,
        List<CardInstance>? opponentSupportCards = null,
        List<CardInstance>? opponentBattlefieldCards = null)
    {
        return new GameState
        {
            GameId = "ABCDE",
            Phase = GamePhase.ActionStep,
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
                    RecoveryEffect = "Recover 1",
                    Effects =
                    [
                        new EffectSpec
                        {
                            Id = "leader-main",
                            EffectType = EffectKind.Activated,
                            Timing = EffectTiming.ActivateMain,
                            RuntimeEffectType = RuntimeEffects.AlterResources,
                        }
                    ]
                },
                ["card-hand"] = CreateCharacterDefinition("card-hand", "Hand Card"),
                ["card-tribute-hand"] = CreateCharacterDefinition("card-tribute-hand", "Tribute Hand Card"),
                ["card-support"] = CreateCharacterDefinition("card-support", "Support Card"),
                ["card-support-capable"] = CreateSupportCapableCharacterDefinition("card-support-capable", "Support Capable Card"),
                ["card-battle"] = CreateCharacterDefinition("card-battle", "Battle Card"),
                ["card-ability"] = CreateCharacterDefinitionWithAbility("card-ability", "Ability Card")
            },
            Players =
            [
                new PlayerState
                {
                    PlayerId = requesterId,
                    LeaderCardInstance = CreateLeader(requesterId),
                    Hand = handCards ?? [],
                    SupportZone = supportCards ?? [],
                    Battlefield = battlefieldCards ?? []
                },
                new PlayerState
                {
                    PlayerId = opponentId,
                    LeaderCardInstance = CreateLeader(opponentId),
                    SupportZone = opponentSupportCards ?? [],
                    Battlefield = opponentBattlefieldCards ?? []
                }
            ]
        };
    }

    private static CharacterCard CreateCharacterDefinitionWithAbility(string id, string displayName)
    {
        var card = CreateCharacterDefinition(id, displayName);

        // N-011's shape: an "[Activate: Main] [Once Per Turn]" ability. The unit-test payload targets the
        // source card itself so the ability is untargeted (N-011's "your Ino/Shikamaru/Choji gain Rush" target
        // selection is covered end-to-end by the character-ability spec).
        card.Effects =
        [
            new EffectSpec
            {
                Id = "team-10-boost",
                EffectType = EffectKind.Activated,
                Timing = EffectTiming.ActivateMain,
                RuntimeEffectType = RuntimeEffects.GainEffect,
                GlobalRestrictions = EffectRestrictions.OncePerTurn,
                ExecutionTargetSource = EffectExecutionTargetSource.None,
                KeywordModifications =
                [
                    new KeywordModificationSpec
                    {
                        TargetType = KeywordModificationTargetType.SourceCard,
                        Operation = KeywordModificationOperation.Add,
                        Keyword = EffectConditionKeywords.Rush
                    }
                ],
            }
        ];

        return card;
    }

    private static CardInstance CreateCardInstance(string instanceId, string definitionId, string playerId)
    {
        return new CardInstance
        {
            InstanceId = instanceId,
            CardDefinitionId = definitionId,
            OwnerPlayerId = playerId,
            ControllerPlayerId = playerId,
            IsExhausted = false,
            IsRested = false
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

    private static CharacterCard CreateCharacterDefinition(string id, string displayName)
    {
        var card = new CharacterCard
        {
            Id = id,
            DisplayName = displayName,
            Name = [displayName],
            Traits = ["Trait"],
            Type = CardType.Character,
            Color = CardColor.Blue,
            Health = 3,
            Damage = 1,
            Power = 2
        };

        if (string.Equals(id, "card-support", StringComparison.Ordinal))
        {
            card.Effects =
            [
                new EffectSpec
                {
                    Id = "support-primary",
                    EffectType = EffectKind.Support,
                    Timing = EffectTiming.Quick,
                    RuntimeEffectType = RuntimeEffects.AlterResources,
                }
            ];
        }

        return card;
    }

    private static CharacterCard CreateSupportCapableCharacterDefinition(string id, string displayName)
    {
        var card = CreateCharacterDefinition(id, displayName);
        card.SupportEffect = "Deal 1";
        return card;
    }

    /// <summary>
    /// Gives <c>card-support</c> N-002's real shape: a "summon this card" SummonCard entry whose summon
    /// candidate rule points at the hand, branching into a power-doubling subordinate.
    /// </summary>
    private static void UseSummonSelfSupportEffects(GameState state)
    {
        var supportDefinition = (CharacterCard)state.CardDefinitions["card-support"];
        supportDefinition.Effects =
        [
            new EffectSpec
            {
                Id = "summon-self",
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                RuntimeEffectType = RuntimeEffects.SummonCard,
                ChakraCost = 1,
                TargetRange = EffectTargetRange.Self,
                ExecutionTargetSource = EffectExecutionTargetSource.SourceCard,
                OnSuccessEffectId = "double-target-character-power",
                TargetRules = new EffectTargetRuleSet
                {
                    Operator = RequirementGroupOperator.Any,
                    ExactTargetCount = 1,
                    Rules =
                    [
                        new EffectTargetRule
                        {
                            Scope = EffectTargetRange.Self,
                            InZone = PlayerZone.Hand,
                            TributeRole = TributeTargetRole.SummonCandidate,
                            ExactSelectedTargetCount = 1,
                            Restriction = new ZoneCardRestriction
                            {
                                Predicates =
                                [
                                    new ZoneCardPropertyPredicate
                                    {
                                        Property = ZoneCardProperty.Self,
                                        Operator = ZoneCardPredicateOperator.Equals,
                                        Value = string.Empty,
                                        IgnoreCase = true,
                                    }
                                ],
                                MatchMode = ZoneRestrictionMatchMode.Any,
                            }
                        }
                    ]
                }
            },
            new EffectSpec
            {
                Id = "double-target-character-power",
                IsSubordinate = true,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                ExecutionFlowMode = EffectExecutionFlowMode.AtomicChain,
            }
        ];
    }

    /// <summary>
    /// Gives <c>card-support</c> N-008's shape: an "Interrupt Attack" entry that resolves the pending attack
    /// itself (no selection, but a leftover declared count) branching into a source-card summon from the
    /// support area.
    /// </summary>
    private static void UseInterruptAttackSupportEffects(GameState state)
    {
        var supportDefinition = (CharacterCard)state.CardDefinitions["card-support"];
        supportDefinition.SupportEffect = "Shadow Possession Jutsu";
        supportDefinition.Effects =
        [
            new EffectSpec
            {
                Id = "interrupt-attack",
                EffectType = EffectKind.Support,
                Timing = EffectTiming.DuringOpponentAttack,
                RuntimeEffectType = RuntimeEffects.InterruptAttack,
                TargetRange = EffectTargetRange.Opponent,
                ChakraCost = 1,
                ExecutionTargetSource = EffectExecutionTargetSource.None,
                ExecutionFlowMode = EffectExecutionFlowMode.AtomicChain,
                OnSuccessEffectId = "summon-self",
                TargetRules = new EffectTargetRuleSet
                {
                    Operator = RequirementGroupOperator.Any,
                    ExactTargetCount = 1,
                }
            },
            new EffectSpec
            {
                Id = "summon-self",
                IsSubordinate = true,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.DuringOpponentAttack,
                RuntimeEffectType = RuntimeEffects.SummonCard,
                TargetRange = EffectTargetRange.Self,
                ChakraCost = 1,
                ExecutionTargetSource = EffectExecutionTargetSource.SourceCard,
                ExecutionFlowMode = EffectExecutionFlowMode.AtomicChain,
                TargetRules = new EffectTargetRuleSet
                {
                    Operator = RequirementGroupOperator.Any,
                    ExactTargetCount = 1,
                    Rules =
                    [
                        new EffectTargetRule
                        {
                            Scope = EffectTargetRange.Self,
                            InZone = PlayerZone.SupportZone,
                            TributeRole = TributeTargetRole.SummonCandidate,
                            ExactSelectedTargetCount = 1,
                            Restriction = new ZoneCardRestriction
                            {
                                Predicates =
                                [
                                    new ZoneCardPropertyPredicate
                                    {
                                        Property = ZoneCardProperty.Self,
                                        Operator = ZoneCardPredicateOperator.Equals,
                                        Value = string.Empty,
                                        IgnoreCase = true,
                                    }
                                ],
                                MatchMode = ZoneRestrictionMatchMode.Any,
                            }
                        }
                    ]
                }
            }
        ];
    }

    private static EffectSpec CreateTributeRequirementEffectSpec(string effectId)
    {
        return new EffectSpec
        {
            Id = effectId,
            EffectType = EffectKind.Activated,
            Timing = EffectTiming.ActivateMain,
            RuntimeEffectType = RuntimeEffects.Tribute,
            TargetRules = new EffectTargetRuleSet
            {
                MinimumTargetCount = 1,
                MaximumTargetCount = 1,
                Rules =
                [
                    new EffectTargetRule
                    {
                        Scope = EffectTargetRange.Self,
                        InZone = PlayerZone.CharacterField,
                        TributeRole = TributeTargetRole.TributeMaterial,
                        Restriction = new ZoneCardRestriction(),
                    }
                ]
            }
        };
    }
    [TestMethod]
    public void ToGameStateResponse_MapsBattleAction_ForLeaderInMainPhase()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var state = BuildState(requesterId, opponentId);
        state.TurnNumber = 3;
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;
        state.Players.Single(player => player.PlayerId == requesterId).TurnCount = 3;

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);
        var battleAction = GetLeaderBattleAction(requester.Leader);

        Assert.AreEqual($"battle-action:leader-{requesterId}", battleAction.ActionId);
        Assert.AreEqual("Battle", battleAction.Label);
        Assert.IsTrue(battleAction.IsEnabled, battleAction.DisabledReason ?? string.Empty);
        Assert.IsNull(battleAction.DisabledReason);
    }

    [TestMethod]
    public void ToGameStateResponse_MapsLeaderBattleAction_WhenLeaderEnteredFieldThisTurn()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var state = BuildState(requesterId, opponentId);
        state.TurnNumber = 3;
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;
        state.Players.Single(player => player.PlayerId == requesterId).TurnCount = 3;

        // A battlefield card would be blocked here without Rush; leaders ignore the summon-turn rule.
        state.Players.Single(player => player.PlayerId == requesterId).LeaderCardInstance!.EnteredFieldTurnNumber = 3;

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);
        var battleAction = GetLeaderBattleAction(requester.Leader);

        Assert.IsTrue(battleAction.IsEnabled, battleAction.DisabledReason ?? string.Empty);
    }

    [TestMethod]
    public void ToGameStateResponse_DisablesLeaderBattleAction_WhenLeaderIsRested()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var state = BuildState(requesterId, opponentId);
        state.TurnNumber = 3;
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;
        state.Players.Single(player => player.PlayerId == requesterId).TurnCount = 3;
        state.Players.Single(player => player.PlayerId == requesterId).LeaderCardInstance!.IsRested = true;

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);
        var battleAction = GetLeaderBattleAction(requester.Leader);

        Assert.IsTrue(requester.Leader.IsRested);
        Assert.IsFalse(battleAction.IsEnabled);
        Assert.AreEqual("Cannot declare battle action because the card is rested.", battleAction.DisabledReason);
    }

    // The leader now also publishes the shared Battle action, so leader effect assertions read the
    // `leader-effect:` entries instead of relying on the total action count.
    [TestMethod]
    public void ToGameStateResponse_DisablesLeaderBattleAction_OnFirstTurn()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var state = BuildState(requesterId, opponentId);
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;
        state.Players.Single(player => player.PlayerId == requesterId).TurnCount = 1;

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);
        var battleAction = GetLeaderBattleAction(requester.Leader);

        Assert.IsFalse(battleAction.IsEnabled);
        Assert.AreEqual("Cannot declare battle action because it is the first turn.", battleAction.DisabledReason);
    }

    [TestMethod]
    public void ToGameStateResponse_DisablesLeaderBattleAction_OutsideMainPhase()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var state = BuildState(requesterId, opponentId);
        state.TurnNumber = 3;
        state.Phase = GamePhase.ActionStep;
        state.ActivePlayerId = requesterId;
        state.Players.Single(player => player.PlayerId == requesterId).TurnCount = 3;

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var requester = response.Players.Single(player => player.PlayerId == requesterId);
        var battleAction = GetLeaderBattleAction(requester.Leader);

        Assert.IsFalse(battleAction.IsEnabled);
        Assert.AreEqual(
            "Battle actions are only available during your own main phase.",
            battleAction.DisabledReason);
    }

    [TestMethod]
    public void ToGameStateResponse_DoesNotMapBattleAction_ForOpponentLeader()
    {
        var requesterId = Guid.NewGuid().ToString("N");
        var opponentId = Guid.NewGuid().ToString("N");

        var state = BuildState(requesterId, opponentId);
        state.TurnNumber = 3;
        state.Phase = GamePhase.MainPhase;
        state.ActivePlayerId = requesterId;
        state.Players.Single(player => player.PlayerId == requesterId).TurnCount = 3;

        var response = GameStateResponseMapper.ToGameStateResponse(state, requesterId);
        var opponent = response.Players.Single(player => player.PlayerId == opponentId);

        Assert.AreEqual(0, opponent.Leader.AvailableActions.Count);
    }

    private static GameActionOptionResponse GetLeaderBattleAction(LeaderCardInstanceResponse leader)
    {
        return leader.AvailableActions.Single(action =>
            action.ActionId.StartsWith("battle-action:", StringComparison.Ordinal));
    }

    private static IReadOnlyList<GameActionOptionResponse> GetLeaderEffectActions(LeaderCardInstanceResponse leader)
    {
        return leader.AvailableActions
            .Where(action => action.ActionId.StartsWith("leader-effect:", StringComparison.Ordinal))
            .ToList();
    }


}