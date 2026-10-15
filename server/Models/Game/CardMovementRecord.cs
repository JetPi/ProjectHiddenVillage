namespace ProjectHiddenVillage.Server;

/// <summary>
/// One card movement the engine performed, published to clients as an animation event so they can animate the
/// move instead of inferring it from zone/count deltas (see <see cref="AnimationEventResponse"/>).
///
/// <see cref="EventId"/> is stable per movement: the server republishes the bounded tail of recent movements on
/// every push, and the client de-duplicates on the id rather than tracking a cursor per player.
/// </summary>
public sealed record CardMovementRecord(
    string EventId,
    string Kind,
    string CardInstanceId,
    string PlayerId,
    string? FromZone,
    string? ToZone);

/// <summary>
/// The <see cref="CardMovementRecord.Kind"/> vocabulary. A movement is recorded where the engine performs it, so
/// the client never has to guess "why" a card moved - only "what" moved and where to.
/// </summary>
public static class CardMovementKinds
{
    /// <summary>A deck card entering its owner's hand (the turn draw, or a draw effect).</summary>
    public const string Draw = "draw";

    /// <summary>A hand (or deck) card going to the trash.</summary>
    public const string Discard = "discard";

    /// <summary>A card being placed on the character field from the hand, deck or trash.</summary>
    public const string Summon = "summon";

    /// <summary>A field card leaving for the trash as summon material.</summary>
    public const string Tribute = "tribute";

    /// <summary>A card destroyed by an effect or by battle.</summary>
    public const string Destroy = "destroy";

    /// <summary>A card set into the support area.</summary>
    public const string SetSupport = "set_support";

    /// <summary>A support card leaving its area for the trash after resolving.</summary>
    public const string SupportUsed = "support_used";

    /// <summary>A card returned from the field or support area to its owner's hand.</summary>
    public const string Bounce = "bounce";

    /// <summary>A deck card turned face up by a reveal (both zones are the deck: nothing moved).</summary>
    public const string Reveal = "reveal";

    /// <summary>A trash card summoned back onto the field.</summary>
    public const string TrashRecall = "trash_recall";

    /// <summary>A hand card placed on (or under) the deck.</summary>
    public const string PlaceOnDeck = "place_on_deck";

    /// <summary>A card moved to the exile pile.</summary>
    public const string Exile = "exile";

    /// <summary>
    /// The movement kind for a zone-to-zone move, or <c>null</c> when the pair is not one clients animate.
    ///
    /// This is the single mapping used by the central move service, so the "why" of a move is decided in one
    /// place instead of being re-derived by each consumer.
    /// </summary>
    public static string? ResolveForZonePair(PlayerZone sourceZone, PlayerZone destinationZone)
    {
        return (sourceZone, destinationZone) switch
        {
            (PlayerZone.Deck, PlayerZone.Hand) => Draw,
            (PlayerZone.Deck, PlayerZone.CharacterField) => Summon,
            (PlayerZone.Hand, PlayerZone.CharacterField) => Summon,
            (PlayerZone.Trash, PlayerZone.CharacterField) => TrashRecall,
            (PlayerZone.Hand, PlayerZone.SupportZone) => SetSupport,
            (PlayerZone.Deck, PlayerZone.SupportZone) => SetSupport,
            (PlayerZone.CharacterField, PlayerZone.SupportZone) => SetSupport,
            (PlayerZone.Hand, PlayerZone.Trash) => Discard,
            (PlayerZone.Deck, PlayerZone.Trash) => Discard,
            (PlayerZone.CharacterField, PlayerZone.Trash) => Destroy,
            (PlayerZone.SupportZone, PlayerZone.Trash) => SupportUsed,
            (PlayerZone.CharacterField, PlayerZone.Hand) => Bounce,
            (PlayerZone.SupportZone, PlayerZone.Hand) => Bounce,
            (PlayerZone.Hand, PlayerZone.Deck) => PlaceOnDeck,
            (_, PlayerZone.ExileZone) => Exile,
            _ => null,
        };
    }
}

/// <summary>
/// The zone vocabulary a <see cref="CardMovementRecord"/> uses. Derived from <see cref="PlayerZone"/> rather than
/// re-typed, so the wire vocabulary can never drift from the engine's own zone names - and it deliberately matches
/// what prompts already publish (<c>Hand</c>, <c>CharacterField</c>, <c>SupportZone</c>).
/// </summary>
public static class CardMovementZones
{
    public static readonly string Deck = PlayerZone.Deck.ToString();
    public static readonly string Hand = PlayerZone.Hand.ToString();
    public static readonly string Trash = PlayerZone.Trash.ToString();
    public static readonly string CharacterField = PlayerZone.CharacterField.ToString();
    public static readonly string SupportZone = PlayerZone.SupportZone.ToString();
    public static readonly string Exile = PlayerZone.ExileZone.ToString();
}
