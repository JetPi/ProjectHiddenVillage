namespace ProjectHiddenVillage.Server;

public sealed record UserResponse(
    Guid Id,
    string Username,
    string Email,
    bool IsCardCatalogAdmin,
    // The password generation this account is on. Login copies it into the token so a reset can revoke sessions;
    // clients have no use for it and simply ignore it.
    int AuthVersion = 0);

public sealed record LoginResponse(
    Guid Id,
    string Username,
    string Email,
    string AccessToken,
    DateTimeOffset ExpiresAt,
    // The client keeps this so admin routes can be gated before they render. The server still re-checks the token
    // on every call - this flag is a navigation hint, never the authority.
    bool IsCardCatalogAdmin);

/// <summary>
/// What a guest is asked for. A display name is the entire sign-up: guests get a player id, a token and
/// nothing durable.
/// </summary>
public sealed record GuestUserRequest(string DisplayName);

public sealed record PagedResponse<T>(
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages,
    IReadOnlyList<T> Items);