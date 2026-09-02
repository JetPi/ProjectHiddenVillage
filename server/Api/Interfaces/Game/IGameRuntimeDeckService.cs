namespace ProjectHiddenVillage.Server.Api.Interfaces.Game;

public interface IGameRuntimeDeckService
{
    global::ProjectHiddenVillage.Server.Card ToRuntimeCard(Data.Entities.CardCatalogEntry entry);

    List<CardInstance> ToRuntimeDeck(
        IReadOnlyList<string> cardDefinitionIds,
        IReadOnlyDictionary<string, global::ProjectHiddenVillage.Server.Card> cardDefinitions,
        string playerId,
        Random? random = null);

    List<CardInstance> DeckShuffle(List<CardInstance> deck, Random? random = null);

    CardInstance MoveCardToZone(
        GameInstance gameInstance,
        string playerId,
        PlayerZone sourceZone,
        PlayerZone destinationZone,
        string cardInstanceId,
        int? destinationIndex = null,
        string? destinationPlayerId = null,
        bool allowCrossPlayer = false);

    CardInstance? DrawCardFromDeck(GameInstance gameInstance, string playerId);

    CardInstance MoveCardFromHandToField(GameInstance gameInstance, string playerId, string cardInstanceId);

    CardInstance MoveCardFromFieldToTrash(GameInstance gameInstance, string playerId, string cardInstanceId);

    CardInstance MoveCardFromHandToSupportZone(
        GameInstance gameInstance,
        string playerId,
        string cardInstanceId,
        int supportZoneIndex);

    CardInstance MoveCardFromSupportZoneToTrash(GameInstance gameInstance, string playerId, string cardInstanceId);

    CardInstance MoveCardFromHandToTopDeck(GameInstance gameInstance, string playerId, string cardInstanceId);

    CardInstance MoveCardFromZoneToExileZone(
        GameInstance gameInstance,
        string playerId,
        PlayerZone sourceZone,
        string cardInstanceId);
}
