using ErrorOr;
using ProjectHiddenVillage.Server.Engine;
using ProjectHiddenVillage.Server.Engine.Interfaces;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public static partial class GameStateResponseMapper
{
    private static (bool IsEnabled, string? DisabledReason) EvaluateEffectAvailability(
        GameState state,
        PlayerState player,
        Card sourceCardDefinition,
        CardInstance? sourceCardInstance,
        EffectSpec effectSpec,
        ref GameInstance? evaluationGame)
    {
        if (RequiresTargets(effectSpec)
            && HasNoCardsInRequiredTargetZones(state, player.PlayerId, effectSpec))
        {
            return (false, "No valid targets available.");
        }

        if (effectSpec.EffectType == EffectKind.Recovery)
        {
            // The registry refuses a direct submit with the same reasons (ChakraRecoveryRules), so the chip and
            // the engine cannot disagree.
            if (!ChakraRecoveryRules.CanActivateLeaderRecovery(state, player, out var recoveryDisabledReason))
            {
                return (false, recoveryDisabledReason);
            }
        }

        if (evaluationGame is null)
        {
            try
            {
                evaluationGame = new GameInstance(state);
            }
            catch (InvalidOperationException)
            {
                return (true, null);
            }
        }

        var arguments = new Dictionary<string, string>(StringComparer.Ordinal);
        if (effectSpec.ChakraCost is > 0)
        {
            arguments[ReactiveEffectExecutionConstants.SupportActivationChakraCostArgument] =
                effectSpec.ChakraCost.Value.ToString(System.Globalization.CultureInfo.InvariantCulture);
        }

        var context = new GameCardEffectContext(
            game: evaluationGame,
            actingPlayer: new Player { Id = player.PlayerId },
            sourceCardDefinition: sourceCardDefinition,
            sourceCardInstance: sourceCardInstance,
            arguments: arguments,
            selectedTargets: []);

        var canExecuteResult = EffectCanExecuteEvaluator.Evaluate(context, effectSpec, includeValidTargets: RequestsResolvedTargets(effectSpec));
        var requiresTargets = RequiresTargets(effectSpec);

        if (!canExecuteResult.CanExecute)
        {
            if (requiresTargets)
            {
                var resolvedTargets = new EffectTargetResolver().ResolveTargets(context, effectSpec);
                if (resolvedTargets.Count == 0)
                {
                    return (false, "No valid targets available.");
                }
            }

            return (false, canExecuteResult.FailedConditions.FirstOrDefault());
        }

        // ValidTargets is only populated when the evaluator was asked for them, so the check has to use the
        // same discriminator: a node that never collects a selection (Execution Target Source: None) is not
        // target-less just because it was not asked to resolve any.
        if (requiresTargets
            && RequestsResolvedTargets(effectSpec)
            && canExecuteResult.ValidTargets.Count == 0)
        {
            return (false, "No valid targets available.");
        }

        return (true, null);
    }

    /// <summary>
    /// Whether availability evaluation asks the evaluator to resolve the node's candidates (the same toggle
    /// the executor uses to decide whether a node collects a selection).
    /// </summary>
    private static bool RequestsResolvedTargets(EffectSpec effectSpec)
    {
        return effectSpec.ExecutionTargetSource is EffectExecutionTargetSource.SelectedTargets
            or EffectExecutionTargetSource.SourceCard;
    }

    private static bool RequiresTargets(EffectSpec effectSpec)
    {
        // The same question the engine asks (GameEffectCanExecuteEvaluator.TryResolveTargetCountBounds):
        // authored counts alone do not make a node demand a selection - N-008's "Interrupt Attack" carries a
        // leftover exactTargetCount while resolving the pending attack itself, so treating it as a target
        // requirement disabled the whole activation with "No valid targets available.".
        return EffectTargetRequirementAnalyzer.RequiresPlayerSelection(effectSpec);
    }

    private static bool HasNoCardsInRequiredTargetZones(GameState state, string actingPlayerId, EffectSpec effectSpec)
    {
        var targetRules = effectSpec.TargetRules;
        if (targetRules.Rules.Count == 0)
        {
            return false;
        }

        var hasCardsByRule = targetRules.Rules
            .Select(rule => RuleHasAnyCardsInScope(state, actingPlayerId, rule))
            .ToArray();

        return targetRules.Operator switch
        {
            RequirementGroupOperator.All => hasCardsByRule.Any(hasCards => !hasCards),
            _ => hasCardsByRule.All(hasCards => !hasCards),
        };
    }

    private static bool RuleHasAnyCardsInScope(GameState state, string actingPlayerId, EffectTargetRule rule)
    {
        var playersInScope = ResolveTargetPlayersInScope(state, actingPlayerId, rule.Scope);
        if (playersInScope.Count == 0)
        {
            return false;
        }

        if (rule.InZone == PlayerZone.Leader)
        {
            return playersInScope.Any(currentPlayer => currentPlayer.LeaderCardInstance is not null);
        }

        return playersInScope.Any(currentPlayer =>
            PlayerZoneCardAccessor.GetCards(rule.InZone, currentPlayer).Count > 0);
    }

    private static IReadOnlyList<PlayerState> ResolveTargetPlayersInScope(GameState state, string actingPlayerId, EffectTargetRange scope)
    {
        return scope switch
        {
            EffectTargetRange.Self => state.Players
                .Where(currentPlayer => string.Equals(currentPlayer.PlayerId, actingPlayerId, StringComparison.Ordinal))
                .ToList(),
            EffectTargetRange.Opponent => state.Players
                .Where(currentPlayer => !string.Equals(currentPlayer.PlayerId, actingPlayerId, StringComparison.Ordinal))
                .ToList(),
            EffectTargetRange.Any => state.Players,
            _ => [],
        };
    }
}
