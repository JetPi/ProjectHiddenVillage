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

        DeckRulesetShapeRules.AddClockRules(this);

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

        DeckRulesetShapeRules.AddClockRules(this);

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

    internal const int MaxClockSeconds = 21_600;
    internal const int MaxPoolSeconds = 14_400;
    internal const int MaxTimeoutsBeforeForfeit = 10;

    /// <summary>
    /// The action-clock ranges. A zero budget would arm an already-expired deadline (so the first stop would time
    /// out instantly), and a budget larger than the player's whole-game pool would make the pool the only limit.
    /// </summary>
    internal static void AddClockRules<T>(AbstractValidator<T> validator)
        where T : IDeckRulesetClockRequest
    {
        validator.RuleFor(request => request.MainPhaseSeconds)
            .InclusiveBetween(1, MaxClockSeconds)
            .WithMessage($"A main phase budget must be between 1 and {MaxClockSeconds} seconds.");

        validator.RuleFor(request => request.OtherPhaseSeconds)
            .InclusiveBetween(1, MaxClockSeconds)
            .WithMessage($"An other phase budget must be between 1 and {MaxClockSeconds} seconds.");

        validator.RuleFor(request => request.PlayerPoolSeconds)
            .InclusiveBetween(1, MaxPoolSeconds)
            .WithMessage($"A player clock pool must be between 1 and {MaxPoolSeconds} seconds.");

        validator.RuleFor(request => request.TimeoutsBeforeForfeit)
            .InclusiveBetween(1, MaxTimeoutsBeforeForfeit)
            .WithMessage($"Timeouts before forfeit must be between 1 and {MaxTimeoutsBeforeForfeit}.");

        validator.RuleFor(request => request)
            .Must(request => request.MainPhaseSeconds <= request.PlayerPoolSeconds
                && request.OtherPhaseSeconds <= request.PlayerPoolSeconds)
            .WithMessage("A single stop's budget cannot exceed the player's whole-game pool.");
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
