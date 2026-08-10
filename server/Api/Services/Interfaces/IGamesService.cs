using ErrorOr;

namespace ProjectHiddenVillage.Server;

public interface IGamesService
{
    Task<ErrorOr<GameInstance>> CreateGameForUser(CreateGameForUserRequest request);

    Task<ErrorOr<GameInstance>> CreateGameForUser(CreateGameForUserRequest request, string? preferredGameCode);

    Task<ErrorOr<List<CardCatalogItemResponse>>> GetCardDataForGame(string gameCode);

    ErrorOr<GameInstance> GetById(string gameCode);

    Task<ErrorOr<GameInstance>> JoinGameForUser(string gameCode, JoinGameAsPlayer request);

    ErrorOr<GameInstance> ResolvePrompt(string gameId, ResolvePromptRequest request);

    ErrorOr<GameInstance> AdvancePhase(string gameId);

    ErrorOr<GameInstance> DeclarePassInActionStep(string gameId, PlayerPhaseActionRequest request);

    ErrorOr<GameInstance> DeclareActionInActionStep(string gameId, PlayerPhaseActionRequest request);

    ErrorOr<GameInstance> DeclareEndStep(string gameId);

    ErrorOr<GameInstance> CompleteEndStep(string gameId);
}
