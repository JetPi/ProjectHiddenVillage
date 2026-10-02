namespace ProjectHiddenVillage.Server.Api.Services.Games;

public static class PlayerZoneCardAccessor
{
    public static List<CardInstance> GetCards(PlayerZone zone, PlayerState playerState)
    {
        return zone switch
        {
            PlayerZone.CharacterField => playerState.Battlefield,
            PlayerZone.Deck => playerState.Deck,
            PlayerZone.Trash => playerState.DiscardPile,
            PlayerZone.Hand => playerState.Hand,
            PlayerZone.SupportZone => playerState.SupportZone,
            PlayerZone.ExileZone => playerState.ExileZone,
            PlayerZone.Leader => playerState.LeaderCardInstance is null
                ? []
                :
                [
                    new CardInstance
                    {
                        InstanceId = playerState.LeaderCardInstance.InstanceId,
                        CardDefinitionId = playerState.LeaderCardInstance.CardDefinitionId,
                        OwnerPlayerId = playerState.LeaderCardInstance.OwnerPlayerId,
                        ControllerPlayerId = playerState.LeaderCardInstance.ControllerPlayerId,
                        IsExhausted = false,
                    }
                ],
            _ => throw new ArgumentOutOfRangeException(nameof(zone), zone, null)
        };
    }

    /// <summary>
    /// The live instance behind a target reference. Every list zone already returns the state's own objects,
    /// but the leader is stored as <see cref="LeaderCardInstanceState"/> (itself a <see cref="CardInstance"/>)
    /// and <see cref="GetCards"/> projects it into a *copy* - an effect that mutates a selected target (N-013's
    /// freeze, which adds a runtime keyword) must resolve the stored instance or the change is lost.
    /// </summary>
    public static CardInstance? ResolveLiveCard(PlayerZone zone, PlayerState playerState, string? cardInstanceId)
    {
        if (string.IsNullOrWhiteSpace(cardInstanceId))
        {
            return null;
        }

        if (zone == PlayerZone.Leader)
        {
            var leader = playerState.LeaderCardInstance;
            return leader is not null
                && string.Equals(leader.InstanceId, cardInstanceId, StringComparison.Ordinal)
                    ? leader
                    : null;
        }

        return GetCards(zone, playerState).FirstOrDefault(card =>
            string.Equals(card.InstanceId, cardInstanceId, StringComparison.Ordinal));
    }
}
