using FluentValidation;
using ProjectHiddenVillage.Server.Data.DTOs;

namespace ProjectHiddenVillage.Server;

public sealed class CreateGameInstanceRequestValidator : AbstractValidator<CreateGameInstanceRequest>
{
    public CreateGameInstanceRequestValidator()
    {
        RuleFor(request => request.Players)
            .NotNull().WithMessage("Players payload is required.")
            .NotEmpty().WithMessage("At least one player is required.");

        RuleForEach(request => request.Players)
            .SetValidator(new PlayerValidator());

        RuleFor(request => request.CardDefinitions)
            .NotNull().WithMessage("CardDefinitions payload is required.")
            .NotEmpty().WithMessage("At least one card definition is required.");

        RuleForEach(request => request.CardDefinitions)
            .SetValidator(new CardValidator());
    }
}

public sealed class JoinGameInstanceRequestValidator : AbstractValidator<JoinGameInstanceRequest>
{
    public JoinGameInstanceRequestValidator()
    {
        RuleFor(request => request.Player)
            .NotNull().WithMessage("Player payload is required.")
            .SetValidator(new PlayerValidator());
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
