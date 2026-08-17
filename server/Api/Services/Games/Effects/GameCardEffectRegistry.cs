using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class GameCardEffectRegistry : IGameCardEffectRegistry
{
    private readonly Dictionary<string, IGameCardEffect> effectsByKey;

    public GameCardEffectRegistry(IEnumerable<IGameCardEffect> effects)
    {
        effectsByKey = effects.ToDictionary(
            effect => effect.EffectTypeKey,
            StringComparer.OrdinalIgnoreCase);
    }

    public bool TryResolve(string effectTypeKey, out IGameCardEffect? effect)
    {
        if (string.IsNullOrWhiteSpace(effectTypeKey))
        {
            effect = null;
            return false;
        }

        return effectsByKey.TryGetValue(effectTypeKey, out effect);
    }
}