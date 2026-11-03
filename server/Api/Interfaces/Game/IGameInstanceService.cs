using ErrorOr;

namespace ProjectHiddenVillage.Server.Api.Interfaces.Game;

public interface IGameInstanceService
{
    Task<ErrorOr<GameInstance>> CreateGameForUser(CreateGameForUserRequest request);

    Task<ErrorOr<GameInstance>> CreateGameForUser(CreateGameForUserRequest request, string? preferredGameCode);

    Task<ErrorOr<GameInstance>> JoinGameForUser(string gameCode, JoinGameAsPlayer request);

    /// <summary>
    /// Undoes the creation of a hosted table: retires it when it still has a single seat, which releases its code.
    /// Once an opponent sits down the table is a game, and leaving it is a resignation rather than an undo.
    /// </summary>
    Task<ErrorOr<Success>> CancelUnstartedGameForUser(string gameCode, string requestingPlayerId);
}
