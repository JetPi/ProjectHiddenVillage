namespace ProjectHiddenVillage.Server.Engine;

/// <summary>
/// Builds a game-local copy of a catalogue card definition. Card definitions are shared by every game
/// loaded from the same catalogue, so anything that needs to change how a definition executes (chain
/// trimming, support activation normalisation) must work on a clone.
/// </summary>
public static class CardDefinitionCloner
{
    public static Card CloneWithEffects(Card sourceCardDefinition, IReadOnlyList<EffectSpec> effects)
    {
        ArgumentNullException.ThrowIfNull(sourceCardDefinition);
        ArgumentNullException.ThrowIfNull(effects);

        var clonedDefinition = sourceCardDefinition switch
        {
            LeaderCard leader => new LeaderCard
            {
                Life = leader.Life,
                RecoveryEffect = leader.RecoveryEffect,
            },
            CharacterCard character => new CharacterCard
            {
                Health = character.Health,
                SupportName = character.SupportName,
                SupportEffect = character.SupportEffect,
            },
            _ => new Card(),
        };

        clonedDefinition.Id = sourceCardDefinition.Id;
        clonedDefinition.Image = sourceCardDefinition.Image;
        clonedDefinition.OriginalId = sourceCardDefinition.OriginalId;
        clonedDefinition.MainAlternate = sourceCardDefinition.MainAlternate;
        clonedDefinition.Attribute = sourceCardDefinition.Attribute;
        clonedDefinition.Name = sourceCardDefinition.Name.ToList();
        clonedDefinition.DisplayName = sourceCardDefinition.DisplayName;
        clonedDefinition.Type = sourceCardDefinition.Type;
        clonedDefinition.Traits = sourceCardDefinition.Traits.ToList();
        clonedDefinition.Color = sourceCardDefinition.Color;
        clonedDefinition.Description = sourceCardDefinition.Description;
        clonedDefinition.MainEffect = sourceCardDefinition.MainEffect;
        clonedDefinition.Damage = sourceCardDefinition.Damage;
        clonedDefinition.Power = sourceCardDefinition.Power;
        clonedDefinition.CannotBeNormalSummoned = sourceCardDefinition.CannotBeNormalSummoned;
        clonedDefinition.Conditions = sourceCardDefinition.Conditions.ToList();
        clonedDefinition.Effects = effects.ToList();

        return clonedDefinition;
    }
}
