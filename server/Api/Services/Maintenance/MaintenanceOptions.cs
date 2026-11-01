namespace ProjectHiddenVillage.Server.Api.Services.Maintenance;

public sealed class MaintenanceOptions
{
    public const string SectionName = "Maintenance";

    public bool Enabled { get; set; }

    public string Message { get; set; } = "The server is restarting for a scheduled update. New games resume shortly.";
}
