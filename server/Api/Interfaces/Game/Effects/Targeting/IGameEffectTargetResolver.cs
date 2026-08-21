namespace ProjectHiddenVillage.Server.Api.Interfaces.Game;

public interface IGameEffectTargetResolver
{
    IReadOnlyList<GameEffectTargetReference> ResolveTargets(GameCardEffectContext context, EffectSpec effectSpec);
}
