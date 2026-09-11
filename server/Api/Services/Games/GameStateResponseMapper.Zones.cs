using ErrorOr;
using ProjectHiddenVillage.Server.Engine;
using ProjectHiddenVillage.Server.Engine.Interfaces;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public static partial class GameStateResponseMapper
{
    private static PlayerZonesResponse ToPlayerZonesResponse(
        PlayerState player,
        string requestingPlayerId,
        GameState state,
        GamePrompt? pendingPrompt)
    {
        var isRequestingPlayer = IsSamePlayerId(player.PlayerId, requestingPlayerId);

        return new PlayerZonesResponse(
            PlayerId: player.PlayerId,
            TurnCount: player.TurnCount,
            IsSummonCardReady: state.IsSummonCardReady(player.PlayerId),
            ResourcePool: player.ResourcePool,
            Leader: ToLeaderCardInstanceResponse(player.LeaderCardInstance, state, player, isRequestingPlayer, pendingPrompt),
            Deck: isRequestingPlayer
                ? player.Deck.ConvertAll(card => ToCardInstanceResponse(card, state.CardDefinitions, PlayerZone.Deck))
                : player.Deck
                    .Where(card => IsVisibleToRequestingPlayer(card, PlayerZone.Deck, isRequestingPlayer))
                    .Select(card => ToCardInstanceResponse(card, state.CardDefinitions, PlayerZone.Deck, state, pendingPrompt, isRequestingPlayer))
                    .ToList(),
            DeckCount: player.Deck.Count,
            Hand: isRequestingPlayer
                ? player.Hand.ConvertAll(card => ToCardInstanceResponse(card, state.CardDefinitions, PlayerZone.Hand, state, pendingPrompt, isRequestingPlayer))
                : player.Hand
                    .ConvertAll(card => IsVisibleToRequestingPlayer(card, PlayerZone.Hand, isRequestingPlayer)
                        ? ToCardInstanceResponse(card, state.CardDefinitions, PlayerZone.Hand, state, pendingPrompt, isRequestingPlayer)
                        : ToConcealedCardInstanceResponse(card)),
            HandCount: player.Hand.Count,
            CharacterField: player.Battlefield.ConvertAll(card => (EnrichedCardInstanceResponse)ToCardInstanceResponse(card, state.CardDefinitions, PlayerZone.CharacterField, state, pendingPrompt, isRequestingPlayer)),
            SupportZone: player.SupportZone
                .ConvertAll(card => ToSupportCardInstanceResponse(card, state.CardDefinitions, state, pendingPrompt, isRequestingPlayer)),
            Trash: player.DiscardPile.ConvertAll(card => ToCardInstanceResponse(card, state.CardDefinitions, PlayerZone.Trash)),
            ExileZone: player.ExileZone.ConvertAll(card => ToCardInstanceResponse(card, state.CardDefinitions, PlayerZone.ExileZone)));
    }

    private static bool IsVisibleToRequestingPlayer(CardInstance card, PlayerZone zone, bool isRequestingPlayer)
    {
        if (isRequestingPlayer)
        {
            return true;
        }

        if (!card.IsRevealedToBothPlayers)
        {
            return false;
        }

        return card.RevealedInZone == zone;
    }

    private static CardInstanceResponse ToSupportCardInstanceResponse(
        CardInstance card,
        IReadOnlyDictionary<string, Card> cardDefinitions,
        GameState state,
        GamePrompt? pendingPrompt,
        bool isRequestingPlayer)
    {
        var isConcealedFromOpponent = !IsVisibleToRequestingPlayer(card, PlayerZone.SupportZone, isRequestingPlayer: false);

        if (!IsVisibleToRequestingPlayer(card, PlayerZone.SupportZone, isRequestingPlayer))
        {
            return new CardInstanceResponse(
                InstanceId: card.InstanceId,
                CardDefinitionId: card.CardDefinitionId,
                OwnerPlayerId: card.OwnerPlayerId,
                ControllerPlayerId: card.ControllerPlayerId)
            {
                IsFaceUp = false,
                SupportSlotIndex = card.SupportSlotIndex,
                IsConcealedFromOpponent = isConcealedFromOpponent,
            };
        }

        var supportResponse = ToCardInstanceResponse(card, cardDefinitions, PlayerZone.SupportZone, state, pendingPrompt, isRequestingPlayer);
        return supportResponse with { IsConcealedFromOpponent = isConcealedFromOpponent };
    }

    private static CardInstanceResponse ToConcealedCardInstanceResponse(CardInstance card)
    {
        return new CardInstanceResponse(
            InstanceId: card.InstanceId,
            CardDefinitionId: ConcealedCardDefinitionId,
            OwnerPlayerId: card.OwnerPlayerId,
            ControllerPlayerId: card.ControllerPlayerId)
        {
            IsFaceUp = false,
        };
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
        var resolvedPower = state is null
            ? card.PowerOverride ?? definition.Power
            : CardRuntimeEffectStateService.ResolveEffectivePower(state, card, definition);
        var resolvedDamage = state is null
            ? card.DamageOverride ?? definition.Damage
            : CardRuntimeEffectStateService.ResolveEffectiveDamage(state, card, definition);
        var baseHealth = definition is CharacterCard characterDefinition
            ? characterDefinition.Health
            : 0;
        var resolvedBaseHealth = state is null
            ? card.HealthOverride ?? baseHealth
            : CardRuntimeEffectStateService.ResolveEffectiveHealth(state, card, definition);
        var resolvedCurrentHealth = card.CurrentHealth ?? resolvedBaseHealth;
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
                    DisplayName: definition.DisplayName,
                    Type: definition.Type,
                    Color: definition.Color,
                    Traits: definition.Traits,
                    Health: resolvedCurrentHealth,
                    MaxHealth: baseHealth,
                    Damage: resolvedDamage,
                    Power: resolvedPower)
                {
                    IsFaceUp = card.IsFaceUp,
                    IsExhausted = card.IsExhausted,
                    IsRested = card.IsRested,
                    AvailableActions = cardActions
                },
            PlayerZone.SupportZone =>
                    isRequestingPlayer
                        ? new EnrichedCardInstanceResponse(
                            InstanceId: card.InstanceId,
                            CardDefinitionId: card.CardDefinitionId,
                            OwnerPlayerId: card.OwnerPlayerId,
                            ControllerPlayerId: card.ControllerPlayerId,
                            DisplayName: definition.DisplayName,
                            Type: definition.Type,
                            Color: definition.Color,
                            Traits: definition.Traits,
                            Health: resolvedCurrentHealth,
                            MaxHealth: baseHealth,
                            Damage: resolvedDamage,
                            Power: resolvedPower)
                        {
                            IsFaceUp = card.IsFaceUp,
                            IsExhausted = card.IsExhausted,
                            IsRested = card.IsRested,
                            SupportSlotIndex = card.SupportSlotIndex,
                            AvailableActions = cardActions
                        }
                        : new CardInstanceResponse(
                            InstanceId: card.InstanceId,
                            CardDefinitionId: card.CardDefinitionId,
                            OwnerPlayerId: card.OwnerPlayerId,
                            ControllerPlayerId: card.ControllerPlayerId)
                        {
                            IsFaceUp = card.IsFaceUp,
                            SupportSlotIndex = card.SupportSlotIndex,
                        },

            _ => new CardInstanceResponse(
                InstanceId: card.InstanceId,
                CardDefinitionId: card.CardDefinitionId,
                OwnerPlayerId: card.OwnerPlayerId,
                ControllerPlayerId: card.ControllerPlayerId)
        };
    }
}
