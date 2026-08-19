using ErrorOr;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class GameEffectChainResolver : IGameEffectChainResolver
{
    private readonly IGameCardEffectRegistry effectRegistry;

    public GameEffectChainResolver(IGameCardEffectRegistry effectRegistry)
    {
        this.effectRegistry = effectRegistry;
    }

    public ErrorOr<EffectChainResolutionResult> Resolve(
        GameInstance game,
        string? actingPlayerId,
        PassiveChainResolutionOptions options)
    {
        ArgumentNullException.ThrowIfNull(game);
        ArgumentNullException.ThrowIfNull(options);

        // Phase 1 foundation: deterministic stack resolution will be added
        // once passive consequence enqueueing is wired.
        if (options.MaxEntriesPerCycle <= 0)
        {
            return Error.Validation(
                code: "Game.Effect.Chain.InvalidMaxEntriesPerCycle",
                description: "MaxEntriesPerCycle must be greater than zero.");
        }

        if (options.MaxDepth <= 0)
        {
            return Error.Validation(
                code: "Game.Effect.Chain.InvalidMaxDepth",
                description: "MaxDepth must be greater than zero.");
        }

        var resolvedEntryIds = new List<string>();
        var skippedNegatedEntryIds = new List<string>();
        var processedCount = 0;

        for (var depth = 0; depth < options.MaxDepth; depth++)
        {
            if (game.State.EffectResolutionStack.Count == 0)
            {
                break;
            }

            if (processedCount >= options.MaxEntriesPerCycle)
            {
                break;
            }

            var entriesAtCycleStart = game.State.EffectResolutionStack.Count;
            var budgetThisCycle = Math.Min(entriesAtCycleStart, options.MaxEntriesPerCycle - processedCount);

            for (var processedThisCycle = 0; processedThisCycle < budgetThisCycle; processedThisCycle++)
            {
                var stackIndex = game.State.EffectResolutionStack.Count - 1;
                if (stackIndex < 0)
                {
                    break;
                }

                var entry = game.State.EffectResolutionStack[stackIndex];
                game.State.EffectResolutionStack.RemoveAt(stackIndex);
                processedCount++;

                if (entry.IsNegated)
                {
                    skippedNegatedEntryIds.Add(entry.EntryId);
                    continue;
                }

                if (!effectRegistry.TryResolve(entry.EffectTypeKey, out var effect) || effect is null)
                {
                    return CreateFailureResult(
                        resolvedEntryIds,
                        skippedNegatedEntryIds,
                        entry.EntryId,
                        $"Could not resolve effect type '{entry.EffectTypeKey}'.");
                }

                var sourcePlayer = game.State.Players.FirstOrDefault(player =>
                    string.Equals(player.PlayerId, entry.SourcePlayerId, StringComparison.Ordinal));

                if (sourcePlayer is null)
                {
                    return CreateFailureResult(
                        resolvedEntryIds,
                        skippedNegatedEntryIds,
                        entry.EntryId,
                        $"Source player '{entry.SourcePlayerId}' was not found.");
                }

                var sourceCardInstance = TryResolveSourceCardInstance(sourcePlayer, entry);
                if (sourceCardInstance is null)
                {
                    return CreateFailureResult(
                        resolvedEntryIds,
                        skippedNegatedEntryIds,
                        entry.EntryId,
                        $"Source card instance '{entry.SourceCardInstanceId}' was not found.");
                }

                if (!game.State.CardDefinitions.TryGetValue(sourceCardInstance.CardDefinitionId, out var sourceCardDefinition))
                {
                    return CreateFailureResult(
                        resolvedEntryIds,
                        skippedNegatedEntryIds,
                        entry.EntryId,
                        $"Card definition '{sourceCardInstance.CardDefinitionId}' was not found.");
                }

                var executionPlayerId = ResolveExecutionPlayerId(game.State, actingPlayerId, entry.SourcePlayerId);
                var arguments = new Dictionary<string, string>(StringComparer.Ordinal);
                foreach (var (argumentKey, argumentValue) in entry.Arguments)
                {
                    arguments[argumentKey] = argumentValue;
                }

                arguments[ReactiveEffectExecutionConstants.SkipReactiveOrchestrationArgument] = bool.TrueString;

                var targetResolution = ResolveExecutionTargets(game.State, entry.SelectedTargets, arguments);
                if (options.ConsequenceTargetValidationMode == ConsequenceTargetValidationMode.Strict
                    && targetResolution.MissingExpectedTargetIds.Count > 0)
                {
                    var missingTargets = string.Join(", ", targetResolution.MissingExpectedTargetIds);
                    return CreateFailureResult(
                        resolvedEntryIds,
                        skippedNegatedEntryIds,
                        entry.EntryId,
                        $"Strict target validation failed. Missing targets: {missingTargets}.");
                }

                var context = new GameCardEffectContext(
                    game: game,
                    actingPlayer: new Player { Id = executionPlayerId },
                    sourceCardDefinition: sourceCardDefinition,
                    sourceCardInstance: sourceCardInstance,
                    arguments: arguments,
                    selectedTargets: targetResolution.ResolvedTargets);

                var executeResult = effect.Execute(context, targetResolution.ResolvedTargets);
                if (executeResult.IsError)
                {
                    var firstError = executeResult.Errors.First();
                    return CreateFailureResult(
                        resolvedEntryIds,
                        skippedNegatedEntryIds,
                        entry.EntryId,
                        $"{firstError.Code}: {firstError.Description}");
                }

                resolvedEntryIds.Add(entry.EntryId);
            }
        }

        return new EffectChainResolutionResult
        {
            ResolvedStackEntryIds = resolvedEntryIds,
            SkippedNegatedEntryIds = skippedNegatedEntryIds,
        };
    }

    private static string ResolveExecutionPlayerId(GameState state, string? requestedPlayerId, string fallbackPlayerId)
    {
        if (!string.IsNullOrWhiteSpace(requestedPlayerId)
            && state.Players.Any(player => string.Equals(player.PlayerId, requestedPlayerId, StringComparison.Ordinal)))
        {
            return requestedPlayerId;
        }

        return fallbackPlayerId;
    }

    private static TargetResolutionResult ResolveExecutionTargets(
        GameState state,
        IReadOnlyList<GameEffectTargetReference> requestedTargets,
        IReadOnlyDictionary<string, string> arguments)
    {
        var resolvedTargets = new List<GameEffectTargetReference>();
        var missingExpectedTargetIds = new List<string>();

        foreach (var target in requestedTargets)
        {
            var resolvedTarget = TryResolveTargetReference(state, target);
            if (resolvedTarget is not null)
            {
                resolvedTargets.Add(resolvedTarget);
            }
        }

        if (arguments.TryGetValue(ReactiveEffectExecutionConstants.ExpectedTriggerTargetIdsArgument, out var expectedTargetsCsv)
            && !string.IsNullOrWhiteSpace(expectedTargetsCsv))
        {
            var expectedTargetIds = expectedTargetsCsv
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Distinct(StringComparer.Ordinal)
                .ToArray();

            var resolvedTargetIds = new HashSet<string>(
                resolvedTargets.Select(target => target.CardInstanceId),
                StringComparer.Ordinal);

            foreach (var expectedTargetId in expectedTargetIds)
            {
                if (!resolvedTargetIds.Contains(expectedTargetId))
                {
                    missingExpectedTargetIds.Add(expectedTargetId);
                }
            }
        }

        return new TargetResolutionResult(
            resolvedTargets,
            missingExpectedTargetIds);
    }

    private static GameEffectTargetReference? TryResolveTargetReference(GameState state, GameEffectTargetReference requestedTarget)
    {
        var requestedPlayer = state.Players.FirstOrDefault(player =>
            string.Equals(player.PlayerId, requestedTarget.PlayerId, StringComparison.Ordinal));

        if (requestedPlayer is not null)
        {
            var requestedZoneCards = PlayerZoneCardAccessor.GetCards(requestedTarget.Zone, requestedPlayer);
            if (requestedZoneCards.Any(card => string.Equals(card.InstanceId, requestedTarget.CardInstanceId, StringComparison.Ordinal)))
            {
                return requestedTarget;
            }
        }

        var allZones = new[]
        {
            PlayerZone.CharacterField,
            PlayerZone.SupportZone,
            PlayerZone.Hand,
            PlayerZone.Deck,
            PlayerZone.Trash,
            PlayerZone.ExileZone,
        };

        foreach (var player in state.Players.OrderBy(player => player.PlayerId, StringComparer.Ordinal))
        {
            foreach (var zone in allZones)
            {
                var zoneCards = PlayerZoneCardAccessor.GetCards(zone, player);
                if (!zoneCards.Any(card => string.Equals(card.InstanceId, requestedTarget.CardInstanceId, StringComparison.Ordinal)))
                {
                    continue;
                }

                return new GameEffectTargetReference(
                    PlayerId: player.PlayerId,
                    Zone: zone,
                    CardInstanceId: requestedTarget.CardInstanceId,
                    SlotId: requestedTarget.SlotId,
                    IsEffectResolutionStackTarget: requestedTarget.IsEffectResolutionStackTarget,
                    EffectResolutionEntryId: requestedTarget.EffectResolutionEntryId);
            }
        }

        return null;
    }

    private static CardInstance? TryResolveSourceCardInstance(PlayerState sourcePlayer, EffectResolutionStackEntry entry)
    {
        var preferredZoneCards = PlayerZoneCardAccessor.GetCards(entry.SourceZone, sourcePlayer);
        var sourceCard = preferredZoneCards.FirstOrDefault(card =>
            string.Equals(card.InstanceId, entry.SourceCardInstanceId, StringComparison.Ordinal));

        if (sourceCard is not null)
        {
            return sourceCard;
        }

        var allZones = new[]
        {
            PlayerZone.CharacterField,
            PlayerZone.SupportZone,
            PlayerZone.Hand,
            PlayerZone.Deck,
            PlayerZone.Trash,
            PlayerZone.ExileZone,
        };

        foreach (var zone in allZones)
        {
            var zoneCards = PlayerZoneCardAccessor.GetCards(zone, sourcePlayer);
            sourceCard = zoneCards.FirstOrDefault(card =>
                string.Equals(card.InstanceId, entry.SourceCardInstanceId, StringComparison.Ordinal));

            if (sourceCard is not null)
            {
                return sourceCard;
            }
        }

        return null;
    }

    private static EffectChainResolutionResult CreateFailureResult(
        IReadOnlyList<string> resolvedEntryIds,
        IReadOnlyList<string> skippedNegatedEntryIds,
        string failedEntryId,
        string failureReason)
    {
        return new EffectChainResolutionResult
        {
            ResolvedStackEntryIds = resolvedEntryIds,
            SkippedNegatedEntryIds = skippedNegatedEntryIds,
            FailedEntryId = failedEntryId,
            FailureReason = failureReason,
        };
    }

    private sealed record TargetResolutionResult(
        IReadOnlyList<GameEffectTargetReference> ResolvedTargets,
        IReadOnlyList<string> MissingExpectedTargetIds);
}