using ErrorOr;
using Microsoft.AspNetCore.Mvc;

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
            _ => BadRequest(firstError.Description)
        };
    }
}