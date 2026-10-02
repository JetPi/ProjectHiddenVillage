using System.Globalization;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Engine;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>
/// Runs a card definition's automatic (mandatory) triggered effects for a single <see cref="EffectTiming"/>.
///
/// Every site that puts a character on the field funnels through here - the registry's normal summon and
/// requirement (tribute) summon, plus the <c>SummonCard</c> / <c>TributeSummonCard</c> effects - so
/// "[On Summon]" and "[When Attacking]" share one implementation and cannot drift apart. Optional
/// triggers (the ones with the "may" clause, which the player answers explicitly) are deliberately not
/// dispatched here.
///
/// Failures are logged instead of thrown: an effect the engine cannot execute yet (unsupported runtime
/// effect, a chain branch target that does not exist, a prompt a step cannot open) must not abort an action
/// whose board mutation already happened, because that would leave the game half-mutated with no way for
/// either client to continue.
/// </summary>
public static class GameTriggeredEffectRunner
{
    /// <summary>
    /// How many nested triggering dispatches ("[On Summon] summons a card that itself has an [On Summon]")
    /// may chain before the runner stops dispatching. The card pool allows summon effects to summon cards
    /// with summon effects, so the recursion has to be bounded somewhere; three levels covers every authored
    /// chain and guarantees resolution terminates.
    /// </summary>
    public const int MaxTriggerDepth = 3;

    /// <summary>Effect-context argument carrying the current trigger depth into nested executions.</summary>
    public const string TriggerDepthArgument = "__triggerDepth";

    public const string WhenAttackingSkippedActionType = "when_attacking_effect_skipped";

    public const string OnSummonSkippedActionType = "on_summon_effect_skipped";

    /// <summary>
    /// Executes every non-optional effect of <paramref name="sourceCardDefinition"/> whose timing matches
    /// <paramref name="timing"/>, returning one entry per failing effect (empty when everything resolved).
    /// </summary>
    public static IReadOnlyList<string> ExecuteAutomaticTimedEffects(
        GameInstance game,
        string actingPlayerId,
        Card sourceCardDefinition,
        CardInstance? sourceCardInstance,
        EffectTiming timing,
        IGameSequentialEffectExecutor sequentialEffectExecutor,
        int triggerDepth = 0)
    {
        var failures = new List<string>();

        foreach (var effectSpec in sourceCardDefinition.Effects)
        {
            if (effectSpec.Timing != timing || effectSpec.IsOptional)
            {
                continue;
            }

            var arguments = new Dictionary<string, string>(StringComparer.Ordinal)
            {
                [ReactiveEffectExecutionConstants.ActiveEffectSpecIdArgument] = string.IsNullOrWhiteSpace(effectSpec.Id)
                    ? effectSpec.RuntimeEffectType.ToString()
                    : effectSpec.Id,
                [TriggerDepthArgument] = triggerDepth.ToString(CultureInfo.InvariantCulture),
            };

            var singleEffectDefinition = CloneCardDefinitionWithEffectChain(sourceCardDefinition, effectSpec);

            var context = new GameCardEffectContext(
                game: game,
                actingPlayer: new Player { Id = actingPlayerId },
                sourceCardDefinition: singleEffectDefinition,
                sourceCardInstance: sourceCardInstance,
                arguments: arguments,
                selectedTargets: []);

            var executeResult = sequentialEffectExecutor.Execute(context);
            if (executeResult.IsError)
            {
                var firstError = executeResult.FirstError;
                failures.Add($"{effectSpec.Id}: {firstError.Code} - {firstError.Description}");
            }
        }

        return failures;
    }

    /// <summary>
    /// Runs the "[On Summon]" effects of a card that just entered the field through a player action
    /// (normal summon, requirement summon). A fresh summon starts a new trigger depth.
    /// </summary>
    public static void ExecuteAutomaticOnSummonEffects(
        GameInstance game,
        string actingPlayerId,
        CardInstance? summonedCard,
        IGameSequentialEffectExecutor? sequentialEffectExecutor)
    {
        ExecuteAutomaticOnSummonEffects(game, actingPlayerId, summonedCard, sequentialEffectExecutor, triggerDepth: 0);
    }

