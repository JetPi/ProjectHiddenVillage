using ErrorOr;

namespace ProjectHiddenVillage.Server;

public interface IGameDeckResolverService
{
    Task<ErrorOr<ResolvedPlayerDeck>> ResolvePlayerDeck(Guid userId, Guid deckId, string operationName);
}
