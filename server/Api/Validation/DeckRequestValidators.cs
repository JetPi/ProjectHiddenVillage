using FluentValidation;

namespace ProjectHiddenVillage.Server;

public sealed class DeckCardRequestValidator : AbstractValidator<DeckCardRequest>
{
    private const int MaxCardIdLength = 64;

    internal const int MaxQuantityPerLine = 99;

    public DeckCardRequestValidator()
    {
        RuleFor(card => card.CardId)
            .NotEmpty()
            .WithMessage("Card id is required.")
            .MaximumLength(MaxCardIdLength)
            .WithMessage($"Card id cannot exceed {MaxCardIdLength} characters.")
            .Matches("^[A-Za-z0-9._-]+$")
            .WithMessage("Card id can only contain letters, digits, dot, dash and underscore.");

        RuleFor(card => card.Quantity)
            .InclusiveBetween(1, MaxQuantityPerLine)
            .WithMessage($"A card line must have a quantity between 1 and {MaxQuantityPerLine}.");
    }
}

public sealed class CreatePublicDeckRequestValidator : AbstractValidator<CreatePublicDeckRequest>
{
    public CreatePublicDeckRequestValidator()
    {
        DeckWriteShapeRules.AddNameRule(this, request => request.Name);
        DeckWriteShapeRules.AddCardsRule(this, request => request.Cards);
    }
}

public sealed class UpdateDeckRequestValidator : AbstractValidator<UpdateDeckRequest>
{
    public UpdateDeckRequestValidator()
    {
        DeckWriteShapeRules.AddNameRule(this, request => request.Name);
        DeckWriteShapeRules.AddCardsRule(this, request => request.Cards);
    }
}

internal static class DeckWriteShapeRules
{
    internal const int MaxNameLength = 128;

    internal static void AddNameRule<T>(AbstractValidator<T> validator, System.Linq.Expressions.Expression<Func<T, string>> nameSelector)
    {
        validator.RuleFor(nameSelector)
            .Must(name => !string.IsNullOrWhiteSpace(name))
            .WithMessage("Deck name is required.")
            .MaximumLength(MaxNameLength)
            .WithMessage($"Deck name cannot exceed {MaxNameLength} characters.");
    }

    internal static void AddCardsRule<T>(
        AbstractValidator<T> validator,
        System.Linq.Expressions.Expression<Func<T, IEnumerable<DeckCardRequest>>> cardsSelector)
    {
        validator.RuleFor(cardsSelector)
            .NotNull()
            .WithMessage("Deck cards are required.")
            .NotEmpty()
            .WithMessage("A deck needs at least one card.")
            .Must(HaveDistinctCardIds)
            .WithMessage("Each card id may appear only once; combine duplicate lines into a single quantity.");

        validator.RuleForEach(cardsSelector)
            .SetValidator(new DeckCardRequestValidator());
    }

    private static bool HaveDistinctCardIds(IEnumerable<DeckCardRequest>? cards)
    {
        if (cards is null)
        {
            return true;
        }

        var seenCardIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var card in cards)
        {
            var cardId = card.CardId?.Trim();
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
