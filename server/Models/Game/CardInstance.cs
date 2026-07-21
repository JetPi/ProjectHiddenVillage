namespace ProjectHiddenVillage.Server;

public sealed class CardInstance
{
    public string InstanceId { get; set; } = Guid.NewGuid().ToString("N");

    // References a key in GameState.CardDefinitions.
    public string CardDefinitionId { get; set; } = string.Empty;

    public string OwnerPlayerId { get; set; } = string.Empty;

    public string ControllerPlayerId { get; set; } = string.Empty;

    public bool IsExhausted { get; set; }
}