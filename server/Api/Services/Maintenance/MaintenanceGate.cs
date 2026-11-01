using ErrorOr;

namespace ProjectHiddenVillage.Server.Api.Services.Maintenance;

public static class MaintenanceGate
{
    public const int StatusCode = 503;
    public const string ErrorCode = "Game.Maintenance.Enabled";

    public static Error? BlockedError(MaintenanceState? state)
    {
        return state is { IsEnabled: true }
            ? Error.Custom(StatusCode, ErrorCode, state.Message)
            : null;
    }
}
