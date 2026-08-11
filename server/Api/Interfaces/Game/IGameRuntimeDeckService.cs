namespace ProjectHiddenVillage.Server;

public interface IGameRuntimeDeckService
{
    Card ToRuntimeCard(Data.Entities.CardCatalogEntry entry);

    List<CardInstance> ToRuntimeDeck(IReadOnlyList<string> cardDefinitionIds, string playerId);

    void DeckShuffle(List<CardInstance> deck, Random? random = null);
}
