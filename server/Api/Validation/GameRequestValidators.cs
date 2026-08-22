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

        RuleForEach(request => request.Conditions)
            .Must(condition => !string.IsNullOrWhiteSpace(condition))
            .WithMessage("Condition entries must be non-empty strings.")
            .When(request => request.Conditions is not null);

        RuleForEach(request => request.Effects)
            .ChildRules(effect =>
            {
                effect.RuleFor(value => value.Id)
                    .NotEmpty().WithMessage("Effect id is required.");

                effect.RuleFor(value => value.EffectType)
                    .NotEqual(EffectKind.Unknown)
                    .WithMessage("Effect kind must be specified.");

                effect.RuleFor(value => value.Timing)
                    .NotEqual(EffectTiming.Unspecified)
                    .WithMessage("Effect timing must be specified.");

                effect.RuleFor(value => value.ChakraCost)
                    .GreaterThanOrEqualTo(0)
                    .When(value => value.ChakraCost.HasValue)
                    .WithMessage("Effect chakra cost cannot be negative.");

                effect.RuleFor(value => value.ContextRules)
                    .NotNull().WithMessage("Effect context rules are required.");

                effect.RuleFor(value => value.TargetRules)
                    .NotNull().WithMessage("Effect target rules are required.");

                effect.RuleFor(value => value.TargetRules.ExactTargetCount)
                    .GreaterThanOrEqualTo(0)
                    .When(value => value.TargetRules.ExactTargetCount.HasValue)
                    .WithMessage("Exact target count cannot be negative.");

                effect.RuleFor(value => value.TargetRules.MinimumTargetCount)
                    .GreaterThanOrEqualTo(0)
                    .When(value => value.TargetRules.MinimumTargetCount.HasValue)
                    .WithMessage("Minimum target count cannot be negative.");

                effect.RuleFor(value => value.TargetRules.MaximumTargetCount)
                    .GreaterThanOrEqualTo(0)
                    .When(value => value.TargetRules.MaximumTargetCount.HasValue)
                    .WithMessage("Maximum target count cannot be negative.");

                effect.RuleFor(value => value.TargetRules)
                    .Must(targetRules =>
                        !targetRules.ExactTargetCount.HasValue
                        || (!targetRules.MinimumTargetCount.HasValue && !targetRules.MaximumTargetCount.HasValue))
                    .WithMessage("Exact target count cannot be combined with minimum or maximum target count.");

                effect.RuleFor(value => value.TargetRules)
                    .Must(targetRules =>
                    {
                        if (targetRules.ExactTargetCount.HasValue)
                        {
                            return true;
                        }

                        if (!targetRules.MinimumTargetCount.HasValue || !targetRules.MaximumTargetCount.HasValue)
                        {
                            return true;
                        }

                        return targetRules.MinimumTargetCount.Value <= targetRules.MaximumTargetCount.Value;
                    })
                    .WithMessage("Minimum target count cannot be greater than maximum target count.");

                effect.RuleForEach(value => value.TargetRules.Rules)
                    .ChildRules(rule =>
                    {
                        rule.RuleFor(value => value.ExactSelectedTargetCount)
                            .GreaterThanOrEqualTo(0)
                            .When(value => value.ExactSelectedTargetCount.HasValue)
                            .WithMessage("Rule exact selected target count cannot be negative.");

                        rule.RuleFor(value => value.MinimumSelectedTargetCount)
                            .GreaterThanOrEqualTo(0)
                            .When(value => value.MinimumSelectedTargetCount.HasValue)
                            .WithMessage("Rule minimum selected target count cannot be negative.");

                        rule.RuleFor(value => value.MaximumSelectedTargetCount)
                            .GreaterThanOrEqualTo(0)
                            .When(value => value.MaximumSelectedTargetCount.HasValue)
                            .WithMessage("Rule maximum selected target count cannot be negative.");

                        rule.RuleFor(value => value)
                            .Must(value => !value.ExactSelectedTargetCount.HasValue
                                || (!value.MinimumSelectedTargetCount.HasValue && !value.MaximumSelectedTargetCount.HasValue))
                            .WithMessage("Rule exact selected target count cannot be combined with minimum or maximum selected target count.");

                        rule.RuleFor(value => value)
                            .Must(value =>
                            {
                                if (!value.MinimumSelectedTargetCount.HasValue || !value.MaximumSelectedTargetCount.HasValue)
                                {
                                    return true;
                                }

                                return value.MinimumSelectedTargetCount.Value <= value.MaximumSelectedTargetCount.Value;
                            })
                            .WithMessage("Rule minimum selected target count cannot be greater than maximum selected target count.");

                        rule.RuleForEach(value => value.Restriction.Predicates)
                            .ChildRules(predicate =>
                            {
                                predicate.RuleFor(value => value)
                                    .Must(value =>
                                    {
                                        var hasValue = !string.IsNullOrWhiteSpace(value.Value);
                                        var hasValues = value.Values is { Count: > 0 };

                                        return value.Operator switch
                                        {
                                            ZoneCardPredicateOperator.In => hasValues || value.Property == ZoneCardProperty.Type,
                                            ZoneCardPredicateOperator.Equals => hasValue || value.Property == ZoneCardProperty.Self,
                                            ZoneCardPredicateOperator.NotEquals => hasValue || value.Property == ZoneCardProperty.Self,
                                            ZoneCardPredicateOperator.Contains => hasValue,
                                            ZoneCardPredicateOperator.GreaterThan => hasValue,
                                            ZoneCardPredicateOperator.GreaterThanOrEqual => hasValue,
                                            ZoneCardPredicateOperator.LessThan => hasValue,
                                            ZoneCardPredicateOperator.LessThanOrEqual => hasValue,
                                            _ => false,
                                        };
                                    })
                                    .WithMessage("Predicate value payload does not match the selected operator.");
                            });
                    });

                effect.RuleFor(value => value.TargetRules.TributeComposition)
                    .Must(composition => composition is null ||
                        !composition.ExactTributeCount.HasValue ||
                        (!composition.MinimumTributeCount.HasValue && !composition.MaximumTributeCount.HasValue))
                    .WithMessage("Exact tribute count cannot be combined with minimum or maximum tribute count.");

                effect.RuleFor(value => value.TargetRules.TributeComposition)
                    .Must(composition => composition is null
                        || !composition.MinimumTributeCount.HasValue
                        || !composition.MaximumTributeCount.HasValue
                        || composition.MinimumTributeCount.Value <= composition.MaximumTributeCount.Value)
                    .WithMessage("Minimum tribute count cannot be greater than maximum tribute count.");

                effect.RuleFor(value => value.TargetRules.TributeComposition)
                    .Must(composition => composition is null
                        || (!composition.ExactTributeCount.HasValue || composition.ExactTributeCount.Value >= 0)
                        && (!composition.MinimumTributeCount.HasValue || composition.MinimumTributeCount.Value >= 0)
                        && (!composition.MaximumTributeCount.HasValue || composition.MaximumTributeCount.Value >= 0))
                    .WithMessage("Tribute composition counts cannot be negative.");

                effect.RuleFor(value => value.TargetRules)
                    .Must(targetRules => targetRules.TributeComposition is null
                        || targetRules.Rules.Any(rule => rule.TributeRole == TributeTargetRole.SummonCandidate))
                    .WithMessage("Tribute composition requires at least one summon candidate target rule.");

                effect.RuleFor(value => value.TargetRules)
                    .Must(targetRules => targetRules.TributeComposition is null
                        || targetRules.Rules.Any(rule => rule.TributeRole == TributeTargetRole.TributeMaterial))
                    .WithMessage("Tribute composition requires at least one tribute material target rule.");

                effect.RuleFor(value => value)
                    .Must(value => value.RuntimeEffectType != RuntimeEffects.Tribute
                        || value.TargetRules.TributeComposition is not null
                        || !value.TargetRules.Rules.Any(rule =>
                            rule.ExactSelectedTargetCount.HasValue
                            || rule.MinimumSelectedTargetCount.HasValue
                            || rule.MaximumSelectedTargetCount.HasValue))
                    .WithMessage("Rule selected target count constraints require tribute composition.");
            })
            .When(request => request.Effects is not null);
    }

    private static bool HasAnyPatchableField(UpdateCardEffectsRequest request)
    {
        return request.Conditions is not null
            || request.Effects is not null
            || request.Description is not null
            || request.SupportEffect is not null
            || request.CannotBeNormalSummoned.HasValue;
    }
}
