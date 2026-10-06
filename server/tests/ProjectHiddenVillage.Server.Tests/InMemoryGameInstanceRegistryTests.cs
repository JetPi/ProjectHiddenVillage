using Microsoft.VisualStudio.TestTools.UnitTesting;
using ErrorOr;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;
using ProjectHiddenVillage.Server.Engine;
using System.Text.RegularExpressions;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class InMemoryGameInstanceRegistryTests
{
    private readonly InMemoryGameInstanceRegistry registry = new(
        new GameInstanceFactory(),
        new global::ProjectHiddenVillage.Server.Engine.GamePhaseService(new global::ProjectHiddenVillage.Server.Engine.GamePhaseStateService()));

    [TestMethod]
    public void Create_StoresGame_AndTryGetReturnsIt()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildDefinitions("card-1"));

        var found = registry.TryGet(game.Id, out var loaded);

        Assert.IsTrue(found);
        Assert.IsNotNull(loaded);
        Assert.AreEqual(game.Id, loaded.Id);
        Assert.IsTrue(game.ActionLog.Any(entry => entry.ActionType == "game_created"));
    }

    [TestMethod]
    public void Join_AddsPlayer_AndEnqueuesStartingPlayerPrompt()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildDefinitions("card-1"));

        registry.Join(game.Id, new Player { Id = "p2", Deck = ["card-1"] }, new FixedIndexRandom(1));

        Assert.AreEqual(2, game.State.Players.Count);
        Assert.AreEqual("p2", game.State.ActivePlayerId);
        var prompt = game.GetPendingPrompt();
        Assert.IsNotNull(prompt);
        Assert.AreEqual("p2", prompt.RequestedPlayerId);
        CollectionAssert.AreEqual(new[] { "goFirst", "goSecond" }, prompt.Options);
        Assert.IsTrue(game.ActionLog.Any(entry => entry.ActionType == "player_joined" && entry.PlayerId == "p2"));
        Assert.IsTrue(game.ActionLog.Any(entry => entry.ActionType == "starting_player_assigned" && entry.PlayerId == "p2"));
        Assert.IsTrue(game.ActionLog.Any(entry => entry.ActionType == "starting_player_prompted" && entry.PlayerId == "p2"));
    }

    [TestMethod]
    public void ResolvePrompt_SetsActivePlayer()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] },
                new Player { Id = "p2", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildDefinitions("card-1"),
            random: new FixedIndexRandom(0));

        var prompt = game.GetPendingPrompt()!;

        registry.ResolvePrompt(game.Id, prompt.RequestedPlayerId, "goSecond");

        Assert.AreEqual("p2", game.State.ActivePlayerId);
        Assert.AreEqual(GamePhase.DrawInitialHand, game.State.Phase);
        Assert.IsNull(game.GetPendingPrompt());
        Assert.IsTrue(game.ActionLog.Any(entry => entry.ActionType == "prompt_resolved" && entry.PlayerId == prompt.RequestedPlayerId));
        Assert.IsTrue(game.ActionLog.Any(entry => entry.ActionType == "phase_started" && entry.PlayerId == "p2"));
    }

    [TestMethod]
    public void AdvancePhase_Throws_WhenPromptIsPending()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] },
                new Player { Id = "p2", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildDefinitions("card-1"),
            random: new FixedIndexRandom(0));

        Assert.IsNotNull(game.GetPendingPrompt());

        var ex = Assert.ThrowsException<InvalidOperationException>(() => registry.AdvancePhase(game.Id));
        Assert.AreEqual("Cannot advance phase while a prompt is pending.", ex.Message);
    }

    [TestMethod]
    public void ResolvePrompt_Mulligan_AdvancesToStartOfMainPhase()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1", "card-1", "card-1", "card-1", "card-1", "card-1"] },
                new Player { Id = "p2", Deck = ["card-1", "card-1", "card-1", "card-1", "card-1", "card-1"] }
            ],
            cardDefinitions: BuildDefinitions("card-1"),
            random: new FixedIndexRandom(0));

        var startingPrompt = game.GetPendingPrompt()!;
        registry.ResolvePrompt(game.Id, startingPrompt.RequestedPlayerId, "goFirst");

        // Enter Mulligan and enqueue mulligan prompt for the second player.
        registry.AdvancePhase(game.Id);

        var mulliganPrompt = game.GetPendingPrompt();
        Assert.IsNotNull(mulliganPrompt);
        Assert.AreEqual(GamePromptType.Mulligan, mulliganPrompt.Type);

        registry.ResolvePrompt(game.Id, mulliganPrompt.RequestedPlayerId, "noMulligan");

        Assert.AreEqual(GamePhase.StartOfMainPhase, game.State.Phase);
        Assert.IsNull(game.GetPendingPrompt());
    }

    [TestMethod]
    public void AdvancePhase_AutoEndsMainPhase_WhenNoLegalActionsRemain()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["leader-def", "card-1"] },
                new Player { Id = "p2", Deck = ["leader-def", "card-1"] }
            ],
            cardDefinitions: BuildDefinitionsWithLeaderEffects(),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.DrawPhase;
        game.State.ActivePlayerId = "p1";
        game.State.Players[0].TurnCount = 2;
        game.State.Players[0].Deck.Clear();
        game.State.Players[0].Hand.Clear();
        game.State.Players[0].Battlefield.Clear();
        // Leaders never exhaust (exhaustion means the card is out of play), so a cannot-attack
        // effect is what expresses "this card has no legal action left".
        game.State.Players[0].LeaderCardInstance!.RuntimeKeywords.Add(FreezeCardEffect.CannotAttackKeyword);
        game.State.SetSummonCardReady("p1", false);

        registry.AdvancePhase(game.Id);
        registry.AdvancePhase(game.Id);

        Assert.AreEqual(GamePhase.StartOfMainPhase, game.State.Phase);
        Assert.AreEqual("p2", game.State.ActivePlayerId);
        Assert.AreEqual(2, game.State.TurnNumber);
    }

    [TestMethod]
    public void AdvancePhase_KeepsMainPhase_WhenFreshlySummonedCardHasRush()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["leader-def", "card-1"] },
                new Player { Id = "p2", Deck = ["leader-def", "card-1"] }
            ],
            cardDefinitions: BuildDefinitionsWithLeaderEffects(),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.DrawPhase;
        game.State.ActivePlayerId = "p1";
        game.State.Players[0].TurnCount = 2;
        game.State.Players[0].Deck.Clear();
        game.State.Players[0].Hand.Clear();
        game.State.Players[0].Battlefield.Clear();
        game.State.Players[0].Battlefield.Add(new CardInstance
        {
            InstanceId = "rush-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
            EnteredFieldTurnNumber = game.State.TurnNumber,
            RuntimeKeywords = [EffectConditionKeywords.Rush],
        });
        // The leader is unable to attack, so the freshly summoned Rush card is the only legal action.
        game.State.Players[0].LeaderCardInstance!.RuntimeKeywords.Add(FreezeCardEffect.CannotAttackKeyword);
        game.State.SetSummonCardReady("p1", false);

        registry.AdvancePhase(game.Id);
        registry.AdvancePhase(game.Id);

        Assert.AreEqual(GamePhase.MainPhase, game.State.Phase);
        Assert.AreEqual("p1", game.State.ActivePlayerId);
    }

    [TestMethod]
    public void AdvancePhase_AutoEndsMainPhase_WhenOnlyFreshlySummonedCardsRemain()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["leader-def", "card-1"] },
                new Player { Id = "p2", Deck = ["leader-def", "card-1"] }
            ],
            cardDefinitions: BuildDefinitionsWithLeaderEffects(),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.DrawPhase;
        game.State.ActivePlayerId = "p1";
        game.State.Players[0].TurnCount = 2;
        game.State.Players[0].Deck.Clear();
        game.State.Players[0].Hand.Clear();
        game.State.Players[0].Battlefield.Clear();
        // Summon sick and without Rush, so it cannot attack this turn.
        game.State.Players[0].Battlefield.Add(new CardInstance
        {
            InstanceId = "fresh-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
            EnteredFieldTurnNumber = game.State.TurnNumber,
        });
        game.State.Players[0].LeaderCardInstance!.RuntimeKeywords.Add(FreezeCardEffect.CannotAttackKeyword);
        game.State.SetSummonCardReady("p1", false);

        registry.AdvancePhase(game.Id);
        registry.AdvancePhase(game.Id);

        Assert.AreEqual(GamePhase.StartOfMainPhase, game.State.Phase);
        Assert.AreEqual("p2", game.State.ActivePlayerId);
    }

    [TestMethod]
    public void ExecuteCardAction_BattleAction_AttacksLeaderAndRestsAttacker()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["leader-def", "card-1"] },
                new Player { Id = "p2", Deck = ["leader-def", "card-1"] }
            ],
            cardDefinitions: BuildDefinitionsWithLeaderEffects(),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p1";
        game.State.Players[0].Battlefield.Add(new CardInstance
        {
            InstanceId = "attacker-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
            IsRested = false,
            DamageOverride = 2,
        });

        var startingLife = game.State.Players[1].LeaderCardInstance!.CurrentLife;
        var request = new GameCardActionExecutionRequest(
            PlayerId: "p1",
            ActionId: "battle-action:attacker-1",
            SourceCardInstanceId: "attacker-1",
            SelectedTargets:
            [
                new GameEffectTargetReference(
                    PlayerId: "p2",
                    Zone: PlayerZone.Leader,
                    CardInstanceId: game.State.Players[1].LeaderCardInstance!.InstanceId)
            ]);

        registry.ExecuteCardAction(game.Id, request, new RecordingSequentialExecutor());

        Assert.IsTrue(game.State.Players[0].Battlefield[0].IsRested);
        Assert.AreEqual(startingLife, game.State.Players[1].LeaderCardInstance!.CurrentLife);
        Assert.AreEqual(GamePhase.ActionStep, game.State.Phase);
        Assert.AreEqual("p2", game.State.PriorityPlayerId);
        Assert.IsTrue(game.State.HasPendingAttack);
    }

    [TestMethod]
    public void ExecuteCardAction_BattleAction_AllowsEquivalentGuidPlayerIdFormats()
    {
        var activePlayerGuid = Guid.Parse("11111111-1111-1111-1111-111111111111");
        var opponentPlayerGuid = Guid.Parse("22222222-2222-2222-2222-222222222222");
        var activePlayerDashed = activePlayerGuid.ToString();
        var activePlayerCompact = activePlayerGuid.ToString("N");
        var opponentPlayerDashed = opponentPlayerGuid.ToString();

        var game = registry.Create(
            players:
            [
                new Player { Id = activePlayerDashed, Deck = ["leader-def", "card-1"] },
                new Player { Id = opponentPlayerDashed, Deck = ["leader-def", "card-1"] }
            ],
            cardDefinitions: BuildDefinitionsWithLeaderEffects(),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = activePlayerDashed;
        game.State.Players[0].Battlefield.Add(new CardInstance
        {
            InstanceId = "attacker-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = activePlayerDashed,
            ControllerPlayerId = activePlayerDashed,
            IsRested = false,
        });

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: activePlayerCompact,
                ActionId: "battle-action:attacker-1",
                SourceCardInstanceId: "attacker-1",
                SelectedTargets:
                [
                    new GameEffectTargetReference(
                        PlayerId: opponentPlayerDashed,
                        Zone: PlayerZone.Leader,
                        CardInstanceId: game.State.Players[1].LeaderCardInstance!.InstanceId)
                ]),
            new RecordingSequentialExecutor());

        Assert.AreEqual(GamePhase.ActionStep, game.State.Phase);
        Assert.AreEqual(opponentPlayerDashed, game.State.PriorityPlayerId);
    }

    [TestMethod]
    public void ExecuteCardAction_BattleAction_ThrowsWithoutExplicitTarget()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["leader-def", "card-1"] },
                new Player { Id = "p2", Deck = ["leader-def", "card-1"] }
            ],
            cardDefinitions: BuildDefinitionsWithLeaderEffects(),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p1";
        game.State.Players[0].Battlefield.Add(new CardInstance
        {
            InstanceId = "attacker-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
            IsRested = false,
        });

        var request = new GameCardActionExecutionRequest(
            PlayerId: "p1",
            ActionId: "battle-action:attacker-1",
            SourceCardInstanceId: "attacker-1");

        var ex = Assert.ThrowsException<InvalidOperationException>(() =>
            registry.ExecuteCardAction(game.Id, request, new RecordingSequentialExecutor()));

        Assert.AreEqual("Battle actions require an explicit defender target.", ex.Message);
    }

    [TestMethod]
    public void AdvancePhase_AttackResolution_AppliesPendingLeaderDamage()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["leader-def", "card-1"] },
                new Player { Id = "p2", Deck = ["leader-def", "card-1"] }
            ],
            cardDefinitions: BuildDefinitionsWithLeaderEffects(),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p1";
        game.State.Players[0].Battlefield.Add(new CardInstance
        {
            InstanceId = "attacker-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
            IsRested = false,
            DamageOverride = 2,
        });

        var startingLife = game.State.Players[1].LeaderCardInstance!.CurrentLife;
        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p1",
                ActionId: "battle-action:attacker-1",
                SourceCardInstanceId: "attacker-1",
                SelectedTargets:
                [
                    new GameEffectTargetReference(
                        PlayerId: "p2",
                        Zone: PlayerZone.Leader,
                        CardInstanceId: game.State.Players[1].LeaderCardInstance!.InstanceId)
                ]),
            new RecordingSequentialExecutor());

        Assert.AreEqual(GamePhase.ActionStep, game.State.Phase);
        Assert.AreEqual(startingLife, game.State.Players[1].LeaderCardInstance!.CurrentLife);

        registry.DeclarePassInActionStep(game.Id, "p2");
        registry.DeclarePassInActionStep(game.Id, "p1"); // enters AttackResolution

        Assert.AreEqual(GamePhase.AttackResolution, game.State.Phase);
        Assert.AreEqual(startingLife - 2, game.State.Players[1].LeaderCardInstance!.CurrentLife);
        Assert.IsFalse(game.State.HasPendingAttack);
    }

    [TestMethod]
    public void ExecuteCardAction_BattleAction_RestsLeaderAndDeclaresAttack()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["leader-def", "card-1"] },
                new Player { Id = "p2", Deck = ["leader-def", "card-1"] }
            ],
            cardDefinitions: BuildDefinitionsWithLeaderEffects(),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p1";
        game.State.Players[0].TurnCount = 2;

        var attackerLeader = game.State.Players[0].LeaderCardInstance!;
        var defenderLeader = game.State.Players[1].LeaderCardInstance!;
        Assert.IsFalse(attackerLeader.IsRested);

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p1",
                ActionId: $"battle-action:{attackerLeader.InstanceId}",
                SourceCardInstanceId: attackerLeader.InstanceId,
                SelectedTargets:
                [
                    new GameEffectTargetReference(
                        PlayerId: "p2",
                        Zone: PlayerZone.Leader,
                        CardInstanceId: defenderLeader.InstanceId)
                ]),
            new RecordingSequentialExecutor());

        Assert.IsTrue(attackerLeader.IsRested);
        Assert.IsTrue(game.State.HasPendingAttack);
        Assert.AreEqual(attackerLeader.InstanceId, game.State.PendingAttackAttackerInstanceId);
        Assert.AreEqual("p2", game.State.PendingAttackDefenderPlayerId);
        Assert.AreEqual(PlayerZone.Leader, game.State.PendingAttackDefenderZone);
        Assert.AreEqual(GamePhase.ActionStep, game.State.Phase);
        Assert.AreEqual("p2", game.State.PriorityPlayerId);
    }

    [TestMethod]
    public void AdvancePhase_AttackResolution_AppliesLeaderAttackerDamage()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["leader-def", "card-1"] },
                new Player { Id = "p2", Deck = ["leader-def", "card-1"] }
            ],
            cardDefinitions: BuildDefinitionsWithLeaderEffects(),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p1";
        game.State.Players[0].TurnCount = 2;

        var attackerLeader = game.State.Players[0].LeaderCardInstance!;
        attackerLeader.Damage = 3;
        var startingLife = game.State.Players[1].LeaderCardInstance!.CurrentLife;

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p1",
                ActionId: $"battle-action:{attackerLeader.InstanceId}",
                SourceCardInstanceId: attackerLeader.InstanceId,
                SelectedTargets:
                [
                    new GameEffectTargetReference(
                        PlayerId: "p2",
                        Zone: PlayerZone.Leader,
                        CardInstanceId: game.State.Players[1].LeaderCardInstance!.InstanceId)
                ]),
            new RecordingSequentialExecutor());

        Assert.AreEqual(startingLife, game.State.Players[1].LeaderCardInstance!.CurrentLife);

        registry.DeclarePassInActionStep(game.Id, "p2");
        registry.DeclarePassInActionStep(game.Id, "p1"); // enters AttackResolution

        Assert.AreEqual(GamePhase.AttackResolution, game.State.Phase);
        Assert.AreEqual(startingLife - 3, game.State.Players[1].LeaderCardInstance!.CurrentLife);
        Assert.IsFalse(game.State.HasPendingAttack);
    }

    [TestMethod]
    public void AdvancePhase_AttackResolution_AppliesLeaderAttackerPowerToDefenderCharacter()
    {
        var definitions = BuildDefinitionsWithLeaderEffects();
        definitions["defender-card"] = new CharacterCard
        {
            Id = "defender-card",
            DisplayName = "defender-card",
            Name = ["defender-card"],
            Type = CardType.Character,
            Traits = [],
            Color = CardColor.Red,
            Description = string.Empty,
            Damage = 0,
            Power = 0,
            Health = 3,
            Conditions = [],
            Effects = []
        };

        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["leader-def", "card-1"] },
                new Player { Id = "p2", Deck = ["leader-def", "card-1"] }
            ],
            cardDefinitions: definitions,
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p1";
        game.State.Players[0].TurnCount = 2;

        var attackerLeader = game.State.Players[0].LeaderCardInstance!;
        attackerLeader.Power = 4;

        game.State.Players[1].Battlefield.Add(new CardInstance
        {
            InstanceId = "defender-1",
            CardDefinitionId = "defender-card",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
            IsRested = true,
        });

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p1",
                ActionId: $"battle-action:{attackerLeader.InstanceId}",
                SourceCardInstanceId: attackerLeader.InstanceId,
                SelectedTargets:
                [
                    new GameEffectTargetReference(
                        PlayerId: "p2",
                        Zone: PlayerZone.CharacterField,
                        CardInstanceId: "defender-1")
                ]),
            new RecordingSequentialExecutor());

        registry.DeclarePassInActionStep(game.Id, "p2");
        registry.DeclarePassInActionStep(game.Id, "p1"); // enters AttackResolution

        Assert.AreEqual(GamePhase.AttackResolution, game.State.Phase);
        Assert.AreEqual(0, game.State.Players[1].Battlefield.Count);
        Assert.IsTrue(game.State.Players[1].DiscardPile.Any(card => card.InstanceId == "defender-1"));
    }

    [TestMethod]
    public void AdvancePhase_AttackResolution_AppliesAttributeModifiersToCharacterAttackerDamage()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["leader-def", "card-1"] },
                new Player { Id = "p2", Deck = ["leader-def", "card-1"] }
            ],
            cardDefinitions: BuildDefinitionsWithLeaderEffects(),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p1";
        game.State.Players[0].TurnCount = 2;

        var attacker = new CardInstance
        {
            InstanceId = "attacker-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
            IsRested = false,
            DamageOverride = 2,
        };
        game.State.Players[0].Battlefield.Add(attacker);
        game.State.AppliedCardEffects.Add(new AppliedCardEffectState
        {
            SourceCardInstanceId = attacker.InstanceId,
            EffectSpecId = "effect-damage-boost",
            TargetCardInstanceId = attacker.InstanceId,
            ModifierKind = AppliedCardModifierKind.Attribute,
            DurationMode = EffectDurationMode.DuringThisTurn,
            AttributeType = EffectAttributeType.CardDamage,
            AttributeOperation = AttributeModificationOperation.Add,
            AttributeValue = 1,
            AppliedTurnNumber = game.State.TurnNumber,
        });

        var startingLife = game.State.Players[1].LeaderCardInstance!.CurrentLife;

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p1",
                ActionId: "battle-action:attacker-1",
                SourceCardInstanceId: "attacker-1",
                SelectedTargets:
                [
                    new GameEffectTargetReference(
                        PlayerId: "p2",
                        Zone: PlayerZone.Leader,
                        CardInstanceId: game.State.Players[1].LeaderCardInstance!.InstanceId)
                ]),
            new RecordingSequentialExecutor());

        registry.DeclarePassInActionStep(game.Id, "p2");
        registry.DeclarePassInActionStep(game.Id, "p1"); // enters AttackResolution

        Assert.AreEqual(GamePhase.AttackResolution, game.State.Phase);
        Assert.AreEqual(startingLife - 3, game.State.Players[1].LeaderCardInstance!.CurrentLife);
    }

    [TestMethod]
    public void AdvancePhase_AttackResolution_AppliesAttributeModifiersToCharacterAttackerPower()
    {
        var definitions = BuildDefinitionsWithLeaderEffects();
        definitions["defender-card"] = new CharacterCard
        {
            Id = "defender-card",
            DisplayName = "defender-card",
            Name = ["defender-card"],
            Type = CardType.Character,
            Traits = [],
            Color = CardColor.Red,
            Description = string.Empty,
            Damage = 0,
            Power = 0,
            Health = 4,
            Conditions = [],
            Effects = []
        };

        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["leader-def", "card-1"] },
                new Player { Id = "p2", Deck = ["leader-def", "card-1"] }
            ],
            cardDefinitions: definitions,
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p1";
        game.State.Players[0].TurnCount = 2;

        var attacker = new CardInstance
        {
            InstanceId = "attacker-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
            IsRested = false,
            PowerOverride = 2,
        };
        game.State.Players[0].Battlefield.Add(attacker);
        game.State.AppliedCardEffects.Add(new AppliedCardEffectState
        {
            SourceCardInstanceId = attacker.InstanceId,
            EffectSpecId = "effect-power-boost",
            TargetCardInstanceId = attacker.InstanceId,
            ModifierKind = AppliedCardModifierKind.Attribute,
            DurationMode = EffectDurationMode.DuringThisTurn,
            AttributeType = EffectAttributeType.CardPower,
            AttributeOperation = AttributeModificationOperation.Add,
            AttributeValue = 1,
            AppliedTurnNumber = game.State.TurnNumber,
        });

        game.State.Players[1].Battlefield.Add(new CardInstance
        {
            InstanceId = "defender-1",
            CardDefinitionId = "defender-card",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
            IsRested = true,
        });

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p1",
                ActionId: "battle-action:attacker-1",
                SourceCardInstanceId: "attacker-1",
                SelectedTargets:
                [
                    new GameEffectTargetReference(
                        PlayerId: "p2",
                        Zone: PlayerZone.CharacterField,
                        CardInstanceId: "defender-1")
                ]),
            new RecordingSequentialExecutor());

        registry.DeclarePassInActionStep(game.Id, "p2");
        registry.DeclarePassInActionStep(game.Id, "p1"); // enters AttackResolution

        var defender = game.State.Players[1].Battlefield.Single(card => card.InstanceId == "defender-1");
        Assert.AreEqual(GamePhase.AttackResolution, game.State.Phase);
        // Base power 2 would leave 2 health; the +1 attribute modifier must be applied.
        Assert.AreEqual(1, defender.CurrentHealth ?? -1);
    }

    [TestMethod]
    public void ExecuteCardAction_BattleAction_DoesNotAutoExecuteLeaderWhenAttackingEffects()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["leader-def", "card-1"] },
                new Player { Id = "p2", Deck = ["leader-def", "card-1"] }
            ],
            cardDefinitions: BuildDefinitionsWithLeaderEffects(),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p1";
        game.State.Players[0].Battlefield.Add(new CardInstance
        {
            InstanceId = "attacker-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
            IsRested = false,
        });

        var leaderDefinition = (LeaderCard)game.State.CardDefinitions["leader-def"];
        leaderDefinition.Effects =
        [
            new EffectSpec
            {
                Id = "leader-on-attack-auto",
                EffectType = EffectKind.Activated,
                Timing = EffectTiming.WhenAttacking,
                RuntimeEffectType = RuntimeEffects.AlterResources,
                IsOptional = false,
            }
        ];

        var recordingExecutor = new RecordingSequentialExecutor();

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p1",
                ActionId: "battle-action:attacker-1",
                SourceCardInstanceId: "attacker-1",
                SelectedTargets:
                [
                    new GameEffectTargetReference(
                        PlayerId: "p2",
                        Zone: PlayerZone.Leader,
                        CardInstanceId: game.State.Players[1].LeaderCardInstance!.InstanceId)
                ]),
            recordingExecutor);

        Assert.IsFalse(recordingExecutor.Contexts.Any(context =>
            context.Arguments.TryGetValue(ReactiveEffectExecutionConstants.ActiveEffectSpecIdArgument, out var effectId)
            && effectId == "leader-on-attack-auto"));
    }

    [TestMethod]
    public void ExecuteCardAction_BattleAction_WithoutAttackEffect_TransitionsDirectlyToActionStep()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["leader-def", "card-1"] },
                new Player { Id = "p2", Deck = ["leader-def", "card-1"] }
            ],
            cardDefinitions: BuildDefinitionsWithLeaderEffects(),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p1";
        game.State.Players[0].Battlefield.Add(new CardInstance
        {
            InstanceId = "attacker-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
            IsRested = false,
        });

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p1",
                ActionId: "battle-action:attacker-1",
                SourceCardInstanceId: "attacker-1",
                SelectedTargets:
                [
                    new GameEffectTargetReference(
                        PlayerId: "p2",
                        Zone: PlayerZone.Leader,
                        CardInstanceId: game.State.Players[1].LeaderCardInstance!.InstanceId)
                ]),
            new RecordingSequentialExecutor());

        Assert.AreEqual(GamePhase.ActionStep, game.State.Phase);
        Assert.AreEqual("p2", game.State.PriorityPlayerId);
        Assert.AreEqual(string.Empty, game.State.PendingAttackOptionalEffectSourceCardInstanceId);
    }

    [TestMethod]
    public void ExecuteCardAction_BattleAction_WithMandatoryAttackerAttackEffect_AutoExecutesThenTransitionsToActionStep()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["leader-def", "card-1"] },
                new Player { Id = "p2", Deck = ["leader-def", "card-1"] }
            ],
            cardDefinitions: BuildDefinitionsWithLeaderEffects(),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p1";
        game.State.Players[0].Battlefield.Add(new CardInstance
        {
            InstanceId = "attacker-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
            IsRested = false,
        });

        var attackerDefinition = game.State.CardDefinitions["card-1"];
        attackerDefinition.Effects =
        [
            new EffectSpec
            {
                Id = "attacker-on-attack-mandatory",
                EffectType = EffectKind.Activated,
                Timing = EffectTiming.WhenAttacking,
                RuntimeEffectType = RuntimeEffects.AlterResources,
                IsOptional = false,
            }
        ];

        var recordingExecutor = new RecordingSequentialExecutor();

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p1",
                ActionId: "battle-action:attacker-1",
                SourceCardInstanceId: "attacker-1",
                SelectedTargets:
                [
                    new GameEffectTargetReference(
                        PlayerId: "p2",
                        Zone: PlayerZone.Leader,
                        CardInstanceId: game.State.Players[1].LeaderCardInstance!.InstanceId)
                ]),
            recordingExecutor);

        Assert.IsTrue(recordingExecutor.Contexts.Any(context =>
            context.Arguments.TryGetValue(ReactiveEffectExecutionConstants.ActiveEffectSpecIdArgument, out var effectId)
            && effectId == "attacker-on-attack-mandatory"));
        Assert.AreEqual(GamePhase.ActionStep, game.State.Phase);
        Assert.AreEqual("p2", game.State.PriorityPlayerId);
    }

    [TestMethod]
    public void ExecuteCardAction_BattleAction_KeepsTheRestPaidByTheDeclaration_WhenAWhenAttackingEffectReadiesTheAttacker()
    {
        // The rest is the declaration cost, so it is paid once and never re-asserted: an effect that stands the
        // attacker back up afterwards keeps it standing (the refresh phase re-readies it as usual).
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["leader-def", "card-1"] },
                new Player { Id = "p2", Deck = ["leader-def", "card-1"] }
            ],
            cardDefinitions: BuildDefinitionsWithLeaderEffects(),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p1";
        game.State.Players[0].Battlefield.Add(new CardInstance
        {
            InstanceId = "attacker-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
            IsRested = false,
        });

        var attackerDefinition = game.State.CardDefinitions["card-1"];
        attackerDefinition.Effects =
        [
            new EffectSpec
            {
                Id = "attacker-on-attack-mandatory",
                EffectType = EffectKind.Activated,
                Timing = EffectTiming.WhenAttacking,
                RuntimeEffectType = RuntimeEffects.AlterResources,
                IsOptional = false,
            }
        ];

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p1",
                ActionId: "battle-action:attacker-1",
                SourceCardInstanceId: "attacker-1",
                SelectedTargets:
                [
                    new GameEffectTargetReference(
                        PlayerId: "p2",
                        Zone: PlayerZone.Leader,
                        CardInstanceId: game.State.Players[1].LeaderCardInstance!.InstanceId)
                ]),
            new AttackerUnrestingSequentialExecutor());

        Assert.IsFalse(
            game.State.Players[0].Battlefield[0].IsRested,
            "the when-attacking effect stood the attacker up, and nothing re-rests it");
        Assert.IsTrue(game.State.HasPendingAttack);
        Assert.AreEqual(GamePhase.ActionStep, game.State.Phase);
    }

    [TestMethod]
    public void ExecuteCardAction_BattleAction_WithOptionalAttackerAttackEffect_RequiresChoiceThenTransitionsToActionStep()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["leader-def", "card-1"] },
                new Player { Id = "p2", Deck = ["leader-def", "card-1"] }
            ],
            cardDefinitions: BuildDefinitionsWithLeaderEffects(),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p1";
        game.State.Players[0].Battlefield.Add(new CardInstance
        {
            InstanceId = "attacker-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
            IsRested = false,
        });

        var attackerDefinition = game.State.CardDefinitions["card-1"];
        attackerDefinition.Effects =
        [
            new EffectSpec
            {
                Id = "attacker-on-attack-optional",
                EffectType = EffectKind.Activated,
                Timing = EffectTiming.WhenAttacking,
                RuntimeEffectType = RuntimeEffects.AlterResources,
                IsOptional = true,
            }
        ];

        var recordingExecutor = new RecordingSequentialExecutor();

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p1",
                ActionId: "battle-action:attacker-1",
                SourceCardInstanceId: "attacker-1",
                SelectedTargets:
                [
                    new GameEffectTargetReference(
                        PlayerId: "p2",
                        Zone: PlayerZone.Leader,
                        CardInstanceId: game.State.Players[1].LeaderCardInstance!.InstanceId)
                ]),
            recordingExecutor);

        Assert.AreEqual(GamePhase.AttackDeclaration, game.State.Phase);
        Assert.AreEqual("attacker-1", game.State.PendingAttackOptionalEffectSourceCardInstanceId);
        Assert.AreEqual("p1", game.State.PendingAttackOptionalEffectPlayerId);

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p1",
                ActionId: "resolve-optional-attack-effect:attacker-1:yes",
                SourceCardInstanceId: "attacker-1"),
            recordingExecutor);

        Assert.IsTrue(recordingExecutor.Contexts.Any(context =>
            context.Arguments.TryGetValue(ReactiveEffectExecutionConstants.ActiveEffectSpecIdArgument, out var effectId)
            && effectId == "attacker-on-attack-optional"));
        Assert.AreEqual(GamePhase.ActionStep, game.State.Phase);
        Assert.AreEqual("p2", game.State.PriorityPlayerId);
        Assert.AreEqual(string.Empty, game.State.PendingAttackOptionalEffectSourceCardInstanceId);
    }

    [TestMethod]
    public void ExecuteCardAction_ActivateSupport_FromHandOnOpponentTurn_Throws()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] },
                new Player { Id = "p2", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildSupportCapableDefinitions("card-1"),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.ActionStep;
        game.State.ActivePlayerId = "p1";
        game.State.PriorityPlayerId = "p2";
        game.State.Players[1].Hand.Add(new CardInstance
        {
            InstanceId = "hand-support-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
        });

        var request = new GameCardActionExecutionRequest(
            PlayerId: "p2",
            ActionId: "activate-support:hand-support-1",
            SourceCardInstanceId: "hand-support-1");

        var ex = Assert.ThrowsException<InvalidOperationException>(() =>
            registry.ExecuteCardAction(game.Id, request, new RecordingSequentialExecutor()));

        Assert.AreEqual("Opponent-turn supports, including Quick, must be played from support area.", ex.Message);
    }

    [TestMethod]
    public void ExecuteCardAction_ActivateSupport_QuickOnOpponentTurn_ThrowsOutsideSupportCutInStage()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] },
                new Player { Id = "p2", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildSupportCapableDefinitions("card-1"),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.AttackDeclaration;
        game.State.ActivePlayerId = "p1";
        game.State.PriorityPlayerId = "p2";
        game.State.Players[1].SupportZone.Add(new CardInstance
        {
            InstanceId = "support-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
        });

        var quickDefinition = (CharacterCard)game.State.CardDefinitions["card-1"];
        quickDefinition.Effects =
        [
            new EffectSpec
            {
                Id = "support-quick",
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                RuntimeEffectType = RuntimeEffects.ChangeValues,
            }
        ];

        var request = new GameCardActionExecutionRequest(
            PlayerId: "p2",
            ActionId: "activate-support:support-1",
            SourceCardInstanceId: "support-1");

        var ex = Assert.ThrowsException<InvalidOperationException>(() =>
            registry.ExecuteCardAction(game.Id, request, new RecordingSequentialExecutor()));

        Assert.AreEqual("Support timing is not available right now.", ex.Message);
    }

    [TestMethod]
    public void ExecuteCardAction_ActivateSupport_QuickOnOpponentTurn_AllowsInSupportCutInStage()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] },
                new Player { Id = "p2", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildSupportCapableDefinitions("card-1"),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.ActionStep;
        game.State.ActivePlayerId = "p1";
        game.State.PriorityPlayerId = "p2";
        game.State.HasPendingAttack = true;
        game.State.Players[1].SupportZone.Add(new CardInstance
        {
            InstanceId = "support-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
        });

        var quickDefinition = (CharacterCard)game.State.CardDefinitions["card-1"];
        quickDefinition.Effects =
        [
            new EffectSpec
            {
                Id = "support-quick",
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                RuntimeEffectType = RuntimeEffects.ChangeValues,
            }
        ];

        var request = new GameCardActionExecutionRequest(
            PlayerId: "p2",
            ActionId: "activate-support:support-1",
            SourceCardInstanceId: "support-1");

        registry.ExecuteCardAction(game.Id, request, new RecordingSequentialExecutor());

        Assert.AreEqual("p1", game.State.PriorityPlayerId);
    }

    [TestMethod]
    public void ExecuteCardAction_ActivateSupport_QuickInMainPhaseReactionWindow_AllowsOpponentCutIn()
    {
        // "[Quick] can be played at any valid Support Cut-in response window": a MainPhase activation opens
        // one, so the opponent answers N-002-style from the support area - and priority flips back to the
        // activator. Before this the timing gate only accepted the attack cut-in step.
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] },
                new Player { Id = "p2", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildSupportCapableDefinitions("card-1"),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p1";
        game.State.PriorityPlayerId = "p2";
        game.State.HasPendingAttack = false;
        game.State.EffectResolutionStack.Add(new EffectResolutionStackEntry
        {
            SourcePlayerId = "p1",
            SourceZone = PlayerZone.SupportZone,
            SourceCardInstanceId = "p1-pending-support",
            EffectTypeKey = "ChangeValues",
            ActivatedEffectId = "support-effect",
        });
        game.State.Players[1].SupportZone.Add(new CardInstance
        {
            InstanceId = "support-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
        });

        var quickDefinition = (CharacterCard)game.State.CardDefinitions["card-1"];
        quickDefinition.Effects =
        [
            new EffectSpec
            {
                Id = "support-quick",
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                RuntimeEffectType = RuntimeEffects.ChangeValues,
            }
        ];

        var request = new GameCardActionExecutionRequest(
            PlayerId: "p2",
            ActionId: "activate-support:support-1",
            SourceCardInstanceId: "support-1");

        registry.ExecuteCardAction(game.Id, request, new RecordingSequentialExecutor());

        Assert.AreEqual(2, game.State.EffectResolutionStack.Count);
        Assert.AreEqual("p1", game.State.PriorityPlayerId);
    }

    [TestMethod]
    public void ExecuteCardAction_ActivateSupport_QuickOnOpponentTurn_ThrowsWhenNoPendingAttack()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] },
                new Player { Id = "p2", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildSupportCapableDefinitions("card-1"),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.ActionStep;
        game.State.ActivePlayerId = "p1";
        game.State.PriorityPlayerId = "p2";
        game.State.HasPendingAttack = false;
        game.State.Players[1].SupportZone.Add(new CardInstance
        {
            InstanceId = "support-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
        });

        var quickDefinition = (CharacterCard)game.State.CardDefinitions["card-1"];
        quickDefinition.Effects =
        [
            new EffectSpec
            {
                Id = "support-quick",
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                RuntimeEffectType = RuntimeEffects.ChangeValues,
            }
        ];

        var request = new GameCardActionExecutionRequest(
            PlayerId: "p2",
            ActionId: "activate-support:support-1",
            SourceCardInstanceId: "support-1");

        var ex = Assert.ThrowsException<InvalidOperationException>(() =>
            registry.ExecuteCardAction(game.Id, request, new RecordingSequentialExecutor()));

        Assert.AreEqual("Support timing is not available right now.", ex.Message);
    }

    [TestMethod]
    public void AttackWindow_MultiSupportStack_ResolvesInLifoOrder_ForOpponentCutIn()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] },
                new Player { Id = "p2", Deck = ["card-2", "card-3"] }
            ],
            cardDefinitions: BuildSupportCapableDefinitions("card-1", "card-2", "card-3"),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.ActionStep;
        game.State.ActivePlayerId = "p1";
        game.State.PriorityPlayerId = "p2";
        game.State.HasPendingAttack = true;
        game.State.Players[1].SupportZone.Add(new CardInstance
        {
            InstanceId = "support-1",
            CardDefinitionId = "card-2",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
        });
        game.State.Players[1].SupportZone.Add(new CardInstance
        {
            InstanceId = "support-2",
            CardDefinitionId = "card-3",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
        });

        SetQuickSupportEffect(game.State, "card-2", "stack-alpha");
        SetQuickSupportEffect(game.State, "card-3", "stack-beta");

        var recordingExecutor = new RecordingSequentialExecutor();

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p2",
                ActionId: "activate-support:support-1",
                SourceCardInstanceId: "support-1"),
            recordingExecutor);

        game.State.PriorityPlayerId = "p2";

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p2",
                ActionId: "activate-support:support-2",
                SourceCardInstanceId: "support-2"),
            recordingExecutor);

        // Both activations are queued in activation order and nothing has resolved yet.
        Assert.AreEqual(2, game.State.EffectResolutionStack.Count);
        Assert.AreEqual("support-1", game.State.EffectResolutionStack[0].SourceCardInstanceId);
        Assert.AreEqual("support-2", game.State.EffectResolutionStack[1].SourceCardInstanceId);
        Assert.AreEqual(0, recordingExecutor.Contexts.Count);

        // Double pass closes the cut-in window: supports resolve most-recent-first.
        registry.DeclarePassInActionStep(game.Id, "p1", reactiveEffectOrchestrator: null, sequentialEffectExecutor: recordingExecutor);
        registry.DeclarePassInActionStep(game.Id, "p2", reactiveEffectOrchestrator: null, sequentialEffectExecutor: recordingExecutor);

        Assert.AreEqual(2, recordingExecutor.Contexts.Count);
        Assert.AreEqual("stack-beta", recordingExecutor.Contexts[0].SourceCardDefinition.Effects[0].Id);
        Assert.AreEqual("support-2", recordingExecutor.Contexts[0].SourceCardInstance?.InstanceId);
        Assert.AreEqual("stack-alpha", recordingExecutor.Contexts[1].SourceCardDefinition.Effects[0].Id);
        Assert.AreEqual("support-1", recordingExecutor.Contexts[1].SourceCardInstance?.InstanceId);
        Assert.AreEqual(0, game.State.EffectResolutionStack.Count);
    }

    [TestMethod]
    public void AttackWindow_MultiSupportStack_ResolvesInLifoOrder_ForActivePlayerCutIn()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-2", "card-3"] },
                new Player { Id = "p2", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildSupportCapableDefinitions("card-1", "card-2", "card-3"),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.ActionStep;
        game.State.ActivePlayerId = "p1";
        game.State.PriorityPlayerId = "p1";
        game.State.HasPendingAttack = true;
        game.State.Players[0].SupportZone.Add(new CardInstance
        {
            InstanceId = "support-1",
            CardDefinitionId = "card-2",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
        });
        game.State.Players[0].SupportZone.Add(new CardInstance
        {
            InstanceId = "support-2",
            CardDefinitionId = "card-3",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
        });

        SetQuickSupportEffect(game.State, "card-2", "stack-gamma");
        SetQuickSupportEffect(game.State, "card-3", "stack-delta");

        var recordingExecutor = new RecordingSequentialExecutor();

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p1",
                ActionId: "activate-support:support-1",
                SourceCardInstanceId: "support-1"),
            recordingExecutor);

        game.State.PriorityPlayerId = "p1";

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p1",
                ActionId: "activate-support:support-2",
                SourceCardInstanceId: "support-2"),
            recordingExecutor);

        Assert.AreEqual(2, game.State.EffectResolutionStack.Count);
        Assert.AreEqual("support-1", game.State.EffectResolutionStack[0].SourceCardInstanceId);
        Assert.AreEqual("support-2", game.State.EffectResolutionStack[1].SourceCardInstanceId);
        Assert.AreEqual(0, recordingExecutor.Contexts.Count);

        registry.DeclarePassInActionStep(game.Id, "p2", reactiveEffectOrchestrator: null, sequentialEffectExecutor: recordingExecutor);
        registry.DeclarePassInActionStep(game.Id, "p1", reactiveEffectOrchestrator: null, sequentialEffectExecutor: recordingExecutor);

        Assert.AreEqual(2, recordingExecutor.Contexts.Count);
        Assert.AreEqual("stack-delta", recordingExecutor.Contexts[0].SourceCardDefinition.Effects[0].Id);
        Assert.AreEqual("support-2", recordingExecutor.Contexts[0].SourceCardInstance?.InstanceId);
        Assert.AreEqual("stack-gamma", recordingExecutor.Contexts[1].SourceCardDefinition.Effects[0].Id);
        Assert.AreEqual("support-1", recordingExecutor.Contexts[1].SourceCardInstance?.InstanceId);
        Assert.AreEqual(0, game.State.EffectResolutionStack.Count);
    }

    [TestMethod]
    public void GetCardActionTargets_BattleAction_ReturnsLeaderAndRestedCharacterTargets()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["leader-def", "card-1"] },
                new Player { Id = "p2", Deck = ["leader-def", "card-1"] }
            ],
            cardDefinitions: BuildDefinitionsWithLeaderEffects(),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p1";
        game.State.Players[0].Battlefield.Add(new CardInstance
        {
            InstanceId = "attacker-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
            IsRested = false,
        });
        game.State.Players[1].Battlefield.Add(new CardInstance
        {
            InstanceId = "defender-rested",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
            IsRested = true,
        });
        game.State.Players[1].Battlefield.Add(new CardInstance
        {
            InstanceId = "defender-active",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
            IsRested = false,
        });

        var targets = registry.GetCardActionTargets(
            game.Id,
            new GameCardActionTargetsRequest(
                PlayerId: "p1",
                ActionId: "battle-action:attacker-1",
                SourceCardInstanceId: "attacker-1"),
            new GameEffectCanExecuteEvaluator(
                new EffectContextConditionEvaluator(),
                new EffectTargetResolver(),
                new GameValidTargetResultFactory(),
                new GameEffectConditionDiagnostics()));

        Assert.IsTrue(targets.IsEnabled);
        Assert.AreEqual(1, targets.ExactTargetCount);
        Assert.AreEqual(2, targets.ValidTargets.Count);
        Assert.IsTrue(targets.ValidTargets.Any(target => target.Zone == PlayerZone.Leader && target.PlayerId == "p2"));
        Assert.IsTrue(targets.ValidTargets.Any(target => target.Zone == PlayerZone.CharacterField && target.CardInstanceId == "defender-rested"));
        Assert.IsFalse(targets.ValidTargets.Any(target => target.CardInstanceId == "defender-active"));
    }

    [TestMethod]
    public void Join_Throws_WhenGameIsMissing()
    {
        var ex = Assert.ThrowsException<KeyNotFoundException>(() =>
            registry.Join("missing", new Player { Id = "p2", Deck = ["card-1"] }));

        Assert.AreEqual("Game instance 'missing' was not found.", ex.Message);
    }

    [TestMethod]
    public void Create_InitializesAndPreservesSummonCardFlags()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] },
                new Player { Id = "p2", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildDefinitions("card-1"),
            random: new FixedIndexRandom(0));

        Assert.IsTrue(game.State.Player1SummonCard);
        Assert.IsTrue(game.State.Player2SummonCard);

        var found = registry.TryGet(game.Id, out var loaded);

        Assert.IsTrue(found);
        Assert.IsNotNull(loaded);
        Assert.IsTrue(loaded.State.Player1SummonCard);
        Assert.IsTrue(loaded.State.Player2SummonCard);
    }

    [TestMethod]
    public void Create_AssignsFiveCharacterAlphanumericGameCode()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildDefinitions("card-1"));

        Assert.AreEqual(5, game.Id.Length);
        Assert.IsTrue(Regex.IsMatch(game.Id, "^[A-Za-z0-9]{5}$"));
    }

    [TestMethod]
    public void Create_UsesPreferredGameCode_WhenValidAndAvailable()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildDefinitions("card-1"),
            preferredGameCode: "TEST1");

        Assert.AreEqual("TEST1", game.Id);
    }

    [TestMethod]
    public void Create_Throws_WhenPreferredGameCodeIsAlreadyInUse()
    {
        registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildDefinitions("card-1"),
            preferredGameCode: "TEST1");

        var ex = Assert.ThrowsException<InvalidOperationException>(() =>
            registry.Create(
                players:
                [
                    new Player { Id = "p2", Deck = ["card-1"] }
                ],
                cardDefinitions: BuildDefinitions("card-1"),
                preferredGameCode: "TEST1"));

        Assert.AreEqual("Game code 'TEST1' is already in use.", ex.Message);
    }

    [TestMethod]
    public void ExecuteCardAction_ActivateSupport_QueuesActivation_AndSwapsPriority()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] },
                new Player { Id = "p2", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildSupportCapableDefinitions("card-1"),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.ActionStep;
        game.State.ActivePlayerId = "p2";
        game.State.PriorityPlayerId = "p2";
        game.State.HasPendingAttack = true;
        game.State.Players[1].SupportZone.Add(new CardInstance
        {
            InstanceId = "support-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
        });

        SetQuickSupportEffect(game.State, "card-1", "support-quick");

        var recordingExecutor = new RecordingSequentialExecutor();
        var request = new GameCardActionExecutionRequest(
            PlayerId: "p2",
            ActionId: "activate-support:support-1",
            SourceCardInstanceId: "support-1");

        registry.ExecuteCardAction(game.Id, request, recordingExecutor);

        // The activation is paid and queued, but it only resolves when the cut-in window closes (the
        // opponent still gets a chance to respond with a Support Activated card).
        Assert.AreEqual(0, recordingExecutor.Contexts.Count);
        Assert.AreEqual(1, game.State.EffectResolutionStack.Count);
        Assert.AreEqual("support-1", game.State.EffectResolutionStack[0].SourceCardInstanceId);
        Assert.AreEqual(PlayerZone.SupportZone, game.State.EffectResolutionStack[0].SourceZone);
        Assert.IsFalse(string.IsNullOrWhiteSpace(game.State.EffectResolutionStack[0].ActivatedEffectId));
        Assert.AreEqual("p1", game.State.PriorityPlayerId);
        Assert.AreEqual(0, game.State.ConsecutivePasses);
        Assert.AreEqual(GamePhase.ActionStep, game.State.Phase);
    }

    [TestMethod]
    public void ExecuteCardAction_ThrowsForUnsupportedActionId()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] },
                new Player { Id = "p2", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildDefinitions("card-1"),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.ActionStep;
        game.State.ActivePlayerId = "p2";
        game.State.PriorityPlayerId = "p2";

        var request = new GameCardActionExecutionRequest(
            PlayerId: "p2",
            ActionId: "unknown-action:hand-1",
            SourceCardInstanceId: "hand-1");

        var ex = Assert.ThrowsException<InvalidOperationException>(() =>
            registry.ExecuteCardAction(game.Id, request, new RecordingSequentialExecutor()));

        Assert.AreEqual("Card action 'unknown-action:hand-1' is not supported yet.", ex.Message);
    }

    [TestMethod]
    public void ExecuteCardAction_SummonToField_MovesCardFromHandAndRestsSummonCard()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] },
                new Player { Id = "p2", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildDefinitions("card-1"),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p2";
        game.State.PriorityPlayerId = "p2";
        game.State.SetSummonCardReady("p2", true);
        game.State.Players[1].Hand.Add(new CardInstance
        {
            InstanceId = "hand-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
        });

        var request = new GameCardActionExecutionRequest(
            PlayerId: "p2",
            ActionId: "summon-to-field:hand-1",
            SourceCardInstanceId: "hand-1");

        registry.ExecuteCardAction(game.Id, request, new RecordingSequentialExecutor());

        Assert.AreEqual(0, game.State.Players[1].Hand.Count);
        Assert.AreEqual(1, game.State.Players[1].Battlefield.Count);
        Assert.AreEqual("hand-1", game.State.Players[1].Battlefield[0].InstanceId);
        Assert.IsFalse(game.State.IsSummonCardReady("p2"));
    }

    [TestMethod]
    public void GetCardActionTargets_SummonRequirementSummon_ReturnsTributeTargets()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] },
                new Player { Id = "p2", Deck = ["leader-def", "tribute-card"] }
            ],
            cardDefinitions: BuildDefinitionsWithSummonRequirement(),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p2";
        game.State.PriorityPlayerId = "p2";
        game.State.Players[1].Hand.Add(new CardInstance
        {
            InstanceId = "hand-tribute",
            CardDefinitionId = "tribute-card",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
        });
        game.State.Players[1].Battlefield.Add(new CardInstance
        {
            InstanceId = "tribute-material-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
        });

        var targets = registry.GetCardActionTargets(
            game.Id,
            new GameCardActionTargetsRequest(
                PlayerId: "p2",
                ActionId: "summon-to-field:hand-tribute",
                SourceCardInstanceId: "hand-tribute"),
            new GameEffectCanExecuteEvaluator(
                new EffectContextConditionEvaluator(),
                new EffectTargetResolver(),
                new GameValidTargetResultFactory(),
                new GameEffectConditionDiagnostics()));

        Assert.IsTrue(targets.IsEnabled);
        Assert.AreEqual(1, targets.ExactTargetCount);
        Assert.AreEqual(1, targets.ValidTargets.Count);
        Assert.AreEqual("tribute-material-1", targets.ValidTargets[0].CardInstanceId);
        Assert.AreEqual(PlayerZone.CharacterField, targets.ValidTargets[0].Zone);
    }

    [TestMethod]
    public void ExecuteCardAction_SummonRequirementSummon_ConsumesTributeAndDoesNotRestSummonCard()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] },
                new Player { Id = "p2", Deck = ["leader-def", "tribute-card"] }
            ],
            cardDefinitions: BuildDefinitionsWithSummonRequirement(),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p2";
        game.State.PriorityPlayerId = "p2";
        game.State.SetSummonCardReady("p2", true);
        game.State.Players[1].Hand.Add(new CardInstance
        {
            InstanceId = "hand-tribute",
            CardDefinitionId = "tribute-card",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
        });
        game.State.Players[1].Battlefield.Add(new CardInstance
        {
            InstanceId = "tribute-material-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
        });
        game.State.Players[1].DiscardPile.Add(new CardInstance
        {
            InstanceId = "older-trash-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
        });

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p2",
                ActionId: "summon-to-field:hand-tribute",
                SourceCardInstanceId: "hand-tribute",
                SelectedTargets:
                [
                    new GameEffectTargetReference("p2", PlayerZone.CharacterField, "tribute-material-1")
                ]),
            new RecordingSequentialExecutor());

        Assert.AreEqual(0, game.State.Players[1].Hand.Count);
        Assert.IsTrue(game.State.Players[1].Battlefield.Any(card => card.InstanceId == "hand-tribute"));
        Assert.AreEqual(2, game.State.Players[1].DiscardPile.Count);
        // Trash is newest-first: the freshly tributed card becomes the pile's face.
        Assert.AreEqual("tribute-material-1", game.State.Players[1].DiscardPile[0].InstanceId);
        Assert.AreEqual("older-trash-1", game.State.Players[1].DiscardPile[1].InstanceId);
        Assert.IsTrue(game.State.IsSummonCardReady("p2"));
    }

    [TestMethod]
    public void ExecuteCardAction_SetSupport_MovesCardFromHandToSelectedSupportSlot()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] },
                new Player { Id = "p2", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildSupportCapableDefinitions("card-1"),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p2";
        game.State.PriorityPlayerId = "p2";
        game.State.Players[1].Hand.Add(new CardInstance
        {
            InstanceId = "hand-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
        });

        var request = new GameCardActionExecutionRequest(
            PlayerId: "p2",
            ActionId: "set-support:hand-1",
            SourceCardInstanceId: "hand-1",
            Arguments: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["supportSlotIndex"] = "0",
            });

        registry.ExecuteCardAction(game.Id, request, new RecordingSequentialExecutor());

        Assert.AreEqual(0, game.State.Players[1].Hand.Count);
        Assert.AreEqual(1, game.State.Players[1].SupportZone.Count);
        Assert.AreEqual("hand-1", game.State.Players[1].SupportZone[0].InstanceId);
        Assert.AreEqual(0, game.State.Players[1].SupportZone[0].SupportSlotIndex);
    }

    [TestMethod]
    public void ExecuteCardAction_SetSupport_WithoutSlotArgument_UsesLeftmostEmptySlot()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] },
                new Player { Id = "p2", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildSupportCapableDefinitions("card-1"),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p2";
        game.State.PriorityPlayerId = "p2";
        // Slots 0 and 1 are taken, so the card has to land in slot 2 without the player choosing it.
        game.State.Players[1].SupportZone.Add(new CardInstance
        {
            InstanceId = "support-0",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
            SupportSlotIndex = 0,
        });
        game.State.Players[1].SupportZone.Add(new CardInstance
        {
            InstanceId = "support-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
            SupportSlotIndex = 1,
        });
        game.State.Players[1].Hand.Add(new CardInstance
        {
            InstanceId = "hand-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
        });

        var request = new GameCardActionExecutionRequest(
            PlayerId: "p2",
            ActionId: "set-support:hand-1",
            SourceCardInstanceId: "hand-1");

        registry.ExecuteCardAction(game.Id, request, new RecordingSequentialExecutor());

        Assert.AreEqual(0, game.State.Players[1].Hand.Count);
        Assert.AreEqual(3, game.State.Players[1].SupportZone.Count);
        Assert.IsTrue(game.State.Players[1].SupportZone
            .Any(card => card.InstanceId == "hand-1" && card.SupportSlotIndex == 2));
    }

    [TestMethod]
    public void ExecuteCardAction_SetSupport_AllowsPlacementIntoAnyEmptySupportSlot()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] },
                new Player { Id = "p2", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildSupportCapableDefinitions("card-1"),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p2";
        game.State.PriorityPlayerId = "p2";
        game.State.Players[1].SupportZone.Add(new CardInstance
        {
            InstanceId = "support-0",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
            SupportSlotIndex = 0,
        });
        game.State.Players[1].Hand.Add(new CardInstance
        {
            InstanceId = "hand-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
        });

        var request = new GameCardActionExecutionRequest(
            PlayerId: "p2",
            ActionId: "set-support:hand-1",
            SourceCardInstanceId: "hand-1",
            Arguments: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["supportSlotIndex"] = "2",
            });

        registry.ExecuteCardAction(game.Id, request, new RecordingSequentialExecutor());

        Assert.AreEqual(0, game.State.Players[1].Hand.Count);
        Assert.AreEqual(2, game.State.Players[1].SupportZone.Count);
        Assert.IsTrue(game.State.Players[1].SupportZone.Any(card => card.InstanceId == "hand-1" && card.SupportSlotIndex == 2));
    }

    [TestMethod]
    public void ExecuteCardAction_SetSupport_Throws_WhenRequestedSlotIsOccupied()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] },
                new Player { Id = "p2", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildSupportCapableDefinitions("card-1"),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p2";
        game.State.PriorityPlayerId = "p2";
        game.State.Players[1].SupportZone.Add(new CardInstance
        {
            InstanceId = "support-0",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
        });
        game.State.Players[1].Hand.Add(new CardInstance
        {
            InstanceId = "hand-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
        });

        var request = new GameCardActionExecutionRequest(
            PlayerId: "p2",
            ActionId: "set-support:hand-1",
            SourceCardInstanceId: "hand-1",
            Arguments: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["supportSlotIndex"] = "0",
            });

        var ex = Assert.ThrowsException<InvalidOperationException>(() =>
            registry.ExecuteCardAction(game.Id, request, new RecordingSequentialExecutor()));

        Assert.AreEqual("Support slot 0 is already occupied.", ex.Message);
    }

    [TestMethod]
    public void ExecuteCardAction_SummonToField_ThrowsOutsideMainPhase()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] },
                new Player { Id = "p2", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildDefinitions("card-1"),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.ActionStep;
        game.State.ActivePlayerId = "p2";
        game.State.PriorityPlayerId = "p2";
        game.State.SetSummonCardReady("p2", true);
        game.State.Players[1].Hand.Add(new CardInstance
        {
            InstanceId = "hand-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
        });

        var request = new GameCardActionExecutionRequest(
            PlayerId: "p2",
            ActionId: "summon-to-field:hand-1",
            SourceCardInstanceId: "hand-1");

        var ex = Assert.ThrowsException<InvalidOperationException>(() =>
            registry.ExecuteCardAction(game.Id, request, new RecordingSequentialExecutor()));

        Assert.AreEqual("Hand card actions can only be executed during MainPhase.", ex.Message);
    }

    [TestMethod]
    public void ExecuteCardAction_SetSupport_ThrowsWhenRequesterIsNotActivePlayer()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["card-1"] },
                new Player { Id = "p2", Deck = ["card-1"] }
            ],
            cardDefinitions: BuildSupportCapableDefinitions("card-1"),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p1";
        game.State.PriorityPlayerId = "p2";
        game.State.Players[1].Hand.Add(new CardInstance
        {
            InstanceId = "hand-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
        });

        var request = new GameCardActionExecutionRequest(
            PlayerId: "p2",
            ActionId: "set-support:hand-1",
            SourceCardInstanceId: "hand-1",
            Arguments: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["supportSlotIndex"] = "0",
            });

        var ex = Assert.ThrowsException<InvalidOperationException>(() =>
            registry.ExecuteCardAction(game.Id, request, new RecordingSequentialExecutor()));

        Assert.AreEqual("Only the active player can execute hand card actions.", ex.Message);
    }

    [TestMethod]
    public void ExecuteCardAction_LeaderEffect_ExecutesSequentialEffect()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["leader-def", "card-1"] },
                new Player { Id = "p2", Deck = ["leader-def", "card-1"] }
            ],
            cardDefinitions: BuildDefinitionsWithLeaderEffects(),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p2";
        game.State.PriorityPlayerId = "p1";

        var leaderInstanceId = game.State.Players[1].LeaderCardInstance!.InstanceId;
        var request = new GameCardActionExecutionRequest(
            PlayerId: "p2",
            ActionId: $"leader-effect:{leaderInstanceId}:leader-main",
            SourceCardInstanceId: leaderInstanceId);

        var recordingExecutor = new RecordingSequentialExecutor();
        registry.ExecuteCardAction(game.Id, request, recordingExecutor);

        Assert.AreEqual(1, recordingExecutor.Contexts.Count);
        Assert.AreEqual("p2", recordingExecutor.Contexts[0].ActingPlayer.Id);
    }

    [TestMethod]
    public void GetCardActionTargets_LeaderEffect_ReturnsPrecomputedTargets()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["leader-def", "card-1"] },
                new Player { Id = "p2", Deck = ["leader-def", "card-1"] }
            ],
            cardDefinitions: BuildDefinitionsWithLeaderEffects(),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p2";
        game.State.PriorityPlayerId = "p1";

        var leaderInstanceId = game.State.Players[1].LeaderCardInstance!.InstanceId;
        var response = registry.GetCardActionTargets(
            game.Id,
            new GameCardActionTargetsRequest(
                PlayerId: "p2",
                ActionId: $"leader-effect:{leaderInstanceId}:leader-main",
                SourceCardInstanceId: leaderInstanceId),
            new GameEffectCanExecuteEvaluator(
                new EffectContextConditionEvaluator(),
                new EffectTargetResolver(),
                new GameValidTargetResultFactory(),
                new GameEffectConditionDiagnostics()));

        Assert.AreEqual($"leader-effect:{leaderInstanceId}:leader-main", response.ActionId);
        Assert.IsTrue(response.IsEnabled);
    }

    [TestMethod]
    public void ExecuteCardAction_LeaderRecovery_TurnsChakraFaceUp_AndRestsTheLeader()
    {
        // N-001/N-012's authored Recovery ("[Recovery] If it is the second turn or later, rest this card and
        // flip all of your CHAKRA face-up"): an AlterResources `Recover 5` step behind the
        // `isSecondTurnOrLater` execution condition. Both the argument the condition reads and the rest the
        // ability pays are supplied by the registry, so the real sequential executor has to turn the pool
        // back up in one submit.
        var game = CreateLeaderRecoveryGame(playerTurnCount: 3, resourcePool: 3);
        var leaderInstance = game.State.Players[1].LeaderCardInstance!;

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p2",
                ActionId: $"leader-effect:{leaderInstance.InstanceId}:recovery",
                SourceCardInstanceId: leaderInstance.InstanceId),
            CreateAlterResourcesExecutor());

        Assert.AreEqual(PlayerState.ChakraCardCount, game.State.Players[1].ResourcePool);
        Assert.IsTrue(leaderInstance.IsRested, "Recovery rests the leader as part of its cost");
    }

    [TestMethod]
    public void ExecuteCardAction_LeaderRecovery_RefusesTheFirstTurn_AndChangesNothing()
    {
        var game = CreateLeaderRecoveryGame(playerTurnCount: 1, resourcePool: 0);
        var leaderInstance = game.State.Players[1].LeaderCardInstance!;

        var ex = Assert.ThrowsException<InvalidOperationException>(() =>
            registry.ExecuteCardAction(
                game.Id,
                new GameCardActionExecutionRequest(
                    PlayerId: "p2",
                    ActionId: $"leader-effect:{leaderInstance.InstanceId}:recovery",
                    SourceCardInstanceId: leaderInstance.InstanceId),
                CreateAlterResourcesExecutor()));

        Assert.AreEqual("Recovery can only be activated starting from your second turn.", ex.Message);
        Assert.AreEqual(0, game.State.Players[1].ResourcePool);
        Assert.IsFalse(leaderInstance.IsRested);
    }

    [TestMethod]
    public void ExecuteCardAction_SuppliesTheIsSecondTurnOrLaterArgument_FromTheActingPlayersTurnCount()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["leader-def", "card-1"] },
                new Player { Id = "p2", Deck = ["leader-def", "card-1"] }
            ],
            cardDefinitions: BuildDefinitionsWithLeaderEffects(),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p2";
        game.State.PriorityPlayerId = "p1";

        var leaderInstanceId = game.State.Players[1].LeaderCardInstance!.InstanceId;
        var argumentKey = EffectExecutionConditionArgumentKey.IsSecondTurnOrLater.ToWireValue();

        var firstTurnExecutor = new RecordingSequentialExecutor();
        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p2",
                ActionId: $"leader-effect:{leaderInstanceId}:leader-main",
                SourceCardInstanceId: leaderInstanceId),
            firstTurnExecutor);

        Assert.AreEqual(bool.FalseString, firstTurnExecutor.Contexts[0].Arguments[argumentKey]);

        game.State.Players[1].TurnCount = 2;

        var laterTurnExecutor = new RecordingSequentialExecutor();
        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p2",
                ActionId: $"leader-effect:{leaderInstanceId}:leader-main",
                SourceCardInstanceId: leaderInstanceId),
            laterTurnExecutor);

        Assert.AreEqual(bool.TrueString, laterTurnExecutor.Contexts[0].Arguments[argumentKey]);
    }

    private static Dictionary<string, Card> BuildDefinitions(params string[] ids)
    {
        return ids.ToDictionary(
            keySelector: id => id,
            elementSelector: id => new Card
            {
                Id = id,
                DisplayName = id,
                Name = [id],
                Type = CardType.Character,
                Traits = [],
                Color = CardColor.Red,
                Description = string.Empty,
                Damage = 2,
                Power = 2,
                Conditions = [],
                Effects = []
            },
            comparer: StringComparer.Ordinal);
    }

    [TestMethod]
    public void ExecuteCardAction_LeaderEffect_RejectsActivation_WhenOncePerTurnEffectAlreadyUsed()
    {
        var game = CreateOncePerTurnLeaderGame();

        var leaderInstanceId = game.State.Players[1].LeaderCardInstance!.InstanceId;
        game.State.MarkEffectUsedThisTurn("p2", leaderInstanceId, "leader-main");

        var ex = Assert.ThrowsException<InvalidOperationException>(() =>
            registry.ExecuteCardAction(
                game.Id,
                new GameCardActionExecutionRequest(
                    PlayerId: "p2",
                    ActionId: $"leader-effect:{leaderInstanceId}:leader-main",
                    SourceCardInstanceId: leaderInstanceId),
                new RecordingSequentialExecutor()));

        Assert.AreEqual(EffectRestrictionMessages.OncePerTurn, ex.Message);
    }

    [TestMethod]
    public void ExecuteCardAction_LeaderEffect_MarksOncePerTurnEffectAsUsed()
    {
        var game = CreateOncePerTurnLeaderGame();

        var leaderInstanceId = game.State.Players[1].LeaderCardInstance!.InstanceId;
        Assert.IsFalse(game.State.IsEffectUsedThisTurn("p2", leaderInstanceId, "leader-main"));

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p2",
                ActionId: $"leader-effect:{leaderInstanceId}:leader-main",
                SourceCardInstanceId: leaderInstanceId),
            new RecordingSequentialExecutor());

        var record = game.State.EffectActivations.Single(entry => entry.EffectKey == "leader-main");
        Assert.AreEqual("p2", record.PlayerId);
        Assert.AreEqual(leaderInstanceId, record.SourceInstanceId);
    }

    [TestMethod]
    public void GetCardActionTargets_LeaderEffect_DisablesOncePerTurnEffectAfterUse()
    {
        var game = CreateOncePerTurnLeaderGame();

        var leaderInstanceId = game.State.Players[1].LeaderCardInstance!.InstanceId;
        var request = new GameCardActionTargetsRequest(
            PlayerId: "p2",
            ActionId: $"leader-effect:{leaderInstanceId}:leader-main",
            SourceCardInstanceId: leaderInstanceId);
        var evaluator = new GameEffectCanExecuteEvaluator(
            new EffectContextConditionEvaluator(),
            new EffectTargetResolver(),
            new GameValidTargetResultFactory(),
            new GameEffectConditionDiagnostics());

        var beforeUse = registry.GetCardActionTargets(game.Id, request, evaluator);
        Assert.IsTrue(beforeUse.IsEnabled);

        game.State.MarkEffectUsedThisTurn("p2", leaderInstanceId, "leader-main");

        var afterUse = registry.GetCardActionTargets(game.Id, request, evaluator);
        Assert.IsFalse(afterUse.IsEnabled);
        Assert.AreEqual(EffectRestrictionMessages.OncePerTurn, afterUse.DisabledReason);
    }

    /// <summary>
    /// A leader whose only effect is the authored Recovery shape ("[Recovery] If it is the second turn or
    /// later, rest this card and flip all of your CHAKRA face-up"): an AlterResources `Recover 5` step behind
    /// the `isSecondTurnOrLater` execution condition. p2 is the acting player.
    /// </summary>
    private GameInstance CreateLeaderRecoveryGame(int playerTurnCount, int resourcePool)
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["leader-def", "card-1"] },
                new Player { Id = "p2", Deck = ["leader-def", "card-1"] }
            ],
            cardDefinitions: BuildDefinitionsWithLeaderEffects(),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p2";
        game.State.PriorityPlayerId = "p1";
        game.State.TurnNumber = 3;
        game.State.Players[1].TurnCount = playerTurnCount;
        game.State.Players[1].ResourcePool = resourcePool;

        var leaderCard = (LeaderCard)game.State.CardDefinitions["leader-def"];
        leaderCard.Effects =
        [
            new EffectSpec
            {
                Id = "recovery",
                EffectType = EffectKind.Recovery,
                Timing = EffectTiming.ActivateMain,
                RuntimeEffectType = RuntimeEffects.AlterResources,
                ExecutionCondition = new EffectExecutionConditionSpec
                {
                    ArgumentKey = EffectExecutionConditionArgumentKey.IsSecondTurnOrLater,
                    ExpectedValue = bool.TrueString,
                },
                ChakraAdjustments =
                [
                    new ChakraAdjustmentSpec
                    {
                        TargetRange = EffectTargetRange.Self,
                        Operation = ChakraAdjustmentOperation.Recover,
                        Amount = PlayerState.ChakraCardCount,
                    }
                ],
            }
        ];

        return game;
    }

    /// <summary>The real sequential executor carrying the single runtime effect the authored recovery uses.</summary>
    private static IGameSequentialEffectExecutor CreateAlterResourcesExecutor()
    {
        var canExecuteEvaluator = new GameEffectCanExecuteEvaluator(
            new EffectContextConditionEvaluator(),
            new EffectTargetResolver(),
            new GameValidTargetResultFactory(),
            new GameEffectConditionDiagnostics());

        return new GameSequentialEffectExecutor(
            new GameCardEffectRegistry(
            [
                new AlterResourcesEffect(new GameRuntimeEffectSpecResolver(), canExecuteEvaluator)
            ]));
    }

    [TestMethod]
    public void ExecuteCardAction_CharacterAbility_ExecutesTheSourceCardsAbility_AndSpendsItsOncePerTurn()
    {
        // N-011's shape: the ability belongs to a battlefield character, not the leader, and it is published
        // as `character-ability:{instanceId}:{effectKey}`. A second ability card keeps the MainPhase open after
        // the first activation, so the retry reaches the once-per-turn guard instead of the phase guard.
        var game = CreateCharacterAbilityGame(abilityInstanceIds: ["ino-1", "shikamaru-1"]);
        var executor = new RecordingSequentialExecutor();

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p2",
                ActionId: "character-ability:ino-1:team-10-boost",
                SourceCardInstanceId: "ino-1"),
            executor);

        Assert.AreEqual(1, executor.Contexts.Count);
        Assert.AreEqual("p2", executor.Contexts[0].ActingPlayer.Id);
        Assert.AreEqual(
            "team-10-boost",
            executor.Contexts[0].Arguments[ReactiveEffectExecutionConstants.AbilityKeyArgument]);
        Assert.AreEqual("ino-1", executor.Contexts[0].SourceCardInstance?.InstanceId);

        // "[Once Per Turn]" is spent by the activation: the same ability cannot be activated again.
        var ex = Assert.ThrowsException<InvalidOperationException>(() =>
            registry.ExecuteCardAction(
                game.Id,
                new GameCardActionExecutionRequest(
                    PlayerId: "p2",
                    ActionId: "character-ability:ino-1:team-10-boost",
                    SourceCardInstanceId: "ino-1"),
                new RecordingSequentialExecutor()));
        Assert.AreEqual(EffectRestrictionMessages.OncePerTurn, ex.Message);
    }

    [TestMethod]
    public void GetCardActionTargets_CharacterAbility_ReturnsTheCardsAbilityTargets()
    {
        var game = CreateCharacterAbilityGame(abilityInstanceIds: ["ino-1"]);

        var response = registry.GetCardActionTargets(
            game.Id,
            new GameCardActionTargetsRequest(
                PlayerId: "p2",
                ActionId: "character-ability:ino-1:team-10-boost",
                SourceCardInstanceId: "ino-1"),
            new GameEffectCanExecuteEvaluator(
                new EffectContextConditionEvaluator(),
                new EffectTargetResolver(),
                new GameValidTargetResultFactory(),
                new GameEffectConditionDiagnostics()));

        Assert.AreEqual("character-ability:ino-1:team-10-boost", response.ActionId);
        Assert.IsTrue(response.IsEnabled, response.DisabledReason ?? string.Empty);
    }

    [TestMethod]
    public void ExecuteCardAction_CharacterAbility_ThrowsOutsideTheOwnersMainPhase()
    {
        var game = CreateCharacterAbilityGame(abilityInstanceIds: ["ino-1"]);
        game.State.Phase = GamePhase.ActionStep;

        var ex = Assert.ThrowsException<InvalidOperationException>(() =>
            registry.ExecuteCardAction(
                game.Id,
                new GameCardActionExecutionRequest(
                    PlayerId: "p2",
                    ActionId: "character-ability:ino-1:team-10-boost",
                    SourceCardInstanceId: "ino-1"),
                new RecordingSequentialExecutor()));

        Assert.AreEqual("Card abilities can only be activated during MainPhase.", ex.Message);
    }

    [TestMethod]
    public void ExecuteCardAction_CharacterAbility_ThrowsForTheNonActivePlayer()
    {
        var game = CreateCharacterAbilityGame(abilityInstanceIds: ["ino-1"]);

        var ex = Assert.ThrowsException<InvalidOperationException>(() =>
            registry.ExecuteCardAction(
                game.Id,
                new GameCardActionExecutionRequest(
                    PlayerId: "p1",
                    ActionId: "character-ability:ino-1:team-10-boost",
                    SourceCardInstanceId: "ino-1"),
                new RecordingSequentialExecutor()));

        // p1 is not the active player, so the window guard fires before the source lookup can fail.
        Assert.AreEqual("Only the active player can activate card abilities.", ex.Message);
    }

    [TestMethod]
    public void ExecuteCardAction_CharacterAbility_KeepsTheMainPhaseOpen_WhileAnotherAbilityIsStillLegal()
    {
        // The auto-end probe: activating one battlefield ability must not end the MainPhase while a second
        // character still publishes an activatable ability (without the probe the phase would auto-advance).
        var game = CreateCharacterAbilityGame(abilityInstanceIds: ["ino-1", "shikamaru-1"]);

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p2",
                ActionId: "character-ability:ino-1:team-10-boost",
                SourceCardInstanceId: "ino-1"),
            new RecordingSequentialExecutor());

        Assert.AreEqual(GamePhase.MainPhase, game.State.Phase);
    }

    [TestMethod]
    public void ExecuteCardAction_CharacterAbility_AutoEndsTheMainPhase_WhenNoOtherActionIsLegal()
    {
        // Same game with a single ability card: once it is spent (and every character is rested, so no battle
        // can be declared) the MainPhase has no legal action left and must not strand the player on it.
        var game = CreateCharacterAbilityGame(abilityInstanceIds: ["ino-1"]);

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p2",
                ActionId: "character-ability:ino-1:team-10-boost",
                SourceCardInstanceId: "ino-1"),
            new RecordingSequentialExecutor());

        Assert.AreNotEqual(GamePhase.MainPhase, game.State.Phase);
    }

    [TestMethod]
    public void ExecuteCardAction_CharacterAbility_Throws_ForTheSummonRequirementNode()
    {
        // N-022's `tribute-requirement` node is a non-subordinate root carrying a MainPhase timing, so the
        // ability path used to accept a direct submit of it and re-ran the whole reveal + summon chain - an
        // ability the board never offers. It is the summon requirement, paid by the summon action's own flow.
        var game = CreateCharacterAbilityGame(abilityInstanceIds: [], summonRequirementInstanceIds: ["manda-1"]);

        var ex = Assert.ThrowsException<InvalidOperationException>(() =>
            registry.ExecuteCardAction(
                game.Id,
                new GameCardActionExecutionRequest(
                    PlayerId: "p2",
                    ActionId: "character-ability:manda-1:tribute-requirement",
                    SourceCardInstanceId: "manda-1"),
                new RecordingSequentialExecutor()));

        Assert.AreEqual(EffectRestrictionMessages.NotAnActivatedAbility, ex.Message);
    }

    [TestMethod]
    public void ExecuteCardAction_CharacterAbility_Throws_ForAChainStep()
    {
        // `on-summon` is a subordinate step of the summon chain ("[On Summon] Reveal the top card..."), reached
        // through its parent's success branch, so it has no activation window of its own - even though the
        // ingestion gave it a MainPhase timing.
        var game = CreateCharacterAbilityGame(abilityInstanceIds: [], summonRequirementInstanceIds: ["manda-1"]);

        var ex = Assert.ThrowsException<InvalidOperationException>(() =>
            registry.ExecuteCardAction(
                game.Id,
                new GameCardActionExecutionRequest(
                    PlayerId: "p2",
                    ActionId: "character-ability:manda-1:on-summon",
                    SourceCardInstanceId: "manda-1"),
                new RecordingSequentialExecutor()));

        Assert.AreEqual(EffectRestrictionMessages.NotAnActivatedAbility, ex.Message);
    }

    [TestMethod]
    public void GetCardActionTargets_CharacterAbility_DisablesTheSummonRequirementNode()
    {
        var game = CreateCharacterAbilityGame(abilityInstanceIds: [], summonRequirementInstanceIds: ["manda-1"]);

        var response = registry.GetCardActionTargets(
            game.Id,
            new GameCardActionTargetsRequest(
                PlayerId: "p2",
                ActionId: "character-ability:manda-1:tribute-requirement",
                SourceCardInstanceId: "manda-1"),
            new GameEffectCanExecuteEvaluator(
                new EffectContextConditionEvaluator(),
                new EffectTargetResolver(),
                new GameValidTargetResultFactory(),
                new GameEffectConditionDiagnostics()));

        Assert.IsFalse(response.IsEnabled);
        Assert.AreEqual(EffectRestrictionMessages.NotAnActivatedAbility, response.DisabledReason);
        Assert.AreEqual(0, response.ValidTargets.Count);
    }

    [TestMethod]
    public void ExecuteCardAction_CharacterAbility_Throws_ForASupportEffect()
    {
        // N-015's support effect is a non-subordinate `effectType: Support` root carrying a MainPhase timing, so
        // the timing window alone cannot tell it apart from an ability. A support is activated through the
        // support path (from the hand or the support area), never as `character-ability:`, so a crafted submit
        // is refused instead of running the K.O. from the character field.
        var game = CreateCharacterAbilityGame(abilityInstanceIds: [], supportEffectInstanceIds: ["sasuke-1"]);

        var ex = Assert.ThrowsException<InvalidOperationException>(() =>
            registry.ExecuteCardAction(
                game.Id,
                new GameCardActionExecutionRequest(
                    PlayerId: "p2",
                    ActionId: "character-ability:sasuke-1:KO-all-targets",
                    SourceCardInstanceId: "sasuke-1"),
                new RecordingSequentialExecutor()));

        Assert.AreEqual(EffectRestrictionMessages.NotAnActivatedAbility, ex.Message);
    }

    [TestMethod]
    public void GetCardActionTargets_CharacterAbility_DisablesTheSupportEffectNode()
    {
        var game = CreateCharacterAbilityGame(abilityInstanceIds: [], supportEffectInstanceIds: ["sasuke-1"]);

        var response = registry.GetCardActionTargets(
            game.Id,
            new GameCardActionTargetsRequest(
                PlayerId: "p2",
                ActionId: "character-ability:sasuke-1:KO-all-targets",
                SourceCardInstanceId: "sasuke-1"),
            new GameEffectCanExecuteEvaluator(
                new EffectContextConditionEvaluator(),
                new EffectTargetResolver(),
                new GameValidTargetResultFactory(),
                new GameEffectConditionDiagnostics()));

        Assert.IsFalse(response.IsEnabled);
        Assert.AreEqual(EffectRestrictionMessages.NotAnActivatedAbility, response.DisabledReason);
        Assert.AreEqual(0, response.ValidTargets.Count);
    }

    [TestMethod]
    public void ExecuteCardAction_CharacterAbility_AutoEndsTheMainPhase_WhenOnlyASupportEffectRemains()
    {
        // The auto-end probe applies the same shape gate as the chip builder *before* the can-execute
        // evaluator: a support node would otherwise evaluate as executable and keep the MainPhase open with
        // nothing the player can actually activate (the card has no ability on the field).
        var game = CreateCharacterAbilityGame(
            abilityInstanceIds: ["ino-1"],
            supportEffectInstanceIds: ["sasuke-1"]);

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p2",
                ActionId: "character-ability:ino-1:team-10-boost",
                SourceCardInstanceId: "ino-1"),
            new RecordingSequentialExecutor());

        Assert.AreNotEqual(GamePhase.MainPhase, game.State.Phase);
    }

    [TestMethod]
    public void ExecuteCardAction_CharacterAbility_AutoEndsTheMainPhase_WhenOnlyTheSummonRequirementRemains()
    {
        // The auto-end probe applies the same shape gate as the chip builder *before* the can-execute evaluator:
        // a summon-requirement node that carries no selection of its own would otherwise evaluate as executable
        // and keep the MainPhase open with nothing the player can actually activate.
        var game = CreateCharacterAbilityGame(abilityInstanceIds: ["ino-1"], summonRequirementInstanceIds: ["manda-1"]);
        var requirementDefinition = (CharacterCard)game.State.CardDefinitions["manda-1"];
        requirementDefinition.Effects =
        [
            new EffectSpec
            {
                Id = "tribute-requirement",
                EffectType = EffectKind.SummonRequirement,
                Timing = EffectTiming.DuringYourMain,
                RuntimeEffectType = RuntimeEffects.Tribute,
                ExecutionTargetSource = EffectExecutionTargetSource.None,
                TargetRules = new EffectTargetRuleSet(),
            }
        ];

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p2",
                ActionId: "character-ability:ino-1:team-10-boost",
                SourceCardInstanceId: "ino-1"),
            new RecordingSequentialExecutor());

        Assert.AreNotEqual(GamePhase.MainPhase, game.State.Phase);
    }

    private static Dictionary<string, Card> BuildDefinitionsWithCharacterAbilities(params string[] ids)
    {
        return ids.ToDictionary(
            keySelector: id => id,
            elementSelector: id => (Card)new CharacterCard
            {
                Id = id,
                DisplayName = id,
                Name = [id],
                Type = CardType.Character,
                Traits = [],
                Color = CardColor.Red,
                Description = string.Empty,
                Conditions = [],
                Effects =
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
                ],
            },
            comparer: StringComparer.Ordinal);
    }

    /// <summary>
    /// The summon-requirement shape of a special-summon card (N-022/N-014/N-005/N-003): the requirement is a
    /// non-subordinate <c>Tribute</c> root node carrying a MainPhase timing, followed by its subordinate
    /// `[On Summon]` chain steps.
    /// </summary>
    private static Dictionary<string, Card> BuildDefinitionsWithSummonRequirements(params string[] ids)
    {
        return ids.ToDictionary(
            keySelector: id => id,
            elementSelector: id => (Card)new CharacterCard
            {
                Id = id,
                DisplayName = id,
                Name = [id],
                Type = CardType.Character,
                Traits = [],
                Color = CardColor.Blue,
                Description = string.Empty,
                Conditions = [EffectConditionKeywords.SummonRequirements],
                CannotBeNormalSummoned = true,
                Effects =
                [
                    new EffectSpec
                    {
                        Id = "tribute-requirement",
                        EffectType = EffectKind.SummonRequirement,
                        Timing = EffectTiming.DuringYourMain,
                        RuntimeEffectType = RuntimeEffects.Tribute,
                        OnSuccessEffectId = "on-summon",
                        TargetRules = new EffectTargetRuleSet
                        {
                            ExactTargetCount = 2,
                            Rules =
                            [
                                new EffectTargetRule
                                {
                                    Scope = EffectTargetRange.Self,
                                    InZone = PlayerZone.CharacterField,
                                    TributeRole = TributeTargetRole.TributeMaterial,
                                    ExactSelectedTargetCount = 1,
                                    Restriction = new ZoneCardRestriction(),
                                },
                                new EffectTargetRule
                                {
                                    Scope = EffectTargetRange.Self,
                                    InZone = PlayerZone.Hand,
                                    TributeRole = TributeTargetRole.SummonCandidate,
                                    ExactSelectedTargetCount = 1,
                                    Restriction = new ZoneCardRestriction(),
                                },
                            ],
                            TributeComposition = new TributeTargetComposition
                            {
                                ExactTributeCount = 1,
                                RequireSingleSummonTarget = true,
                                RequireDistinctSummonAndTributes = true,
                            },
                        },
                    },
                    new EffectSpec
                    {
                        Id = "on-summon",
                        EffectType = EffectKind.Activated,
                        Timing = EffectTiming.DuringYourMain,
                        RuntimeEffectType = RuntimeEffects.SummonCard,
                        IsSubordinate = true,
                    },
                ],
            },
            comparer: StringComparer.Ordinal);
    }

    /// <summary>
    /// p2's MainPhase with the given battlefield characters and nothing else legal: no hand, no support area,
    /// every character rested and the leader rested, so an enabled ability is the only action in the phase.
    /// <paramref name="summonRequirementInstanceIds"/> puts a special-summon card next to them, so a test can
    /// check that its summon-requirement node is not treated as an ability;
    /// <paramref name="supportEffectInstanceIds"/> puts a support-capable character there, so a test can check
    /// that its `effectType: Support` node is not treated as one either.
    /// </summary>
    private GameInstance CreateCharacterAbilityGame(
        IReadOnlyList<string> abilityInstanceIds,
        IReadOnlyList<string>? summonRequirementInstanceIds = null,
        IReadOnlyList<string>? supportEffectInstanceIds = null)
    {
        var summonRequirementIds = summonRequirementInstanceIds ?? [];
        var supportEffectIds = supportEffectInstanceIds ?? [];
        var definitions = BuildDefinitionsWithLeaderEffects();
        foreach (var entry in BuildDefinitionsWithCharacterAbilities([.. abilityInstanceIds]))
        {
            definitions[entry.Key] = entry.Value;
        }

        foreach (var entry in BuildDefinitionsWithSummonRequirements([.. summonRequirementIds]))
        {
            definitions[entry.Key] = entry.Value;
        }

        foreach (var entry in BuildDefinitionsWithSupportEffects([.. supportEffectIds]))
        {
            definitions[entry.Key] = entry.Value;
        }

        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["leader-def", "card-1"] },
                new Player { Id = "p2", Deck = ["leader-def", "card-1"] }
            ],
            cardDefinitions: definitions,
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p2";
        game.State.PriorityPlayerId = "p2";
        game.State.TurnNumber = 3;
        game.State.Players[1].TurnCount = 3;
        game.State.Players[1].Hand.Clear();
        game.State.Players[1].SupportZone.Clear();

        foreach (var instanceId in abilityInstanceIds.Concat(summonRequirementIds).Concat(supportEffectIds))
        {
            game.State.Players[1].Battlefield.Add(new CardInstance
            {
                InstanceId = instanceId,
                CardDefinitionId = instanceId,
                OwnerPlayerId = "p2",
                ControllerPlayerId = "p2",
                IsRested = true,
            });
        }

        game.State.Players[1].LeaderCardInstance!.IsRested = true;

        return game;
    }

    /// <summary>
    /// The support-effect shape (N-015): a normally summonable support-capable character whose support effect
    /// is a non-subordinate `effectType: Support` root node carrying a MainPhase timing ("[During Your Main]
    /// K.O. all Characters"). Support effects are activated from the hand or the support area, so this node is
    /// never an ability of a card sitting on the character field.
    /// </summary>
    private static Dictionary<string, Card> BuildDefinitionsWithSupportEffects(params string[] ids)
    {
        return ids.ToDictionary(
            keySelector: id => id,
            elementSelector: id => (Card)new CharacterCard
            {
                Id = id,
                DisplayName = id,
                Name = [id],
                Type = CardType.Character,
                Traits = [],
                Color = CardColor.Blue,
                Description = string.Empty,
                Conditions = [],
                SupportName = "Chidori: One Thousand Birds",
                SupportEffect = "[During Your Main] K.O. all Characters.",
                Effects =
                [
                    new EffectSpec
                    {
                        Id = "KO-all-targets",
                        EffectType = EffectKind.Support,
                        Timing = EffectTiming.DuringYourMain,
                        RuntimeEffectType = RuntimeEffects.DestroyCard,
                        TargetRange = EffectTargetRange.Any,
                        ChakraCost = 2,
                        ExecutionTargetSource = EffectExecutionTargetSource.SelectedTargets,
                    }
                ],
            },
            comparer: StringComparer.Ordinal);
    }

    private GameInstance CreateOncePerTurnLeaderGame()
    {
        var game = registry.Create(
            players:
            [
                new Player { Id = "p1", Deck = ["leader-def", "card-1"] },
                new Player { Id = "p2", Deck = ["leader-def", "card-1"] }
            ],
            cardDefinitions: BuildDefinitionsWithLeaderEffects(),
            random: new FixedIndexRandom(0));

        game.PendingPrompts.Clear();
        game.State.Phase = GamePhase.MainPhase;
        game.State.ActivePlayerId = "p2";
        game.State.PriorityPlayerId = "p1";
        game.State.TurnNumber = 4;

        var leaderCard = (LeaderCard)game.State.CardDefinitions["leader-def"];
        leaderCard.Effects =
        [
            new EffectSpec
            {
                Id = "leader-main",
                EffectType = EffectKind.Activated,
                Timing = EffectTiming.ActivateMain,
                RuntimeEffectType = RuntimeEffects.AlterResources,
                GlobalRestrictions = EffectRestrictions.OncePerTurn,
                TargetRules = new EffectTargetRuleSet
                {
                    MinimumTargetCount = 0,
                }
            }
        ];

        return game;
    }


    private static Dictionary<string, Card> BuildDefinitionsWithLeaderEffects()
    {
        return new Dictionary<string, Card>(StringComparer.Ordinal)
        {
            ["card-1"] = new Card
            {
                Id = "card-1",
                DisplayName = "card-1",
                Name = ["card-1"],
                Type = CardType.Character,
                Traits = [],
                Color = CardColor.Red,
                Description = string.Empty,
                Conditions = [],
                Effects = []
            },
            ["leader-def"] = new LeaderCard
            {
                Id = "leader-def",
                DisplayName = "Leader",
                Name = ["Leader"],
                Type = CardType.Leader,
                Traits = ["Leader"],
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
            }
        };
    }

    private static Dictionary<string, Card> BuildSupportCapableDefinitions(params string[] ids)
    {
        return ids.ToDictionary(
            keySelector: id => id,
            elementSelector: id => (Card)new CharacterCard
            {
                Id = id,
                DisplayName = id,
                Name = [id],
                Type = CardType.Character,
                Traits = [],
                Color = CardColor.Red,
                Description = string.Empty,
                Conditions = [],
                Effects = [],
                SupportEffect = "Deal 1",
            },
            comparer: StringComparer.Ordinal);
    }

    private static Dictionary<string, Card> BuildDefinitionsWithSummonRequirement()
    {
        return new Dictionary<string, Card>(StringComparer.Ordinal)
        {
            ["card-1"] = new CharacterCard
            {
                Id = "card-1",
                DisplayName = "Tribute Material",
                Name = ["Tribute Material"],
                Type = CardType.Character,
                Traits = [],
                Color = CardColor.Red,
                Description = string.Empty,
                Damage = 2,
                Power = 2,
                Health = 2,
                Conditions = [],
                Effects = []
            },
            ["tribute-card"] = new CharacterCard
            {
                Id = "tribute-card",
                DisplayName = "Tribute Summon Card",
                Name = ["Tribute Summon Card"],
                Type = CardType.Character,
                Traits = [],
                Color = CardColor.Blue,
                Description = string.Empty,
                Damage = 3,
                Power = 3,
                Health = 3,
                CannotBeNormalSummoned = true,
                Conditions = [EffectConditionKeywords.SummonRequirements],
                Effects =
                [
                    new EffectSpec
                    {
                        Id = "tribute-1",
                        EffectType = EffectKind.Activated,
                        Timing = EffectTiming.ActivateMain,
                        RuntimeEffectType = RuntimeEffects.Tribute,
                        TargetRules = new EffectTargetRuleSet
                        {
                            TributeComposition = new TributeTargetComposition
                            {
                                ExactTributeCount = 1,
                                RequireSingleSummonTarget = false,
                                RequireDistinctSummonAndTributes = true,
                            },
                            Rules =
                            [
                                new EffectTargetRule
                                {
                                    Scope = EffectTargetRange.Self,
                                    InZone = PlayerZone.CharacterField,
                                    TributeRole = TributeTargetRole.TributeMaterial,
                                    ExactSelectedTargetCount = 1,
                                    Restriction = new ZoneCardRestriction(),
                                }
                            ]
                        }
                    }
                ]
            },
            ["leader-def"] = new LeaderCard
            {
                Id = "leader-def",
                DisplayName = "Leader",
                Name = ["Leader"],
                Type = CardType.Leader,
                Traits = ["Leader"],
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
            }
        };
    }

    private static void SetQuickSupportEffect(GameState state, string cardDefinitionId, string effectTypeKey)
    {
        var supportDefinition = (CharacterCard)state.CardDefinitions[cardDefinitionId];
        supportDefinition.Effects =
        [
            new EffectSpec
            {
                Id = effectTypeKey,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                RuntimeEffectType = RuntimeEffects.ChangeValues,
            }
        ];
    }

    private sealed class FixedIndexRandom(int fixedIndex) : Random
    {
        public override int Next(int maxValue)
        {
            if (maxValue <= 0)
            {
                throw new ArgumentOutOfRangeException(nameof(maxValue), "maxValue must be positive.");
            }

            return fixedIndex % maxValue;
        }
    }

    private sealed class RecordingSequentialExecutor : IGameSequentialEffectExecutor
    {
        public List<GameCardEffectContext> Contexts { get; } = [];

        public ErrorOr<Success> Execute(GameCardEffectContext context)
        {
            Contexts.Add(context);
            return Result.Success;
        }

        public ErrorOr<Success> Resume(
            GameInstance game,
            PendingEffectContinuation continuation,
            IReadOnlyList<GameEffectTargetReference> selection)
        {
            return Result.Success;
        }
    }

    private sealed class AttackerUnrestingSequentialExecutor : IGameSequentialEffectExecutor
    {
        public ErrorOr<Success> Execute(GameCardEffectContext context)
        {
            if (context.SourceCardInstance is not null)
            {
                context.SourceCardInstance.IsRested = false;
            }

            return Result.Success;
        }

        public ErrorOr<Success> Resume(
            GameInstance game,
            PendingEffectContinuation continuation,
            IReadOnlyList<GameEffectTargetReference> selection)
        {
            return Result.Success;
        }
    }

    private sealed class RecordingStackEffect(string effectTypeKey, List<string> order) : IGameCardEffect
    {
        public string EffectTypeKey => effectTypeKey;
        public CanExecuteResult CanExecute(GameCardEffectContext context)
        {
            return new CanExecuteResult { CanExecute = true };
        }

        public IReadOnlyList<GameEffectTargetReference> GetValidTargets(GameCardEffectContext context)
        {
            return [];
        }

        public ErrorOr<Success> Execute(GameCardEffectContext context, IReadOnlyList<GameEffectTargetReference> selectedTargets)
        {
            order.Add(effectTypeKey);
            return Result.Success;
        }
    }
}