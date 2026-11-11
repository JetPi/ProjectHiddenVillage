namespace ProjectHiddenVillage.Server.Api.Services.Email;

/// <summary>
/// The single seam between the recovery flow and whichever delivery channel is configured. Keeping the flow behind
/// this interface means the provider (transactional API today, SMTP relay later) is a deployment decision, and the
/// tests can assert on what would have been sent without a network.
/// </summary>
public interface IEmailSender
{
    /// <summary>
    /// True when the sender can actually deliver. A sender that is not configured is still called; it suppresses
    /// the message and logs it, so a misconfigured deployment fails visibly in the logs instead of at the request.
    /// </summary>
    bool IsConfigured { get; }

    Task SendPasswordResetAsync(PasswordResetEmail email, CancellationToken cancellationToken = default);
}

/// <summary>
/// A recovery mail. <see cref="ResetUrl"/> carries the raw token and must never be logged: the sender owns the
/// message body, and the service that builds the URL owns the token's lifetime.
/// </summary>
public sealed record PasswordResetEmail(
    string RecipientEmail,
    string RecipientUsername,
    string ResetUrl,
    DateTimeOffset ExpiresAtUtc);
