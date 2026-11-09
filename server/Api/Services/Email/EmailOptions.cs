namespace ProjectHiddenVillage.Server.Api.Services.Email;

public sealed class EmailOptions
{
    public const string SectionName = "Email";

    /// <summary>
    /// Which <see cref="IEmailSender"/> the container builds. <c>None</c> keeps the flow working end to end but
    /// suppresses the message, which is what Development and the e2e suite run.
    /// </summary>
    public string Provider { get; set; } = EmailProviders.None;

    public string FromAddress { get; set; } = string.Empty;

    public string FromName { get; set; } = "Hidden Village";

    /// <summary>
    /// Browser origin the reset link must point at. It is deliberately separate from the CORS origins: the API must
    /// never guess the client address from a request header, and the SPA is served from a different host than the
    /// API in production.
    /// </summary>
    public string AppPublicBaseUrl { get; set; } = "http://localhost:5173";

    public ResendEmailOptions Resend { get; set; } = new();
}

public sealed class ResendEmailOptions
{
    /// <summary>Sending API key. Secret: user-secrets locally, environment variable in production.</summary>
    public string ApiKey { get; set; } = string.Empty;

    public string BaseUrl { get; set; } = "https://api.resend.com";
}

public static class EmailProviders
{
    public const string None = "None";
    public const string Resend = "Resend";
}
