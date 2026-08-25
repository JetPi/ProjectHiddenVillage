using ErrorOr;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class GameSequentialEffectExecutor(
    IGameCardEffectRegistry effectRegistry,
    IGameEffectTargetResolver? targetResolver = null) : IGameSequentialEffectExecutor
{
    private const int MaxVisitsPerNode = 4;

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

        var nodeById = nodes.ToDictionary(node => node.NodeId, node => node, StringComparer.Ordinal);
        var visitCounts = new Dictionary<string, int>(StringComparer.Ordinal);
        var currentNodeId = ResolveEntryNodeId(nodes);

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
                    visitCounts: visitCounts);

                if (atomicResult.IsError)
                {
                    return atomicResult.Errors;
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
                effectSpec: effectSpec);

            var arguments = new Dictionary<string, string>(context.Arguments, StringComparer.Ordinal)
            {
                [ReactiveEffectExecutionConstants.ActiveEffectSpecIdArgument] = effectSpec.Id,
                [ReactiveEffectExecutionConstants.SupportActivationChakraCostArgument] = activationCost.ToString(),
                [ReactiveEffectExecutionConstants.EnforceTargetCountArgument] = bool.TrueString,
            };

            var selectedTargetsResult = ResolveStepTargets(context, effectSpec);
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

            if (shouldExecuteBeforeCondition && !ConditionMatches(effectSpec.ExecutionCondition, perEffectContext.Arguments))
            {
                currentNodeId = branchOnFailure;
                continue;
            }

            currentNodeId = branchOnSuccess;
        }

        return Result.Success;
    }

    private ErrorOr<AtomicChainExecutionResult> TryExecuteAtomicChain(
        string startNodeId,
        IReadOnlyDictionary<string, ExecutionNode> nodeById,
        GameCardEffectContext context,
        Dictionary<string, int> visitCounts)
    {
        var chainResult = BuildAtomicExecutionPlan(startNodeId, nodeById, context, visitCounts);
        if (chainResult.IsError)
        {
            return chainResult.Errors;
        }

        var chain = chainResult.Value;
        if (chain.Aborted)
        {
            return new AtomicChainExecutionResult(chain.NextNodeId);
        }

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
        }

        return new AtomicChainExecutionResult(chain.NextNodeId);
    }

    private ErrorOr<AtomicExecutionPlan> BuildAtomicExecutionPlan(
        string startNodeId,
        IReadOnlyDictionary<string, ExecutionNode> nodeById,
        GameCardEffectContext context,
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
                effectSpec: effectSpec);

            var arguments = new Dictionary<string, string>(context.Arguments, StringComparer.Ordinal)
            {
                [ReactiveEffectExecutionConstants.ActiveEffectSpecIdArgument] = effectSpec.Id,
                [ReactiveEffectExecutionConstants.SupportActivationChakraCostArgument] = activationCost.ToString(),
                [ReactiveEffectExecutionConstants.EnforceTargetCountArgument] = bool.TrueString,
            };

            var selectedTargetsResult = ResolveStepTargets(context, effectSpec);
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
                chakraCost: activationCost,
                simulatedResourcePoolByPlayer: simulatedResourcePoolByPlayer);
            if (preflightResult.IsError)
            {
                var nextNodeId = branchOnFailure;
                return new AtomicExecutionPlan(
                    Steps: [],
                    Aborted: true,
                    NextNodeId: nextNodeId);
            }

            steps.Add(new PlannedExecutionStep(effect, perEffectContext, activationCost));
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

    private static bool ShouldExecuteBeforeCondition(EffectSpec effectSpec)
    {
        return effectSpec.RuntimeEffectType == RuntimeEffects.RevealCard
            && effectSpec.RevealTimingMode == RevealTimingMode.RevealFirst;
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

    private static string ResolveEntryNodeId(IReadOnlyList<ExecutionNode> nodes)
    {
        var independentRoot = nodes.FirstOrDefault(node => !node.EffectSpec.IsSubordinate);
        return independentRoot?.NodeId ?? nodes[0].NodeId;
    }

    private static string? NormalizeEffectId(string? effectId)
    {
        return string.IsNullOrWhiteSpace(effectId) ? null : effectId.Trim();
    }

    private ErrorOr<IReadOnlyList<GameEffectTargetReference>> ResolveStepTargets(GameCardEffectContext context, EffectSpec effectSpec)
    {
        return effectSpec.ExecutionTargetSource switch
        {
            EffectExecutionTargetSource.SelectedTargets => ResolveSelectedTargets(context, effectSpec),
            EffectExecutionTargetSource.SourceCard => ResolveSourceCardTarget(context),
            EffectExecutionTargetSource.None => ErrorOrFactory.From<IReadOnlyList<GameEffectTargetReference>>(Array.Empty<GameEffectTargetReference>()),
            _ => Error.Validation(
                code: "Game.Effect.Sequential.UnsupportedTargetSource",
                description: $"Unsupported execution target source '{effectSpec.ExecutionTargetSource}'.")
        };
    }

    private ErrorOr<IReadOnlyList<GameEffectTargetReference>> ResolveSelectedTargets(GameCardEffectContext context, EffectSpec effectSpec)
    {
        if (effectSpec.TargetRules.AutoSelectAllValidTargets)
        {
            var resolvedTargets = targetResolver.ResolveTargets(context, effectSpec);
            return ErrorOrFactory.From<IReadOnlyList<GameEffectTargetReference>>(resolvedTargets);
        }

        return ErrorOrFactory.From<IReadOnlyList<GameEffectTargetReference>>(context.SelectedTargets);
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
        effectTypeKey = runtimeEffectType switch
        {
            RuntimeEffects.DestroyCard => DestroyCardEffect.EffectKey,
            RuntimeEffects.NegateEffect => NegateCardEffect.EffectKey,
            RuntimeEffects.FreezeCard => FreezeCardEffect.EffectKey,
            RuntimeEffects.InterruptAttack => InterruptAttackEffect.EffectKey,
            RuntimeEffects.GainEffect => GainKeywordEffect.EffectKey,
            RuntimeEffects.ChangeValues => ModifyAttributeEffect.EffectKey,
            RuntimeEffects.AlterResources => AlterResourcesEffect.EffectKey,
            RuntimeEffects.Tribute => TributeSummonCardEffect.EffectKey,
            RuntimeEffects.SummonCard => SummonCardEffect.EffectKey,
            RuntimeEffects.MoveCard => MoveCardEffect.EffectKey,
            RuntimeEffects.RevealCard => RevealCardEffect.EffectKey,
            _ => string.Empty,
        };

        return !string.IsNullOrWhiteSpace(effectTypeKey);
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

    private sealed record AtomicChainExecutionResult(string? NextNodeId);

    private sealed record AtomicExecutionPlan(
        IReadOnlyList<PlannedExecutionStep> Steps,
        bool Aborted,
        string? NextNodeId);

    private sealed record PlannedExecutionStep(
        IGameCardEffect Effect,
        GameCardEffectContext Context,
        int ActivationCost);

    private sealed record ExecutionNode(string NodeId, EffectSpec EffectSpec);
}