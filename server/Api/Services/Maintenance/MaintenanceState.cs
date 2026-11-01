using Microsoft.Extensions.Options;

namespace ProjectHiddenVillage.Server.Api.Services.Maintenance;

public sealed class MaintenanceState
{
    private readonly object sync = new();
    private readonly MaintenanceOptions options;
    private readonly TimeProvider timeProvider;

    private bool isEnabled;
    private string message;
    private DateTimeOffset? enabledAtUtc;

    public MaintenanceState(IOptions<MaintenanceOptions> options, TimeProvider timeProvider)
    {
        this.options = options.Value;
        this.timeProvider = timeProvider;

        isEnabled = this.options.Enabled;
        message = this.options.Message;
        enabledAtUtc = isEnabled ? timeProvider.GetUtcNow() : null;
    }

    public bool IsEnabled
    {
        get
        {
            lock (sync)
            {
                return isEnabled;
            }
        }
    }

    public string Message
    {
        get
        {
            lock (sync)
            {
                return message;
            }
        }
    }

    public DateTimeOffset? EnabledAtUtc
    {
        get
        {
            lock (sync)
            {
                return enabledAtUtc;
            }
        }
    }

    public void Enable(string? requestedMessage)
    {
        lock (sync)
        {
            isEnabled = true;
            message = string.IsNullOrWhiteSpace(requestedMessage) ? options.Message : requestedMessage.Trim();
            enabledAtUtc = timeProvider.GetUtcNow();
        }
    }

    public void Disable()
    {
        lock (sync)
        {
            isEnabled = false;
            enabledAtUtc = null;
        }
    }
}
