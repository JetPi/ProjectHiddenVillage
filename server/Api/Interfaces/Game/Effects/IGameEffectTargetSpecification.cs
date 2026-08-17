namespace ProjectHiddenVillage.Server.Api.Interfaces.Game;

public interface IGameEffectTargetSpecification
{
    string SpecificationKey { get; }

    bool IsSatisfiedBy(GameCardEffectContext context, GameEffectTargetReference candidate);
}