namespace ProjectHiddenVillage.Server;

public sealed class GameCardEffectContext
{
    public GameCardEffectContext(
        GameInstance game,
        Player actingPlayer,
        Card sourceCardDefinition,
        CardInstance? sourceCardInstance,
        IReadOnlyDictionary<string, string> arguments,
        IReadOnlyList<GameEffectTargetReference> selectedTargets)
    {
        Game = game;
        ActingPlayer = actingPlayer;
        SourceCardDefinition = sourceCardDefinition;
        SourceCardInstance = sourceCardInstance;
        Arguments = arguments;
        SelectedTargets = selectedTargets;
    }

    public GameInstance Game { get; }

    public Player ActingPlayer { get; }

    public Card SourceCardDefinition { get; }

    public CardInstance? SourceCardInstance { get; }

    public IReadOnlyDictionary<string, string> Arguments { get; }

    public IReadOnlyList<GameEffectTargetReference> SelectedTargets { get; }
}