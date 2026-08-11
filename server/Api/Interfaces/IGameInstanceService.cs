using ErrorOr;

namespace ProjectHiddenVillage.Server;

public interface IGameInstanceService
{
    Task<ErrorOr<GameInstance>> CreateGameForUser(CreateGameForUserRequest request);

    Task<ErrorOr<GameInstance>> CreateGameForUser(CreateGameForUserRequest request, string? preferredGameCode);

    Task<ErrorOr<GameInstance>> JoinGameForUser(string gameCode, JoinGameAsPlayer request);
}
