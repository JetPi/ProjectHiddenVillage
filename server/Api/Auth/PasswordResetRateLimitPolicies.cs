using Microsoft.AspNetCore.Http;

namespace ProjectHiddenVillage.Server;

/// <summary>
/// The two fixed windows that keep a recovery loop from being used as a free mail sender or a CPU burner. The
/// per-email caps live in <c>PasswordResetService</c> and answer 202; these answer 429, because they are about the
/// caller's volume rather than about any particular address.
/// </summary>
public static class PasswordResetRateLimitPolicies
{
    public const string Request = "password-reset-request";
    public const string Confirm = "password-reset-confirm";

    public const int RequestPermitLimitPerHour = 10;
    public const int ConfirmPermitLimitPerHour = 20;

    /// <summary>
    /// The client address, resolved through the forwarded headers Caddy sets. Without those headers every request
    /// in the deployment would land in one partition, which would throttle the whole site instead of one caller.
    /// </summary>
    public static string ResolveClientKey(HttpContext context) =>
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
}
