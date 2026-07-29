namespace ProjectHiddenVillage.Server;

public sealed record UserResponse(
    Guid Id,
    string Username,
    string Email);

public sealed record PagedResponse<T>(
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages,
    IReadOnlyList<T> Items);