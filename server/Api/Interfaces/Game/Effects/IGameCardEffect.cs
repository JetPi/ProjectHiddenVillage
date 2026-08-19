using ErrorOr;

namespace ProjectHiddenVillage.Server.Api.Interfaces.Game;

public interface IGameCardEffect
{
    string EffectTypeKey { get; }

    CanExecuteResult CanExecute(GameCardEffectContext context);

    IReadOnlyList<GameEffectTargetReference> GetValidTargets(GameCardEffectContext context);

    ErrorOr<Success> Execute(GameCardEffectContext context, IReadOnlyList<GameEffectTargetReference> selectedTargets);
}