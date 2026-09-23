using ErrorOr;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class GameSequentialEffectExecutor(
    IGameCardEffectRegistry effectRegistry,
    IGameEffectTargetResolver? targetResolver = null) : IGameSequentialEffectExecutor
{
    private const int MaxVisitsPerNode = 4;

    private static readonly PlayerZone[] RevealedTargetZones =
    [
        PlayerZone.Hand,
        PlayerZone.Deck,
        PlayerZone.SupportZone,
        PlayerZone.CharacterField,
        PlayerZone.Trash,
        PlayerZone.ExileZone,
    ];

    private readonly IGameCardEffectRegistry effectRegistry = effectRegistry;
    private readonly IGameEffectTargetResolver targetResolver = targetResolver ?? new EffectTargetResolver();

    public ErrorOr<Success> Execute(GameCardEffectContext context)
    {
        ArgumentNullException.ThrowIfNull(context);

        if (SourceCardEffectSuppression.IsSuppressedWhileOnField(context.Game.State, context.SourceCardInstance))
        {
            return Result.Success;
        }

        var nodes = BuildExecutionNodes(context.SourceCardDefinition.Effects);
        if (nodes.Count == 0)
        {
            return Result.Success;
        }

        return RunNodes(context, nodes, ResolveEntryNodeId(nodes, context));
    }

    /// <summary>
    /// Resumes a chain that suspended to ask the player for a selection: the node that asked re-enters with
    /// the answer as its targets and the chain carries on from its success branch.
    /// </summary>
    public ErrorOr<Success> Resume(
        GameInstance game,
        PendingEffectContinuation continuation,
        IReadOnlyList<GameEffectTargetReference> selection)
    {
        ArgumentNullException.ThrowIfNull(game);
        ArgumentNullException.ThrowIfNull(continuation);

        if (!game.State.CardDefinitions.TryGetValue(continuation.SourceCardDefinitionId, out var sourceCardDefinition))
        {
            return Error.Validation(
                code: "Game.Effect.Sequential.ResumeSourceMissing",
                description: $"Resumed effect source card definition '{continuation.SourceCardDefinitionId}' was not found.");
        }

        var nodes = BuildExecutionNodes(sourceCardDefinition.Effects);
        if (nodes.Count == 0)
        {
            return Result.Success;
        }

        // The prompt answer IS this node's selection; a node that never prompted keeps whatever it had. A
        // reveal presentation prompt is the exception: its option is an acknowledgement, not a selection, so the
        // targets the suspended step already had stay in place.
        var selectedTargets = continuation.RevealPresentation is not null
            ? continuation.SelectedTargets
            : selection.Count > 0
                ? selection
                : continuation.SelectedTargets;
        var context = new GameCardEffectContext(
            game: game,
            actingPlayer: new Player { Id = continuation.ActingPlayerId },
            sourceCardDefinition: sourceCardDefinition,
            sourceCardInstance: ResolveResumedSourceCardInstance(game, continuation),
            arguments: continuation.Arguments,
            selectedTargets: selectedTargets);

        // Carrying the presentation forward means the resumed chain turns the presented reveals back down when
        // it finishes - the other end of the suspension below.
        var runResult = RunNodes(context, nodes, continuation.ResumeNodeId, continuation.RevealPresentation);

        // A resumed chain can still fail (an unsupported branch node, a step that cannot execute). The reveal it
        // presented has already been seen, so it must be turned back down either way - a presented card the chain
        // never returns to would stay face up for the rest of the game.
        if (runResult.IsError)
        {
            ClearPresentedReveals(game, continuation.RevealPresentation);
        }

        return runResult;
    }

    private static CardInstance? ResolveResumedSourceCardInstance(GameInstance game, PendingEffectContinuation continuation)
    {
        if (string.IsNullOrWhiteSpace(continuation.SourceCardInstanceId))
        {
            return null;
        }

        var sourcePlayer = game.State.Players.FirstOrDefault(player =>
            string.Equals(player.PlayerId, continuation.ActingPlayerId, StringComparison.Ordinal));
        if (sourcePlayer is null)
        {
            return null;
        }

        PlayerZone[] zones =
        [
            PlayerZone.SupportZone,
            PlayerZone.Hand,
            PlayerZone.CharacterField,
            PlayerZone.Deck,
            PlayerZone.Trash,
            PlayerZone.ExileZone,
        ];

        foreach (var zone in zones)
        {
            var match = PlayerZoneCardAccessor
                .GetCards(zone, sourcePlayer)
                .FirstOrDefault(card => string.Equals(card.InstanceId, continuation.SourceCardInstanceId, StringComparison.Ordinal));

            if (match is not null)
            {
                return match;
            }
        }

        return null;
    }

    private ErrorOr<Success> RunNodes(
        GameCardEffectContext context,
        List<ExecutionNode> nodes,
        string startNodeId,
        PendingRevealPresentation? carriedPresentation = null)
    {
        var nodeById = nodes.ToDictionary(node => node.NodeId, node => node, StringComparer.Ordinal);
        var visitCounts = new Dictionary<string, int>(StringComparer.Ordinal);
        var currentNodeId = startNodeId;

        // Reveals a "Reveal First" step presented to the acting player are transient: they stay face up while
        // the chain runs (so the client can animate them) and are turned back down when the chain finishes.
        var revealPresentation = carriedPresentation ?? new PendingRevealPresentation();

        // One mutable arguments dictionary is shared by every step of this execution so values an
        // earlier step produces (for example the cards revealed by a RevealCard step) are visible to
        // the steps that follow it.
        var sharedArguments = new Dictionary<string, string>(context.Arguments, StringComparer.Ordinal);

        while (!string.IsNullOrWhiteSpace(currentNodeId))
        {
            if (!nodeById.TryGetValue(currentNodeId, out var node))
            {
                return Error.Validation(
                    code: "Game.Effect.Sequential.InvalidBranchTarget",
                    description: $"Could not resolve branch target effect id '{currentNodeId}'.");
            }

            visitCounts.TryGetValue(currentNodeId, out var currentVisitCount);
            currentVisitCount++;
            visitCounts[currentNodeId] = currentVisitCount;

            if (currentVisitCount > MaxVisitsPerNode)
            {
                return Error.Validation(
                    code: "Game.Effect.Sequential.PotentialLoopDetected",
                    description: $"Effect flow appears cyclic around '{currentNodeId}'.");
            }

            var effectSpec = node.EffectSpec;

            if (effectSpec.ExecutionFlowMode == EffectExecutionFlowMode.AtomicChain)
            {
                var atomicResult = TryExecuteAtomicChain(
                    startNodeId: currentNodeId,
                    nodeById: nodeById,
                    context: context,
                    sharedArguments: sharedArguments,
                    visitCounts: visitCounts,
                    revealPresentation: revealPresentation);

                if (atomicResult.IsError)
                {
                    return atomicResult.Errors;
                }

                if (atomicResult.Value.IsSuspended)
                {
                    // The atomic chain stopped on a reveal presentation prompt; the continuation owns the rest.
                    return Result.Success;
                }

                currentNodeId = atomicResult.Value.NextNodeId;
                continue;
            }

            var branchOnFailure = NormalizeEffectId(effectSpec.OnFailureEffectId);
            var branchOnSuccess = NormalizeEffectId(effectSpec.OnSuccessEffectId);

            if (!TryResolveEffectKey(effectSpec.RuntimeEffectType, out var effectTypeKey))
            {
                return Error.Validation(
                    code: "Game.Effect.Sequential.UnsupportedRuntimeEffect",
                    description: $"Runtime effect '{effectSpec.RuntimeEffectType}' is not supported by sequential execution.");
            }

            if (!effectRegistry.TryResolve(effectTypeKey, out var effect) || effect is null)
            {
                return Error.NotFound(
                    code: "Game.Effect.Sequential.EffectTypeNotRegistered",
                    description: $"Could not resolve effect type '{effectTypeKey}' for runtime effect '{effectSpec.RuntimeEffectType}'.");
            }

            var activationCost = ResolveActivationCost(
                effectSpec: effectSpec,
                arguments: sharedArguments);

            var arguments = new Dictionary<string, string>(sharedArguments, StringComparer.Ordinal)
            {
                [ReactiveEffectExecutionConstants.ActiveEffectSpecIdArgument] = effectSpec.Id,
                [ReactiveEffectExecutionConstants.SupportActivationChakraCostArgument] = activationCost.ToString(),
                [ReactiveEffectExecutionConstants.EnforceTargetCountArgument] = bool.TrueString,
            };

            var stepContext = new GameCardEffectContext(
                game: context.Game,
                actingPlayer: context.ActingPlayer,
                sourceCardDefinition: context.SourceCardDefinition,
                sourceCardInstance: context.SourceCardInstance,
                arguments: arguments,
                selectedTargets: context.SelectedTargets);

            // A node that defers its target choice asks the player now - i.e. after the earlier steps of this
            // chain have run, which is what lets "draw 1 card, then place 1 card from your hand on top of your
            // deck" offer the post-draw hand. The chain suspends here and resumes from this same node once the
            // player answers (registry.ResolvePrompt -> IGameSequentialEffectExecutor.Resume).
            if (effectSpec.SelectionTiming == EffectSelectionTiming.Prompted
                && !HasSelectionForPromptedStep(context, effectSpec)
                && TryCreateSelectionPrompt(
                    stepContext, effectSpec, node.NodeId, sharedArguments, revealPresentation, out var selectionPrompt))
            {
                context.Game.EnqueuePrompt(selectionPrompt);
                return Result.Success;
            }


            var selectedTargetsResult = ResolveStepTargets(stepContext, effectSpec);
            if (selectedTargetsResult.IsError)
            {
                return selectedTargetsResult.Errors;
            }

            var perEffectContext = new GameCardEffectContext(
                game: context.Game,
                actingPlayer: context.ActingPlayer,
                sourceCardDefinition: context.SourceCardDefinition,
                sourceCardInstance: context.SourceCardInstance,
                arguments: arguments,
                selectedTargets: selectedTargetsResult.Value);

            var shouldExecuteBeforeCondition = ShouldExecuteBeforeCondition(effectSpec);
            if (!shouldExecuteBeforeCondition && !ConditionMatches(effectSpec.ExecutionCondition, perEffectContext.Arguments))
            {
                currentNodeId = branchOnFailure;
                continue;
            }

            var canExecuteResult = effect.CanExecute(perEffectContext);
            if (!canExecuteResult.CanExecute)
            {
                currentNodeId = branchOnFailure;
                continue;
            }

            var activationCostResult = TryApplyActivationCost(
                context: perEffectContext,
                chakraCost: activationCost);
            if (activationCostResult.IsError)
            {
                currentNodeId = branchOnFailure;
                continue;
            }

            var executeResult = effect.Execute(perEffectContext, perEffectContext.SelectedTargets);
            if (executeResult.IsError)
            {
                if (!string.IsNullOrWhiteSpace(branchOnFailure))
                {
                    currentNodeId = branchOnFailure;
                    continue;
                }

                return executeResult.Errors;
            }

            // Hand values an effect produced (for example the cards a RevealCard step revealed) to the
            // steps that follow it in this chain.
            PropagateRevealedArguments(perEffectContext.Arguments, sharedArguments);

            var nextNodeId = branchOnSuccess;
            if (shouldExecuteBeforeCondition
                && (!ConditionMatches(effectSpec.ExecutionCondition, perEffectContext.Arguments)
                    || !RevealPostConditionMatches(effectSpec, perEffectContext)))
            {
                nextNodeId = branchOnFailure;
            }

            // A "Reveal First" step that turned a card face up for the acting player suspends the chain so the
            // reveal can be presented; the chain then resumes at the branch the reveal just picked.
            if (shouldExecuteBeforeCondition && CanResumeAt(nextNodeId, nodeById))
            {
                var presentedNow = FilterPresentableReveals(perEffectContext, ResolveRevealedTargets(perEffectContext));
                revealPresentation.Add(presentedNow);

                if (TrySuspendForRevealPresentation(
                    stepContext: perEffectContext,
                    presentedNow: presentedNow,
                    resumeNodeId: nextNodeId,
                    sharedArguments: sharedArguments,
                    presentation: revealPresentation))
                {
                    return Result.Success;
                }
            }

            currentNodeId = nextNodeId;
        }

        ClearPresentedReveals(context.Game, revealPresentation);
        return Result.Success;
    }

    private ErrorOr<AtomicChainExecutionResult> TryExecuteAtomicChain(
        string startNodeId,
        IReadOnlyDictionary<string, ExecutionNode> nodeById,
        GameCardEffectContext context,
        Dictionary<string, string> sharedArguments,
        Dictionary<string, int> visitCounts,
        PendingRevealPresentation revealPresentation)
    {
        var currentNodeId = startNodeId;
        var planningContext = context;

        while (!string.IsNullOrWhiteSpace(currentNodeId))
        {
            var chainResult = BuildAtomicExecutionPlan(currentNodeId, nodeById, planningContext, sharedArguments, visitCounts);
            if (chainResult.IsError)
            {
                return chainResult.Errors;
            }

            var chain = chainResult.Value;
            if (chain.Aborted)
            {
                return new AtomicChainExecutionResult(chain.NextNodeId);
            }

            PlannedExecutionStep? revealFirstStep = null;

            foreach (var step in chain.Steps)
            {
                var activationCostResult = TryApplyActivationCost(
                    context: step.Context,
                    chakraCost: step.ActivationCost);
                if (activationCostResult.IsError)
                {
                    return activationCostResult.Errors;
                }

                var executeResult = step.Effect.Execute(step.Context, step.Context.SelectedTargets);
                if (executeResult.IsError)
                {
                    return executeResult.Errors;
                }

                if (string.Equals(step.NodeId, chain.PendingRevealNodeId, StringComparison.Ordinal))
                {
                    revealFirstStep = step;
                }
            }

            if (revealFirstStep is null)
            {
                return new AtomicChainExecutionResult(chain.NextNodeId);
            }

            // A "Reveal First" node just executed, so the rest of the chain can only be planned now:
            // its post-condition picks the success/failure branch and the cards it revealed (published
            // through its arguments) become the targets of the following steps - for example
            // "reveal the top card of your deck, then summon it".
            PropagateRevealedArguments(revealFirstStep.Context.Arguments, sharedArguments);

            var revealEffectSpec = nodeById[revealFirstStep.NodeId].EffectSpec;

            planningContext = new GameCardEffectContext(
                game: context.Game,
                actingPlayer: context.ActingPlayer,
                sourceCardDefinition: context.SourceCardDefinition,
                sourceCardInstance: context.SourceCardInstance,
                arguments: sharedArguments,
                selectedTargets: revealFirstStep.Context.SelectedTargets);

            var nextNodeId = RevealPostConditionMatches(revealEffectSpec, planningContext)
                ? NormalizeEffectId(revealEffectSpec.OnSuccessEffectId)
                : NormalizeEffectId(revealEffectSpec.OnFailureEffectId);

            // A reveal the acting player could not see before suspends the chain so the client can present it;
            // otherwise the chain simply carries on to the branch the reveal just picked.
            var presentedNow = FilterPresentableReveals(
                revealFirstStep.Context,
                ResolveRevealedTargets(revealFirstStep.Context));
            revealPresentation.Add(presentedNow);

            if (CanResumeAt(nextNodeId, nodeById)
                && TrySuspendForRevealPresentation(
                    stepContext: revealFirstStep.Context,
                    presentedNow: presentedNow,
                    resumeNodeId: nextNodeId,
                    sharedArguments: sharedArguments,
                    presentation: revealPresentation))
            {
                return new AtomicChainExecutionResult(NextNodeId: null, IsSuspended: true);
            }

            currentNodeId = nextNodeId;
        }

        return new AtomicChainExecutionResult(null);
    }

    private ErrorOr<AtomicExecutionPlan> BuildAtomicExecutionPlan(
        string startNodeId,
        IReadOnlyDictionary<string, ExecutionNode> nodeById,
        GameCardEffectContext context,
        Dictionary<string, string> sharedArguments,
        Dictionary<string, int> visitCounts)
    {
        var steps = new List<PlannedExecutionStep>();
        var currentNodeId = startNodeId;
        var traversedInPlan = new HashSet<string>(StringComparer.Ordinal);
        var isFirstNodeInChain = true;
        var simulatedResourcePoolByPlayer = context.Game.State.Players.ToDictionary(
            player => player.PlayerId,
            player => player.ResourcePool,
            StringComparer.Ordinal);

        while (!string.IsNullOrWhiteSpace(currentNodeId))
        {
            if (!nodeById.TryGetValue(currentNodeId, out var node))
            {
                return Error.Validation(
                    code: "Game.Effect.Sequential.InvalidBranchTarget",
                    description: $"Could not resolve branch target effect id '{currentNodeId}'.");
            }

            if (!traversedInPlan.Add(currentNodeId))
            {
                return Error.Validation(
                    code: "Game.Effect.Sequential.PotentialLoopDetected",
                    description: $"Effect flow appears cyclic around '{currentNodeId}'.");
            }

            visitCounts.TryGetValue(currentNodeId, out var currentVisitCount);
            currentVisitCount++;
            visitCounts[currentNodeId] = currentVisitCount;

            if (currentVisitCount > MaxVisitsPerNode)
            {
                return Error.Validation(
                    code: "Game.Effect.Sequential.PotentialLoopDetected",
                    description: $"Effect flow appears cyclic around '{currentNodeId}'.");
            }

            var effectSpec = node.EffectSpec;
            if (effectSpec.ExecutionFlowMode != EffectExecutionFlowMode.AtomicChain)
            {
                return new AtomicExecutionPlan(steps, Aborted: false, NextNodeId: currentNodeId);
            }

            var branchOnFailure = NormalizeEffectId(effectSpec.OnFailureEffectId);
            var branchOnSuccess = NormalizeEffectId(effectSpec.OnSuccessEffectId);

            if (isFirstNodeInChain
                && !ConditionMatches(effectSpec.ExecutionCondition, context.Arguments))
            {
                var nextNodeId = branchOnFailure;
                return new AtomicExecutionPlan(
                    Steps: [],
                    Aborted: true,
                    NextNodeId: nextNodeId);
            }

            if (!TryResolveEffectKey(effectSpec.RuntimeEffectType, out var effectTypeKey))
            {
                return Error.Validation(
                    code: "Game.Effect.Sequential.UnsupportedRuntimeEffect",
                    description: $"Runtime effect '{effectSpec.RuntimeEffectType}' is not supported by sequential execution.");
            }

            if (!effectRegistry.TryResolve(effectTypeKey, out var effect) || effect is null)
            {
                return Error.NotFound(
                    code: "Game.Effect.Sequential.EffectTypeNotRegistered",
                    description: $"Could not resolve effect type '{effectTypeKey}' for runtime effect '{effectSpec.RuntimeEffectType}'.");
            }

            var activationCost = ResolveActivationCost(
                effectSpec: effectSpec,
                arguments: sharedArguments);

            var arguments = new Dictionary<string, string>(sharedArguments, StringComparer.Ordinal)
            {
                [ReactiveEffectExecutionConstants.ActiveEffectSpecIdArgument] = effectSpec.Id,
                [ReactiveEffectExecutionConstants.SupportActivationChakraCostArgument] = activationCost.ToString(),
                [ReactiveEffectExecutionConstants.EnforceTargetCountArgument] = bool.TrueString,
            };

            var stepContext = new GameCardEffectContext(
                game: context.Game,
                actingPlayer: context.ActingPlayer,
                sourceCardDefinition: context.SourceCardDefinition,
                sourceCardInstance: context.SourceCardInstance,
                arguments: arguments,
                selectedTargets: context.SelectedTargets);

            var selectedTargetsResult = ResolveStepTargets(stepContext, effectSpec);
            if (selectedTargetsResult.IsError)
            {
                return selectedTargetsResult.Errors;
            }

            var perEffectContext = new GameCardEffectContext(
                game: context.Game,
                actingPlayer: context.ActingPlayer,
                sourceCardDefinition: context.SourceCardDefinition,
                sourceCardInstance: context.SourceCardInstance,
                arguments: arguments,
                selectedTargets: selectedTargetsResult.Value);

            var canExecuteResult = effect.CanExecute(perEffectContext);
            if (!canExecuteResult.CanExecute)
            {
                var nextNodeId = branchOnFailure;
                return new AtomicExecutionPlan(
                    Steps: [],
                    Aborted: true,
                    NextNodeId: nextNodeId);
            }

            var preflightResult = TryReserveActivationCost(
                actingPlayerId: perEffectContext.ActingPlayer.Id,
                chakraCost: IsActivationCostAlreadyPaid(sharedArguments) ? 0 : activationCost,
                simulatedResourcePoolByPlayer: simulatedResourcePoolByPlayer);
            if (preflightResult.IsError)
            {
                var nextNodeId = branchOnFailure;
                return new AtomicExecutionPlan(
                    Steps: [],
                    Aborted: true,
                    NextNodeId: nextNodeId);
            }

            steps.Add(new PlannedExecutionStep(
                NodeId: node.NodeId,
                Effect: effect,
                Context: perEffectContext,
                ActivationCost: activationCost));

            if (ShouldExecuteBeforeCondition(effectSpec))
            {
                // "Reveal First" nodes must execute before the rest of the chain can be planned: the
                // reveal outcome selects the success/failure branch and supplies the revealed cards as
                // targets for the following steps. TryExecuteAtomicChain resumes planning from here.
                return new AtomicExecutionPlan(
                    Steps: steps,
                    Aborted: false,
                    NextNodeId: null,
                    PendingRevealNodeId: node.NodeId);
            }

            currentNodeId = branchOnSuccess;
            isFirstNodeInChain = false;
        }

        return new AtomicExecutionPlan(steps, Aborted: false, NextNodeId: null);
    }

    private static bool ConditionMatches(
        EffectExecutionConditionSpec? condition,
        IReadOnlyDictionary<string, string> arguments)
    {
        if (condition is null)
        {
            return true;
        }

        var argumentKey = condition.ArgumentKey.ToWireValue();

        if (!arguments.TryGetValue(argumentKey, out var argumentValue))
        {
            return condition.Negate;
        }

        var comparison = condition.IgnoreCase
            ? StringComparison.OrdinalIgnoreCase
            : StringComparison.Ordinal;

        var isMatch = string.Equals(argumentValue, condition.ExpectedValue, comparison);
        return condition.Negate ? !isMatch : isMatch;
    }

    private static bool RevealPostConditionMatches(EffectSpec effectSpec, GameCardEffectContext context)
    {
        if (effectSpec.RuntimeEffectType != RuntimeEffects.RevealCard)
        {
            return true;
        }

        var revealPostConditionRuleSet = ResolveRevealPostConditionRuleSet(effectSpec);
        if (revealPostConditionRuleSet is null)
        {
            return true;
        }

        if (!TryResolveRevealedPrimaryCard(context, out var revealedCardDefinition, out var revealedCardInstance))
        {
            return false;
        }

        var groupResults = revealPostConditionRuleSet.Restrictions.Select(restriction =>
            ZoneCardRestrictionMatcher.Matches(
                gameState: context.Game.State,
                cardDefinition: revealedCardDefinition,
                restriction: restriction,
                cardInstance: revealedCardInstance,
                sourceCardInstance: context.SourceCardInstance));

        return revealPostConditionRuleSet.Operator == RequirementGroupOperator.All
            ? groupResults.All(result => result)
            : groupResults.Any(result => result);
    }

    private static ZoneCardRestrictionRuleSet? ResolveRevealPostConditionRuleSet(EffectSpec effectSpec)
    {
        if (effectSpec.RevealPostConditionRuleSet?.Restrictions is { Count: > 0 })
        {
            return effectSpec.RevealPostConditionRuleSet;
        }

        var restriction = ResolveRevealPostConditionRestriction(effectSpec);
        if (restriction is null)
        {
            return null;
        }

        return new ZoneCardRestrictionRuleSet
        {
            Operator = RequirementGroupOperator.All,
            Restrictions =
            [
                restriction,
            ],
        };
    }

    private static ZoneCardRestriction? ResolveRevealPostConditionRestriction(EffectSpec effectSpec)
    {
        if (effectSpec.RevealPostConditionRuleSet?.Restrictions is { Count: > 0 })
        {
            return effectSpec.RevealPostConditionRuleSet.Restrictions[0];
        }

        if (effectSpec.RevealPostConditionRestriction is not null)
        {
            return effectSpec.RevealPostConditionRestriction;
        }

        if (effectSpec.RevealPostConditionPredicate is null)
        {
            return null;
        }

        return new ZoneCardRestriction
        {
            MatchMode = ZoneRestrictionMatchMode.All,
            Predicates =
            [
                effectSpec.RevealPostConditionPredicate,
            ],
        };
    }

    private static bool TryResolveRevealedPrimaryCard(
        GameCardEffectContext context,
        out Card revealedCardDefinition,
        out CardInstance revealedCardInstance)
    {
        revealedCardDefinition = null!;
        revealedCardInstance = null!;

        if (!context.Arguments.TryGetValue(ReactiveEffectExecutionConstants.RevealedPrimaryTargetIdArgument, out var primaryTargetId)
            || string.IsNullOrWhiteSpace(primaryTargetId))
        {
            return false;
        }

        foreach (var player in context.Game.State.Players)
        {
            var zones = new[]
            {
                PlayerZone.Hand,
                PlayerZone.Deck,
                PlayerZone.SupportZone,
                PlayerZone.CharacterField,
                PlayerZone.Trash,
                PlayerZone.ExileZone,
            };

            foreach (var zone in zones)
            {
                var cardInstance = PlayerZoneCardAccessor.GetCards(zone, player)
                    .FirstOrDefault(card => string.Equals(card.InstanceId, primaryTargetId, StringComparison.Ordinal));
                if (cardInstance is null)
                {
                    continue;
                }

                if (!context.Game.State.CardDefinitions.TryGetValue(cardInstance.CardDefinitionId, out var definition))
                {
                    return false;
                }

                revealedCardDefinition = definition;
                revealedCardInstance = cardInstance;
                return true;
            }
        }

        return false;
    }

    /// <summary>
    /// Copies the values an effect published into its step arguments (currently the cards produced by a
    /// RevealCard step) into the shared arguments so the following steps of the same chain can act on
    /// them - for example summoning the revealed card.
    /// </summary>
    private static void PropagateRevealedArguments(
        IReadOnlyDictionary<string, string> stepArguments,
        Dictionary<string, string> sharedArguments)
    {
        CopyArgument(
            stepArguments,
            sharedArguments,
            ReactiveEffectExecutionConstants.RevealedTargetIdsArgument);
        CopyArgument(
            stepArguments,
            sharedArguments,
            ReactiveEffectExecutionConstants.RevealedPrimaryTargetIdArgument);
    }

    private static void CopyArgument(
        IReadOnlyDictionary<string, string> source,
        Dictionary<string, string> destination,
        string argumentKey)
    {
        if (source.TryGetValue(argumentKey, out var value) && !string.IsNullOrWhiteSpace(value))
        {
            destination[argumentKey] = value;
        }
    }

    private static bool ShouldExecuteBeforeCondition(EffectSpec effectSpec)
    {
        return effectSpec.RuntimeEffectType == RuntimeEffects.RevealCard
            && effectSpec.RevealTimingMode == RevealTimingMode.RevealFirst;
    }

    /// <summary>
    /// True when the branch a reveal picked can actually be resumed at. A reveal whose branch target is missing
    /// must not suspend the chain: it has to keep walking so it fails where it always did, inside the caller that
    /// records the failure, instead of surfacing that error later from the prompt resolver.
    /// </summary>
    private static bool CanResumeAt(string? nodeId, IReadOnlyDictionary<string, ExecutionNode> nodeById)
    {
        return string.IsNullOrWhiteSpace(nodeId) || nodeById.ContainsKey(nodeId);
    }

    /// <summary>
    /// The revealed cards the acting player could not see before the reveal - the top card of a deck, or an
    /// opponent's hand / support card. Those are the only reveals worth stopping the chain for; a card both
    /// players could already see (a battlefield character, a trash card, the acting player's own hand) needs no
    /// presentation.
    /// </summary>
    private static IReadOnlyList<GameEffectTargetReference> FilterPresentableReveals(
        GameCardEffectContext stepContext,
        IReadOnlyList<GameEffectTargetReference> revealedTargets)
    {
        return revealedTargets.Where(target => IsPresentableReveal(stepContext, target)).ToList();
    }

    private static bool IsPresentableReveal(GameCardEffectContext stepContext, GameEffectTargetReference target)
    {
        if (target.Zone == PlayerZone.Deck)
        {
            return true;
        }

        var isActingPlayerCard = string.Equals(
            target.PlayerId,
            stepContext.ActingPlayer.Id,
            StringComparison.Ordinal);

        return !isActingPlayerCard
            && (target.Zone == PlayerZone.Hand || target.Zone == PlayerZone.SupportZone);
    }

    /// <summary>
    /// Suspends a chain right after a "Reveal First" reveal so the client can present the card: the prompt's
    /// single option acknowledges it and the continuation resumes at the branch the reveal picked (an empty
    /// resume node means the reveal ended the chain). Returns false when there is nothing to present, in which
    /// case the caller carries on immediately.
    /// </summary>
    private static bool TrySuspendForRevealPresentation(
        GameCardEffectContext stepContext,
        IReadOnlyList<GameEffectTargetReference> presentedNow,
        string? resumeNodeId,
        IReadOnlyDictionary<string, string> sharedArguments,
        PendingRevealPresentation presentation)
    {
        if (presentedNow.Count == 0)
        {
            return false;
        }

        var primaryTarget = presentedNow[0];

        var prompt = new GamePrompt
        {
            Type = GamePromptType.Effect,
            RequestedPlayerId = stepContext.ActingPlayer.Id,
            Options = [ReactiveEffectExecutionConstants.RevealPresentedOption],
            SelectionPromptKind = EffectSelectionPromptKind.RevealPresentation,
            CandidateZone = primaryTarget.Zone,
            CandidatePlayerId = primaryTarget.PlayerId,
            MinimumSelection = 1,
            MaximumSelection = 1,
            EffectContinuation = new PendingEffectContinuation
            {
                ResumeNodeId = resumeNodeId ?? string.Empty,
                ActingPlayerId = stepContext.ActingPlayer.Id,
                SourceCardDefinitionId = stepContext.SourceCardDefinition.Id,
                SourceCardInstanceId = stepContext.SourceCardInstance?.InstanceId,
                Arguments = new Dictionary<string, string>(sharedArguments, StringComparer.Ordinal),
                SelectedTargets = stepContext.SelectedTargets.ToList(),
                RevealPresentation = presentation,
            },
        };

        prompt.EffectContinuation.PromptId = prompt.PromptId;
        stepContext.Game.EnqueuePrompt(prompt);
        return true;
    }

    /// <summary>
    /// Turns the cards a finished chain presented back face down. A card that left the zone it was revealed in
    /// (summoned, discarded, moved to the field) already cleared its own reveal on the way, so it is skipped.
    /// </summary>
    private static void ClearPresentedReveals(GameInstance game, PendingRevealPresentation? presentation)
    {
        if (presentation is null || presentation.PresentedTargets.Count == 0)
        {
            return;
        }

        foreach (var target in presentation.PresentedTargets)
        {
            var player = game.State.Players.FirstOrDefault(candidate =>
                string.Equals(candidate.PlayerId, target.PlayerId, StringComparison.Ordinal));

            if (player is null)
            {
                continue;
            }

            var card = PlayerZoneCardAccessor
                .GetCards(target.Zone, player)
                .FirstOrDefault(entry => string.Equals(entry.InstanceId, target.CardInstanceId, StringComparison.Ordinal));

            if (card is null || card.RevealedInZone != target.Zone)
            {
                continue;
            }

            card.IsRevealedToBothPlayers = false;
            card.RevealedInZone = null;
        }
    }

    private static List<ExecutionNode> BuildExecutionNodes(IReadOnlyList<EffectSpec> effectSpecs)
    {
        var nodes = new List<ExecutionNode>(effectSpecs.Count);

        for (var index = 0; index < effectSpecs.Count; index++)
        {
            var effectSpec = effectSpecs[index];
            var nodeId = ResolveNodeId(effectSpec, index);

            nodes.Add(new ExecutionNode(nodeId, effectSpec));
        }

        return nodes;
    }

    private static string ResolveNodeId(EffectSpec effectSpec, int index)
    {
        return string.IsNullOrWhiteSpace(effectSpec.Id)
            ? $"__index:{index}"
            : effectSpec.Id.Trim();
    }

    private static string ResolveEntryNodeId(IReadOnlyList<ExecutionNode> nodes, GameCardEffectContext context)
    {
        // A card can hold several independent abilities, and the action that started this execution names the
        // one it belongs to (`leader-effect:{instanceId}:{effectKey}`). Start at that ability's node so its own
        // on-success chain runs: always picking the first non-subordinate node made a leader's second ability
        // execute the first ability's chain.
        if (context.Arguments.TryGetValue(ReactiveEffectExecutionConstants.LeaderEffectKeyArgument, out var leaderEffectKey)
            && !string.IsNullOrWhiteSpace(leaderEffectKey))
        {
            var requestedNode = nodes.FirstOrDefault(node =>
                string.Equals(node.NodeId, leaderEffectKey.Trim(), StringComparison.Ordinal));

            if (requestedNode is not null)
            {
                return requestedNode.NodeId;
            }
        }

        var independentRoot = nodes.FirstOrDefault(node => !node.EffectSpec.IsSubordinate);
        return independentRoot?.NodeId ?? nodes[0].NodeId;
    }

    /// <summary>
    /// True when the incoming selection already satisfies a prompted node - which is the case on the resume
    /// pass, where the prompt answer arrives as the context's selected targets.
    /// </summary>
    private static bool HasSelectionForPromptedStep(GameCardEffectContext context, EffectSpec effectSpec)
    {
        return effectSpec.TargetRules.AutoSelectAllValidTargets || context.SelectedTargets.Count > 0;
    }

    /// <summary>
    /// Builds the prompt that asks the player to pick a prompted node's targets. Returns false when there is
    /// nothing to ask about, so the node falls through to its normal (failing) execution path instead of
    /// stranding the chain on an empty prompt.
    /// </summary>
    private bool TryCreateSelectionPrompt(
        GameCardEffectContext stepContext,
        EffectSpec effectSpec,
        string nodeId,
        IReadOnlyDictionary<string, string> sharedArguments,
        PendingRevealPresentation revealPresentation,
        out GamePrompt prompt)
    {
        prompt = null!;

        var candidates = FilterSupportEffectImmuneTargets(
            stepContext,
            effectSpec,
            targetResolver.ResolveTargets(stepContext, effectSpec));

        var options = candidates
            .Select(candidate => candidate.CardInstanceId)
            .Where(candidateId => !string.IsNullOrWhiteSpace(candidateId))
            .Distinct(StringComparer.Ordinal)
            .ToList();

        if (options.Count == 0)
        {
            return false;
        }

        var primaryCandidate = candidates[0];
        var (minimumSelection, maximumSelection) = ResolvePromptSelectionBounds(effectSpec);

        prompt = new GamePrompt
        {
            Type = GamePromptType.Effect,
            RequestedPlayerId = stepContext.ActingPlayer.Id,
            Options = options,
            SelectionPromptKind = effectSpec.SelectionPromptKind,
            CandidateZone = primaryCandidate.Zone,
            CandidatePlayerId = primaryCandidate.PlayerId,
            MinimumSelection = minimumSelection,
            MaximumSelection = maximumSelection,
            EffectContinuation = new PendingEffectContinuation
            {
                ResumeNodeId = nodeId,
                ActingPlayerId = stepContext.ActingPlayer.Id,
                SourceCardDefinitionId = stepContext.SourceCardDefinition.Id,
                SourceCardInstanceId = stepContext.SourceCardInstance?.InstanceId,
                Arguments = new Dictionary<string, string>(sharedArguments, StringComparer.Ordinal),
                SelectedTargets = stepContext.SelectedTargets.ToList(),
                // A prompt raised after a presented reveal carries it, so the chain still turns the card back
                // down once the player answers this one.
                RevealPresentation = revealPresentation.PresentedTargets.Count > 0 ? revealPresentation : null,
            },
        };

        prompt.EffectContinuation.PromptId = prompt.PromptId;
        return true;
    }

    private static (int Minimum, int Maximum) ResolvePromptSelectionBounds(EffectSpec effectSpec)
    {
        var targetRules = effectSpec.TargetRules;

        if (targetRules.ExactTargetCount.HasValue)
        {
            return (targetRules.ExactTargetCount.Value, targetRules.ExactTargetCount.Value);
        }

        if (targetRules.MinimumTargetCount.HasValue || targetRules.MaximumTargetCount.HasValue)
        {
            return (targetRules.MinimumTargetCount ?? 1, targetRules.MaximumTargetCount ?? int.MaxValue);
        }

        return (1, 1);
    }

    private static string? NormalizeEffectId(string? effectId)
    {
        return string.IsNullOrWhiteSpace(effectId) ? null : effectId.Trim();
    }

    private ErrorOr<IReadOnlyList<GameEffectTargetReference>> ResolveStepTargets(GameCardEffectContext context, EffectSpec effectSpec)
    {
        var targetsResult = effectSpec.ExecutionTargetSource switch
        {
            EffectExecutionTargetSource.SelectedTargets => ResolveSelectedTargets(context, effectSpec),
            EffectExecutionTargetSource.SourceCard => ResolveSourceCardTarget(context),
            EffectExecutionTargetSource.None => ErrorOrFactory.From<IReadOnlyList<GameEffectTargetReference>>(Array.Empty<GameEffectTargetReference>()),
            _ => Error.Validation(
                code: "Game.Effect.Sequential.UnsupportedTargetSource",
                description: $"Unsupported execution target source '{effectSpec.ExecutionTargetSource}'.")
        };

        if (targetsResult.IsError)
        {
            return targetsResult.Errors;
        }

        var filteredTargets = FilterSupportEffectImmuneTargets(context, effectSpec, targetsResult.Value);
        return ErrorOrFactory.From<IReadOnlyList<GameEffectTargetReference>>(filteredTargets);
    }

    private ErrorOr<IReadOnlyList<GameEffectTargetReference>> ResolveSelectedTargets(GameCardEffectContext context, EffectSpec effectSpec)
    {
        if (effectSpec.TargetRules.AutoSelectAllValidTargets)
        {
            var resolvedTargets = targetResolver.ResolveTargets(context, effectSpec);
            return ErrorOrFactory.From<IReadOnlyList<GameEffectTargetReference>>(resolvedTargets);
        }

        if (context.SelectedTargets.Count > 0)
        {
            return ErrorOrFactory.From<IReadOnlyList<GameEffectTargetReference>>(context.SelectedTargets);
        }

        // Subordinate steps of a reveal chain ("reveal the top card of your deck, then summon it")
        // carry no explicit selection of their own - they act on the cards the previous step revealed.
        return ErrorOrFactory.From(ResolveRevealedTargets(context));
    }

    private static IReadOnlyList<GameEffectTargetReference> ResolveRevealedTargets(GameCardEffectContext context)
    {
        var revealedCardInstanceIds = ResolveRevealedCardInstanceIds(context);
        if (revealedCardInstanceIds.Count == 0)
        {
            return [];
        }

        var targets = new List<GameEffectTargetReference>(revealedCardInstanceIds.Count);

        foreach (var revealedCardInstanceId in revealedCardInstanceIds)
        {
            var reference = TryResolveCardTargetReference(context, revealedCardInstanceId);
            if (reference is not null)
            {
                targets.Add(reference);
            }
        }

        return targets;
    }

    private static IReadOnlyList<string> ResolveRevealedCardInstanceIds(GameCardEffectContext context)
    {
        if (context.Arguments.TryGetValue(ReactiveEffectExecutionConstants.RevealedTargetIdsArgument, out var revealedIdsCsv)
            && !string.IsNullOrWhiteSpace(revealedIdsCsv))
        {
            return revealedIdsCsv
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Distinct(StringComparer.Ordinal)
                .ToList();
        }

        if (context.Arguments.TryGetValue(ReactiveEffectExecutionConstants.RevealedPrimaryTargetIdArgument, out var primaryTargetId)
            && !string.IsNullOrWhiteSpace(primaryTargetId))
        {
            return [primaryTargetId.Trim()];
        }

        return [];
    }

    private static GameEffectTargetReference? TryResolveCardTargetReference(GameCardEffectContext context, string cardInstanceId)
    {
        foreach (var player in context.Game.State.Players)
        {
            if (player.LeaderCardInstance is not null
                && string.Equals(player.LeaderCardInstance.InstanceId, cardInstanceId, StringComparison.Ordinal))
            {
                return new GameEffectTargetReference(
                    PlayerId: player.PlayerId,
                    Zone: PlayerZone.Leader,
                    CardInstanceId: cardInstanceId);
            }

            foreach (var zone in RevealedTargetZones)
            {
                var zoneCards = PlayerZoneCardAccessor.GetCards(zone, player);
                if (zoneCards.Any(card => string.Equals(card.InstanceId, cardInstanceId, StringComparison.Ordinal)))
                {
                    return new GameEffectTargetReference(
                        PlayerId: player.PlayerId,
                        Zone: zone,
                        CardInstanceId: cardInstanceId);
                }
            }
        }

        return null;
    }

    private static IReadOnlyList<GameEffectTargetReference> FilterSupportEffectImmuneTargets(
        GameCardEffectContext context,
        EffectSpec effectSpec,
        IReadOnlyList<GameEffectTargetReference> targets)
    {
        if (effectSpec.EffectType != EffectKind.Support || targets.Count == 0)
        {
            return targets;
        }

        var filteredTargets = new List<GameEffectTargetReference>(targets.Count);

        foreach (var target in targets)
        {
            if (target.IsEffectResolutionStackTarget)
            {
                filteredTargets.Add(target);
                continue;
            }

            if (!TryResolveTargetCardInstance(context.Game.State, target, out var targetCardInstance))
            {
                filteredTargets.Add(target);
                continue;
            }

            var sameControllerAsActingPlayer = string.Equals(
                targetCardInstance.ControllerPlayerId,
                context.ActingPlayer.Id,
                StringComparison.Ordinal);

            if (sameControllerAsActingPlayer)
            {
                filteredTargets.Add(target);
                continue;
            }

            var effectiveKeywords = CardRuntimeEffectStateService.ResolveEffectiveKeywords(context.Game.State, targetCardInstance);
            var isImmuneToOpponentSupport = effectiveKeywords.Any(keyword =>
                string.Equals(keyword, EffectConditionKeywords.NotAffectedByOpponentSupportEffects, StringComparison.OrdinalIgnoreCase));

            if (!isImmuneToOpponentSupport)
            {
                filteredTargets.Add(target);
            }
        }

        return filteredTargets;
    }

    private static bool TryResolveTargetCardInstance(
        GameState state,
        GameEffectTargetReference target,
        out CardInstance cardInstance)
    {
        cardInstance = null!;

        var targetPlayer = state.Players.FirstOrDefault(player =>
            string.Equals(player.PlayerId, target.PlayerId, StringComparison.Ordinal));

        if (targetPlayer is null)
        {
            return false;
        }

        cardInstance = PlayerZoneCardAccessor.GetCards(target.Zone, targetPlayer)
            .FirstOrDefault(card => string.Equals(card.InstanceId, target.CardInstanceId, StringComparison.Ordinal))!;

        return cardInstance is not null;
    }

    private static ErrorOr<IReadOnlyList<GameEffectTargetReference>> ResolveSourceCardTarget(GameCardEffectContext context)
    {
        var sourceCardInstance = context.SourceCardInstance;
        if (sourceCardInstance is null)
        {
            return Error.Validation(
                code: "Game.Effect.Sequential.SourceCardMissing",
                description: "Execution target source 'SourceCard' requires a source card instance.");
        }

        foreach (var player in context.Game.State.Players)
        {
            var zone = TryFindZone(player, sourceCardInstance.InstanceId);
            if (zone is null)
            {
                continue;
            }

            IReadOnlyList<GameEffectTargetReference> sourceTarget =
            [
                new GameEffectTargetReference(
                    PlayerId: player.PlayerId,
                    Zone: zone.Value,
                    CardInstanceId: sourceCardInstance.InstanceId)
            ];

            return ErrorOrFactory.From(sourceTarget);
        }

        return Error.NotFound(
            code: "Game.Effect.Sequential.SourceCardNotFound",
            description: $"Source card instance '{sourceCardInstance.InstanceId}' was not found in any zone.");
    }

    private static PlayerZone? TryFindZone(PlayerState player, string cardInstanceId)
    {
        if (player.Battlefield.Any(card => string.Equals(card.InstanceId, cardInstanceId, StringComparison.Ordinal)))
        {
            return PlayerZone.CharacterField;
        }

        if (player.SupportZone.Any(card => string.Equals(card.InstanceId, cardInstanceId, StringComparison.Ordinal)))
        {
            return PlayerZone.SupportZone;
        }

        if (player.Hand.Any(card => string.Equals(card.InstanceId, cardInstanceId, StringComparison.Ordinal)))
        {
            return PlayerZone.Hand;
        }

        if (player.Deck.Any(card => string.Equals(card.InstanceId, cardInstanceId, StringComparison.Ordinal)))
        {
            return PlayerZone.Deck;
        }

        if (player.DiscardPile.Any(card => string.Equals(card.InstanceId, cardInstanceId, StringComparison.Ordinal)))
        {
            return PlayerZone.Trash;
        }

        if (player.ExileZone.Any(card => string.Equals(card.InstanceId, cardInstanceId, StringComparison.Ordinal)))
        {
            return PlayerZone.ExileZone;
        }

        return null;
    }

    private static bool TryResolveEffectKey(RuntimeEffects runtimeEffectType, out string effectTypeKey)
    {
        return RuntimeEffectKeys.TryResolve(runtimeEffectType, out effectTypeKey);
    }

    private static int ResolveActivationCost(EffectSpec effectSpec, IReadOnlyDictionary<string, string> arguments)
    {
        // Support activations are paid when they are activated, not when the (possibly negated)
        // activation resolves, so the replay must not charge the same chakra a second time.
        if (IsActivationCostAlreadyPaid(arguments))
        {
            return 0;
        }

        return ResolveActivationCost(effectSpec);
    }

    private static bool IsActivationCostAlreadyPaid(IReadOnlyDictionary<string, string> arguments)
    {
        return arguments.TryGetValue(ReactiveEffectExecutionConstants.ActivationCostPaidArgument, out var rawValue)
            && bool.TryParse(rawValue, out var isPaid)
            && isPaid;
    }

    private static int ResolveActivationCost(EffectSpec effectSpec)
    {
        return effectSpec.ChakraCost.HasValue
            ? Math.Max(0, effectSpec.ChakraCost.Value)
            : 0;
    }

    private static ErrorOr<Success> TryApplyActivationCost(GameCardEffectContext context, int chakraCost)
    {
        if (chakraCost <= 0)
        {
            return Result.Success;
        }

        var player = context.Game.State.Players.FirstOrDefault(entry =>
            string.Equals(entry.PlayerId, context.ActingPlayer.Id, StringComparison.Ordinal));

        if (player is null)
        {
            return Error.NotFound(
                code: "Game.Effect.Sequential.ActingPlayerNotFound",
                description: $"Acting player '{context.ActingPlayer.Id}' was not found.");
        }

        if (player.ResourcePool < chakraCost)
        {
            return Error.Validation(
                code: "Game.Effect.Sequential.InsufficientChakra",
                description: $"Player '{player.PlayerId}' does not have enough chakra to pay {chakraCost}.");
        }

        player.ResourcePool -= chakraCost;
        return Result.Success;
    }

    private static ErrorOr<Success> TryReserveActivationCost(
        string actingPlayerId,
        int chakraCost,
        Dictionary<string, int> simulatedResourcePoolByPlayer)
    {
        if (chakraCost <= 0)
        {
            return Result.Success;
        }

        if (!simulatedResourcePoolByPlayer.TryGetValue(actingPlayerId, out var availableChakra))
        {
            return Error.NotFound(
                code: "Game.Effect.Sequential.ActingPlayerNotFound",
                description: $"Acting player '{actingPlayerId}' was not found.");
        }

        if (availableChakra < chakraCost)
        {
            return Error.Validation(
                code: "Game.Effect.Sequential.InsufficientChakra",
                description: $"Player '{actingPlayerId}' does not have enough chakra to pay {chakraCost}.");
        }

        simulatedResourcePoolByPlayer[actingPlayerId] = availableChakra - chakraCost;
        return Result.Success;
    }

    private sealed record AtomicChainExecutionResult(string? NextNodeId, bool IsSuspended = false);

    private sealed record AtomicExecutionPlan(
        IReadOnlyList<PlannedExecutionStep> Steps,
        bool Aborted,
        string? NextNodeId,
        string? PendingRevealNodeId = null);

    private sealed record PlannedExecutionStep(
        string NodeId,
        IGameCardEffect Effect,
        GameCardEffectContext Context,
        int ActivationCost);

    private sealed record ExecutionNode(string NodeId, EffectSpec EffectSpec);
}