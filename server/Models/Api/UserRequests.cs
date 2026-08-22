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

public sealed record PagedResponse<T>(
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages,
    IReadOnlyList<T> Items);