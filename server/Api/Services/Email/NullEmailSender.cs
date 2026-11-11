namespace ProjectHiddenVillage.Server.Api.Services.Email;

/// <summary>
/// The sender every environment without a provider uses: Development, the e2e suite, and a deployment that has not
/// been given a mail key yet. The flow behaves exactly as in production - token issued, stored, capped - and only
/// the delivery is dropped, so the recovery path does not need a second implementation to be testable.
/// </summary>
public sealed class NullEmailSender : IEmailSender
{
    private readonly ILogger<NullEmailSender> logger;

    public NullEmailSender(ILogger<NullEmailSender> logger)
    {
        this.logger = logger;
    }

    public bool IsConfigured => true;

    public Task SendPasswordResetAsync(PasswordResetEmail email, CancellationToken cancellationToken = default)
    {
        // The address proves the request reached the sender; the link carries a live token and is deliberately not
        // logged. Anything else would turn a log dump into a set of working recovery links.
        logger.LogInformation(
            "Password reset mail suppressed by Email:Provider={Provider} for {RecipientEmail}.",
            EmailProviders.None,
            email.RecipientEmail);

        return Task.CompletedTask;
    }
}
