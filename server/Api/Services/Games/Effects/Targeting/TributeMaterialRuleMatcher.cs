namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>
/// Decides whether a candidate <see cref="GameEffectTargetReference"/> satisfies a tribute material
/// <see cref="EffectTargetRule"/>.
///
/// Tribute material rules describe cards that are sacrificed when the summon candidate is put into
/// play, so:
///   * the rule's zone/location/scope must match where the candidate actually is, and
///   * <see cref="ZoneCardProperty.Self"/> identity predicates are ignored when checking the
///     restriction - identity only ever applies to the summon candidate, which is tracked through
///     the tribute role partitioning instead (see ZoneCardRestrictionMatcher for details).
/// </summary>
internal static class TributeMaterialRuleMatcher
{
    public static bool Matches(
        GameEffectTargetReference target,
        EffectTargetRule rule,
        PlayerState actingPlayerState,
        GameState gameState,
        CardInstance? summonCandidateInstance,
        bool requireDistinctFromSummonCandidate)
    {
        if (target.Zone != rule.InZone)
        {
            return false;
        }

        if (!MatchesLocationSelector(target, rule))
        {
            return false;
        }

        if (!ScopeAllowsTargetedPlayer(rule.Scope, actingPlayerState.PlayerId, target.PlayerId))
        {
            return false;
        }

        var targetPlayerState = gameState.Players.First(player =>
            GameStatePlayerResolver.IsSamePlayerId(player.PlayerId, target.PlayerId));

        if (rule.InZone == PlayerZone.Leader)
        {
            var leader = targetPlayerState.LeaderCardInstance;
            return leader is not null
                && string.Equals(leader.InstanceId, target.CardInstanceId, StringComparison.Ordinal)
                && LeaderTargetRestrictionMatcher.Matches(gameState, leader, rule.Restriction);
        }

        var zoneCards = PlayerZoneCardAccessor.GetCards(rule.InZone, targetPlayerState);
        var cardInstance = zoneCards.FirstOrDefault(card =>
            string.Equals(card.InstanceId, target.CardInstanceId, StringComparison.Ordinal));

        if (cardInstance is null)
        {
            return false;
        }

        if (requireDistinctFromSummonCandidate
            && summonCandidateInstance is not null
            && string.Equals(cardInstance.InstanceId, summonCandidateInstance.InstanceId, StringComparison.Ordinal))
        {
            return false;
        }

        if (!gameState.CardDefinitions.TryGetValue(cardInstance.CardDefinitionId, out var cardDefinition))
        {
            return false;
        }

        return ZoneCardRestrictionMatcher.Matches(
            gameState,
            cardDefinition,
            rule.Restriction,
            cardInstance,
            sourceCardInstance: summonCandidateInstance,
            excludeSelfIdentityPredicates: true);
    }

    public static bool ScopeAllowsTargetedPlayer(EffectTargetRange scope, string actingPlayerId, string targetPlayerId)
    {
        return scope switch
        {
            EffectTargetRange.Self => GameStatePlayerResolver.IsSamePlayerId(targetPlayerId, actingPlayerId),
            EffectTargetRange.Opponent => !GameStatePlayerResolver.IsSamePlayerId(targetPlayerId, actingPlayerId),
            EffectTargetRange.Any => true,
            _ => false,
        };
    }

    private static bool MatchesLocationSelector(GameEffectTargetReference target, EffectTargetRule rule)
    {
        var selector = rule.LocationSelector;
        if (selector is null || selector.Kind == EffectTargetLocationSelectorKind.Any)
        {
            return true;
        }

        return selector.Kind switch
        {
            EffectTargetLocationSelectorKind.SupportSlotIndex =>
                rule.InZone == PlayerZone.SupportZone
                && selector.SupportSlotIndex.HasValue
                && string.Equals(target.SlotId, $"support:{selector.SupportSlotIndex.Value}", StringComparison.Ordinal),
            EffectTargetLocationSelectorKind.DeckTop =>
                rule.InZone == PlayerZone.Deck
                && string.Equals(target.SlotId, "deck:0", StringComparison.Ordinal),
            _ => false,
        };
    }
}
