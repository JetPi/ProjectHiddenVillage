using ErrorOr;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class GameSequentialEffectExecutorTests
{
    [TestMethod]
    public void Execute_DoesNotImplicitlyContinueByDefinitionOrder_WhenNoSuccessBranchIsDefined()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(SummonCardEffect.EffectKey, observedSpecIds),
            new RecordingEffect(ModifyAttributeEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "step-1",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "step-2",
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        CollectionAssert.AreEqual(new[] { "step-1" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_UsesSuccessBranchWiring_IrrespectiveOfDefinitionOrder()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(SummonCardEffect.EffectKey, observedSpecIds),
            new RecordingEffect(ModifyAttributeEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "start",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                OnSuccessEffectId = "end",
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "middle",
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "end",
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        CollectionAssert.AreEqual(new[] { "start", "end" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_StartsFromFirstIndependentEffect_AndSkipsSubordinateEntryEffects()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(SummonCardEffect.EffectKey, observedSpecIds),
            new RecordingEffect(ModifyAttributeEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "non-entry-first",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "subordinate-second",
                IsSubordinate = true,
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        CollectionAssert.AreEqual(new[] { "non-entry-first" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_SkipsExecution_WhenSourceCardIsSuppressedWhileOnField()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(SummonCardEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "step-1",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition);
        context.SourceCardInstance!.EffectsSuppressedWhileOnField = true;

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(0, observedSpecIds.Count);
    }

    [TestMethod]
    public void Execute_StopsWhenEffectReturnsError()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(SummonCardEffect.EffectKey, observedSpecIds),
            new FailingEffect(ModifyAttributeEffect.EffectKey),
            new RecordingEffect(DestroyCardEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "step-1",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                OnSuccessEffectId = "step-2",
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "step-2",
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "step-3",
                RuntimeEffectType = RuntimeEffects.DestroyCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition);

        var result = executor.Execute(context);

        Assert.IsTrue(result.IsError);
        Assert.AreEqual("Game.Effect.Sequential.StepFailed", result.FirstError.Code);
        CollectionAssert.AreEqual(new[] { "step-1" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Resolve_UsesActiveEffectSpecIdArgument_WhenProvided()
    {
        var resolver = new GameRuntimeEffectSpecResolver();
        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "first",
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "second",
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(
            sourceDefinition,
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                [ReactiveEffectExecutionConstants.ActiveEffectSpecIdArgument] = "second",
            });

        var resolved = resolver.Resolve(context, RuntimeEffects.ChangeValues);

        Assert.IsNotNull(resolved);
        Assert.AreEqual("second", resolved.Id);
    }

    [TestMethod]
    public void Execute_UsesSourceCardTarget_WhenEffectConfiguredWithSourceCardTargetSource()
    {
        IReadOnlyList<GameEffectTargetReference>? observedTargets = null;
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new InspectingTargetsEffect(
                SummonCardEffect.EffectKey,
                targets => observedTargets = targets),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "step-source",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ExecutionTargetSource = EffectExecutionTargetSource.SourceCard,
                OnSuccessEffectId = null,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        Assert.IsNotNull(observedTargets);
        Assert.AreEqual(1, observedTargets.Count);
        Assert.AreEqual("source-1", observedTargets[0].CardInstanceId);
        Assert.AreEqual(PlayerZone.CharacterField, observedTargets[0].Zone);
        Assert.AreEqual("p1", observedTargets[0].PlayerId);
    }

    [TestMethod]
    public void Execute_AutoSelectsAllValidTargets_WhenEffectTargetRulesEnableAutoSelectAll()
    {
        IReadOnlyList<GameEffectTargetReference>? observedTargets = null;
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new InspectingTargetsEffect(
                DestroyCardEffect.EffectKey,
                targets => observedTargets = targets),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "step-auto-all",
                RuntimeEffectType = RuntimeEffects.DestroyCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Opponent,
                ExecutionTargetSource = EffectExecutionTargetSource.SelectedTargets,
                ContextRules = [],
                OnSuccessEffectId = null,
                TargetRules = new EffectTargetRuleSet
                {
                    AutoSelectAllValidTargets = true,
                    Rules =
                    [
                        new EffectTargetRule
                        {
                            Scope = EffectTargetRange.Opponent,
                            InZone = PlayerZone.CharacterField,
                            Restriction = new ZoneCardRestriction
                            {
                                Predicates = []
                            }
                        }
                    ]
                }
            });

        var context = CreateContext(
            sourceDefinition,
            playerTwoFieldCards:
            [
                CreateCardOnField("opponent-card", "opponent-card-inst", "p2", "Opponent Card")
            ]);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        Assert.IsNotNull(observedTargets);
        Assert.AreEqual(1, observedTargets.Count);
        Assert.AreEqual("opponent-card-inst", observedTargets[0].CardInstanceId);
        Assert.AreEqual("p2", observedTargets[0].PlayerId);
        Assert.AreEqual(PlayerZone.CharacterField, observedTargets[0].Zone);
    }

    [TestMethod]
    public void Execute_FiltersSelectedTarget_WhenTargetIsImmuneToOpponentSupportEffects()
    {
        IReadOnlyList<GameEffectTargetReference>? observedTargets = null;
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new InspectingTargetsEffect(
                DestroyCardEffect.EffectKey,
                targets => observedTargets = targets),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "step-immune-filter-selected",
                RuntimeEffectType = RuntimeEffects.DestroyCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Opponent,
                ExecutionTargetSource = EffectExecutionTargetSource.SelectedTargets,
                ContextRules = [],
                OnSuccessEffectId = null,
            });

        var immuneTarget = CreateCardOnField("immune-target", "immune-target-inst", "p2", "Immune Target");
        var context = CreateContext(
            sourceDefinition,
            playerTwoFieldCards:
            [
                immuneTarget,
            ],
            selectedTargets:
            [
                new GameEffectTargetReference("p2", PlayerZone.CharacterField, "immune-target-inst"),
            ]);

        context.Game.State.AppliedCardEffects.Add(new AppliedCardEffectState
        {
            SourceCardInstanceId = "source-1",
            EffectSpecId = "grant-immunity",
            TargetCardInstanceId = "immune-target-inst",
            ModifierKind = AppliedCardModifierKind.Keyword,
            DurationMode = EffectDurationMode.DuringThisTurn,
            KeywordOperation = KeywordModificationOperation.Add,
            Keyword = EffectConditionKeywords.NotAffectedByOpponentSupportEffects,
            AppliedByPlayerId = "p2",
            AppliedTurnNumber = context.Game.State.TurnNumber,
        });

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        Assert.IsNotNull(observedTargets);
        Assert.AreEqual(0, observedTargets.Count);
    }

    [TestMethod]
    public void Execute_DoesNotFilterSelectedTarget_WhenTargetIsImmuneAndControlledByActingPlayer()
    {
        IReadOnlyList<GameEffectTargetReference>? observedTargets = null;
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new InspectingTargetsEffect(
                ModifyAttributeEffect.EffectKey,
                targets => observedTargets = targets),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "step-immune-self-support",
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Self,
                ExecutionTargetSource = EffectExecutionTargetSource.SelectedTargets,
                ContextRules = [],
                OnSuccessEffectId = null,
            });

        var ownTarget = CreateCardOnField("own-target", "own-target-inst", "p1", "Own Target");
        var context = CreateContext(
            sourceDefinition,
            playerOneFieldCards:
            [
                ownTarget,
            ],
            selectedTargets:
            [
                new GameEffectTargetReference("p1", PlayerZone.CharacterField, "own-target-inst"),
            ]);

        context.Game.State.AppliedCardEffects.Add(new AppliedCardEffectState
        {
            SourceCardInstanceId = "source-1",
            EffectSpecId = "grant-immunity",
            TargetCardInstanceId = "own-target-inst",
            ModifierKind = AppliedCardModifierKind.Keyword,
            DurationMode = EffectDurationMode.DuringThisTurn,
            KeywordOperation = KeywordModificationOperation.Add,
            Keyword = EffectConditionKeywords.NotAffectedByOpponentSupportEffects,
            AppliedByPlayerId = "p1",
            AppliedTurnNumber = context.Game.State.TurnNumber,
        });

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        Assert.IsNotNull(observedTargets);
        Assert.AreEqual(1, observedTargets.Count);
        Assert.AreEqual("own-target-inst", observedTargets[0].CardInstanceId);
    }

    [TestMethod]
    public void Execute_FiltersAutoSelectedTargets_WhenTargetIsImmuneToOpponentSupportEffects()
    {
        IReadOnlyList<GameEffectTargetReference>? observedTargets = null;
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new InspectingTargetsEffect(
                DestroyCardEffect.EffectKey,
                targets => observedTargets = targets),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "step-immune-filter-auto",
                RuntimeEffectType = RuntimeEffects.DestroyCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Opponent,
                ExecutionTargetSource = EffectExecutionTargetSource.SelectedTargets,
                ContextRules = [],
                OnSuccessEffectId = null,
                TargetRules = new EffectTargetRuleSet
                {
                    AutoSelectAllValidTargets = true,
                    Rules =
                    [
                        new EffectTargetRule
                        {
                            Scope = EffectTargetRange.Opponent,
                            InZone = PlayerZone.CharacterField,
                            Restriction = new ZoneCardRestriction
                            {
                                Predicates = []
                            }
                        }
                    ]
                }
            });

        var immuneTarget = CreateCardOnField("immune-auto-target", "immune-auto-target-inst", "p2", "Immune Auto Target");
        var context = CreateContext(
            sourceDefinition,
            playerTwoFieldCards:
            [
                immuneTarget,
            ]);

        context.Game.State.AppliedCardEffects.Add(new AppliedCardEffectState
        {
            SourceCardInstanceId = "source-1",
            EffectSpecId = "grant-immunity",
            TargetCardInstanceId = "immune-auto-target-inst",
            ModifierKind = AppliedCardModifierKind.Keyword,
            DurationMode = EffectDurationMode.DuringThisTurn,
            KeywordOperation = KeywordModificationOperation.Add,
            Keyword = EffectConditionKeywords.NotAffectedByOpponentSupportEffects,
            AppliedByPlayerId = "p2",
            AppliedTurnNumber = context.Game.State.TurnNumber,
        });

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        Assert.IsNotNull(observedTargets);
        Assert.AreEqual(0, observedTargets.Count);
    }

    [TestMethod]
    public void Execute_UsesConditionalBranching_ForChoiceDrivenEffects()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(ModifyAttributeEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "option-a",
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ExecutionCondition = new EffectExecutionConditionSpec
                {
                    ArgumentKey = EffectExecutionConditionArgumentKey.SelectedOption,
                    ExpectedValue = "A",
                },
                OnFailureEffectId = "option-b",
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "option-b",
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ExecutionCondition = new EffectExecutionConditionSpec
                {
                    ArgumentKey = EffectExecutionConditionArgumentKey.SelectedOption,
                    ExpectedValue = "B",
                },
                ContextRules = []
            });

        var context = CreateContext(
            sourceDefinition,
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["selectedOption"] = "B",
            });

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        CollectionAssert.AreEqual(new[] { "option-b" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_UsesFallbackBranch_WhenInitialEffectExecutionFails()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new FailingEffect(ModifyAttributeEffect.EffectKey),
            new RecordingEffect(DestroyCardEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "initial",
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                OnFailureEffectId = "fallback",
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "fallback",
                RuntimeEffectType = RuntimeEffects.DestroyCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        CollectionAssert.AreEqual(new[] { "fallback" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_ResolvesMoveCardRuntimeEffect()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(MoveCardEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "move-step",
                RuntimeEffectType = RuntimeEffects.MoveCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        CollectionAssert.AreEqual(new[] { "move-step" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_ResolvesRevealCardRuntimeEffect()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(RevealCardEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "reveal-step",
                RuntimeEffectType = RuntimeEffects.RevealCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        CollectionAssert.AreEqual(new[] { "reveal-step" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_ResolvesFreezeCardRuntimeEffect()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(FreezeCardEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "freeze-step",
                RuntimeEffectType = RuntimeEffects.FreezeCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        CollectionAssert.AreEqual(new[] { "freeze-step" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_RevealFirst_ExecutesThenBranchesOnFailure_WhenConditionDoesNotMatch()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(RevealCardEffect.EffectKey, observedSpecIds),
            new RecordingEffect(DestroyCardEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "reveal-step",
                RuntimeEffectType = RuntimeEffects.RevealCard,
                RevealTimingMode = RevealTimingMode.RevealFirst,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ExecutionCondition = new EffectExecutionConditionSpec
                {
                    ArgumentKey = EffectExecutionConditionArgumentKey.SelectedOption,
                    ExpectedValue = "B",
                },
                OnFailureEffectId = "fallback",
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "fallback",
                RuntimeEffectType = RuntimeEffects.DestroyCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(
            sourceDefinition,
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["selectedOption"] = "A",
            });

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        CollectionAssert.AreEqual(new[] { "reveal-step", "fallback" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_RevealFirstDeckTopReveal_SuspendsForPresentationThenResumesIntoTheSuccessBranch()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new DeckTopRevealEffect(observedSpecIds),
            new RecordingEffect(FreezeCardEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "reveal-step",
                RuntimeEffectType = RuntimeEffects.RevealCard,
                RevealTimingMode = RevealTimingMode.RevealFirst,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                OnSuccessEffectId = "freeze-step",
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "freeze-step",
                RuntimeEffectType = RuntimeEffects.FreezeCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition);
        AddDeckCard(context, "deck-1", "deck-def");

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        // Only the reveal ran: the chain stopped so the client can present the card it turned over.
        CollectionAssert.AreEqual(new[] { "reveal-step" }, observedSpecIds.ToArray());

        var deckCard = context.Game.State.Players[0].Deck.Single();
        Assert.IsTrue(deckCard.IsRevealedToBothPlayers);
        Assert.AreEqual(PlayerZone.Deck, deckCard.RevealedInZone);

        var prompt = context.Game.GetPendingPrompt();
        Assert.IsNotNull(prompt);
        Assert.AreEqual(GamePromptType.Effect, prompt.Type);
        Assert.AreEqual(EffectSelectionPromptKind.RevealPresentation, prompt.SelectionPromptKind);
        Assert.AreEqual("p1", prompt.RequestedPlayerId);
        Assert.AreEqual(PlayerZone.Deck, prompt.CandidateZone);
        Assert.AreEqual("p1", prompt.CandidatePlayerId);
        CollectionAssert.AreEqual(
            new[] { ReactiveEffectExecutionConstants.RevealPresentedOption },
            prompt.Options.ToArray());
        Assert.IsNotNull(prompt.EffectContinuation);
        Assert.AreEqual("freeze-step", prompt.EffectContinuation.ResumeNodeId);

        // The acknowledgement is not a selection, so the resumed chain carries on to the success branch and the
        // presented card goes back face down once the chain is over.
        var resumeResult = executor.Resume(context.Game, prompt.EffectContinuation, []);

        Assert.IsFalse(resumeResult.IsError);
        CollectionAssert.AreEqual(new[] { "reveal-step", "freeze-step" }, observedSpecIds.ToArray());
        Assert.IsFalse(deckCard.IsRevealedToBothPlayers);
        Assert.IsNull(deckCard.RevealedInZone);
    }

    [TestMethod]
    public void Execute_RevealFirstDeckTopReveal_FlipsTheCardBack_WhenThePostConditionEndsTheChain()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new DeckTopRevealEffect(observedSpecIds),
            new RecordingEffect(FreezeCardEffect.EffectKey, observedSpecIds),
        ]));

        // The post-condition looks for a Leader, so the deck card can never satisfy it and there is no failure
        // branch: the reveal is the whole effect, like the real "reveal the top card, and if ..." cards.
        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "reveal-step",
                RuntimeEffectType = RuntimeEffects.RevealCard,
                RevealTimingMode = RevealTimingMode.RevealFirst,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                RevealPostConditionRestriction = new ZoneCardRestriction
                {
                    MatchMode = ZoneRestrictionMatchMode.All,
                    Predicates =
                    [
                        new ZoneCardPropertyPredicate
                        {
                            Property = ZoneCardProperty.Type,
                            Operator = ZoneCardPredicateOperator.Equals,
                            Value = "Leader",
                            IgnoreCase = true,
                        },
                    ],
                },
                OnSuccessEffectId = "freeze-step",
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "freeze-step",
                RuntimeEffectType = RuntimeEffects.FreezeCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition);
        AddDeckCard(context, "deck-1", "deck-def");

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        CollectionAssert.AreEqual(new[] { "reveal-step" }, observedSpecIds.ToArray());

        var deckCard = context.Game.State.Players[0].Deck.Single();
        Assert.IsTrue(deckCard.IsRevealedToBothPlayers);

        var prompt = context.Game.GetPendingPrompt();
        Assert.IsNotNull(prompt);
        Assert.AreEqual(EffectSelectionPromptKind.RevealPresentation, prompt.SelectionPromptKind);
        // No failure branch means acknowledging the presentation ends the chain.
        Assert.AreEqual(string.Empty, prompt.EffectContinuation!.ResumeNodeId);

        var resumeResult = executor.Resume(context.Game, prompt.EffectContinuation, []);

        Assert.IsFalse(resumeResult.IsError);
        CollectionAssert.AreEqual(new[] { "reveal-step" }, observedSpecIds.ToArray());
        Assert.IsFalse(deckCard.IsRevealedToBothPlayers);
        Assert.IsNull(deckCard.RevealedInZone);
    }

    [TestMethod]
    public void Execute_RevealFirstRevealOfAVisibleCard_DoesNotSuspend()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingRevealEffect(observedSpecIds, "o-field"),
            new RecordingEffect(FreezeCardEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "reveal-step",
                RuntimeEffectType = RuntimeEffects.RevealCard,
                RevealTimingMode = RevealTimingMode.RevealFirst,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                OnSuccessEffectId = "freeze-step",
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "freeze-step",
                RuntimeEffectType = RuntimeEffects.FreezeCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        // The revealed card sits on the opponent's battlefield - both players could already see it, so there is
        // nothing to present and the chain never stops.
        var context = CreateContext(
            sourceDefinition,
            playerTwoFieldCards:
            [
                CreateCardOnField("revealed-card", "o-field", "p2", "Revealed Card"),
            ]);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        Assert.IsNull(context.Game.GetPendingPrompt());
        CollectionAssert.AreEqual(new[] { "reveal-step", "freeze-step" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_RevealFirst_MatchesPostCondition_WhenAnyPredicateOfAGroupMatches()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new DeckTopRevealEffect(observedSpecIds),
            new RecordingEffect(FreezeCardEffect.EffectKey, observedSpecIds),
        ]));

        // N-019's real post-condition: "[Sasuke Uchiha] **or** a [The Taka] type card, other than an EX
        // Character". The revealed deck card is only a [The Taka] card, so the group has to match through its
        // second predicate - a group is not a list of `All` predicates just because it is rendered inline.
        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "reveal-step",
                RuntimeEffectType = RuntimeEffects.RevealCard,
                RevealTimingMode = RevealTimingMode.RevealFirst,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                RevealPostConditionRuleSet = new ZoneCardRestrictionRuleSet
                {
                    Operator = RequirementGroupOperator.All,
                    Restrictions =
                    [
                        new ZoneCardRestriction
                        {
                            MatchMode = ZoneRestrictionMatchMode.Any,
                            Predicates =
                            [
                                new ZoneCardPropertyPredicate
                                {
                                    Property = ZoneCardProperty.Name,
                                    Operator = ZoneCardPredicateOperator.Equals,
                                    Value = "Sasuke Uchiha",
                                    IgnoreCase = true,
                                },
                                new ZoneCardPropertyPredicate
                                {
                                    Property = ZoneCardProperty.Trait,
                                    Operator = ZoneCardPredicateOperator.Equals,
                                    Value = "The Taka",
                                    IgnoreCase = true,
                                },
                            ],
                        },
                        new ZoneCardRestriction
                        {
                            MatchMode = ZoneRestrictionMatchMode.All,
                            Predicates =
                            [
                                new ZoneCardPropertyPredicate
                                {
                                    Property = ZoneCardProperty.Type,
                                    Operator = ZoneCardPredicateOperator.NotEquals,
                                    Value = "EX Character",
                                    IgnoreCase = true,
                                },
                            ],
                        },
                    ],
                },
                OnSuccessEffectId = "freeze-step",
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "freeze-step",
                RuntimeEffectType = RuntimeEffects.FreezeCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition);
        AddDeckCard(context, "deck-1", "deck-def", "Karin", ["Special", "The Taka"]);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        // The reveal is still presented first, and the success branch it picked is the freeze step.
        var prompt = context.Game.GetPendingPrompt();
        Assert.IsNotNull(prompt);
        Assert.AreEqual(EffectSelectionPromptKind.RevealPresentation, prompt.SelectionPromptKind);
        Assert.AreEqual("freeze-step", prompt.EffectContinuation!.ResumeNodeId);

        var resumeResult = executor.Resume(context.Game, prompt.EffectContinuation, []);

        Assert.IsFalse(resumeResult.IsError);
        CollectionAssert.AreEqual(new[] { "reveal-step", "freeze-step" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_RevealFirstDeckTopReveal_FlipsTheCardBack_WhenTheResumedBranchFails()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new DeckTopRevealEffect(observedSpecIds),
        ]));

        // "broken-step" resolves to a runtime effect whose handler is not registered, so resuming into it fails.
        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "reveal-step",
                RuntimeEffectType = RuntimeEffects.RevealCard,
                RevealTimingMode = RevealTimingMode.RevealFirst,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                OnSuccessEffectId = "broken-step",
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "broken-step",
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition);
        AddDeckCard(context, "deck-1", "deck-def");

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        CollectionAssert.AreEqual(new[] { "reveal-step" }, observedSpecIds.ToArray());

        var deckCard = context.Game.State.Players[0].Deck.Single();
        Assert.IsTrue(deckCard.IsRevealedToBothPlayers);

        var prompt = context.Game.GetPendingPrompt();
        Assert.IsNotNull(prompt);
        Assert.AreEqual(EffectSelectionPromptKind.RevealPresentation, prompt.SelectionPromptKind);

        var resumeResult = executor.Resume(context.Game, prompt.EffectContinuation!, []);

        // The branch cannot run, so the chain fails - but the card the player just saw still goes back face
        // down instead of staying revealed for the rest of the game.
        Assert.IsTrue(resumeResult.IsError);
        Assert.IsFalse(deckCard.IsRevealedToBothPlayers);
        Assert.IsNull(deckCard.RevealedInZone);
    }

    [TestMethod]
    public void Execute_RevealLast_BranchesOnFailureWithoutExecuting_WhenConditionDoesNotMatch()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(RevealCardEffect.EffectKey, observedSpecIds),
            new RecordingEffect(DestroyCardEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "reveal-step",
                RuntimeEffectType = RuntimeEffects.RevealCard,
                RevealTimingMode = RevealTimingMode.RevealLast,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ExecutionCondition = new EffectExecutionConditionSpec
                {
                    ArgumentKey = EffectExecutionConditionArgumentKey.SelectedOption,
                    ExpectedValue = "B",
                },
                OnFailureEffectId = "fallback",
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "fallback",
                RuntimeEffectType = RuntimeEffects.DestroyCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(
            sourceDefinition,
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["selectedOption"] = "A",
            });

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        CollectionAssert.AreEqual(new[] { "fallback" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_RevealFirst_ExecutesThenBranchesOnSuccess_WhenPostRevealPredicateMatches()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingRevealEffect(observedSpecIds, "o-hand"),
            new RecordingEffect(FreezeCardEffect.EffectKey, observedSpecIds),
            new RecordingEffect(DestroyCardEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "reveal-step",
                RuntimeEffectType = RuntimeEffects.RevealCard,
                RevealTimingMode = RevealTimingMode.RevealFirst,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                RevealPostConditionPredicate = new ZoneCardPropertyPredicate
                {
                    Property = ZoneCardProperty.Trait,
                    Operator = ZoneCardPredicateOperator.Equals,
                    Value = "Uchiha Clan",
                    IgnoreCase = true,
                },
                OnSuccessEffectId = "freeze-step",
                OnFailureEffectId = "fallback",
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "freeze-step",
                RuntimeEffectType = RuntimeEffects.FreezeCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "fallback",
                RuntimeEffectType = RuntimeEffects.DestroyCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var revealedCard = CreateCardOnField("revealed-card", "o-hand", "p2", "Revealed Uchiha");
        revealedCard.Card.Traits = ["Uchiha Clan"];

        var context = CreateContext(
            sourceDefinition,
            playerTwoFieldCards:
            [
                revealedCard,
            ]);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        CollectionAssert.AreEqual(new[] { "reveal-step", "freeze-step" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_RevealFirst_ExecutesFailureBranch_WhenRevealPostConditionRestrictionDoesNotMatch()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingRevealEffect(observedSpecIds, "o-hand"),
            new RecordingEffect(FreezeCardEffect.EffectKey, observedSpecIds),
            new RecordingEffect(DestroyCardEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "reveal-step",
                RuntimeEffectType = RuntimeEffects.RevealCard,
                RevealTimingMode = RevealTimingMode.RevealFirst,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                RevealPostConditionRestriction = new ZoneCardRestriction
                {
                    MatchMode = ZoneRestrictionMatchMode.All,
                    Predicates =
                    [
                        new ZoneCardPropertyPredicate
                        {
                            Property = ZoneCardProperty.Name,
                            Operator = ZoneCardPredicateOperator.Contains,
                            Value = "Naruto",
                            IgnoreCase = true,
                        },
                        new ZoneCardPropertyPredicate
                        {
                            Property = ZoneCardProperty.Type,
                            Operator = ZoneCardPredicateOperator.NotEquals,
                            Value = "EX Character",
                            IgnoreCase = true,
                        },
                    ],
                },
                OnSuccessEffectId = "freeze-step",
                OnFailureEffectId = "fallback",
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "freeze-step",
                RuntimeEffectType = RuntimeEffects.FreezeCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "fallback",
                RuntimeEffectType = RuntimeEffects.DestroyCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var revealedCard = CreateCardOnField("revealed-card", "o-hand", "p2", "Sasuke Uchiha");
        revealedCard.Card.Type = CardType.ExCharacter;

        var context = CreateContext(
            sourceDefinition,
            playerTwoFieldCards:
            [
                revealedCard,
            ]);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        CollectionAssert.AreEqual(new[] { "reveal-step", "fallback" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_RevealFirst_ExecutesSuccessBranch_WhenRevealPostConditionRuleSetMatchesAnyGroup()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingRevealEffect(observedSpecIds, "o-hand"),
            new RecordingEffect(FreezeCardEffect.EffectKey, observedSpecIds),
            new RecordingEffect(DestroyCardEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "reveal-step",
                RuntimeEffectType = RuntimeEffects.RevealCard,
                RevealTimingMode = RevealTimingMode.RevealFirst,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                RevealPostConditionRuleSet = new ZoneCardRestrictionRuleSet
                {
                    Operator = RequirementGroupOperator.Any,
                    Restrictions =
                    [
                        new ZoneCardRestriction
                        {
                            MatchMode = ZoneRestrictionMatchMode.All,
                            Predicates =
                            [
                                new ZoneCardPropertyPredicate
                                {
                                    Property = ZoneCardProperty.Name,
                                    Operator = ZoneCardPredicateOperator.Contains,
                                    Value = "Sasuke",
                                    IgnoreCase = true,
                                },
                                new ZoneCardPropertyPredicate
                                {
                                    Property = ZoneCardProperty.Type,
                                    Operator = ZoneCardPredicateOperator.NotEquals,
                                    Value = "EX Character",
                                    IgnoreCase = true,
                                },
                            ],
                        },
                        new ZoneCardRestriction
                        {
                            MatchMode = ZoneRestrictionMatchMode.All,
                            Predicates =
                            [
                                new ZoneCardPropertyPredicate
                                {
                                    Property = ZoneCardProperty.Trait,
                                    Operator = ZoneCardPredicateOperator.Equals,
                                    Value = "The Taka",
                                    IgnoreCase = true,
                                },
                                new ZoneCardPropertyPredicate
                                {
                                    Property = ZoneCardProperty.Type,
                                    Operator = ZoneCardPredicateOperator.NotEquals,
                                    Value = "EX Character",
                                    IgnoreCase = true,
                                },
                            ],
                        },
                    ],
                },
                OnSuccessEffectId = "freeze-step",
                OnFailureEffectId = "fallback",
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "freeze-step",
                RuntimeEffectType = RuntimeEffects.FreezeCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "fallback",
                RuntimeEffectType = RuntimeEffects.DestroyCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var revealedCard = CreateCardOnField("revealed-card", "o-hand", "p2", "Sasuke Uchiha");
        revealedCard.Card.Type = CardType.Character;

        var context = CreateContext(
            sourceDefinition,
            playerTwoFieldCards:
            [
                revealedCard,
            ]);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        CollectionAssert.AreEqual(new[] { "reveal-step", "freeze-step" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_AtomicChain_DoesNotExecuteAnyStep_WhenLaterStepCannotExecute()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(SummonCardEffect.EffectKey, observedSpecIds),
            new CannotExecuteEffect(ModifyAttributeEffect.EffectKey),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "summon-self",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ExecutionFlowMode = EffectExecutionFlowMode.AtomicChain,
                OnSuccessEffectId = "double-power",
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "double-power",
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ExecutionFlowMode = EffectExecutionFlowMode.AtomicChain,
                OnSuccessEffectId = "finish",
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "finish",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(0, observedSpecIds.Count);
    }

    [TestMethod]
    public void Execute_AtomicChain_ExecutesAllSteps_WhenWholeChainIsValid()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(SummonCardEffect.EffectKey, observedSpecIds),
            new RecordingEffect(ModifyAttributeEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "summon-self",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ExecutionFlowMode = EffectExecutionFlowMode.AtomicChain,
                OnSuccessEffectId = "double-power",
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "double-power",
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ExecutionFlowMode = EffectExecutionFlowMode.AtomicChain,
                OnSuccessEffectId = "finish",
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "finish",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        CollectionAssert.AreEqual(new[] { "summon-self", "double-power", "finish" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_AtomicChain_IgnoresNonEntryConditions()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(SummonCardEffect.EffectKey, observedSpecIds),
            new RecordingEffect(ModifyAttributeEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "summon-self",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ExecutionFlowMode = EffectExecutionFlowMode.AtomicChain,
                OnSuccessEffectId = "double-power",
                ExecutionCondition = new EffectExecutionConditionSpec
                {
                    ArgumentKey = EffectExecutionConditionArgumentKey.SelectedOption,
                    ExpectedValue = "yes",
                },
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "double-power",
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ExecutionFlowMode = EffectExecutionFlowMode.AtomicChain,
                OnSuccessEffectId = "finish",
                ExecutionCondition = new EffectExecutionConditionSpec
                {
                    ArgumentKey = EffectExecutionConditionArgumentKey.SelectedOption,
                    ExpectedValue = "never-set",
                },
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "finish",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(
            sourceDefinition,
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["selectedOption"] = "yes",
            });

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        CollectionAssert.AreEqual(new[] { "summon-self", "double-power", "finish" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_DoesNotCharge_WhenEffectHasNoChakraCost()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(SummonCardEffect.EffectKey, observedSpecIds),
            new RecordingEffect(ModifyAttributeEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "support-a",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.SupportActivated,
                TargetRange = EffectTargetRange.Any,
                OnSuccessEffectId = "support-b",
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "support-b",
                RuntimeEffectType = RuntimeEffects.ChangeValues,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.SupportActivated,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition, playerOneResource: 5);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(5, context.Game.State.Players[0].ResourcePool);
        CollectionAssert.AreEqual(new[] { "support-a", "support-b" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_BranchesOnFailure_WhenSupportEffectChakraCostCannotBePaid()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(SummonCardEffect.EffectKey, observedSpecIds),
            new RecordingEffect(DestroyCardEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "support-main",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.SupportActivated,
                ChakraCost = 2,
                TargetRange = EffectTargetRange.Any,
                OnFailureEffectId = "fallback",
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "fallback",
                RuntimeEffectType = RuntimeEffects.DestroyCard,
                EffectType = EffectKind.Unknown,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition, playerOneResource: 1);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(1, context.Game.State.Players[0].ResourcePool);
        CollectionAssert.AreEqual(new[] { "fallback" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_UsesEffectLevelChakraCost_WhenProvidedForSupportEffect()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(SummonCardEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "support-main",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.SupportActivated,
                ChakraCost = 1,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition, playerOneResource: 4);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(3, context.Game.State.Players[0].ResourcePool);
        CollectionAssert.AreEqual(new[] { "support-main" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_UsesEffectLevelChakraCost_WhenProvidedForNonSupportEffect()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(SummonCardEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "activated-main",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Activated,
                Timing = EffectTiming.ActivateMain,
                ChakraCost = 2,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition, playerOneResource: 5);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(3, context.Game.State.Players[0].ResourcePool);
        CollectionAssert.AreEqual(new[] { "activated-main" }, observedSpecIds.ToArray());
    }

    [TestMethod]
    public void Execute_BranchesOnFailure_WhenNonSupportEffectChakraCostCannotBePaid()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(SummonCardEffect.EffectKey, observedSpecIds),
            new RecordingEffect(DestroyCardEffect.EffectKey, observedSpecIds),
        ]));

        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "activated-main",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Activated,
                Timing = EffectTiming.ActivateMain,
                ChakraCost = 2,
                TargetRange = EffectTargetRange.Any,
                OnFailureEffectId = "fallback",
                ContextRules = []
            },
            new EffectSpec
            {
                Id = "fallback",
                RuntimeEffectType = RuntimeEffects.DestroyCard,
                EffectType = EffectKind.Unknown,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ContextRules = []
            });

        var context = CreateContext(sourceDefinition, playerOneResource: 1);

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        Assert.AreEqual(1, context.Game.State.Players[0].ResourcePool);
        CollectionAssert.AreEqual(new[] { "fallback" }, observedSpecIds.ToArray());
    }

    private static GameCardEffectContext CreateContext(
        Card sourceDefinition,
        IReadOnlyDictionary<string, string>? arguments = null,
        int playerOneResource = 0,
        IReadOnlyList<(Card Card, CardInstance Instance)>? playerOneFieldCards = null,
        IReadOnlyList<(Card Card, CardInstance Instance)>? playerTwoFieldCards = null,
        IReadOnlyList<GameEffectTargetReference>? selectedTargets = null)
    {
        var sourceCard = new CardInstance
        {
            InstanceId = "source-1",
            CardDefinitionId = "source-def",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
        };

        var state = new GameState
        {
            GameId = "game-seq-1",
            ActivePlayerId = "p1",
            PriorityPlayerId = "p1",
            Players =
            [
                new PlayerState
                {
                    PlayerId = "p1",
                    ResourcePool = playerOneResource,
                    Battlefield = [sourceCard, ..(playerOneFieldCards?.Select(entry => entry.Instance) ?? [])],
                },
                new PlayerState
                {
                    PlayerId = "p2",
                    Battlefield = [..(playerTwoFieldCards?.Select(entry => entry.Instance) ?? [])],
                },
            ],
            CardDefinitions =
            {
                ["source-def"] = sourceDefinition,
            }
        };

        foreach (var (card, _) in playerOneFieldCards ?? [])
        {
            state.CardDefinitions[card.Id] = card;
        }

        foreach (var (card, _) in playerTwoFieldCards ?? [])
        {
            state.CardDefinitions[card.Id] = card;
        }

        var game = new GameInstance(state);

        return new GameCardEffectContext(
            game: game,
            actingPlayer: new Player
            {
                Id = "p1",
                Name = "Player 1",
                DisplayName = "Player 1",
                Deck = []
            },
            sourceCardDefinition: sourceDefinition,
            sourceCardInstance: sourceCard,
            arguments: arguments ?? new Dictionary<string, string>(StringComparer.Ordinal),
            selectedTargets: selectedTargets ?? []);
    }

    private static (Card Card, CardInstance Instance) CreateCardOnField(
        string cardDefinitionId,
        string instanceId,
        string controllerPlayerId,
        string displayName)
    {
        var card = new CharacterCard
        {
            Id = cardDefinitionId,
            DisplayName = displayName,
            Name = [displayName],
            Type = CardType.Character,
            Color = CardColor.Green,
            Traits = ["Ninja"],
            Power = 2,
            Damage = 1,
            Health = 2,
        };

        var instance = new CardInstance
        {
            InstanceId = instanceId,
            CardDefinitionId = cardDefinitionId,
            OwnerPlayerId = controllerPlayerId,
            ControllerPlayerId = controllerPlayerId,
        };

        return (card, instance);
    }

    private static CharacterCard CreateSourceDefinition(params EffectSpec[] effects)
    {
        return new CharacterCard
        {
            Id = "source-def",
            DisplayName = "Source",
            Name = ["Source"],
            Type = CardType.Character,
            Color = CardColor.Blue,
            Traits = ["Ninja"],
            Description = string.Empty,
            Damage = 1,
            Power = 1,
            Health = 2,
            Effects = effects.ToList(),
        };
    }

    [TestMethod]
    public void Execute_PromptedSelection_SuspendsTheChainAndAsksWithTheCurrentCandidates()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(SummonCardEffect.EffectKey, observedSpecIds),
        ]));

        // "draw 1 card, then place 1 card from your hand on top of your deck": the second node defers its
        // target choice, so the chain must stop and ask - not resolve (or fail) before the player answers.
        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "draw-step",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                OnSuccessEffectId = "choose-step",
                ContextRules = [],
            },
            new EffectSpec
            {
                Id = "choose-step",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Support,
                Timing = EffectTiming.Quick,
                TargetRange = EffectTargetRange.Any,
                ExecutionTargetSource = EffectExecutionTargetSource.SelectedTargets,
                SelectionTiming = EffectSelectionTiming.Prompted,
                SelectionPromptKind = EffectSelectionPromptKind.PlaceOnDeckTop,
                ContextRules = [],
                TargetRules = new EffectTargetRuleSet
                {
                    ExactTargetCount = 1,
                    Rules =
                    [
                        new EffectTargetRule
                        {
                            Scope = EffectTargetRange.Self,
                            InZone = PlayerZone.Hand,
                            LocationSelector = new EffectTargetLocationSelector
                            {
                                Kind = EffectTargetLocationSelectorKind.Any,
                            },
                        },
                    ],
                },
            });

        var context = CreateContext(sourceDefinition);
        AddHandCard(context, "hand-1", "hand-def");

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        // Only the draw step ran: the chain suspended instead of executing the prompted node.
        CollectionAssert.AreEqual(new[] { "draw-step" }, observedSpecIds.ToArray());

        var prompt = context.Game.GetPendingPrompt();
        Assert.IsNotNull(prompt);
        Assert.AreEqual(GamePromptType.Effect, prompt.Type);
        Assert.AreEqual("p1", prompt.RequestedPlayerId);
        Assert.AreEqual(PlayerZone.Hand, prompt.CandidateZone);
        Assert.AreEqual("p1", prompt.CandidatePlayerId);
        Assert.AreEqual(EffectSelectionPromptKind.PlaceOnDeckTop, prompt.SelectionPromptKind);
        CollectionAssert.AreEqual(new[] { "hand-1" }, prompt.Options.ToArray());
        Assert.IsNotNull(prompt.EffectContinuation);
        Assert.AreEqual("choose-step", prompt.EffectContinuation.ResumeNodeId);

        var resumeResult = executor.Resume(
            context.Game,
            prompt.EffectContinuation,
            [new GameEffectTargetReference("p1", PlayerZone.Hand, "hand-1")]);

        Assert.IsFalse(resumeResult.IsError);
        CollectionAssert.AreEqual(new[] { "draw-step", "choose-step" }, observedSpecIds.ToArray());
    }


    [TestMethod]
    public void Execute_LeaderEffectKey_StartsAtTheRequestedAbility_NotTheFirstOne()
    {
        var observedSpecIds = new List<string>();
        var executor = new GameSequentialEffectExecutor(new GameCardEffectRegistry(
        [
            new RecordingEffect(SummonCardEffect.EffectKey, observedSpecIds),
        ]));

        // A leader can hold several abilities; the submitted action names the one it belongs to, so the
        // chain must start at that ability's node instead of the card's first non-subordinate effect.
        var sourceDefinition = CreateSourceDefinition(
            new EffectSpec
            {
                Id = "recovery",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Recovery,
                Timing = EffectTiming.ActivateMain,
                TargetRange = EffectTargetRange.Self,
                ContextRules = [],
            },
            new EffectSpec
            {
                Id = "draw-n-place-card",
                RuntimeEffectType = RuntimeEffects.SummonCard,
                EffectType = EffectKind.Activated,
                Timing = EffectTiming.ActivateMain,
                TargetRange = EffectTargetRange.Self,
                ContextRules = [],
            });

        var context = CreateContext(
            sourceDefinition,
            arguments: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                [ReactiveEffectExecutionConstants.LeaderEffectKeyArgument] = "draw-n-place-card",
            });

        var result = executor.Execute(context);

        Assert.IsFalse(result.IsError);
        CollectionAssert.AreEqual(new[] { "draw-n-place-card" }, observedSpecIds.ToArray());
    }

    private static void AddHandCard(GameCardEffectContext context, string instanceId, string definitionId)
    {
        var player = context.Game.State.Players.First(entry => entry.PlayerId == "p1");
        player.Hand.Add(new CardInstance
        {
            InstanceId = instanceId,
            CardDefinitionId = definitionId,
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
        });

        context.Game.State.CardDefinitions[definitionId] = new Card
        {
            Id = definitionId,
            DisplayName = "Hand Card",
            Name = ["Hand Card"],
            Type = CardType.Character,
            Color = CardColor.Red,
            Traits = [],
            Damage = 1,
            Power = 1,
        };
    }

    private static void AddDeckCard(
        GameCardEffectContext context,
        string instanceId,
        string definitionId,
        string displayName = "Deck Card",
        string[]? traits = null)
    {
        var player = context.Game.State.Players.First(entry => entry.PlayerId == "p1");
        player.Deck.Add(new CardInstance
        {
            InstanceId = instanceId,
            CardDefinitionId = definitionId,
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
        });

        context.Game.State.CardDefinitions[definitionId] = new CharacterCard
        {
            Id = definitionId,
            DisplayName = displayName,
            Name = [displayName],
            Type = CardType.Character,
            Color = CardColor.Red,
            Traits = traits is null ? [] : [.. traits],
            Damage = 1,
            Power = 1,
            Health = 2,
        };
    }

    private sealed class RecordingEffect : IGameCardEffect
    {
        private readonly List<string> observedSpecIds;

        public RecordingEffect(string effectTypeKey, List<string> observedSpecIds)
        {
            EffectTypeKey = effectTypeKey;
            this.observedSpecIds = observedSpecIds;
        }

        public string EffectTypeKey { get; }

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
            Assert.IsTrue(context.Arguments.TryGetValue(ReactiveEffectExecutionConstants.ActiveEffectSpecIdArgument, out var activeEffectSpecId));
            observedSpecIds.Add(activeEffectSpecId!);
            return Result.Success;
        }
    }

    private sealed class RecordingRevealEffect(List<string> observedSpecIds, string revealedPrimaryTargetId) : IGameCardEffect
    {
        public string EffectTypeKey => RevealCardEffect.EffectKey;

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
            Assert.IsTrue(context.Arguments.TryGetValue(ReactiveEffectExecutionConstants.ActiveEffectSpecIdArgument, out var activeEffectSpecId));
            observedSpecIds.Add(activeEffectSpecId!);

            if (context.Arguments is IDictionary<string, string> mutableArguments)
            {
                mutableArguments[ReactiveEffectExecutionConstants.RevealedPrimaryTargetIdArgument] = revealedPrimaryTargetId;
                mutableArguments[ReactiveEffectExecutionConstants.RevealedTargetIdsArgument] = revealedPrimaryTargetId;
            }

            return Result.Success;
        }
    }

    /// <summary>
    /// Reveals the top card of the acting player's deck the way <see cref="RevealCardEffect"/> does, publishing the
    /// revealed id so the following steps - and the presentation - can find it.
    /// </summary>
    private sealed class DeckTopRevealEffect(List<string> observedSpecIds) : IGameCardEffect
    {
        public string EffectTypeKey => RevealCardEffect.EffectKey;

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
            Assert.IsTrue(context.Arguments.TryGetValue(ReactiveEffectExecutionConstants.ActiveEffectSpecIdArgument, out var activeEffectSpecId));
            observedSpecIds.Add(activeEffectSpecId!);

            var deck = context.Game.State.Players.First(player => player.PlayerId == "p1").Deck;
            var topCard = deck[0];
            topCard.IsRevealedToBothPlayers = true;
            topCard.RevealedInZone = PlayerZone.Deck;

            if (context.Arguments is IDictionary<string, string> mutableArguments)
            {
                mutableArguments[ReactiveEffectExecutionConstants.RevealedTargetIdsArgument] = topCard.InstanceId;
                mutableArguments[ReactiveEffectExecutionConstants.RevealedPrimaryTargetIdArgument] = topCard.InstanceId;
            }

            return Result.Success;
        }
    }

    private sealed class FailingEffect(string effectTypeKey) : IGameCardEffect
    {
        public string EffectTypeKey { get; } = effectTypeKey;

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
            return Error.Validation(
                code: "Game.Effect.Sequential.StepFailed",
                description: "Intentional failure for testing fail-fast behavior.");
        }
    }

    private sealed class InspectingTargetsEffect(
        string effectTypeKey,
        Action<IReadOnlyList<GameEffectTargetReference>> onExecute) : IGameCardEffect
    {
        public string EffectTypeKey { get; } = effectTypeKey;

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
            onExecute(selectedTargets);
            return Result.Success;
        }
    }

    private sealed class CannotExecuteEffect(string effectTypeKey) : IGameCardEffect
    {
        public string EffectTypeKey { get; } = effectTypeKey;

        public CanExecuteResult CanExecute(GameCardEffectContext context)
        {
            return new CanExecuteResult { CanExecute = false };
        }

        public IReadOnlyList<GameEffectTargetReference> GetValidTargets(GameCardEffectContext context)
        {
            return [];
        }

        public ErrorOr<Success> Execute(GameCardEffectContext context, IReadOnlyList<GameEffectTargetReference> selectedTargets)
        {
            Assert.Fail("Execute should not be called when CanExecute is false.");
            return Result.Success;
        }
    }
}