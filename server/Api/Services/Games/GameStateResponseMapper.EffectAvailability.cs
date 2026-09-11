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
            if (player.TurnCount < 2)
            {
                return (false, "Recovery can only be activated starting from your second turn.");
            }

            if (!HasFaceDownChakra(state, player.PlayerId))
            {
                return (false, "All chakra cards are already face up.");
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

        var canExecuteResult = LeaderEffectCanExecuteEvaluator.Evaluate(context, effectSpec, includeValidTargets: effectSpec.ExecutionTargetSource is EffectExecutionTargetSource.SelectedTargets or EffectExecutionTargetSource.SourceCard);
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

        if (requiresTargets && canExecuteResult.ValidTargets.Count == 0)
        {
            return (false, "No valid targets available.");
        }

        return (true, null);
    }

    private static bool HasFaceDownChakra(GameState state, string playerId)
    {
        var playerIndex = state.Players.FindIndex(player =>
            string.Equals(player.PlayerId, playerId, StringComparison.Ordinal));

        var chakraStates = state.Players[playerIndex].ResourcePool;

        return chakraStates < 5;
    }

    private static bool RequiresTargets(EffectSpec effectSpec)
    {
        var targetRules = effectSpec.TargetRules;
        var hasExplicitTargetRules = targetRules.Rules.Count > 0
            || targetRules.ExactTargetCount.HasValue
            || targetRules.MinimumTargetCount.HasValue
            || targetRules.MaximumTargetCount.HasValue;

        if (hasExplicitTargetRules)
        {
            return true;
        }

        return effectSpec.AttributeModifications.Any(modification =>
            modification.TargetType == AttributeModificationTargetType.SelectedTargets);
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
