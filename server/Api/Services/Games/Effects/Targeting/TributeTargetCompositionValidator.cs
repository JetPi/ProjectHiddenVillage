namespace ProjectHiddenVillage.Server.Api.Services.Games;

internal static class TributeTargetCompositionValidator
{
    public static bool TryValidateSelectedTargets(
        GameCardEffectContext context,
        EffectSpec effectSpec,
        IReadOnlyList<GameEffectTargetReference> selectedTargets,
        out string failure)
    {
        failure = string.Empty;

        var composition = effectSpec.TargetRules.TributeComposition;
        if (composition is null || selectedTargets.Count == 0)
        {
            return true;
        }

        var gameState = context.Game.State;
        var actingPlayerState = gameState.Players.FirstOrDefault(player =>
            string.Equals(player.PlayerId, context.ActingPlayer.Id, StringComparison.Ordinal));

        if (actingPlayerState is null)
        {
            failure = "Unable to resolve acting player while validating tribute target composition.";
            return false;
        }

        var summonCandidateKeys = new HashSet<string>(StringComparer.Ordinal);
        var tributeMaterialKeys = new HashSet<string>(StringComparer.Ordinal);

        foreach (var target in selectedTargets)
        {
            var targetKey = BuildTargetKey(target);

            if (TargetMatchesAnyRoleRule(target, TributeTargetRole.SummonCandidate, effectSpec.TargetRules.Rules, actingPlayerState, gameState, context.SourceCardInstance))
            {
                summonCandidateKeys.Add(targetKey);
            }

            if (TargetMatchesAnyRoleRule(target, TributeTargetRole.TributeMaterial, effectSpec.TargetRules.Rules, actingPlayerState, gameState, context.SourceCardInstance))
            {
                tributeMaterialKeys.Add(targetKey);
            }
        }

        if (composition.RequireSingleSummonTarget && summonCandidateKeys.Count != 1)
        {
            failure = "Selected targets must include exactly one summon candidate target.";
            return false;
        }

        if (!IsTributeCountValid(composition, tributeMaterialKeys.Count, out failure))
        {
            return false;
        }

        if (composition.RequireDistinctSummonAndTributes && summonCandidateKeys.Overlaps(tributeMaterialKeys))
        {
            failure = "Summon candidate target must be distinct from tribute material targets.";
            return false;
        }

        if (!TryValidatePerRuleSelectedTargetCounts(
            selectedTargets,
            effectSpec.TargetRules.Rules,
            actingPlayerState,
            gameState,
            context.SourceCardInstance,
            out failure))
        {
            return false;
        }

        return true;
    }

    private static bool TryValidatePerRuleSelectedTargetCounts(
        IReadOnlyList<GameEffectTargetReference> selectedTargets,
        IReadOnlyList<EffectTargetRule> rules,
        PlayerState actingPlayerState,
        GameState gameState,
        CardInstance? sourceCardInstance,
        out string failure)
    {
        failure = string.Empty;

        for (var index = 0; index < rules.Count; index++)
        {
            var rule = rules[index];
            if (!rule.ExactSelectedTargetCount.HasValue
                && !rule.MinimumSelectedTargetCount.HasValue
                && !rule.MaximumSelectedTargetCount.HasValue)
            {
                continue;
            }

            var matchingCount = selectedTargets.Count(target =>
                TargetMatchesRule(target, rule, actingPlayerState, gameState, sourceCardInstance));

            if (!IsRuleSelectedCountValid(rule, matchingCount, out var countFailure))
            {
                failure = $"Target rule #{index} ({rule.TributeRole?.ToString() ?? "Unspecified"}) is not satisfied: {countFailure}";
                return false;
            }
        }

        return true;
    }

    private static bool IsRuleSelectedCountValid(EffectTargetRule rule, int matchingCount, out string failure)
    {
        failure = string.Empty;

        if (rule.ExactSelectedTargetCount.HasValue)
        {
            if (matchingCount != rule.ExactSelectedTargetCount.Value)
            {
                failure = $"expected exactly {rule.ExactSelectedTargetCount.Value} matching selected target(s), but got {matchingCount}.";
                return false;
            }

            return true;
        }

        if (rule.MinimumSelectedTargetCount.HasValue && matchingCount < rule.MinimumSelectedTargetCount.Value)
        {
            failure = $"expected at least {rule.MinimumSelectedTargetCount.Value} matching selected target(s), but got {matchingCount}.";
            return false;
        }

        if (rule.MaximumSelectedTargetCount.HasValue && matchingCount > rule.MaximumSelectedTargetCount.Value)
        {
            failure = $"expected at most {rule.MaximumSelectedTargetCount.Value} matching selected target(s), but got {matchingCount}.";
            return false;
        }

        return true;
    }

