namespace ProjectHiddenVillage.Server.Api.Services.Auth;

public sealed class PasswordResetOptions
{
    public const string SectionName = "PasswordReset";

    /// <summary>
    /// Kill switch for the whole flow. Turning it off answers both endpoints with a 404, which is what an
    /// environment without a mail provider (or a deliberately closed registration window) wants.
    /// </summary>
    public bool Enabled { get; set; } = true;

    /// <summary>
    /// How long a link stays valid. Long enough to survive a mail queue and a look at a phone, short enough that a
    /// forgotten mailbox is not a permanent key to the account.
    /// </summary>
    public int TokenLifetimeMinutes { get; set; } = 60;

    /// <summary>
    /// Minimum gap between two links for the same address. Anything inside the window is accepted and dropped
    /// silently: the caller must not be able to use this endpoint to tell whether a link was actually sent.
    /// </summary>
    public int RequestCooldownSeconds { get; set; } = 60;

    /// <summary>
    /// Hard ceiling per address per hour. Same silent treatment as the cooldown, so it throttles floods without
    /// becoming an address oracle.
    /// </summary>
    public int MaxRequestsPerHourPerEmail { get; set; } = 5;

    /// <summary>
    /// How long a spent or superseded token row is kept. It exists to measure the hourly cap and to let support see
    /// that a link was issued, so it only has to outlive the cap window; the purge in the service removes the rest.
    /// </summary>
    public int TokenRetentionHours { get; set; } = 24;
}
