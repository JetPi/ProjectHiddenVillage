namespace ProjectHiddenVillage.Server.Api.Interfaces.Game;

public interface IGameCardEffectRegistry
{
    bool TryResolve(string effectTypeKey, out IGameCardEffect? effect);
}