namespace ProjectHiddenVillage.Server.Api.Interfaces.Game;

public interface IGameEffectTargetSpecificationRegistry
{
    bool TryResolve(string specificationKey, out IGameEffectTargetSpecification? specification);
}