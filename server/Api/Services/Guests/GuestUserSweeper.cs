using Microsoft.Extensions.Options;
using ProjectHiddenVillage.Server.Api.Interfaces.User;

namespace ProjectHiddenVillage.Server.Api.Services.Guests;

/// <summary>
/// Collects guests nobody has used for <see cref="GuestUserOptions.RetentionDays"/>. It owns no logic of its
/// own: the sweep lives in <see cref="IGuestUserService"/> so it can be tested directly, and this only decides
/// when it runs.
/// </summary>
public sealed class GuestUserSweeper : BackgroundService
{
    private readonly IServiceScopeFactory scopeFactory;
    private readonly GuestUserOptions options;
    private readonly ILogger<GuestUserSweeper> logger;

    public GuestUserSweeper(
        IServiceScopeFactory scopeFactory,
        IOptions<GuestUserOptions> options,
        ILogger<GuestUserSweeper> logger)
    {
        this.scopeFactory = scopeFactory;
        this.options = options.Value;
        this.logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromMinutes(Math.Max(1, options.SweepIntervalMinutes));

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var guestUserService = scope.ServiceProvider.GetRequiredService<IGuestUserService>();
                await guestUserService.SweepIdleGuestsAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                // A failed sweep must never take the server down; the next tick tries again.
                logger.LogError(ex, "Guest retention sweep failed.");
            }

            try
            {
                await Task.Delay(interval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }
}
