namespace ProjectHiddenVillage.Server;

public sealed class LeaderCardInstanceState
{
    public string InstanceId { get; set; } = string.Empty;

    public string CardDefinitionId { get; set; } = string.Empty;

    public string OwnerPlayerId { get; set; } = string.Empty;

    public string ControllerPlayerId { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public CardColor Color { get; set; }

    public string Description { get; set; } = string.Empty;

    public List<string> Traits { get; set; } = [];

    public int Damage { get; set; }

    public int Power { get; set; }

    public string RecoveryEffect { get; set; } = string.Empty;

    public int TotalLife { get; set; }

    public int CurrentLife { get; set; }
}