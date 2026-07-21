using ProjectHiddenVillage.Server;

namespace ProjectHiddenVillage.Server.Engine;

public sealed class CardDefinitionResolver
{
    public bool TryGetDefinition(GameState state, CardInstance instance, out Card? definition)
    {
        ArgumentNullException.ThrowIfNull(state);
        ArgumentNullException.ThrowIfNull(instance);

        return state.CardDefinitions.TryGetValue(instance.CardDefinitionId, out definition);
    }

    public Card GetRequiredDefinition(GameState state, CardInstance instance)
    {
        if (!TryGetDefinition(state, instance, out var definition) || definition is null)
        {
            throw new InvalidOperationException(
                $"Card definition '{instance.CardDefinitionId}' was not found for instance '{instance.InstanceId}'.");
        }

        return definition;
    }
}