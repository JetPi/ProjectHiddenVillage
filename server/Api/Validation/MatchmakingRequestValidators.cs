using FluentValidation;

namespace ProjectHiddenVillage.Server;

public sealed class EnqueueMatchRequestValidator : AbstractValidator<EnqueueMatchRequest>
{
    public EnqueueMatchRequestValidator()
    {
        RuleFor(request => request.UserId)
            .NotEmpty()
            .WithMessage("A player is required to queue.");

        RuleFor(request => request.DeckId)
            .NotEmpty()
            .WithMessage("A deck is required to queue.");

        RuleFor(request => request.RulesetId)
            .NotEmpty()
            .WithMessage("A ruleset is required to queue.");
    }
}
