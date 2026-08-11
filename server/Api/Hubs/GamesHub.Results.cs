using ErrorOr;

namespace ProjectHiddenVillage.Server.Api.Hubs;

public sealed record HubOperationResult<T>(bool Succeeded, T? Value, string? ErrorCode, string? ErrorDescription)
{
    public static HubOperationResult<T> Success(T value) => new(true, value, null, null);

    public static HubOperationResult<T> Failure(string code, string description) => new(false, default, code, description);

    public static HubOperationResult<T> FromErrors(IReadOnlyList<Error> errors)
    {
        if (errors.Count == 0)
        {
            return Failure("Unknown", "Unknown error.");
        }

        return Failure(errors[0].Code, errors[0].Description);
    }
}
