using FluentValidation;

namespace ProjectHiddenVillage.Server;

public sealed class DeckRulesetCardRestrictionRequestValidator : AbstractValidator<DeckRulesetCardRestrictionRequest>
{
    internal const int MaxCopiesPerRestriction = 99;

    /// <summary>Mirrors the <c>Code</c> column.</summary>
    internal const int MaxCodeLength = 32;

    public DeckRulesetCardRestrictionRequestValidator()
    {
        RuleFor(restriction => restriction.MatchType)
            .IsInEnum()
            .WithMessage("A card rule must match either a whole card code or a set code.");

        RuleFor(restriction => restriction.Code)
            .NotEmpty()
            .WithMessage("A card rule needs a code.")
            .MaximumLength(MaxCodeLength)
            .WithMessage($"A card rule code cannot exceed {MaxCodeLength} characters.")
            .Matches("^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$")
            .WithMessage("A card rule code can only contain letters, digits and single dashes.");

        // A set code is the segment before the first dash, so a dash inside a set rule would never match
        // anything; the admin almost certainly meant a single card.
        When(
            restriction => restriction.MatchType == CardRestrictionMatchType.Set,
            () =>
            {
                RuleFor(restriction => restriction.Code)
                    .Must(code => code is null || !code.Contains('-'))
                    .WithMessage("A set rule names the code before the first dash, so it cannot contain a dash.");
            });

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

        DeckRulesetShapeRules.AddCardPoolRules(this, request => request.CardPoolMode);

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

        DeckRulesetShapeRules.AddCardPoolRules(this, request => request.CardPoolMode);

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

    /// <summary>
    /// Which pool the rules are read against. The two values are the only ones evaluation knows, so an unknown
    /// value has to be refused here rather than silently treated as an open pool.
    /// </summary>
    internal static void AddCardPoolRules<T>(
        AbstractValidator<T> validator,
        System.Linq.Expressions.Expression<Func<T, CardPoolMode>> cardPoolModeSelector)
    {
        validator.RuleFor(cardPoolModeSelector)
            .IsInEnum()
            .WithMessage("A ruleset must use a known card pool mode.");
    }

    internal static void AddRestrictionRules<T>(
        AbstractValidator<T> validator,
        System.Linq.Expressions.Expression<Func<T, IEnumerable<DeckRulesetCardRestrictionRequest>>> restrictionsSelector)
    {
        validator.RuleFor(restrictionsSelector)
            .NotNull()
            .WithMessage("Card restrictions are required.")
            .Must(HaveDistinctMatchers)
            .WithMessage("Each matcher may appear only once in a ruleset's restriction list.");

        validator.RuleForEach(restrictionsSelector)
            .SetValidator(new DeckRulesetCardRestrictionRequestValidator());
    }

    /// <summary>
    /// A card code and a set code live in separate match spaces, so <c>SAMPLE</c> as a set and <c>SAMPLE</c> as a
    /// card are two different rules. Only an exact repeat of the same pair is a duplicate.
    /// </summary>
    private static bool HaveDistinctMatchers(IEnumerable<DeckRulesetCardRestrictionRequest>? restrictions)
    {
        if (restrictions is null)
        {
            return true;
        }

        var seenMatchers = new HashSet<(CardRestrictionMatchType MatchType, string Code)>();

        foreach (var restriction in restrictions)
        {
            var code = restriction.Code?.Trim().ToUpperInvariant();
            if (string.IsNullOrEmpty(code))
            {
                continue;
            }

            if (!seenMatchers.Add((restriction.MatchType, code)))
            {
                return false;
            }
        }

        return true;
    }
}
