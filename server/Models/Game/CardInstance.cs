namespace ProjectHiddenVillage.Server;

public sealed class CardInstance
{
    public string InstanceId { get; set; } = Guid.NewGuid().ToString("N");

    // References a key in GameState.CardDefinitions.
    public string CardDefinitionId { get; set; } = string.Empty;

    public string OwnerPlayerId { get; set; } = string.Empty;

    public string ControllerPlayerId { get; set; } = string.Empty;

    public bool IsExhausted { get; set; }

    // Null means card uses its base definition power.
    public int? PowerOverride { get; set; }

    // Null means card uses its base definition damage.
    public int? DamageOverride { get; set; }

    // Null means card uses its base definition health.
    public int? HealthOverride { get; set; }

    // Null means current health is derived from effective base health.
    public int? CurrentHealth { get; set; }

    // Runtime keywords granted/removed by effects while in-game.
    public List<string> RuntimeKeywords { get; set; } = [];

    // When true, this card's effects are suppressed while it remains in CharacterField.
    public bool EffectsSuppressedWhileOnField { get; set; }

    // Set when a card enters CharacterField to support summon-turn attack rules.
    public int? EnteredFieldTurnNumber { get; set; }
}