    private static bool TargetMatchesAnyRoleRule(
        GameEffectTargetReference target,
        TributeTargetRole role,
        IReadOnlyList<EffectTargetRule> rules,
        PlayerState actingPlayerState,
        GameState gameState,
        CardInstance? sourceCardInstance)
    {
        foreach (var rule in rules)
        {
            if (rule.TributeRole != role)
            {
                continue;
            }

            if (TargetMatchesRule(target, rule, actingPlayerState, gameState, sourceCardInstance))
            {
                return true;
            }
        }

        return false;
    }

    private static bool TargetMatchesRule(
        GameEffectTargetReference target,
        EffectTargetRule rule,
        PlayerState actingPlayerState,
        GameState gameState,
        CardInstance? sourceCardInstance)
    {
        if (target.Zone != rule.InZone)
        {
            return false;
        }

        if (!ScopeAllowsTargetPlayer(rule.Scope, actingPlayerState.PlayerId, target.PlayerId))
        {
            return false;
        }

        var targetPlayerState = gameState.Players.FirstOrDefault(player =>
            string.Equals(player.PlayerId, target.PlayerId, StringComparison.Ordinal));

        if (targetPlayerState is null)
        {
            return false;
        }

        var zoneCards = PlayerZoneCardAccessor.GetCards(rule.InZone, targetPlayerState);
        var cardInstance = zoneCards.FirstOrDefault(card =>
            string.Equals(card.InstanceId, target.CardInstanceId, StringComparison.Ordinal));

        if (cardInstance is null)
        {
            return false;
        }

        if (!gameState.CardDefinitions.TryGetValue(cardInstance.CardDefinitionId, out var cardDefinition))
        {
            return false;
        }

        return ZoneCardRestrictionMatcher.Matches(cardDefinition, rule.Restriction, cardInstance, sourceCardInstance);
    }

    private static bool ScopeAllowsTargetPlayer(EffectTargetRange scope, string actingPlayerId, string targetPlayerId)
    {
        return scope switch
        {
            EffectTargetRange.Self => string.Equals(targetPlayerId, actingPlayerId, StringComparison.Ordinal),
            EffectTargetRange.Opponent => !string.Equals(targetPlayerId, actingPlayerId, StringComparison.Ordinal),
            EffectTargetRange.Any => true,
            _ => false,
        };
    }

    private static bool IsTributeCountValid(TributeTargetComposition composition, int tributeCount, out string failure)
    {
        failure = string.Empty;

        if (composition.ExactTributeCount.HasValue)
        {
            if (tributeCount != composition.ExactTributeCount.Value)
            {
                failure = $"Selected targets must include exactly {composition.ExactTributeCount.Value} tribute material target(s).";
                return false;
            }

            if (composition.MinimumTributeCount.HasValue || composition.MaximumTributeCount.HasValue)
            {
                failure = "ExactTributeCount cannot be combined with MinimumTributeCount or MaximumTributeCount.";
                return false;
            }

            return true;
        }

        if (composition.MinimumTributeCount.HasValue && tributeCount < composition.MinimumTributeCount.Value)
        {
            failure = $"Selected targets must include at least {composition.MinimumTributeCount.Value} tribute material target(s).";
            return false;
        }

        if (composition.MaximumTributeCount.HasValue && tributeCount > composition.MaximumTributeCount.Value)
        {
            failure = $"Selected targets must include no more than {composition.MaximumTributeCount.Value} tribute material target(s).";
            return false;
        }

        if (composition.MinimumTributeCount.HasValue
            && composition.MaximumTributeCount.HasValue
            && composition.MinimumTributeCount.Value > composition.MaximumTributeCount.Value)
        {
            failure = "MinimumTributeCount cannot be greater than MaximumTributeCount.";
            return false;
        }

        return true;
    }

    private static string BuildTargetKey(GameEffectTargetReference target)
    {
        return string.Join("|", target.PlayerId, target.Zone, target.CardInstanceId);
    }
}
