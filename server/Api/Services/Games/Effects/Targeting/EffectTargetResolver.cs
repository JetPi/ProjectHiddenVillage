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

    private static IReadOnlyList<GameEffectTargetReference> ResolveRuleCandidates(
        EffectTargetRule rule,
        PlayerState actingPlayerState,
        GameState gameState,
        CardInstance? sourceCardInstance)
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

                if (!gameState.CardDefinitions.TryGetValue(cardInstance.CardDefinitionId, out var cardDefinition))
                {
                    continue;
                }

                if (!ZoneCardRestrictionMatcher.Matches(gameState, cardDefinition, rule.Restriction, cardInstance, sourceCardInstance))
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
