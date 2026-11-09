using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.Options;

namespace ProjectHiddenVillage.Server.Api.Services.Email;

/// <summary>
/// Delivers recovery mail through Resend's HTTPS API. An API is used instead of SMTP because the deployment host
/// blocks outbound port 25, and because SPF/DKIM alignment is the provider's responsibility, which is the part a
/// self-hosted sender gets wrong.
/// </summary>
public sealed class ResendEmailSender : IEmailSender
{
    public const string HttpClientName = "Resend";

    private const string Subject = "Reset your Hidden Village password";

    private readonly HttpClient httpClient;
    private readonly EmailOptions options;
    private readonly ILogger<ResendEmailSender> logger;

    public ResendEmailSender(
        HttpClient httpClient,
        IOptions<EmailOptions> options,
        ILogger<ResendEmailSender> logger)
    {
        this.httpClient = httpClient;
        this.options = options.Value;
        this.logger = logger;
    }

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(options.Resend.ApiKey) &&
        !string.IsNullOrWhiteSpace(options.FromAddress);

    public async Task SendPasswordResetAsync(PasswordResetEmail email, CancellationToken cancellationToken = default)
    {
        if (!IsConfigured)
        {
            throw new EmailDeliveryException(
                "Email:Provider is Resend but Email:Resend:ApiKey or Email:FromAddress is empty.");
        }

        var payload = new
        {
            from = FormatFrom(),
            to = new[] { email.RecipientEmail },
            subject = Subject,
            html = BuildHtml(email),
            text = BuildText(email)
        };

        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"{options.Resend.BaseUrl.TrimEnd('/')}/emails")
        {
            Content = JsonContent.Create(payload)
        };

        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.Resend.ApiKey);

        using var response = await httpClient.SendAsync(request, cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            // The body explains the rejection (unverified domain, bad key, ...) and is the fastest thing an operator
            // can look at when resets stop arriving. It never contains the message we sent.
            var detail = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new EmailDeliveryException(
                $"Resend rejected the password reset mail ({(int)response.StatusCode} {response.StatusCode}): {detail}");
        }

        logger.LogInformation(
            "Password reset mail accepted by Resend for {RecipientEmail}.",
            email.RecipientEmail);
    }

    private string FormatFrom()
    {
        return string.IsNullOrWhiteSpace(options.FromName)
            ? options.FromAddress
            : $"{options.FromName} <{options.FromAddress}>";
    }

    private static string BuildText(PasswordResetEmail email)
    {
        return string.Join(
            "\n",
            [
                $"Hi {email.RecipientUsername},",
                string.Empty,
                "Someone asked to reset the password on your Hidden Village account.",
                "If it was you, open this link to choose a new one:",
                string.Empty,
                email.ResetUrl,
                string.Empty,
                $"The link stops working at {email.ExpiresAtUtc:yyyy-MM-dd HH:mm} UTC.",
                "If it was not you, you can ignore this message; your password has not changed."
            ]);
    }

    private static string BuildHtml(PasswordResetEmail email)
    {
        // The username is the only value that comes from the account, and it is escaped: the body is built here,
        // not templated from anything a user could have written.
        var username = System.Net.WebUtility.HtmlEncode(email.RecipientUsername);
        var resetUrl = System.Net.WebUtility.HtmlEncode(email.ResetUrl);

        return string.Join(
            "\n",
            [
                "<div style=\"font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.5;color:#1f2933\">",
                $"<p>Hi {username},</p>",
                "<p>Someone asked to reset the password on your Hidden Village account.</p>",
                "<p>If it was you, choose a new password here:</p>",
                $"<p><a href=\"{resetUrl}\">Reset my password</a></p>",
                $"<p>The link stops working at {email.ExpiresAtUtc:yyyy-MM-dd HH:mm} UTC.</p>",
                "<p>If it was not you, you can ignore this message; your password has not changed.</p>",
                "</div>"
            ]);
    }
}
