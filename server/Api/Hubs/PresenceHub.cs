using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using ProjectHiddenVillage.Server.Api.Services.Presence;

namespace ProjectHiddenVillage.Server.Api.Hubs;

/// <summary>
/// Counts viewers, not players. A client connects here from every route - including the login screen and the
/// matchmaking search - so the number means "people with the site open", in a game or not.
///
/// Anonymous connections are allowed deliberately: a guest has no identity until they submit, and those are
/// exactly the viewers a queue needs to count. Presence here is unrelated to <see cref="Games.GamePresenceTracker"/>,
/// which decides who must acknowledge a phase presentation and therefore has to stay game-scoped.
/// </summary>
[AllowAnonymous]
public sealed class PresenceHub(PresenceRegistry presenceRegistry) : Hub
{
    public const string ViewerIdQueryKey = "viewerId";

    /// <summary>Event carrying a <see cref="PresenceSnapshot"/> to every connected viewer.</summary>
    public const string PresenceUpdatedEvent = "PresenceUpdated";

    public override Task OnConnectedAsync()
    {
        var viewerId = Context.GetHttpContext()?.Request.Query[ViewerIdQueryKey].ToString() ?? string.Empty;

        // An unusable id or a viewer over its connection cap stays connected but is not counted, which keeps a
        // misbehaving client from inflating the number without breaking its own page.
        presenceRegistry.Register(
            viewerId,
            Context.ConnectionId,
            isAuthenticated: Context.User?.Identity?.IsAuthenticated == true);

        return base.OnConnectedAsync();
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        presenceRegistry.Remove(Context.ConnectionId);

        return base.OnDisconnectedAsync(exception);
    }
}
