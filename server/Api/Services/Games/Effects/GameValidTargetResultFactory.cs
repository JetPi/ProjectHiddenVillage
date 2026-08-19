using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class GameValidTargetResultFactory : IGameValidTargetResultFactory
{
    public ValidTargetResult Create(GameEffectTargetReference target, GameState gameState)
    {
        var cardZone = target.Zone;

        var cardName = ResolveCardName(target, cardZone, gameState);
        var executeMessage = string.IsNullOrWhiteSpace(target.SlotId)
            ? $"Player {target.PlayerId} -> {target.Zone} -> card {target.CardInstanceId}"
            : $"Player {target.PlayerId} -> {target.Zone} -> card {target.CardInstanceId} (slot {target.SlotId})";

        return new ValidTargetResult
        {
            CardName = cardName,
            CardZone = cardZone,
            CardInstanceId = target.CardInstanceId,
            SlotId = target.SlotId ?? string.Empty,
            ExecuteMessage = executeMessage,
        };
    }

    private static string ResolveCardName(GameEffectTargetReference target, PlayerZone cardZone, GameState gameState)
    {
        var targetPlayer = gameState.Players.Find(player => string.Equals(player.PlayerId, target.PlayerId, StringComparison.Ordinal));
        if (targetPlayer is null)
        {
            return string.Empty;
        }

        var zoneCards = PlayerZoneCardAccessor.GetCards(cardZone, targetPlayer);
        var targetCardInstance = zoneCards.Find(card => string.Equals(card.InstanceId, target.CardInstanceId, StringComparison.Ordinal));
        if (targetCardInstance is null)
        {
            return string.Empty;
        }

        if (!gameState.CardDefinitions.TryGetValue(targetCardInstance.CardDefinitionId, out var cardDefinition))
        {
            return string.Empty;
        }

        return cardDefinition.DisplayName;
    }
}
