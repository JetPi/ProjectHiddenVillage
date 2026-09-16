using ProjectHiddenVillage.Server.Engine;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public static partial class GameStateResponseMapper
{
    /// <summary>
    /// The support activations still waiting on the resolution stack, oldest first - the chain the client
    /// renders in the support-chain bubble. Each entry carries its activation order, its source card's name
    /// and its targets; a target flagged as a chain entry is another queued activation, i.e. the card this
    /// activation answers with a [Support Activated] negate.
    /// </summary>
    private static IReadOnlyList<SupportChainEntryResponse> BuildSupportChain(GameState state)
    {
        ArgumentNullException.ThrowIfNull(state);

        var activations = state.EffectResolutionStack
            .Where(entry => !string.IsNullOrWhiteSpace(entry.ActivatedEffectId))
            .ToList();

        if (activations.Count == 0)
        {
            return [];
        }

        var sequenceByEntryId = activations
            .Select((entry, index) => (EntryId: entry.EntryId, Sequence: index + 1))
            .ToDictionary(pair => pair.EntryId, pair => pair.Sequence, StringComparer.Ordinal);

        return activations
            .Select(entry => new SupportChainEntryResponse(
                EntryId: entry.EntryId,
                Sequence: sequenceByEntryId[entry.EntryId],
                PlayerId: entry.SourcePlayerId,
                SourceCardInstanceId: entry.SourceCardInstanceId,
                SourceCardDisplayName: ResolveCardDisplayName(state, entry.SourcePlayerId, entry.SourceCardInstanceId),
                IsNegated: entry.IsNegated,
                Targets: entry.SelectedTargets
                    .Select(target => new SupportChainTargetResponse(
                        CardInstanceId: target.CardInstanceId,
                        DisplayName: ResolveCardDisplayName(state, target.PlayerId, target.CardInstanceId),
                        OwnerPlayerId: target.PlayerId,
                        IsChainEntry: target.IsEffectResolutionStackTarget,
                        ChainEntryId: target.EffectResolutionEntryId))
                    .ToList()))
            .ToList();
    }

    /// <summary>
    /// Display name of a card instance anywhere in its owner's zones. A support activation's source card can
    /// already have left the zone it was played from (a hand activation moves it straight to the trash), and
    /// a chain-entry target is the source card of the entry it negates.
    /// </summary>
    private static string ResolveCardDisplayName(GameState state, string? playerId, string? cardInstanceId)
    {
        var card = ResolveCardInstance(state, playerId, cardInstanceId);
        if (card is null)
        {
            return string.Empty;
        }

        return state.CardDefinitions.TryGetValue(card.CardDefinitionId, out var definition)
            ? definition.DisplayName
            : card.CardDefinitionId;
    }

    private static CardInstance? ResolveCardInstance(GameState state, string? playerId, string? cardInstanceId)
    {
        if (string.IsNullOrWhiteSpace(playerId) || string.IsNullOrWhiteSpace(cardInstanceId))
        {
            return null;
        }

        var player = state.Players.FirstOrDefault(candidate =>
            GameStatePlayerResolver.IsSamePlayerId(candidate.PlayerId, playerId));

        if (player is null)
        {
            return null;
        }

        foreach (var zone in new[]
        {
            PlayerZone.CharacterField,
            PlayerZone.SupportZone,
            PlayerZone.Hand,
            PlayerZone.Trash,
            PlayerZone.ExileZone,
            PlayerZone.Deck,
            PlayerZone.Leader,
        })
        {
            var zoneCard = PlayerZoneCardAccessor.GetCards(zone, player).FirstOrDefault(card =>
                string.Equals(card.InstanceId, cardInstanceId, StringComparison.Ordinal));

            if (zoneCard is not null)
            {
                return zoneCard;
            }
        }

        return null;
    }
}