    /// <summary>
    /// Runs the "[On Summon]" effects of a card that just entered the field from inside an effect chain,
    /// carrying that chain's trigger depth so nested triggering summons cannot recurse forever.
    /// </summary>
    public static void ExecuteAutomaticOnSummonEffects(
        GameInstance game,
        string actingPlayerId,
        CardInstance? summonedCard,
        IGameSequentialEffectExecutor? sequentialEffectExecutor,
        int triggerDepth)
    {
        if (summonedCard is null || sequentialEffectExecutor is null)
        {
            return;
        }

        var nextDepth = triggerDepth + 1;
        if (nextDepth > MaxTriggerDepth)
        {
            RecordSkippedTriggeredEffect(
                game,
                actingPlayerId,
                summonedCard,
                EffectTiming.OnSummon,
                $"{TriggerDepthArgument} limit ({MaxTriggerDepth}) reached; nested triggering summons stop here.");
            return;
        }

        if (!game.State.CardDefinitions.TryGetValue(summonedCard.CardDefinitionId, out var summonedDefinition))
        {
            return;
        }

        var failures = ExecuteAutomaticTimedEffects(
            game,
            actingPlayerId,
            summonedDefinition,
            summonedCard,
            EffectTiming.OnSummon,
            sequentialEffectExecutor,
            nextDepth);

        foreach (var failure in failures)
        {
            RecordSkippedTriggeredEffect(game, actingPlayerId, summonedCard, EffectTiming.OnSummon, failure);
        }
    }

    /// <summary>Reads the trigger depth an effect's own context was executed with.</summary>
    public static int ResolveTriggerDepth(IReadOnlyDictionary<string, string>? arguments)
    {
        if (arguments is not null
            && arguments.TryGetValue(TriggerDepthArgument, out var raw)
            && int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var depth)
            && depth > 0)
        {
            return depth;
        }

        return 0;
    }

    /// <summary>
    /// Records an unsupported / failing triggered effect instead of failing the action that caused it. The
    /// summon (or attack) always continues, so a single effect the engine cannot process yet cannot strand
    /// both players on a stale snapshot.
    /// </summary>
    public static void RecordSkippedTriggeredEffect(
        GameInstance instance,
        string playerId,
        CardInstance? sourceCardInstance,
        EffectTiming timing,
        string failure)
    {
        var sourceInstanceId = sourceCardInstance?.InstanceId ?? "unknown";
        var timingLabel = timing switch
        {
            EffectTiming.OnSummon => "On Summon",
            EffectTiming.WhenAttacking => "When Attacking",
            _ => timing.ToString(),
        };
        var actionType = timing switch
        {
            EffectTiming.OnSummon => OnSummonSkippedActionType,
            EffectTiming.WhenAttacking => WhenAttackingSkippedActionType,
            _ => "triggered_effect_skipped",
        };

        instance.AddActionLogEntry(
            actionType: actionType,
            message: $"Skipped '{timingLabel}' effect on card '{sourceInstanceId}': {failure}",
            playerId: playerId,
            metadata: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["sourceCardInstanceId"] = sourceInstanceId,
                ["timing"] = timing.ToString(),
            });
    }

    /// <summary>
    /// Clones a card definition down to a single triggering effect plus every effect reachable from it
    /// through its on-success / on-failure branches, so chained (subordinate) effects still resolve
    /// while unrelated effects on the same card stay dormant. The sequential executor walks the supplied
    /// definition, so cloning down to the single effect alone made it fail with
    /// "Could not resolve branch target effect id '...'" for chained effects.
    /// </summary>
    public static Card CloneCardDefinitionWithEffectChain(Card sourceCardDefinition, EffectSpec triggerEffectSpec)
    {
        var includedEffectIds = new HashSet<string>(StringComparer.Ordinal);
        var effectsToVisit = new Queue<string>();
        var effectById = sourceCardDefinition.Effects
            .Where(effect => !string.IsNullOrWhiteSpace(effect.Id))
            .ToDictionary(effect => effect.Id.Trim(), effect => effect, StringComparer.Ordinal);

        void TrackBranch(string? branchEffectId)
        {
            if (string.IsNullOrWhiteSpace(branchEffectId))
            {
                return;
            }

            var normalizedBranchId = branchEffectId.Trim();
            if (includedEffectIds.Add(normalizedBranchId))
            {
                effectsToVisit.Enqueue(normalizedBranchId);
            }
        }

        TrackBranch(triggerEffectSpec.Id);
        TrackBranch(triggerEffectSpec.OnSuccessEffectId);
        TrackBranch(triggerEffectSpec.OnFailureEffectId);

        while (effectsToVisit.Count > 0)
        {
            var effectId = effectsToVisit.Dequeue();
            if (!effectById.TryGetValue(effectId, out var chainedEffect))
            {
                continue;
            }

            TrackBranch(chainedEffect.OnSuccessEffectId);
            TrackBranch(chainedEffect.OnFailureEffectId);
        }

        var chainedEffects = new List<EffectSpec>
        {
            triggerEffectSpec,
        };

        chainedEffects.AddRange(sourceCardDefinition.Effects
            .Where(effect => !ReferenceEquals(effect, triggerEffectSpec))
            .Where(effect => !string.IsNullOrWhiteSpace(effect.Id) && includedEffectIds.Contains(effect.Id.Trim())));

        return CardDefinitionCloner.CloneWithEffects(sourceCardDefinition, chainedEffects);
    }
}

