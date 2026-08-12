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
                .ConvertAll(player => ToPlayerZonesResponse(player, requestingPlayerId, state.CardDefinitions)));
    }

    private static PlayerZonesResponse ToPlayerZonesResponse(
        PlayerState player,
        string requestingPlayerId,
        IReadOnlyDictionary<string, Card> cardDefinitions)
    {
        var isRequestingPlayer = string.Equals(player.PlayerId, requestingPlayerId, StringComparison.Ordinal);

        return new PlayerZonesResponse(
            PlayerId: player.PlayerId,
            TurnCount: player.TurnCount,
            Leader: ToLeaderCardInstanceResponse(player.LeaderCardInstance),
            Deck: isRequestingPlayer
                ? player.Deck.ConvertAll(card => ToCardInstanceResponse(card, cardDefinitions, PlayerZone.Deck)) : [],
            DeckCount: player.Deck.Count,
            Hand: isRequestingPlayer
                ? player.Hand.ConvertAll(card => ToCardInstanceResponse(card, cardDefinitions, PlayerZone.Hand)) : [],
            HandCount: player.Hand.Count,
            CharacterField: player.Battlefield.ConvertAll(card => ToCardInstanceResponse(card, cardDefinitions, PlayerZone.CharacterField)),
            SupportZone: player.SupportZone.ConvertAll(card => ToCardInstanceResponse(card, cardDefinitions, PlayerZone.SupportZone, isRequestingPlayer)),
            Trash: player.DiscardPile.ConvertAll(card => ToCardInstanceResponse(card, cardDefinitions, PlayerZone.Trash)),
            ExileZone: player.ExileZone.ConvertAll(card => ToCardInstanceResponse(card, cardDefinitions, PlayerZone.ExileZone)));
    }

    private static CardInstanceResponse ToCardInstanceResponse(
        CardInstance card,
        IReadOnlyDictionary<string, Card> cardDefinitions,
        PlayerZone playerZone,
        bool isRequestingPlayer = false)
    {
        var definition = cardDefinitions[card.CardDefinitionId];
        var maxHealth = definition is CharacterCard characterDefinition
            ? characterDefinition.Health
            : 0;

        return playerZone switch
        {
            PlayerZone.Trash or
            PlayerZone.Hand or
            PlayerZone.CharacterField or
            PlayerZone.ExileZone =>
                new EnrichedCardInstanceResponse(
                    InstanceId: card.InstanceId,
                    CardDefinitionId: card.CardDefinitionId,
                    OwnerPlayerId: card.OwnerPlayerId,
                    ControllerPlayerId: card.ControllerPlayerId,
                    IsExhausted: card.IsExhausted,
                    DisplayName: definition.DisplayName,
                    Type: definition.Type,
                    Color: definition.Color,
                    Traits: definition.Traits,
                    Health: maxHealth,
                    MaxHealth: maxHealth,
                    Damage: definition.Damage,
                    Power: definition.Power),
            PlayerZone.SupportZone =>
                    isRequestingPlayer
                        ? new EnrichedCardInstanceResponse(
                            InstanceId: card.InstanceId,
                            CardDefinitionId: card.CardDefinitionId,
                            OwnerPlayerId: card.OwnerPlayerId,
                            ControllerPlayerId: card.ControllerPlayerId,
                            IsExhausted: card.IsExhausted,
                            DisplayName: definition.DisplayName,
                            Type: definition.Type,
                            Color: definition.Color,
                            Traits: definition.Traits,
                            Health: maxHealth,
                            MaxHealth: maxHealth,
                            Damage: definition.Damage,
                            Power: definition.Power)
                        : new CardInstanceResponse(
                            InstanceId: card.InstanceId,
                            CardDefinitionId: card.CardDefinitionId,
                            OwnerPlayerId: card.OwnerPlayerId,
                            ControllerPlayerId: card.ControllerPlayerId),

            _ => new CardInstanceResponse(
                InstanceId: card.InstanceId,
                CardDefinitionId: card.CardDefinitionId,
                OwnerPlayerId: card.OwnerPlayerId,
                ControllerPlayerId: card.ControllerPlayerId)
        };
    }

    private static LeaderCardInstanceResponse ToLeaderCardInstanceResponse(LeaderCardInstanceState? leader)
    {
        return new LeaderCardInstanceResponse(
            InstanceId: leader!.InstanceId,
            CardDefinitionId: leader!.CardDefinitionId,
            OwnerPlayerId: leader!.OwnerPlayerId,
            ControllerPlayerId: leader!.ControllerPlayerId,
            IsExhausted: false,
            DisplayName: leader!.Name,
            Color: leader!.Color,
            Traits: leader!.Traits,
            Damage: leader!.Damage,
            Power: leader!.Power,
            TotalLife: leader!.TotalLife,
            CurrentLife: leader!.CurrentLife,
            RecoveryEffect: leader!.RecoveryEffect);
    }
}
