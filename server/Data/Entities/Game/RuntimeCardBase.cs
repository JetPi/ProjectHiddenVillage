using System.ComponentModel.DataAnnotations.Schema;

namespace ProjectHiddenVillage.Server.Data.Entities;

[NotMapped]
public abstract class RuntimeCardBase
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid GameInstanceId { get; set; }

    public GameInstance GameInstance { get; set; } = null!;

    public string CardId { get; set; } = string.Empty;

    public int Position { get; set; }
}