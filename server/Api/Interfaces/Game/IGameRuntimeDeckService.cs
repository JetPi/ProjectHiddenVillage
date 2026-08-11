namespace ProjectHiddenVillage.Server.Api.Interfaces.Game;

public interface IGameRuntimeDeckService
{
    global::ProjectHiddenVillage.Server.Card ToRuntimeCard(Data.Entities.CardCatalogEntry entry);

    List<CardInstance> ToRuntimeDeck(IReadOnlyList<string> cardDefinitionIds, string playerId);

    void DeckShuffle(List<CardInstance> deck, Random? random = null);
}
