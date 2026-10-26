namespace ProjectHiddenVillage.Server;

public sealed record UserResponse(
    Guid Id,
    string Username,
    string Email,
    bool IsCardCatalogAdmin);

public sealed record LoginResponse(
    Guid Id,
    string Username,
    string Email,
    string AccessToken,
    DateTimeOffset ExpiresAt);

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