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
}
