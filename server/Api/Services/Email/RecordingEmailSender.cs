using ProjectHiddenVillage.Server.Api.Testing;

namespace ProjectHiddenVillage.Server.Api.Services.Email;

/// <summary>
/// The sender used when the test profiles are enabled. It behaves exactly like <see cref="NullEmailSender"/> except
/// that the message is kept in memory, which is what lets an e2e scenario open the link a real mailbox would have
/// delivered.
/// </summary>
public sealed class RecordingEmailSender : IEmailSender
{
    private readonly PasswordResetEmailRecorder recorder;
    private readonly ILogger<RecordingEmailSender> logger;

    public RecordingEmailSender(
        PasswordResetEmailRecorder recorder,
        ILogger<RecordingEmailSender> logger)
    {
        this.recorder = recorder;
        this.logger = logger;
    }

    public bool IsConfigured => true;

    public Task SendPasswordResetAsync(PasswordResetEmail email, CancellationToken cancellationToken = default)
    {
        recorder.Record(email);

        // As with the null sender, the link itself is never logged.
        logger.LogInformation(
            "Password reset mail recorded for {RecipientEmail} because the test profiles are enabled.",
            email.RecipientEmail);

        return Task.CompletedTask;
    }
}
