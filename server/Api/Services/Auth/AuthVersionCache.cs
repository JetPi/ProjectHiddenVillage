namespace ProjectHiddenVillage.Server.Api.Services.Auth;

/// <summary>
/// Where the validated <c>AuthVersion</c> of an account is memoised between requests. JWT validation is the hottest
/// authenticated path in the API, and a database read on every request would be the one thing the small box cannot
/// afford; a minute of staleness is the trade for it. The reset itself evicts the entry, so revoking a session is
/// immediate on the process that performed the reset, which is every deployment of this game.
/// </summary>
public static class AuthVersionCache
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromSeconds(60);

    public static string Key(Guid userId) => $"auth-version:{userId:N}";
}
