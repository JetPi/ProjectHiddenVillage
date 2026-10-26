using FluentValidation;

namespace ProjectHiddenVillage.Server;

public sealed class DeckRulesetCardRestrictionRequestValidator : AbstractValidator<DeckRulesetCardRestrictionRequest>
{
    internal const int MaxCopiesPerRestriction = 99;

    public DeckRulesetCardRestrictionRequestValidator()
    {
        RuleFor(restriction => restriction.CardId)
            .NotEmpty()
            .WithMessage("Card id is required.")
            .MaximumLength(64)
            .WithMessage("Card id cannot exceed 64 characters.")
            .Matches("^[A-Za-z0-9._-]+$")
            .WithMessage("Card id can only contain letters, digits, dot, dash and underscore.");

        RuleFor(restriction => restriction.MaxCopies)
            .InclusiveBetween(0, MaxCopiesPerRestriction)
            .WithMessage($"A card restriction must allow between 0 and {MaxCopiesPerRestriction} copies.");
    }
}

public sealed class CreateDeckRulesetRequestValidator : AbstractValidator<CreateDeckRulesetRequest>
{
    public CreateDeckRulesetRequestValidator()
    {
        RuleFor(request => request.Key)
            .NotEmpty()
            .WithMessage("Ruleset key is required.")
            .MaximumLength(64)
            .WithMessage("Ruleset key cannot exceed 64 characters.")
            .Matches("^[a-z0-9]+(?:-[a-z0-9]+)*$")
            .WithMessage("Ruleset key must be lower-case letters, digits and single dashes.");

        DeckRulesetShapeRules.AddScalarRules(
            this,
            request => request.Name,
            request => request.LeaderCount,
            request => request.NonLeaderCardCount,
            request => request.MaxCopiesPerNonLeaderCard,
            request => request.SortOrder);

        DeckRulesetShapeRules.AddRestrictionRules(this, request => request.CardRestrictions);
    }
}

public sealed class UpdateDeckRulesetRequestValidator : AbstractValidator<UpdateDeckRulesetRequest>
{
    public UpdateDeckRulesetRequestValidator()
    {
        DeckRulesetShapeRules.AddScalarRules(
            this,
            request => request.Name,
            request => request.LeaderCount,
            request => request.NonLeaderCardCount,
            request => request.MaxCopiesPerNonLeaderCard,
            request => request.SortOrder);

        DeckRulesetShapeRules.AddRestrictionRules(this, request => request.CardRestrictions);
    }
}

internal static class DeckRulesetShapeRules
{
    internal const int MaxNameLength = 64;
    internal const int MaxDeckSize = 200;
    internal const int MaxCopiesPerCard = 99;

    internal static void AddScalarRules<T>(
        AbstractValidator<T> validator,
        System.Linq.Expressions.Expression<Func<T, string>> nameSelector,
        System.Linq.Expressions.Expression<Func<T, int>> leaderCountSelector,
        System.Linq.Expressions.Expression<Func<T, int>> nonLeaderCardCountSelector,
        System.Linq.Expressions.Expression<Func<T, int>> maxCopiesSelector,
        System.Linq.Expressions.Expression<Func<T, int>> sortOrderSelector)
    {
        validator.RuleFor(nameSelector)
            .Must(name => !string.IsNullOrWhiteSpace(name))
            .WithMessage("Ruleset name is required.")
            .MaximumLength(MaxNameLength)
            .WithMessage($"Ruleset name cannot exceed {MaxNameLength} characters.");

        validator.RuleFor(leaderCountSelector)
            .Equal(1)
            .WithMessage("A ruleset must require exactly one leader card.");

        validator.RuleFor(nonLeaderCardCountSelector)
            .InclusiveBetween(1, MaxDeckSize)
            .WithMessage($"A ruleset deck size must be between 1 and {MaxDeckSize} non-leader cards.");

        validator.RuleFor(maxCopiesSelector)
            .InclusiveBetween(1, MaxCopiesPerCard)
            .WithMessage($"A ruleset copy cap must be between 1 and {MaxCopiesPerCard}.");

        validator.RuleFor(sortOrderSelector)
            .GreaterThanOrEqualTo(0)
            .WithMessage("Sort order cannot be negative.");
    }

    internal static void AddRestrictionRules<T>(
        AbstractValidator<T> validator,
        System.Linq.Expressions.Expression<Func<T, IEnumerable<DeckRulesetCardRestrictionRequest>>> restrictionsSelector)
    {
        validator.RuleFor(restrictionsSelector)
            .NotNull()
            .WithMessage("Card restrictions are required.")
            .Must(HaveDistinctCardIds)
            .WithMessage("Each card may appear only once in a ruleset's restriction list.");

        validator.RuleForEach(restrictionsSelector)
            .SetValidator(new DeckRulesetCardRestrictionRequestValidator());
    }

    private static bool HaveDistinctCardIds(IEnumerable<DeckRulesetCardRestrictionRequest>? restrictions)
    {
        if (restrictions is null)
        {
            return true;
        }

        var seenCardIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var restriction in restrictions)
        {
            var cardId = restriction.CardId?.Trim();
            if (string.IsNullOrEmpty(cardId))
            {
                continue;
            }

            if (!seenCardIds.Add(cardId))
            {
                return false;
            }
        }

        return true;
    }
}
