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
        game.State.SetSummonCardReady("p1", false);

        registry.AdvancePhase(game.Id);
        registry.AdvancePhase(game.Id);

        Assert.AreEqual(GamePhase.StartOfMainPhase, game.State.Phase);
        Assert.AreEqual("p2", game.State.ActivePlayerId);
        Assert.AreEqual(2, game.State.TurnNumber);
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
    public void ExecuteCardAction_BattleAction_StaysRested_WhenAttackingEffectAttemptsToReadyAttacker()
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

        Assert.IsTrue(game.State.Players[0].Battlefield[0].IsRested);
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

        var enqueueExecutor = new StackEnqueueingSequentialExecutor();

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p2",
                ActionId: "activate-support:support-1",
                SourceCardInstanceId: "support-1"),
            enqueueExecutor);

        game.State.PriorityPlayerId = "p2";

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p2",
                ActionId: "activate-support:support-2",
                SourceCardInstanceId: "support-2"),
            enqueueExecutor);

        Assert.AreEqual(2, game.State.EffectResolutionStack.Count);
        Assert.AreEqual("stack-alpha", game.State.EffectResolutionStack[0].EffectTypeKey);
        Assert.AreEqual("stack-beta", game.State.EffectResolutionStack[1].EffectTypeKey);

        var resolutionOrder = new List<string>();
        var chainResolver = new GameEffectChainResolver(new GameCardEffectRegistry(
        [
            new RecordingStackEffect("stack-alpha", resolutionOrder),
            new RecordingStackEffect("stack-beta", resolutionOrder),
        ]));

        var result = chainResolver.Resolve(game, actingPlayerId: "p2", new PassiveChainResolutionOptions());

        Assert.IsFalse(result.IsError);
        CollectionAssert.AreEqual(new[] { "stack-beta", "stack-alpha" }, resolutionOrder.ToArray());
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

        var enqueueExecutor = new StackEnqueueingSequentialExecutor();

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p1",
                ActionId: "activate-support:support-1",
                SourceCardInstanceId: "support-1"),
            enqueueExecutor);

        game.State.PriorityPlayerId = "p1";

        registry.ExecuteCardAction(
            game.Id,
            new GameCardActionExecutionRequest(
                PlayerId: "p1",
                ActionId: "activate-support:support-2",
                SourceCardInstanceId: "support-2"),
            enqueueExecutor);

        Assert.AreEqual(2, game.State.EffectResolutionStack.Count);
        Assert.AreEqual("stack-gamma", game.State.EffectResolutionStack[0].EffectTypeKey);
        Assert.AreEqual("stack-delta", game.State.EffectResolutionStack[1].EffectTypeKey);

        var resolutionOrder = new List<string>();
        var chainResolver = new GameEffectChainResolver(new GameCardEffectRegistry(
        [
            new RecordingStackEffect("stack-gamma", resolutionOrder),
            new RecordingStackEffect("stack-delta", resolutionOrder),
        ]));

        var result = chainResolver.Resolve(game, actingPlayerId: "p1", new PassiveChainResolutionOptions());

        Assert.IsFalse(result.IsError);
        CollectionAssert.AreEqual(new[] { "stack-delta", "stack-gamma" }, resolutionOrder.ToArray());
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
    public void ExecuteCardAction_ActivateSupport_ExecutesSequentialEffect_AndSwapsPriority()
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
        game.State.Players[1].SupportZone.Add(new CardInstance
        {
            InstanceId = "support-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p2",
            ControllerPlayerId = "p2",
        });

        var recordingExecutor = new RecordingSequentialExecutor();
        var request = new GameCardActionExecutionRequest(
            PlayerId: "p2",
            ActionId: "activate-support:support-1",
            SourceCardInstanceId: "support-1");

        registry.ExecuteCardAction(game.Id, request, recordingExecutor);

        Assert.AreEqual(1, recordingExecutor.Contexts.Count);
        Assert.AreEqual("support-1", recordingExecutor.Contexts[0].SourceCardInstance?.InstanceId);
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
    }

    private sealed class StackEnqueueingSequentialExecutor : IGameSequentialEffectExecutor
    {
        public ErrorOr<Success> Execute(GameCardEffectContext context)
        {
            var effectTypeKey = context.SourceCardDefinition.Effects.FirstOrDefault()?.Id;
            if (string.IsNullOrWhiteSpace(effectTypeKey))
            {
                return Result.Success;
            }

            context.Game.State.EffectResolutionStack.Add(new EffectResolutionStackEntry
            {
                SourcePlayerId = context.ActingPlayer.Id,
                SourceZone = PlayerZone.SupportZone,
                SourceCardInstanceId = context.SourceCardInstance?.InstanceId ?? string.Empty,
                EffectTypeKey = effectTypeKey,
            });

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