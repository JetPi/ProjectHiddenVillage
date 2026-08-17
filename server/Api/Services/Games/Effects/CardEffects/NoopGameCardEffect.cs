using ErrorOr;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class NoopGameCardEffect : IGameCardEffect
{
    public const string EffectKey = "noop";

    public string EffectTypeKey => EffectKey;

    public bool CanExecute(GameCardEffectContext context)
    {
        return context is not null;
    }

    public IReadOnlyList<GameEffectTargetReference> GetValidTargets(GameCardEffectContext context)
    {
        return [];
    }

    public ErrorOr<Success> Execute(GameCardEffectContext context)
    {
        return Result.Success;
    }
}