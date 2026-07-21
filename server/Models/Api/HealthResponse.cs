namespace ProjectHiddenVillage.Server;

public sealed record HealthResponse(string Status, string Service, DateTimeOffset Timestamp);