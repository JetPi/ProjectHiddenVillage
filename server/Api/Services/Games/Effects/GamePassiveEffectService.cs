using ErrorOr;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class GamePassiveEffectService(
    IGameEffectCanExecuteEvaluator canExecuteEvaluator,
    IGameCardEffectRegistry effectRegistry) : IGamePassiveEffectService
{
    private static readonly IReadOnlyDictionary<string, string> EmptyArguments =
        new Dictionary<string, string>(StringComparer.Ordinal);

    private readonly IGameEffectCanExecuteEvaluator canExecuteEvaluator = canExecuteEvaluator;
    private readonly IGameCardEffectRegistry effectRegistry = effectRegistry;

    public ErrorOr<PassiveEvaluationResult> EvaluateAndEnqueue(
        GameInstance game,
        GameMutationEvent mutationEvent,
        PassiveChainResolutionOptions options)
    {
        ArgumentNullException.ThrowIfNull(game);
        ArgumentNullException.ThrowIfNull(mutationEvent);
        ArgumentNullException.ThrowIfNull(options);

        var activatedPassiveKeys = new List<string>();
        var deactivatedPassiveKeys = new List<string>();
        var enqueuedEntryIds = new List<string>();
        var consequenceDeduplicationSet = new HashSet<string>(StringComparer.Ordinal);

        var triggerKind = MapTriggerKind(mutationEvent.Kind);
        var existingStateByPassiveKey = game.State.PassiveStates
            .ToDictionary(state => state.PassiveKey, state => state, StringComparer.Ordinal);

        var nextStateByPassiveKey = new Dictionary<string, PassiveActivationState>(StringComparer.Ordinal);
        var discoveredPassiveKeys = new HashSet<string>(StringComparer.Ordinal);

        foreach (var passiveSource in EnumeratePassiveSources(game.State))
        {
            var passiveKey = BuildPassiveKey(passiveSource.SourceCardInstance.InstanceId, passiveSource.EffectSpec.Id);
            discoveredPassiveKeys.Add(passiveKey);

            var previousState = existingStateByPassiveKey.TryGetValue(passiveKey, out var existing)
                ? existing
                : new PassiveActivationState
                {
                    PassiveKey = passiveKey,
                    SourceCardInstanceId = passiveSource.SourceCardInstance.InstanceId,
                    SourcePlayerId = passiveSource.SourceCardInstance.ControllerPlayerId,
                    EffectSpecId = passiveSource.EffectSpec.Id,
                    IsActive = false,
                    LastChangedAtTurn = game.State.TurnNumber,
                    LastChangedAtPhase = game.State.Phase,
                };

            if (!ShouldReevaluate(passiveSource.EffectSpec, triggerKind))
            {
                nextStateByPassiveKey[passiveKey] = previousState;
                continue;
            }

            var isActiveNow = EvaluateIsActive(game, passiveSource);
            var wasActive = previousState.IsActive;

            previousState.IsActive = isActiveNow;
            if (wasActive != isActiveNow)
            {
                previousState.LastChangedAtTurn = game.State.TurnNumber;
                previousState.LastChangedAtPhase = game.State.Phase;
            }

            nextStateByPassiveKey[passiveKey] = previousState;

            if (!wasActive && isActiveNow)
            {
                activatedPassiveKeys.Add(passiveKey);
            }
            else if (wasActive && !isActiveNow)
            {
                deactivatedPassiveKeys.Add(passiveKey);
            }

            if (ShouldEnqueueConsequences(passiveSource.EffectSpec, wasActive, isActiveNow))
            {
                EnqueuePassiveConsequences(
                    game,
                    passiveSource,
                    passiveKey,
                    options,
                    consequenceDeduplicationSet,
                    enqueuedEntryIds);
            }
        }

        foreach (var staleState in game.State.PassiveStates.Where(state => !discoveredPassiveKeys.Contains(state.PassiveKey)))
        {
            if (staleState.IsActive)
            {
                deactivatedPassiveKeys.Add(staleState.PassiveKey);
            }
        }

        game.State.PassiveStates = nextStateByPassiveKey.Values
            .OrderBy(state => state.PassiveKey, StringComparer.Ordinal)
            .ToList();

        return new PassiveEvaluationResult
        {
            ActivatedPassiveKeys = activatedPassiveKeys,
            DeactivatedPassiveKeys = deactivatedPassiveKeys,
            EnqueuedStackEntryIds = enqueuedEntryIds,
        };
    }

    private bool EvaluateIsActive(GameInstance game, PassiveSource passiveSource)
    {
        var context = new GameCardEffectContext(
            game: game,
            actingPlayer: new Player { Id = passiveSource.SourceCardInstance.ControllerPlayerId },
            sourceCardDefinition: passiveSource.SourceCardDefinition,
            sourceCardInstance: passiveSource.SourceCardInstance,
            arguments: EmptyArguments,
            selectedTargets: []);

        var canExecuteResult = canExecuteEvaluator.Evaluate(context, passiveSource.EffectSpec, includeValidTargets: false);
        return canExecuteResult.CanExecute;
    }

    private void EnqueuePassiveConsequences(
        GameInstance game,
        PassiveSource passiveSource,
        string passiveKey,
        PassiveChainResolutionOptions options,
        HashSet<string> consequenceDeduplicationSet,
        List<string> enqueuedEntryIds)
    {
        foreach (var consequence in passiveSource.EffectSpec.PassiveConsequences)
        {
            if (string.IsNullOrWhiteSpace(consequence.ConsequenceEffectTypeKey))
            {
                continue;
            }

            var trimmedEffectTypeKey = consequence.ConsequenceEffectTypeKey.Trim();
            if (!effectRegistry.TryResolve(trimmedEffectTypeKey, out _))
            {
                continue;
            }

            var dedupeKey = $"{passiveKey}:{trimmedEffectTypeKey}";
            if (options.DeduplicateByPassiveKey && !consequenceDeduplicationSet.Add(dedupeKey))
            {
                continue;
            }

            var stackEntry = new EffectResolutionStackEntry
            {
                SourcePlayerId = passiveSource.SourceCardInstance.ControllerPlayerId,
                SourceZone = passiveSource.SourceZone,
                SourceCardInstanceId = passiveSource.SourceCardInstance.InstanceId,
                EffectTypeKey = trimmedEffectTypeKey,
                IsNegated = false,
            };

            game.State.EffectResolutionStack.Add(stackEntry);
            enqueuedEntryIds.Add(stackEntry.EntryId);
        }
    }

    private static bool ShouldEnqueueConsequences(EffectSpec effectSpec, bool wasActive, bool isActiveNow)
    {
        if (!isActiveNow || effectSpec.PassiveConsequences.Count == 0)
        {
            return false;
        }

        if (effectSpec.PassiveMode == PassiveMode.Triggered)
        {
            return true;
        }

        return !wasActive;
    }

    private static bool ShouldReevaluate(EffectSpec effectSpec, PassiveTriggerKind triggerKind)
    {
        var reevaluation = effectSpec.PassiveReevaluation;
        if (reevaluation is null || reevaluation.TriggerKinds.Count == 0)
        {
            return true;
        }

        return reevaluation.TriggerKinds.Contains(PassiveTriggerKind.Any)
            || reevaluation.TriggerKinds.Contains(triggerKind);
    }

    private static string BuildPassiveKey(string sourceCardInstanceId, string effectSpecId)
    {
        return string.Concat(sourceCardInstanceId, ":", effectSpecId);
    }

    private static PassiveTriggerKind MapTriggerKind(GameMutationKind kind)
    {
        return kind switch
        {
            GameMutationKind.CardSummoned or GameMutationKind.CardMovedZone => PassiveTriggerKind.ZoneChanged,
            GameMutationKind.CardStatChanged or GameMutationKind.LeaderStatChanged or GameMutationKind.KeywordChanged => PassiveTriggerKind.StatsChanged,
            GameMutationKind.TurnAdvanced => PassiveTriggerKind.TurnChanged,
            GameMutationKind.PhaseAdvanced => PassiveTriggerKind.PhaseChanged,
            GameMutationKind.EffectResolved => PassiveTriggerKind.StackResolved,
            _ => PassiveTriggerKind.Any,
        };
    }

    private static IEnumerable<PassiveSource> EnumeratePassiveSources(GameState gameState)
    {
        foreach (var player in gameState.Players)
        {
            foreach (var card in player.Battlefield)
            {
                if (!gameState.CardDefinitions.TryGetValue(card.CardDefinitionId, out var definition))
                {
                    continue;
                }

                foreach (var effectSpec in GetPassiveEffects(definition))
                {
                    yield return new PassiveSource(card, definition, effectSpec, PlayerZone.CharacterField);
                }
            }

            foreach (var card in player.SupportZone)
            {
                if (!gameState.CardDefinitions.TryGetValue(card.CardDefinitionId, out var definition))
                {
                    continue;
                }

                foreach (var effectSpec in GetPassiveEffects(definition))
                {
                    yield return new PassiveSource(card, definition, effectSpec, PlayerZone.SupportZone);
                }
            }
        }
    }

    private static IEnumerable<EffectSpec> GetPassiveEffects(Card definition)
    {
        return definition.Effects.Where(effect =>
            effect.PassiveMode != PassiveMode.None
            && !string.IsNullOrWhiteSpace(effect.Id)
            && effect.PassiveConsequences.Count > 0);
    }

    private sealed record PassiveSource(
        CardInstance SourceCardInstance,
        Card SourceCardDefinition,
        EffectSpec EffectSpec,
        PlayerZone SourceZone);
}