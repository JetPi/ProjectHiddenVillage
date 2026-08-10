namespace ProjectHiddenVillage.Server;

public sealed record AuthTokenResult(string AccessToken, DateTimeOffset ExpiresAt);
