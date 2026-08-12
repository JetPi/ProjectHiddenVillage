namespace ProjectHiddenVillage.Server.Api.Services.Games;

public static class GameStateResponseMapper
{
    public static GameStateResponse ToGameStateResponse(GameInstance game, string requestingPlayerId)
    {
        ArgumentNullException.ThrowIfNull(game);

        return ToGameStateResponse(game.State, requestingPlayerId, game.GetPendingPrompt());
    }

    public static GameStateResponse ToGameStateResponse(GameState state, string requestingPlayerId)
    {
        return ToGameStateResponse(state, requestingPlayerId, pendingPrompt: null);
    }

    private static GameStateResponse ToGameStateResponse(
        GameState state,
        string requestingPlayerId,
        GamePrompt? pendingPrompt)
    {
        return new GameStateResponse(
            GameId: state.GameId,
            TurnNumber: state.TurnNumber,
            ActivePlayerId: state.ActivePlayerId,
            PriorityPlayerId: state.PriorityPlayerId,
            Phase: state.Phase.ToString(),
            PendingPrompt: ToPendingPromptResponse(pendingPrompt, requestingPlayerId),
            AvailableActions: BuildAvailableActions(state, requestingPlayerId, pendingPrompt),
            Players: state.Players
                .ConvertAll(player => ToPlayerZonesResponse(player, requestingPlayerId, state, pendingPrompt)));
    }

    private static PendingPromptResponse? ToPendingPromptResponse(GamePrompt? pendingPrompt, string requestingPlayerId)
    {
        if (pendingPrompt is null)
        {
            return null;
        }

        var isAwaitingRequestingPlayer = string.Equals(
            pendingPrompt.RequestedPlayerId,
            requestingPlayerId,
            StringComparison.Ordinal);

        var options = isAwaitingRequestingPlayer
            ? pendingPrompt.Options
            : [];

        return new PendingPromptResponse(
            PromptId: pendingPrompt.PromptId,
            Type: pendingPrompt.Type.ToString(),
            IsAwaitingRequestingPlayer: isAwaitingRequestingPlayer,
            Options: options);
    }

    private static IReadOnlyList<GameActionOptionResponse> BuildAvailableActions(
        GameState state,
        string requestingPlayerId,
        GamePrompt? pendingPrompt)
    {
        if (pendingPrompt is not null)
        {
            var isAwaitingRequestingPlayer = string.Equals(
                pendingPrompt.RequestedPlayerId,
                requestingPlayerId,
                StringComparison.Ordinal);

            if (!isAwaitingRequestingPlayer)
            {
                return [];
            }

            return pendingPrompt.Options.ConvertAll(option =>
                new GameActionOptionResponse(
                    ActionId: $"resolve-prompt:{option}",
                    Label: option,
                    IsEnabled: true));
        }

        var actions = new List<GameActionOptionResponse>();
        var isRequestingPlayerActive = string.Equals(state.ActivePlayerId, requestingPlayerId, StringComparison.Ordinal);
        var isRequestingPlayerPriority = string.Equals(state.PriorityPlayerId, requestingPlayerId, StringComparison.Ordinal);

        if (state.Phase == GamePhase.ActionStep && isRequestingPlayerPriority)
        {
            actions.Add(new GameActionOptionResponse(ActionId: "pass-turn", Label: "Pass Turn", IsEnabled: true));
            actions.Add(new GameActionOptionResponse(ActionId: "declare-action", Label: "Declare Action", IsEnabled: true));
        }

        if (isRequestingPlayerActive)
        {
            actions.Add(new GameActionOptionResponse(ActionId: "advance-phase", Label: "Advance Phase", IsEnabled: true));
        }

        return actions;
    }

    private static PlayerZonesResponse ToPlayerZonesResponse(
        PlayerState player,
        string requestingPlayerId,
        GameState state,
        GamePrompt? pendingPrompt)
    {
        var isRequestingPlayer = string.Equals(player.PlayerId, requestingPlayerId, StringComparison.Ordinal);

        return new PlayerZonesResponse(
            PlayerId: player.PlayerId,
            TurnCount: player.TurnCount,
            Leader: ToLeaderCardInstanceResponse(player.LeaderCardInstance),
            Deck: isRequestingPlayer
                ? player.Deck.ConvertAll(card => ToCardInstanceResponse(card, state.CardDefinitions, PlayerZone.Deck)) : [],
            DeckCount: player.Deck.Count,
            Hand: isRequestingPlayer
                ? player.Hand.ConvertAll(card => ToCardInstanceResponse(card, state.CardDefinitions, PlayerZone.Hand, state, pendingPrompt, isRequestingPlayer)) : [],
            HandCount: player.Hand.Count,
            CharacterField: player.Battlefield.ConvertAll(card => ToCardInstanceResponse(card, state.CardDefinitions, PlayerZone.CharacterField, state, pendingPrompt, isRequestingPlayer)),
            SupportZone: player.SupportZone.ConvertAll(card => ToCardInstanceResponse(card, state.CardDefinitions, PlayerZone.SupportZone, state, pendingPrompt, isRequestingPlayer)),
            Trash: player.DiscardPile.ConvertAll(card => ToCardInstanceResponse(card, state.CardDefinitions, PlayerZone.Trash)),
            ExileZone: player.ExileZone.ConvertAll(card => ToCardInstanceResponse(card, state.CardDefinitions, PlayerZone.ExileZone)));
    }

    private static CardInstanceResponse ToCardInstanceResponse(
        CardInstance card,
        IReadOnlyDictionary<string, Card> cardDefinitions,
        PlayerZone playerZone,
        GameState? state = null,
        GamePrompt? pendingPrompt = null,
        bool isRequestingPlayer = false)
    {
        var definition = cardDefinitions[card.CardDefinitionId];
        var maxHealth = definition is CharacterCard characterDefinition
            ? characterDefinition.Health
            : 0;
        var cardActions = BuildCardAvailableActions(card, playerZone, state, pendingPrompt, isRequestingPlayer);

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
                    Power: definition.Power)
                {
                    AvailableActions = cardActions
                },
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
                        {
                            AvailableActions = cardActions
                        }
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

    private static IReadOnlyList<GameActionOptionResponse> BuildCardAvailableActions(
        CardInstance card,
        PlayerZone playerZone,
        GameState? state,
        GamePrompt? pendingPrompt,
        bool isRequestingPlayer)
    {
        if (!isRequestingPlayer || state is null)
        {
            return [];
        }

        if (pendingPrompt is not null)
        {
            return [];
        }

        var isPriorityPlayer = string.Equals(state.PriorityPlayerId, card.ControllerPlayerId, StringComparison.Ordinal);
        if (!isPriorityPlayer || state.Phase != GamePhase.ActionStep)
        {
            return [];
        }

        return playerZone switch
        {
            PlayerZone.Hand =>
            [
                new GameActionOptionResponse(
                    ActionId: $"play-card:{card.InstanceId}",
                    Label: "Play",
                    IsEnabled: true)
            ],

            PlayerZone.SupportZone =>
            [
                new GameActionOptionResponse(
                    ActionId: $"activate-support:{card.InstanceId}",
                    Label: "Activate",
                    IsEnabled: true)
            ],

            PlayerZone.CharacterField =>
                card.IsExhausted
                    ? []
                    :
                    [
                        new GameActionOptionResponse(
                            ActionId: $"battle-action:{card.InstanceId}",
                            Label: "Battle",
                            IsEnabled: true)
                    ],

            _ => []
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
