using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class GameEffectTargetSpecificationRegistry : IGameEffectTargetSpecificationRegistry
{
    private readonly Dictionary<string, IGameEffectTargetSpecification> specificationsByKey;

    public GameEffectTargetSpecificationRegistry(IEnumerable<IGameEffectTargetSpecification> specifications)
    {
        specificationsByKey = specifications.ToDictionary(
            specification => specification.SpecificationKey,
            StringComparer.OrdinalIgnoreCase);
    }

    public bool TryResolve(string specificationKey, out IGameEffectTargetSpecification? specification)
    {
        if (string.IsNullOrWhiteSpace(specificationKey))
        {
            specification = null;
            return false;
        }

        return specificationsByKey.TryGetValue(specificationKey, out specification);
    }
}