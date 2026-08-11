namespace ProjectHiddenVillage.Server.Api.Services.Games;

public static class GameStateResponseMapper
{
    public static GameStateResponse ToGameStateResponse(GameState state, string requestingPlayerId)
    {
        return new GameStateResponse(
            GameId: state.GameId,
            TurnNumber: state.TurnNumber,
            ActivePlayerId: state.ActivePlayerId,
            PriorityPlayerId: state.PriorityPlayerId,
            Phase: state.Phase.ToString(),
            Players: state.Players
                .Select(player => ToPlayerZonesResponse(player, requestingPlayerId))
                .ToList());
    }

    private static PlayerZonesResponse ToPlayerZonesResponse(PlayerState player, string requestingPlayerId)
    {
        var isRequestingPlayer = string.Equals(player.PlayerId, requestingPlayerId, StringComparison.Ordinal);

        return new PlayerZonesResponse(
            PlayerId: player.PlayerId,
            Deck: isRequestingPlayer
                ? player.Deck.Select(ToCardInstanceResponse).ToList()
                : [],
            DeckCount: player.Deck.Count,
            Hand: isRequestingPlayer
                ? player.Hand.Select(ToCardInstanceResponse).ToList()
                : [],
            HandCount: player.Hand.Count,
            CharacterField: player.Battlefield.Select(ToCardInstanceResponse).ToList(),
            SupportZone: player.SupportZone.Select(ToCardInstanceResponse).ToList(),
            Trash: player.DiscardPile.Select(ToCardInstanceResponse).ToList(),
            ExileZone: player.ExileZone.Select(ToCardInstanceResponse).ToList());
    }

    private static CardInstanceResponse ToCardInstanceResponse(CardInstance card)
    {
        return new CardInstanceResponse(
            InstanceId: card.InstanceId,
            CardDefinitionId: card.CardDefinitionId,
            OwnerPlayerId: card.OwnerPlayerId,
            ControllerPlayerId: card.ControllerPlayerId,
            IsExhausted: card.IsExhausted);
    }
}
