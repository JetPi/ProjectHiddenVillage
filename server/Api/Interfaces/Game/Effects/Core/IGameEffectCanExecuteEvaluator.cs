namespace ProjectHiddenVillage.Server.Api.Interfaces.Game;

public interface IGameEffectCanExecuteEvaluator
{
    CanExecuteResult Evaluate(GameCardEffectContext context, EffectSpec effectSpec, bool includeValidTargets);
}
