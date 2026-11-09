using System.Net;
using System.Text;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Email;

namespace ProjectHiddenVillage.Server.Tests;

[TestClass]
public sealed class EmailSenderTests
{
    private static readonly DateTimeOffset ExpiresAt = new(2026, 11, 9, 13, 0, 0, TimeSpan.Zero);

    private const string ResetUrl = "https://game.test/reset-password?token=RAW-TOKEN-VALUE";

    [TestMethod]
    public async Task Resend_PostsTheRecoveryMail()
    {
        var handler = new CapturingHandler(HttpStatusCode.OK);
        var sender = CreateResendSender(handler);

        await sender.SendPasswordResetAsync(CreateEmail());

        Assert.IsNotNull(handler.Request);
        Assert.AreEqual(HttpMethod.Post, handler.Request.Method);
        Assert.AreEqual("https://api.resend.test/emails", handler.Request.RequestUri!.ToString());
        Assert.AreEqual(
            "Bearer test-key",
            handler.Request.Headers.Authorization?.ToString());

        Assert.IsNotNull(handler.Body);
        StringAssert.Contains(handler.Body, "player@example.com");
        // The JSON encoder escapes the angle brackets of the display-name form, so only the stable halves are
        // asserted here.
        StringAssert.Contains(handler.Body, "Hidden Village");
        StringAssert.Contains(handler.Body, "no-reply@test");
        StringAssert.Contains(handler.Body, "Reset your Hidden Village password");
        StringAssert.Contains(handler.Body, ResetUrl);
    }

    [TestMethod]
    public void Resend_IsNotConfiguredWithoutAKey()
    {
        var sender = new ResendEmailSender(
            new HttpClient(new CapturingHandler(HttpStatusCode.OK)),
            Options.Create(new EmailOptions
            {
                Provider = EmailProviders.Resend,
                FromAddress = "no-reply@test",
                Resend = new ResendEmailOptions { ApiKey = string.Empty },
            }),
            new RecordingLogger<ResendEmailSender>());

        Assert.IsFalse(sender.IsConfigured);
    }

    [TestMethod]
    public async Task Resend_SurfacesARejectionAsADeliveryFailure()
    {
        var sender = CreateResendSender(new CapturingHandler(HttpStatusCode.UnprocessableEntity, "domain not verified"));

        var exception = await Assert.ThrowsExceptionAsync<EmailDeliveryException>(
            () => sender.SendPasswordResetAsync(CreateEmail()));

        StringAssert.Contains(exception.Message, "domain not verified");
    }

    [TestMethod]
    public async Task NullSender_NeverLogsTheRecoveryLink()
    {
        var logger = new RecordingLogger<NullEmailSender>();
        var sender = new NullEmailSender(logger);

        await sender.SendPasswordResetAsync(CreateEmail());

        Assert.AreEqual(1, logger.Messages.Count);
        StringAssert.Contains(logger.Messages[0], "player@example.com");
        Assert.IsFalse(
            logger.Messages.Any(message => message.Contains("RAW-TOKEN-VALUE", StringComparison.Ordinal)),
            "A log line with the reset URL would turn log access into account takeover.");
    }

    private static ResendEmailSender CreateResendSender(CapturingHandler handler)
    {
        return new ResendEmailSender(
            new HttpClient(handler),
            Options.Create(new EmailOptions
            {
                Provider = EmailProviders.Resend,
                FromAddress = "no-reply@test",
                FromName = "Hidden Village",
                AppPublicBaseUrl = "https://game.test",
                Resend = new ResendEmailOptions { ApiKey = "test-key", BaseUrl = "https://api.resend.test" },
            }),
            new RecordingLogger<ResendEmailSender>());
    }

    private static PasswordResetEmail CreateEmail() =>
        new("player@example.com", "Player", ResetUrl, ExpiresAt);

    private sealed class CapturingHandler : HttpMessageHandler
    {
        private readonly HttpStatusCode statusCode;
        private readonly string responseBody;

        public CapturingHandler(HttpStatusCode statusCode, string responseBody = "{}")
        {
            this.statusCode = statusCode;
            this.responseBody = responseBody;
        }

        public HttpRequestMessage? Request { get; private set; }

        public string? Body { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            Request = request;
            Body = request.Content is null
                ? null
                : await request.Content.ReadAsStringAsync(cancellationToken);

            return new HttpResponseMessage(statusCode)
            {
                Content = new StringContent(responseBody, Encoding.UTF8, "application/json"),
            };
        }
    }

    private sealed class RecordingLogger<T> : ILogger<T>
    {
        public List<string> Messages { get; } = [];

        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            Messages.Add(formatter(state, exception));
        }
    }
}
