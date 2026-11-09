using System.Collections.Concurrent;
using ProjectHiddenVillage.Server.Api.Services.Email;

namespace ProjectHiddenVillage.Server.Api.Testing;

/// <summary>
/// Holds the most recent recovery mail per address so the e2e suite can follow the link it would otherwise never
/// receive. Only registered when the test endpoints are enabled; a deployed build never constructs it.
/// </summary>
public sealed class PasswordResetEmailRecorder
{
    private readonly ConcurrentDictionary<string, PasswordResetEmail> latestByRecipient =
        new(StringComparer.OrdinalIgnoreCase);

    public void Record(PasswordResetEmail email)
    {
        latestByRecipient[email.RecipientEmail] = email;
    }

    /// <summary>
    /// Removes and returns the mail. Taking rather than reading keeps a test from accidentally consuming a link
    /// twice, which would look like the single-use rule failing.
    /// </summary>
    public bool TryTake(string recipientEmail, out PasswordResetEmail email)
    {
        if (latestByRecipient.TryRemove(recipientEmail, out var recorded) && recorded is not null)
        {
            email = recorded;
            return true;
        }

        email = null!;
        return false;
    }
}
