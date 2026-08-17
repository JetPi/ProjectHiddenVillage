using FluentValidation;
using ProjectHiddenVillage.Server.Data.DTOs;

namespace ProjectHiddenVillage.Server;

public sealed class CreateGameForUserRequestValidator : AbstractValidator<CreateGameForUserRequest>
{
    public CreateGameForUserRequestValidator()
    {
        RuleFor(request => request.UserId)
            .NotEmpty().WithMessage("UserId is required.");

        RuleFor(request => request.DeckId)
            .NotEmpty().WithMessage("DeckId is required.");
    }
}

public sealed class JoinGameAsPlayerValidator : AbstractValidator<JoinGameAsPlayer>
{
    public JoinGameAsPlayerValidator()
    {
        RuleFor(request => request.UserId)
            .NotEmpty().WithMessage("UserId is required.");
    }
}

public sealed class ResolvePromptRequestValidator : AbstractValidator<ResolvePromptRequest>
{
    public ResolvePromptRequestValidator()
    {
        RuleFor(request => request.RequestedPlayerId)
            .NotEmpty().WithMessage("RequestedPlayerId is required.");

        RuleFor(request => request.SelectedOption)
            .NotEmpty().WithMessage("SelectedOption is required.");
    }
}

public sealed class PlayerPhaseActionRequestValidator : AbstractValidator<PlayerPhaseActionRequest>
{
    public PlayerPhaseActionRequestValidator()
    {
        RuleFor(request => request.PlayerId)
            .NotEmpty().WithMessage("PlayerId is required.");
    }
}

public sealed class PlayerValidator : AbstractValidator<Player>
{
    public PlayerValidator()
    {
        RuleFor(player => player.Id)
            .NotEmpty().WithMessage("Player id is required.");

        RuleFor(player => player.DisplayName)
            .NotEmpty().WithMessage("Player display name is required.");

        RuleFor(player => player.Deck)
            .NotNull().WithMessage("Player deck is required.")
            .NotEmpty().WithMessage("Player deck must contain at least one card.");

        RuleForEach(player => player.Deck)
            .NotEmpty().WithMessage("Deck card ids cannot be empty.");
    }
}

public sealed class CardValidator : AbstractValidator<Card>
{
    public CardValidator()
    {
        RuleFor(card => card.Id)
            .NotEmpty().WithMessage("Card id is required.");

        RuleFor(card => card.DisplayName)
            .NotEmpty().WithMessage("Card display name is required.");

        RuleFor(card => card.Name)
            .NotNull().WithMessage("Card name entries are required.")
            .NotEmpty().WithMessage("Card must have at least one name entry.");

        RuleForEach(card => card.Name)
            .NotEmpty().WithMessage("Card name entries cannot be empty.");

        RuleFor(card => card.Conditions)
            .NotNull().WithMessage("Card conditions collection is required.");

        RuleFor(card => card.Effects)
            .NotNull().WithMessage("Card effects collection is required.");
    }
}

public sealed class UserDtoValidator : AbstractValidator<UserDto>
{
    public UserDtoValidator()
    {
        RuleFor(userDto => userDto.Username)
            .NotEmpty().WithMessage("Username is required.");

        RuleFor(userDto => userDto.Email)
            .NotEmpty().WithMessage("Email is required.")
            .EmailAddress().WithMessage("Email must be a valid email address.");

        RuleFor(userDto => userDto.Password)
            .NotEmpty().WithMessage("Password is required.");
    }
}

public sealed class CreateDeckRequestValidator : AbstractValidator<CreateDeckRequest>
{
    public CreateDeckRequestValidator()
    {
        RuleFor(request => request.Type)
            .IsInEnum().WithMessage("Deck type is invalid.");

        RuleFor(request => request.Cards)
            .NotEmpty().WithMessage("Cards payload is required.");

        RuleFor(request => request.UserId)
            .NotNull()
            .When(request => request.Type == Data.Entities.DeckType.User)
            .WithMessage("UserId is required when deck type is User.");
    }
}

public sealed class UserLoginDtoValidator : AbstractValidator<UserLoginDto>
{
    public UserLoginDtoValidator()
    {
        RuleFor(userDto => userDto.Email)
            .NotEmpty().WithMessage("Email is required.")
            .EmailAddress().WithMessage("Email must be a valid email address.");

        RuleFor(userDto => userDto.Password)
            .NotEmpty().WithMessage("Password is required.");
    }
}

public sealed class UpdateCardEffectsRequestValidator : AbstractValidator<UpdateCardEffectsRequest>
{
    public UpdateCardEffectsRequestValidator()
    {
        RuleFor(request => request)
            .Must(HasAnyPatchableField)
            .WithMessage("At least one patchable field is required.");

        RuleFor(request => request.Conditions)
            .Must(conditions => conditions is null || conditions.Count > 0)
            .WithMessage("Conditions must include at least one entry when provided.");

        RuleFor(request => request.Effects)
            .Must(effects => effects is null || effects.Count > 0)
            .WithMessage("Effects must include at least one entry when provided.");

        RuleForEach(request => request.Conditions ?? Array.Empty<ConditionSpec>())
            .ChildRules(condition =>
            {
                condition.RuleFor(value => value.Id)
                    .NotEmpty().WithMessage("Condition id is required.");

                condition.RuleFor(value => value.Args)
                    .NotNull().WithMessage("Condition args are required.");

                condition.RuleForEach(value => value.Args)
                    .Must(arg => !string.IsNullOrWhiteSpace(arg.Key) && !string.IsNullOrWhiteSpace(arg.Value))
                    .WithMessage("Condition args must include non-empty keys and values.");
            });

        RuleForEach(request => request.Effects ?? Array.Empty<EffectSpec>())
            .ChildRules(effect =>
            {
                effect.RuleFor(value => value.Id)
                    .NotEmpty().WithMessage("Effect id is required.");

                effect.RuleFor(value => value.Kind)
                    .NotEqual(EffectKind.Unknown)
                    .WithMessage("Effect kind must be specified.");

                effect.RuleFor(value => value.Timing)
                    .NotEqual(EffectTiming.Unspecified)
                    .WithMessage("Effect timing must be specified.");

                effect.RuleFor(value => value.Args)
                    .NotNull().WithMessage("Effect args are required.");

                effect.RuleForEach(value => value.Args)
                    .Must(arg => !string.IsNullOrWhiteSpace(arg.Key) && !string.IsNullOrWhiteSpace(arg.Value))
                    .WithMessage("Effect args must include non-empty keys and values.");
            });
    }

    private static bool HasAnyPatchableField(UpdateCardEffectsRequest request)
    {
        return request.Conditions is not null
            || request.Effects is not null
            || request.Description is not null
            || request.SupportEffect is not null;
    }
}
