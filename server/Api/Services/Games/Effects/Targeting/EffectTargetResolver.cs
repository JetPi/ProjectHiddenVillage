using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class EffectTargetResolver : IGameEffectTargetResolver
{
    public IReadOnlyList<GameEffectTargetReference> ResolveTargets(GameCardEffectContext context, EffectSpec effectSpec)
    {
        if (effectSpec.TargetRules.Rules.Count == 0)
        {
            return [];
        }

        var gameState = context.Game.State;
        var actingPlayerState = gameState.Players.Find(player => string.Equals(player.PlayerId, context.ActingPlayer.Id, StringComparison.Ordinal));

        if (actingPlayerState is null)
        {
            return [];
        }

        var composition = effectSpec.TargetRules.TributeComposition;
        if (composition is not null)
        {
            return ResolveTributeMaterialCandidates(
                effectSpec.TargetRules.Rules,
                actingPlayerState,
                gameState,
                context.SourceCardInstance,
                composition.RequireDistinctSummonAndTributes);
        }

        var perRuleCandidates = effectSpec.TargetRules.Rules
            .Select(rule => ResolveRuleCandidates(rule, actingPlayerState, gameState, context.SourceCardInstance))
            .ToList();

        if (perRuleCandidates.Count == 0)
        {
            return [];
        }

        return effectSpec.TargetRules.Operator switch
        {
            RequirementGroupOperator.All => IntersectCandidates(perRuleCandidates),
            _ => UnionCandidates(perRuleCandidates),
        };
    }

    /// <summary>
    /// For tribute compositions the summon candidate is the card that requires the tributes (the
    /// effect source), so its rule is NOT resolved against the game state. Only tribute material
    /// rules contribute candidates, and the group operator (All/Any) is not applied - each rule
    /// yields its own eligible cards and the distinct-card assignment is validated later by
    /// <see cref="TributeMaterialAssignmentSolver"/>.
    /// </summary>
    private static IReadOnlyList<GameEffectTargetReference> ResolveTributeMaterialCandidates(
        IReadOnlyList<EffectTargetRule> rules,
        PlayerState actingPlayerState,
        GameState gameState,
        CardInstance? sourceCardInstance,
        bool requireDistinctSummonAndTributes)
    {
        var unique = new Dictionary<string, GameEffectTargetReference>(StringComparer.Ordinal);

        foreach (var rule in rules)
        {
            if (rule.TributeRole == TributeTargetRole.SummonCandidate)
            {
                continue;
            }

            var candidates = ResolveRuleCandidates(
                rule,
                actingPlayerState,
                gameState,
                sourceCardInstance,
                excludeSelfIdentityPredicates: true,
                excludeSourceCardInstance: requireDistinctSummonAndTributes);

            foreach (var candidate in candidates)
            {
                unique[GetCandidateKey(candidate)] = candidate;
            }
        }

        return unique.Values.ToList();
    }

    private static IReadOnlyList<GameEffectTargetReference> ResolveRuleCandidates(
        EffectTargetRule rule,
        PlayerState actingPlayerState,
        GameState gameState,
        CardInstance? sourceCardInstance,
        bool excludeSelfIdentityPredicates = false,
        bool excludeSourceCardInstance = false)
    {
        var targetPlayers = ResolveTargetPlayers(rule.Scope, actingPlayerState, gameState);
        var candidates = new List<GameEffectTargetReference>();

        foreach (var targetPlayer in targetPlayers)
        {
            if (rule.InZone == PlayerZone.Leader)
            {
                var leader = targetPlayer.LeaderCardInstance;
                if (leader is null)
                {
                    continue;
                }

                if (excludeSourceCardInstance
                    && sourceCardInstance is not null
                    && string.Equals(leader.InstanceId, sourceCardInstance.InstanceId, StringComparison.Ordinal))
                {
                    continue;
                }

                if (!LeaderTargetRestrictionMatcher.Matches(gameState, leader, rule.Restriction))
                {
                    continue;
                }

                candidates.Add(new GameEffectTargetReference(
                    PlayerId: targetPlayer.PlayerId,
                    Zone: PlayerZone.Leader,
                    CardInstanceId: leader.InstanceId));

                continue;
            }

            var zoneCards = PlayerZoneCardAccessor.GetCards(rule.InZone, targetPlayer);
            for (var index = 0; index < zoneCards.Count; index++)
            {
                var cardInstance = zoneCards[index];

                if (excludeSourceCardInstance
                    && sourceCardInstance is not null
                    && string.Equals(cardInstance.InstanceId, sourceCardInstance.InstanceId, StringComparison.Ordinal))
                {
                    continue;
                }

                if (!gameState.CardDefinitions.TryGetValue(cardInstance.CardDefinitionId, out var cardDefinition))
                {
                    continue;
                }

                if (!ZoneCardRestrictionMatcher.Matches(
                        gameState,
                        cardDefinition,
                        rule.Restriction,
                        cardInstance,
                        sourceCardInstance,
                        excludeSelfIdentityPredicates))
                {
                    continue;
                }

                if (!MatchesLocationSelector(rule, index, zoneCards.Count))
                {
                    continue;
                }

                candidates.Add(new GameEffectTargetReference(
                    PlayerId: targetPlayer.PlayerId,
                    Zone: rule.InZone,
                    CardInstanceId: cardInstance.InstanceId,
                    SlotId: ResolveSlotId(rule.InZone, index)));
            }
        }

        return candidates;
    }

    private static IReadOnlyList<PlayerState> ResolveTargetPlayers(
        EffectTargetRange scope,
        PlayerState actingPlayerState,
        GameState gameState)
    {
        return scope switch
        {
            EffectTargetRange.Self => [actingPlayerState],
            EffectTargetRange.Opponent => gameState.Players.Where(player => !string.Equals(player.PlayerId, actingPlayerState.PlayerId, StringComparison.Ordinal)).ToList(),
            EffectTargetRange.Any => gameState.Players,
            _ => [],
        };
    }

    private static IReadOnlyList<GameEffectTargetReference> UnionCandidates(IReadOnlyList<IReadOnlyList<GameEffectTargetReference>> perRuleCandidates)
    {
        var unique = new Dictionary<string, GameEffectTargetReference>(StringComparer.Ordinal);

        foreach (var candidates in perRuleCandidates)
        {
            foreach (var candidate in candidates)
            {
                unique[GetCandidateKey(candidate)] = candidate;
            }
        }

        return unique.Values.ToList();
    }

    private static IReadOnlyList<GameEffectTargetReference> IntersectCandidates(IReadOnlyList<IReadOnlyList<GameEffectTargetReference>> perRuleCandidates)
    {
        if (perRuleCandidates.Count == 0)
        {
            return [];
        }

        var allowedKeys = new HashSet<string>(perRuleCandidates[0].Select(GetCandidateKey), StringComparer.Ordinal);

        for (var index = 1; index < perRuleCandidates.Count; index++)
        {
            allowedKeys.IntersectWith(perRuleCandidates[index].Select(GetCandidateKey));
            if (allowedKeys.Count == 0)
            {
                return [];
            }
        }

        return perRuleCandidates[0]
            .Where(candidate => allowedKeys.Contains(GetCandidateKey(candidate)))
            .ToList();
    }

    private static string GetCandidateKey(GameEffectTargetReference candidate)
    {
        return string.Join("|", candidate.PlayerId, candidate.Zone, candidate.CardInstanceId, candidate.SlotId ?? string.Empty);
    }

    private static bool MatchesLocationSelector(EffectTargetRule rule, int index, int zoneCount)
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
                && selector.SupportSlotIndex.Value == index,
            EffectTargetLocationSelectorKind.DeckTop =>
                rule.InZone == PlayerZone.Deck
                && zoneCount > 0
                && index == 0,
            _ => false,
        };
    }

    private static string ResolveSlotId(PlayerZone zone, int index)
    {
        return zone switch
        {
            PlayerZone.SupportZone => $"support:{index}",
            PlayerZone.Deck => $"deck:{index}",
            _ => string.Empty,
        };
    }

}
