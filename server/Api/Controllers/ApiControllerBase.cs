using ErrorOr;
using Microsoft.AspNetCore.Mvc;
using ProjectHiddenVillage.Server.Api.Services.Maintenance;

namespace ProjectHiddenVillage.Server;

public abstract class ApiControllerBase : ControllerBase
{
    protected ActionResult<T> ProblemFromErrors<T>(List<Error> errors)
    {
        var firstError = errors[0];

        return firstError.Type switch
        {
            ErrorType.NotFound => NotFound(firstError.Description),
            ErrorType.Conflict => Conflict(firstError.Description),
            ErrorType.Unauthorized => Unauthorized(firstError.Description),
            // Forbidden is a real 403 rather than another 400: the caller is authenticated, they simply may not do
            // this to that resource.
            ErrorType.Forbidden => StatusCode(StatusCodes.Status403Forbidden, firstError.Description),
            // Maintenance is a 503 so a client (and a deploy script) can tell "come back shortly" from "bad request".
            _ when (int)firstError.Type == MaintenanceGate.StatusCode =>
                StatusCode(StatusCodes.Status503ServiceUnavailable, firstError.Description),
            _ => BadRequest(firstError.Description)
        };
    }
}