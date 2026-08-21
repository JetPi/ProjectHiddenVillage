using ErrorOr;

namespace ProjectHiddenVillage.Server.Api.Interfaces.Game;

public interface IGameSequentialEffectExecutor
{
    ErrorOr<Success> Execute(GameCardEffectContext context);
}