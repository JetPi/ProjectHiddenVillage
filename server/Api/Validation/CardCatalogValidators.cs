using FluentValidation;
using ProjectHiddenVillage.Server.Api.Services.CardArt;

namespace ProjectHiddenVillage.Server;

/// <summary>
/// Validates a brand new card. The authoring half is not re-specified here: the create payload is reshaped into
/// the effects patch and handed to <see cref="UpdateCardEffectsRequestValidator"/>, so a rule about effects,
/// target rules or life/health can never hold on an edit and be forgotten on a create.
/// </summary>
public sealed class CreateCardRequestValidator : AbstractValidator<CreateCardRequest>
{
    /// <summary>Mirrors the <c>CardCatalogEntry.CardId</c> column.</summary>
    private const int MaxCardIdLength = CardArtSourceReference.MaxSegmentLength;

    /// <summary>Mirrors the <c>CardCatalogEntry.DisplayName</c> column.</summary>
    private const int MaxDisplayNameLength = 256;

    /// <summary>Mirrors the <c>CardCatalogEntry.OriginalId</c> column.</summary>
    private const int MaxOriginalIdLength = 64;

    /// <summary>Mirrors the <c>CardCatalogEntry.Attribute</c> column.</summary>
    private const int MaxAttributeLength = 128;

    /// <summary>Mirrors the <c>CardCatalogEntry.Image</c> column.</summary>
    private const int MaxImageLength = 1024;

    /// <summary>The name/trait lists are stored as jsonb, so these caps are about sane authoring, not schema.</summary>
    private const int MaxListEntries = 32;
    private const int MaxListEntryLength = 128;

    public CreateCardRequestValidator()
    {
        RuleFor(request => request.CardId)
            .NotEmpty()
            .WithMessage("Card id is required.")
            .MaximumLength(MaxCardIdLength)
            .WithMessage($"Card id cannot exceed {MaxCardIdLength} characters.")
            .Must(CardArtSourceReference.IsSafeSegment)
            .WithMessage("Card id can only contain letters, digits, dot, dash and underscore.");

        RuleFor(request => request.DisplayName)
            .NotEmpty()
            .WithMessage("Display name is required.")
            .MaximumLength(MaxDisplayNameLength)
            .WithMessage($"Display name cannot exceed {MaxDisplayNameLength} characters.");

        RuleFor(request => request.OriginalId)
            .MaximumLength(MaxOriginalIdLength)
            .WithMessage($"Original id cannot exceed {MaxOriginalIdLength} characters.")
            .When(request => request.OriginalId is not null);

        RuleFor(request => request.Attribute)
            .MaximumLength(MaxAttributeLength)
            .WithMessage($"Attribute cannot exceed {MaxAttributeLength} characters.")
            .When(request => request.Attribute is not null);

        RuleFor(request => request.Name)
            .Must(entries => entries is null || entries.Count <= MaxListEntries)
            .WithMessage($"A card can have at most {MaxListEntries} name entries.")
            .Must(entries => entries is null || entries.All(IsUsableListEntry))
            .WithMessage($"Name entries must be non-empty and at most {MaxListEntryLength} characters.");

        RuleFor(request => request.Traits)
            .Must(entries => entries is null || entries.Count <= MaxListEntries)
            .WithMessage($"A card can have at most {MaxListEntries} trait entries.")
            .Must(entries => entries is null || entries.All(IsUsableListEntry))
            .WithMessage($"Trait entries must be non-empty and at most {MaxListEntryLength} characters.");

        RuleFor(request => request.Image)
            .MaximumLength(MaxImageLength)
            .WithMessage($"Image reference cannot exceed {MaxImageLength} characters.")
            .Must((request, image) => IsUsableArtSource(image, request.CardId))
            .WithMessage("Image must be an http(s) URL or the local card art reference uploaded for this card id.")
            .When(request => !string.IsNullOrWhiteSpace(request.Image));

        RuleFor(request => ToEffectsPatch(request))
            .SetValidator(new UpdateCardEffectsRequestValidator());
    }

    /// <summary>
    /// The create request's authoring half, shaped as the effects patch. Effects is always non-null so the patch
    /// is never rejected merely for carrying no effect yet.
    /// </summary>
    private static UpdateCardEffectsRequest ToEffectsPatch(CreateCardRequest request)
    {
        return new UpdateCardEffectsRequest(
            Conditions: request.Conditions,
            Effects: request.Effects ?? [],
            Description: request.Description,
            SupportEffect: request.SupportEffect,
            CannotBeNormalSummoned: request.CannotBeNormalSummoned,
            Type: request.Type,
            Color: request.Color,
            Power: request.Power,
            Damage: request.Damage,
            Life: request.Life,
            Health: request.Health);
    }

    private static bool IsUsableListEntry(string? entry)
    {
        return !string.IsNullOrWhiteSpace(entry)
            && entry.Trim().Length <= MaxListEntryLength;
    }

    /// <summary>
    /// Art is optional, but when it is supplied it is either a fetchable URL or a local reference that names the
    /// card being created - a reference to another card's file would let one card claim another card's art.
    /// </summary>
    private static bool IsUsableArtSource(string? image, string? cardId)
    {
        var trimmedImage = image?.Trim();
        if (string.IsNullOrEmpty(trimmedImage))
        {
            return true;
        }

        if (CardArtSourceReference.IsLocal(trimmedImage))
        {
            return !string.IsNullOrWhiteSpace(cardId)
                && string.Equals(
                    trimmedImage,
                    CardArtSourceReference.BuildLocalReference(cardId.Trim()),
                    StringComparison.OrdinalIgnoreCase);
        }

        return IsWellFormedExternalArtSource(trimmedImage);
    }

    /// <summary>
    /// The format half of the art rule, shared with the replacement validator: that an image is either a fetchable
    /// URL or a local reference at all. Whether a local reference belongs to the card is a question the create
    /// request can answer from its own payload but the replacement request cannot - it has to be checked against
    /// the stored card - so ownership stays out of here.
    /// </summary>
    internal static bool IsWellFormedExternalArtSource(string image)
    {
        return Uri.TryCreate(image, UriKind.Absolute, out var parsed)
            && (parsed.Scheme == Uri.UriSchemeHttp || parsed.Scheme == Uri.UriSchemeHttps)
            && !string.IsNullOrWhiteSpace(parsed.Host);
    }
}

/// <summary>
/// Validates a replacement art reference. An empty value clears the art, which is how the edit screen removes it.
/// </summary>
public sealed class UpdateCardImageRequestValidator : AbstractValidator<UpdateCardImageRequest>
{
    private const int MaxImageLength = 1024;

    public UpdateCardImageRequestValidator()
    {
        RuleFor(request => request.Image)
            .MaximumLength(MaxImageLength)
            .WithMessage($"Image reference cannot exceed {MaxImageLength} characters.")
            .Must(image => string.IsNullOrWhiteSpace(image)
                || CardArtSourceReference.IsWellFormedLocalReference(image)
                || CreateCardRequestValidator.IsWellFormedExternalArtSource(image.Trim()))
            .WithMessage("Image must be an http(s) URL or a local card art reference.");
    }
}
