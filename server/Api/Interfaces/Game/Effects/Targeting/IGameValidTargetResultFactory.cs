namespace ProjectHiddenVillage.Server.Api.Interfaces.Game;

public interface IGameValidTargetResultFactory
{
    ValidTargetResult Create(GameEffectTargetReference target, GameState gameState);
}
