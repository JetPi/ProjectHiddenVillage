namespace ProjectHiddenVillage.Server.Api.Interfaces.Game;

public interface IGameEffectContextConditionEvaluator
{
    bool IsConditionSatisfied(EffectContextCondition condition, PlayerState playerState, GameState gameState);
}
