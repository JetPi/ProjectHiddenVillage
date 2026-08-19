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
            _ => throw new ArgumentOutOfRangeException(nameof(zone), zone, null)
        };
    }
}
