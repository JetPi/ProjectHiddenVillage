using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class AllowAllTargetsSpecification : IGameEffectTargetSpecification
{
    public const string Key = "allow-all";

    public string SpecificationKey => Key;

    public bool IsSatisfiedBy(GameCardEffectContext context, GameEffectTargetReference candidate)
    {
        return true;
    }
}

public sealed class AllTargetSpecifications : IGameEffectTargetSpecification
{
    private readonly IReadOnlyList<IGameEffectTargetSpecification> specifications;

    public AllTargetSpecifications(string specificationKey, IReadOnlyList<IGameEffectTargetSpecification> specifications)
    {
        SpecificationKey = specificationKey;
        this.specifications = specifications;
    }

    public string SpecificationKey { get; }

    public bool IsSatisfiedBy(GameCardEffectContext context, GameEffectTargetReference candidate)
    {
        return specifications.All(specification => specification.IsSatisfiedBy(context, candidate));
    }
}

public sealed class AnyTargetSpecifications : IGameEffectTargetSpecification
{
    private readonly IReadOnlyList<IGameEffectTargetSpecification> specifications;

    public AnyTargetSpecifications(string specificationKey, IReadOnlyList<IGameEffectTargetSpecification> specifications)
    {
        SpecificationKey = specificationKey;
        this.specifications = specifications;
    }

    public string SpecificationKey { get; }

    public bool IsSatisfiedBy(GameCardEffectContext context, GameEffectTargetReference candidate)
    {
        return specifications.Any(specification => specification.IsSatisfiedBy(context, candidate));
    }
}

public sealed class NotTargetSpecification : IGameEffectTargetSpecification
{
    private readonly IGameEffectTargetSpecification wrapped;

    public NotTargetSpecification(string specificationKey, IGameEffectTargetSpecification wrapped)
    {
        SpecificationKey = specificationKey;
        this.wrapped = wrapped;
    }

    public string SpecificationKey { get; }

    public bool IsSatisfiedBy(GameCardEffectContext context, GameEffectTargetReference candidate)
    {
        return !wrapped.IsSatisfiedBy(context, candidate);
    }
}