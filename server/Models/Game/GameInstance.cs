namespace ProjectHiddenVillage.Server;

/// <summary>
/// The deck ruleset a game was created under. A game with a binding is a quick-match game: every participant's
/// deck was validated against it, and anyone joining by code is validated too.
///
/// <see cref="Clock"/> is the action-clock policy the ruleset binds, snapshotted here at creation time so editing
/// the ruleset later cannot retune a running game.
/// </summary>
public sealed record GameRulesetBinding(Guid Id, string Key, string Name, GameClockPolicy Clock);

public sealed class GameInstance
{
    private static readonly IReadOnlyDictionary<GamePromptType, PromptTemplate> PromptTemplates =
        new Dictionary<GamePromptType, PromptTemplate>
        {
            [GamePromptType.ChooseStartingPlayer] = new(
                RequiresOptions: true,
                ResolveChooseStartingPlayerPrompt,
                ValidateChooseStartingPlayerPrompt),
            [GamePromptType.Mulligan] = new(
                RequiresOptions: true,
                ResolveMulliganPrompt,
                ValidateMulliganPrompt),
            // Raised mid-resolution when an effect defers its target choice (EffectSelectionTiming.Prompted).
            // Resolving only records the answer: the engine resumes the suspended chain from
            // GamePrompt.EffectContinuation.
            [GamePromptType.Effect] = new(
                RequiresOptions: true,
                ResolveEffectSelectionPrompt,
                ValidateEffectSelectionPrompt)
        };

    public GameInstance(GameState state, IEnumerable<GamePrompt>? pendingPrompts = null, DateTimeOffset? createdAtUtc = null)
    {
        State = state ?? throw new ArgumentNullException(nameof(state));
        CreatedAtUtc = createdAtUtc ?? DateTimeOffset.UtcNow;

        foreach (var prompt in pendingPrompts ?? [])
        {
            EnqueuePrompt(prompt);
        }

        ValidateInvariants();
    }

    public GameState State { get; }

    /// <summary>
    /// The ruleset this game plays under, or <c>null</c> for a game created through the plain create mode. It
    /// lives on the instance (not in <see cref="GameState"/>) because it is matchmaking metadata: the state is
    /// what the board renders, this is what admission checks read.
    /// </summary>
    public GameRulesetBinding? Ruleset { get; set; }

    /// <summary>
    /// The modifiers the host opened this table with (see <see cref="GameModifierKeys"/>). They are stamped at
    /// creation and never changed, so a running game keeps the rules its players agreed to. Quick match never sets
    /// them: the queue request has no modifier field.
    /// </summary>
    public IReadOnlyList<string> Modifiers { get; set; } = [];

    /// <summary>True when this table was hosted as "time relaxed": the action clock never runs here.</summary>
    public bool IsTimeRelaxed => GameModifierKeys.IsTimeRelaxed(Modifiers);

    public DateTimeOffset CreatedAtUtc { get; }

    public string Id => State.GameId;

    public Queue<GamePrompt> PendingPrompts { get; } = new();

    public List<GameActionLogEntry> ActionLog { get; } = [];

    /// <summary>
    /// The phase transition this instance stopped on, waiting for its acknowledgement from every connected
    /// participant. <c>null</c> means nothing is outstanding: the phase automation may take the next step and
    /// the clients may act. See <see cref="PendingPhasePresentation"/>.
    /// </summary>
    public PendingPhasePresentation? PendingPhasePresentation { get; private set; }

    /// <summary>
    /// True when the engine owns this game's non-interactive phases (the phase automation is on for the registry
    /// that created it). The response mapper stops publishing the client's system <c>advance-phase</c> action
    /// when it is: driving the phases is the engine's job then, and the client's is to present and acknowledge.
    /// </summary>
    public bool IsPhaseAutomationEnabled { get; set; }

    /// <summary>
    /// The action clock of this game, or <c>null</c> until the first mutation boundary creates it. It lives on the
    /// instance (not in <see cref="GameState"/>) because it is time, not board state: the state is what the board
    /// renders, while this is bookkeeping the engine charges players against. See <see cref="GameClock"/>.
    /// </summary>
    public GameClock? Clock { get; private set; }

    /// <summary>
    /// Creates the clock for <paramref name="policy"/> the first time it is called, or replaces it when the policy
    /// changed (which only happens when a ruleset binding is stamped on right after creation). Pools are seeded
    /// for every player currently in the game; calling it again adds players who joined since, without disturbing
    /// an armed deadline.
    /// </summary>
    public GameClock StartClock(GameClockPolicy policy, TimeProvider timeProvider)
    {
        ArgumentNullException.ThrowIfNull(policy);
        ArgumentNullException.ThrowIfNull(timeProvider);

        if (Clock is null
            || !Equals(Clock.Policy, policy)
            || !ReferenceEquals(Clock.TimeProvider, timeProvider))
        {
            Clock = new GameClock(policy, timeProvider);
        }

        Clock.Start(State.Players.Select(player => player.PlayerId));
        return Clock;
    }

    /// <summary>Stops the clock for good: the game is over, or nothing else can be charged.</summary>
    public void StopClock()
    {
        Clock?.Stop();
    }

    /// <summary>
    /// Stops the phase automation on the transition that was just performed and records who has to present it.
    /// The previous presentation (if any) is replaced: only the newest transition can still be on screen.
    /// </summary>
    public PendingPhasePresentation MintPhasePresentation(
        PhasePresentationKind kind,
        IEnumerable<string> requiredAckPlayerIds,
        DateTimeOffset? timestampUtc = null)
    {
        if (kind == PhasePresentationKind.None)
        {
            throw new InvalidOperationException("A presentation with nothing to show must not be minted.");
        }

        var presentation = new PendingPhasePresentation(
            presentationId: Guid.NewGuid().ToString("N"),
            phase: State.Phase,
            kind: kind,
            turnNumber: State.TurnNumber,
            requiredAckPlayerIds: requiredAckPlayerIds);

        PendingPhasePresentation = presentation;

        AddActionLogEntry(
            actionType: "phase_presented",
            message: $"Phase {State.Phase} is waiting to be presented ({kind}).",
            metadata: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["presentationId"] = presentation.PresentationId,
                ["presentationKind"] = kind.ToString(),
                ["phase"] = State.Phase.ToString(),
                ["turnNumber"] = State.TurnNumber.ToString(System.Globalization.CultureInfo.InvariantCulture),
                ["requiredAckPlayerIds"] = string.Join(",", presentation.RequiredAckPlayerIds),
            },
            timestampUtc: timestampUtc,
            category: GameActionLogCategory.Phase);

        return presentation;
    }

    /// <summary>
    /// Records an acknowledgement for the outstanding presentation. Returns false when the id does not match the
    /// pending one (already superseded, or expired by the ack timeout) or the player was not expected to ack -
    /// neither is an error, the caller just has nothing to resume.
    /// </summary>
    public bool AcknowledgePhasePresentation(string presentationId, string playerId)
    {
        var presentation = PendingPhasePresentation;
        if (presentation is null
            || !string.Equals(presentation.PresentationId, presentationId, StringComparison.Ordinal)
            || !presentation.IsRequiredFrom(playerId))
        {
            return false;
        }

        presentation.Acknowledge(playerId);

        AddActionLogEntry(
            actionType: "phase_presentation_acknowledged",
            message: $"Phase {presentation.Phase} presentation acknowledged.",
            playerId: playerId,
            metadata: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["presentationId"] = presentation.PresentationId,
                ["presentationKind"] = presentation.Kind.ToString(),
                ["phase"] = presentation.Phase.ToString(),
            },
            category: GameActionLogCategory.Phase);

        return true;
    }

    /// <summary>
    /// Drops a disconnected participant from the outstanding requirement, so a closed tab can never hold the
    /// table. Returns whether the requirement changed, which tells the caller to re-check the drain.
    /// </summary>
    public bool ReleasePhasePresentationRequirement(string playerId)
    {
        var presentation = PendingPhasePresentation;
        return presentation is not null && presentation.ReleaseRequirement(playerId);
    }

    /// <summary>Clears the outstanding presentation: it is satisfied, or the game ended and nothing is presented.</summary>
    public void ClearPhasePresentation()
    {
        PendingPhasePresentation = null;
    }

    public GameActionLogEntry AddActionLogEntry(
        string actionType,
        string message,
        string? playerId = null,
        IReadOnlyDictionary<string, string>? metadata = null,
        DateTimeOffset? timestampUtc = null,
        GameActionLogCategory category = GameActionLogCategory.Lifecycle,
        GameActionLogVisibility visibility = GameActionLogVisibility.Public)
    {
        if (string.IsNullOrWhiteSpace(actionType))
        {
            throw new InvalidOperationException("ActionType is required.");
        }

        if (string.IsNullOrWhiteSpace(message))
        {
            throw new InvalidOperationException("Message is required.");
        }

        var resolvedPlayerId = playerId ?? string.Empty;

        if (!string.IsNullOrWhiteSpace(resolvedPlayerId)
            && !State.Players.Any(player => string.Equals(player.PlayerId, resolvedPlayerId, StringComparison.Ordinal)))
        {
            throw new InvalidOperationException(
                $"Log player '{resolvedPlayerId}' was not found in game players.");
        }

        // An owner-only entry nobody owns could never be shown to anyone, which is almost certainly a mistake at
        // the call site rather than a deliberate "record it and hide it from everybody".
        if (visibility == GameActionLogVisibility.OwnerOnly && string.IsNullOrWhiteSpace(resolvedPlayerId))
        {
            throw new InvalidOperationException(
                "An owner-only action log entry must name the player it belongs to.");
        }

        var entry = new GameActionLogEntry
        {
            ActionType = actionType,
            Message = message,
            PlayerId = resolvedPlayerId,
            TimestampUtc = timestampUtc ?? DateTimeOffset.UtcNow,
            Category = category,
            Visibility = visibility,
            Metadata = metadata is null
                ? []
                : new Dictionary<string, string>(metadata, StringComparer.Ordinal)
        };

        ActionLog.Add(entry);
        return entry;
    }

    public void EnqueuePrompt(GamePrompt prompt)
    {
        ArgumentNullException.ThrowIfNull(prompt);

        if (!PromptTemplates.TryGetValue(prompt.Type, out var promptTemplate))
        {
            throw new InvalidOperationException($"Unsupported prompt type '{prompt.Type}'.");
        }

        if (string.IsNullOrWhiteSpace(prompt.RequestedPlayerId))
        {
            throw new InvalidOperationException("Prompt RequestedPlayerId is required.");
        }

        if (!State.Players.Any(player => string.Equals(player.PlayerId, prompt.RequestedPlayerId, StringComparison.Ordinal)))
        {
            throw new InvalidOperationException(
                $"Prompt requested player '{prompt.RequestedPlayerId}' was not found in game players.");
        }

        if (promptTemplate.RequiresOptions && prompt.Options.Count == 0)
        {
            throw new InvalidOperationException($"{prompt.Type} prompt requires at least one option.");
        }

        PendingPrompts.Enqueue(prompt);
    }

    public GamePrompt? GetPendingPrompt()
    {
        return PendingPrompts.Count > 0 ? PendingPrompts.Peek() : null;
    }

    public void ResolvePrompt(string requestedPlayerId, string selectedOption)
    {
        if (PendingPrompts.Count == 0)
        {
            throw new InvalidOperationException("There are no pending prompts to resolve.");
        }

        var prompt = PendingPrompts.Peek();

        if (!string.Equals(prompt.RequestedPlayerId, requestedPlayerId, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Only the requested player can resolve this prompt.");
        }

        if (!prompt.Options.Contains(selectedOption, StringComparer.Ordinal))
        {
            throw new InvalidOperationException("Selected option is not valid for this prompt.");
        }

        if (PromptTemplates.TryGetValue(prompt.Type, out var promptTemplate))
        {
            promptTemplate.Resolve(this, requestedPlayerId, selectedOption);
            return;
        }

        throw new InvalidOperationException($"Unsupported prompt type '{prompt.Type}'.");
    }

    public void ValidateInvariants()
    {
        if (string.IsNullOrWhiteSpace(State.GameId))
        {
            throw new InvalidOperationException("GameId is required.");
        }

        if (State.TurnNumber < 1)
        {
            throw new InvalidOperationException("TurnNumber must be at least 1.");
        }

        var playerIds = new HashSet<string>(StringComparer.Ordinal);

        foreach (var player in State.Players)
        {
            if (string.IsNullOrWhiteSpace(player.PlayerId))
            {
                throw new InvalidOperationException("Each player must have a non-empty PlayerId.");
            }

            if (!playerIds.Add(player.PlayerId))
            {
                throw new InvalidOperationException($"Duplicate player id '{player.PlayerId}' found.");
            }

            if (player.ResourcePool < 0)
            {
                throw new InvalidOperationException($"Player '{player.PlayerId}' has a negative resource pool.");
            }

            if (player.TurnCount < 0)
            {
                throw new InvalidOperationException($"Player '{player.PlayerId}' has a negative turn count.");
            }
        }

        foreach (var player in State.Players)
        {
            ValidatePlayerCardInstances(player, playerIds);
        }

        var hasPendingStartingPlayerPrompt = PendingPrompts.Any(prompt => prompt.Type == GamePromptType.ChooseStartingPlayer);

        if (State.Players.Count < 2)
        {
            if (!string.IsNullOrWhiteSpace(State.ActivePlayerId))
            {
                throw new InvalidOperationException("ActivePlayerId cannot be set before at least two players join.");
            }

            if (!string.IsNullOrWhiteSpace(State.PriorityPlayerId))
            {
                throw new InvalidOperationException("PriorityPlayerId cannot be set before at least two players join.");
            }

            if (hasPendingStartingPlayerPrompt)
            {
                throw new InvalidOperationException(
                    "ChooseStartingPlayer prompt cannot exist before at least two players join.");
            }
        }
        else if (string.IsNullOrWhiteSpace(State.ActivePlayerId))
        {
            if (State.Phase == GamePhase.ActionStep)
            {
                throw new InvalidOperationException(
                    "ActivePlayerId must be set before ActionStep can be entered.");
            }

            if (!hasPendingStartingPlayerPrompt && State.TurnNumber > 1)
            {
                throw new InvalidOperationException(
                    "ActivePlayerId must be set once the game has moved past setup.");
            }
        }
        else if (!playerIds.Contains(State.ActivePlayerId))
        {
            throw new InvalidOperationException("ActivePlayerId must reference an existing player.");
        }

        if (!string.IsNullOrEmpty(State.PriorityPlayerId) && !playerIds.Contains(State.PriorityPlayerId))
        {
            throw new InvalidOperationException("PriorityPlayerId must reference an existing player when set.");
        }

        if (State.Phase == GamePhase.ActionStep && string.IsNullOrEmpty(State.PriorityPlayerId))
        {
            throw new InvalidOperationException("PriorityPlayerId must be set during ActionStep.");
        }

        foreach (var stackEntry in State.EffectResolutionStack)
        {
            ValidateEffectResolutionStackEntry(stackEntry, playerIds);
        }

        foreach (var entry in ActionLog)
        {
            ValidateActionLogEntry(entry, playerIds);
        }

        ValidatePendingPrompts(playerIds);

        ValidatePendingPhasePresentation();
    }

    /// <summary>
    /// A presentation can only belong to the phase the engine is currently showing, in the current turn: the
    /// phase automation stops on it, so anything else means a transition ran past the acknowledgement it owed.
    /// </summary>
    private void ValidatePendingPhasePresentation()
    {
        var presentation = PendingPhasePresentation;
        if (presentation is null)
        {
            return;
        }

        if (presentation.Kind == PhasePresentationKind.None)
        {
            throw new InvalidOperationException("A pending phase presentation must have something to show.");
        }

        if (presentation.Phase != State.Phase || presentation.TurnNumber != State.TurnNumber)
        {
            throw new InvalidOperationException(
                $"Pending phase presentation {presentation.PresentationId} belongs to " +
                $"{presentation.Phase}/{presentation.TurnNumber} but the engine is on {State.Phase}/{State.TurnNumber}.");
        }

        foreach (var playerId in presentation.RequiredAckPlayerIds)
        {
            if (!State.Players.Any(player => string.Equals(player.PlayerId, playerId, StringComparison.Ordinal)))
            {
                throw new InvalidOperationException(
                    $"Pending phase presentation requires an acknowledgement from unknown player '{playerId}'.");
            }
        }
    }

    private static void ValidateActionLogEntry(GameActionLogEntry entry, HashSet<string> playerIds)
    {
        if (entry is null)
        {
            throw new InvalidOperationException("Action log entries cannot be null.");
        }

        if (string.IsNullOrWhiteSpace(entry.EntryId))
        {
            throw new InvalidOperationException("Action log entries must have a non-empty EntryId.");
        }

        if (string.IsNullOrWhiteSpace(entry.ActionType))
        {
            throw new InvalidOperationException("Action log entries must have a non-empty ActionType.");
        }

        if (string.IsNullOrWhiteSpace(entry.Message))
        {
            throw new InvalidOperationException("Action log entries must have a non-empty Message.");
        }

        if (!string.IsNullOrWhiteSpace(entry.PlayerId) && !playerIds.Contains(entry.PlayerId))
        {
            throw new InvalidOperationException(
                $"Action log entry references unknown player '{entry.PlayerId}'.");
        }
    }

    private void ValidatePendingPrompts(HashSet<string> playerIds)
    {
        foreach (var prompt in PendingPrompts)
        {
            if (string.IsNullOrWhiteSpace(prompt.PromptId))
            {
                throw new InvalidOperationException("Pending prompts must have a non-empty PromptId.");
            }

            if (!playerIds.Contains(prompt.RequestedPlayerId))
            {
                throw new InvalidOperationException(
                    $"Pending prompt requested player '{prompt.RequestedPlayerId}' was not found in game players.");
            }

            if (PromptTemplates.TryGetValue(prompt.Type, out var promptTemplate))
            {
                promptTemplate.Validate(this, prompt, playerIds);
                continue;
            }

            throw new InvalidOperationException($"Unsupported prompt type '{prompt.Type}'.");
        }
    }

    private static void ResolveChooseStartingPlayerPrompt(GameInstance instance, string requestedPlayerId, string selectedOption)
    {
        var startingPlayerId = ResolveStartingPlayerFromPromptOption(instance.State, requestedPlayerId, selectedOption);
        instance.State.ActivePlayerId = startingPlayerId;

        var startingPlayer = instance.State.Players.Single(player => string.Equals(player.PlayerId, startingPlayerId, StringComparison.Ordinal));
        startingPlayer.TurnCount++;

        instance.PendingPrompts.Dequeue();

        LogAction(
            instance,
            actionType: "prompt_resolved",
            playerId: requestedPlayerId,
            promptType: GamePromptType.ChooseStartingPlayer,
            selectedOption: selectedOption,
            selectedPlayerId: startingPlayerId);

        LogAction(
            instance,
            actionType: "phase_started",
            playerId: startingPlayerId);

        instance.ValidateInvariants();
    }

    private static void ValidateChooseStartingPlayerPrompt(GameInstance instance, GamePrompt prompt, HashSet<string> _)
    {
        if (prompt.Options.Count == 0)
        {
            throw new InvalidOperationException("ChooseStartingPlayer prompt requires at least one option.");
        }

        if (instance.State.Players.Count < 2)
        {
            throw new InvalidOperationException(
                "ChooseStartingPlayer prompt requires at least two players in the game.");
        }

        var validOptions = new HashSet<string>(StringComparer.Ordinal) { "goFirst", "goSecond" };

        foreach (var option in prompt.Options)
        {
            if (!validOptions.Contains(option))
            {
                throw new InvalidOperationException(
                    $"ChooseStartingPlayer option '{option}' is not supported.");
            }
        }
    }

    private static string ResolveStartingPlayerFromPromptOption(GameState state, string requestedPlayerId, string selectedOption)
    {
        if (string.Equals(selectedOption, "goFirst", StringComparison.Ordinal))
        {
            return requestedPlayerId;
        }

        if (string.Equals(selectedOption, "goSecond", StringComparison.Ordinal))
        {
            var requestedIndex = state.Players.FindIndex(player =>
                string.Equals(player.PlayerId, requestedPlayerId, StringComparison.Ordinal));

            if (requestedIndex < 0)
            {
                throw new InvalidOperationException(
                    $"Requested player '{requestedPlayerId}' was not found in turn order.");
            }

            var nextIndex = (requestedIndex + 1) % state.Players.Count;
            return state.Players[nextIndex].PlayerId;
        }

        throw new InvalidOperationException("Selected option is not valid for this prompt.");
    }

    private static void ResolveMulliganPrompt(GameInstance instance, string requestedPlayerId, string selectedOption)
    {
        var player = instance.State.Players.SingleOrDefault(entry =>
            string.Equals(entry.PlayerId, requestedPlayerId, StringComparison.Ordinal));

        if (player is null)
        {
            throw new InvalidOperationException(
                $"Requested player '{requestedPlayerId}' was not found in game players.");
        }

        if (string.Equals(selectedOption, "mulligan", StringComparison.Ordinal))
        {
            var returnedCards = player.Hand.ToList();
            player.Hand.Clear();
            player.Deck.AddRange(returnedCards);
            player.DeckShuffleCount++;
            var mulliganSeed = HashCode.Combine(player.DeckShuffleSeed, player.DeckShuffleCount);
            GameDeckShuffle.Shuffle(player.Deck, new Random(mulliganSeed));

            var drawCount = Math.Min(5, player.Deck.Count);
            if (drawCount > 0)
            {
                var redrawnCards = player.Deck.Take(drawCount).ToList();
                player.Deck.RemoveRange(0, drawCount);
                player.Hand.AddRange(redrawnCards);
            }
        }

        instance.PendingPrompts.Dequeue();
        LogAction(
            instance,
            actionType: "prompt_resolved",
            playerId: requestedPlayerId,
            promptType: GamePromptType.Mulligan,
            selectedOption: selectedOption);

        instance.ValidateInvariants();
    }

    private static void ValidateMulliganPrompt(GameInstance _, GamePrompt prompt, HashSet<string> __)
    {
        if (prompt.Options.Count == 0)
        {
            throw new InvalidOperationException("Mulligan prompt requires at least one option.");
        }

        var validOptions = new HashSet<string>(StringComparer.Ordinal) { "mulligan", "noMulligan" };

        foreach (var option in prompt.Options)
        {
            if (!validOptions.Contains(option))
            {
                throw new InvalidOperationException(
                    $"Mulligan option '{option}' is not supported.");
            }
        }
    }

    /// <summary>
    /// An effect suspended mid-resolution to ask the player which card(s) to act on. The selection itself
    /// was validated against <see cref="GamePrompt.Options"/> before this ran, so resolving only needs to
    /// record the answer and drop the prompt - the registry then resumes the suspended chain through
    /// <see cref="GamePrompt.EffectContinuation"/>.
    /// </summary>
    private static void ResolveEffectSelectionPrompt(GameInstance instance, string requestedPlayerId, string selectedOption)
    {
        instance.PendingPrompts.Dequeue();

        LogAction(
            instance,
            actionType: "prompt_resolved",
            playerId: requestedPlayerId,
            promptType: GamePromptType.Effect,
            selectedOption: selectedOption);

        instance.ValidateInvariants();
    }

    private static void ValidateEffectSelectionPrompt(GameInstance _, GamePrompt prompt, HashSet<string> __)
    {
        if (prompt.Options.Count == 0)
        {
            throw new InvalidOperationException("Effect selection prompt requires at least one option.");
        }

        if (string.IsNullOrWhiteSpace(prompt.CandidatePlayerId))
        {
            throw new InvalidOperationException("Effect selection prompt requires a candidate owner.");
        }

        if (prompt.MinimumSelection < 1 || prompt.MaximumSelection < prompt.MinimumSelection)
        {
            throw new InvalidOperationException("Effect selection prompt has an invalid selection range.");
        }

        if (prompt.EffectContinuation is null)
        {
            throw new InvalidOperationException("Effect selection prompt requires a pending effect continuation.");
        }

        if (!string.Equals(prompt.EffectContinuation.PromptId, prompt.PromptId, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Effect selection prompt continuation does not belong to the prompt.");
        }
    }

    private sealed record PromptTemplate(
        bool RequiresOptions,
        Action<GameInstance, string, string> Resolve,
        Action<GameInstance, GamePrompt, HashSet<string>> Validate);

    private static void LogAction(
        GameInstance instance,
        string actionType,
        string? playerId = null,
        GamePromptType? promptType = null,
        string? selectedOption = null,
        string? selectedPlayerId = null)
    {
        var message = actionType switch
        {
            "prompt_resolved" => BuildPromptResolvedMessage(
                promptType ?? throw new InvalidOperationException("Prompt type is required."),
                selectedOption ?? throw new InvalidOperationException("Selected option is required for prompt resolution.")),
            "phase_started" => $"Turn {instance.State.TurnNumber} started in {instance.State.Phase}.",
            _ => throw new InvalidOperationException($"Unsupported action log type '{actionType}'.")
        };

        var metadata = actionType switch
        {
            "prompt_resolved" => BuildPromptResolvedMetadata(
                promptType ?? throw new InvalidOperationException("Prompt type is required."),
                selectedOption ?? throw new InvalidOperationException("Selected option is required for prompt resolution."),
                selectedPlayerId),
            "phase_started" => CreateMetadata(
                ("phase", instance.State.Phase.ToString()),
                ("turnNumber", ToInvariant(instance.State.TurnNumber))),
            _ => throw new InvalidOperationException($"Unsupported action log type '{actionType}'.")
        };

        instance.AddActionLogEntry(
            actionType,
            message,
            playerId,
            metadata,
            category: string.Equals(actionType, "prompt_resolved", StringComparison.Ordinal)
                ? GameActionLogCategory.Prompt
                : GameActionLogCategory.Phase);
    }

    /// <summary>
    /// The audit sentence for a resolved prompt, deliberately free of identifiers: who answered is the entry's
    /// <see cref="GameActionLogEntry.PlayerId"/>, and the answer itself lives in the metadata.
    /// </summary>
    private static string BuildPromptResolvedMessage(GamePromptType promptType, string selectedOption)
    {
        return promptType switch
        {
            GamePromptType.ChooseStartingPlayer => $"The starting player was chosen: {selectedOption}.",
            GamePromptType.Mulligan => $"A mulligan choice was made: {selectedOption}.",
            GamePromptType.Effect => "An effect selection was made.",
            _ => throw new InvalidOperationException($"Unsupported prompt type '{promptType}'.")
        };
    }

    private static IReadOnlyDictionary<string, string> BuildPromptResolvedMetadata(
        GamePromptType promptType,
        string selectedOption,
        string? selectedPlayerId)
    {
        if (promptType == GamePromptType.ChooseStartingPlayer)
        {
            return CreateMetadata(
                ("promptType", nameof(GamePromptType.ChooseStartingPlayer)),
                ("selectedOption", selectedOption),
                ("selectedPlayerId", selectedPlayerId ?? throw new InvalidOperationException("Selected player id is required.")));
        }

        if (promptType == GamePromptType.Mulligan)
        {
            return CreateMetadata(
                ("promptType", nameof(GamePromptType.Mulligan)),
                ("selectedOption", selectedOption));
        }

        if (promptType == GamePromptType.Effect)
        {
            return CreateMetadata(
                ("promptType", nameof(GamePromptType.Effect)),
                ("selectedOption", selectedOption));
        }

        throw new InvalidOperationException($"Unsupported prompt type '{promptType}'.");
    }

    private static IReadOnlyDictionary<string, string> CreateMetadata(params (string Key, string Value)[] entries)
    {
        var map = new Dictionary<string, string>(StringComparer.Ordinal);

        foreach (var (key, value) in entries)
        {
            map[key] = value;
        }

        return map;
    }

    private static string ToInvariant(int value)
    {
        return value.ToString(System.Globalization.CultureInfo.InvariantCulture);
    }

    private void ValidatePlayerCardInstances(PlayerState player, HashSet<string> playerIds)
    {
        ValidateLeaderCardInstance(player, playerIds);

        foreach (var card in player.Deck)
        {
            ValidateCardInstance(card, playerIds);
        }

        foreach (var card in player.Hand)
        {
            ValidateCardInstance(card, playerIds);
        }

        foreach (var card in player.Battlefield)
        {
            ValidateCardInstance(card, playerIds);
        }

        foreach (var card in player.DiscardPile)
        {
            ValidateCardInstance(card, playerIds);
        }

        foreach (var card in player.SupportZone)
        {
            ValidateCardInstance(card, playerIds);
        }

        foreach (var card in player.ExileZone)
        {
            ValidateCardInstance(card, playerIds);
        }
    }

    private void ValidateLeaderCardInstance(PlayerState player, HashSet<string> playerIds)
    {
        var leader = player.LeaderCardInstance;
        if (leader is null)
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(leader.InstanceId))
        {
            throw new InvalidOperationException($"Player '{player.PlayerId}' has a leader card with an empty InstanceId.");
        }

        if (string.IsNullOrWhiteSpace(leader.CardDefinitionId))
        {
            throw new InvalidOperationException($"Player '{player.PlayerId}' has a leader card with an empty CardDefinitionId.");
        }

        if (!State.CardDefinitions.TryGetValue(leader.CardDefinitionId, out var leaderDefinition))
        {
            throw new InvalidOperationException(
                $"Leader card definition '{leader.CardDefinitionId}' was not found for player '{player.PlayerId}'.");
        }

        if (leaderDefinition.Type != CardType.Leader)
        {
            throw new InvalidOperationException(
                $"Leader card definition '{leader.CardDefinitionId}' for player '{player.PlayerId}' is not a leader card.");
        }

        if (!playerIds.Contains(leader.OwnerPlayerId))
        {
            throw new InvalidOperationException(
                $"Leader card '{leader.InstanceId}' has unknown owner '{leader.OwnerPlayerId}'.");
        }

        if (!playerIds.Contains(leader.ControllerPlayerId))
        {
            throw new InvalidOperationException(
                $"Leader card '{leader.InstanceId}' has unknown controller '{leader.ControllerPlayerId}'.");
        }

        if (leader.TotalLife < 0)
        {
            throw new InvalidOperationException(
                $"Leader card '{leader.InstanceId}' has invalid TotalLife '{leader.TotalLife}'.");
        }

        // Only the lower bound is enforced: healing may push life *above* the starting maximum (TotalLife),
        // and whether that should be capped is still an open rule question - so no upper-bound failure here.
        if (leader.CurrentLife < 0)
        {
            throw new InvalidOperationException(
                $"Leader card '{leader.InstanceId}' has invalid CurrentLife '{leader.CurrentLife}'.");
        }
    }

    private void ValidateCardInstance(CardInstance instance, HashSet<string> playerIds)
    {
        if (instance is null)
        {
            throw new InvalidOperationException("Card instance entries cannot be null.");
        }

        if (string.IsNullOrWhiteSpace(instance.InstanceId))
        {
            throw new InvalidOperationException("Card instances must have a non-empty InstanceId.");
        }

        if (string.IsNullOrWhiteSpace(instance.CardDefinitionId))
        {
            throw new InvalidOperationException($"Card instance '{instance.InstanceId}' is missing CardDefinitionId.");
        }

        if (!State.CardDefinitions.ContainsKey(instance.CardDefinitionId))
        {
            throw new InvalidOperationException(
                $"Card definition '{instance.CardDefinitionId}' was not found for instance '{instance.InstanceId}'.");
        }

        if (!playerIds.Contains(instance.OwnerPlayerId))
        {
            throw new InvalidOperationException(
                $"Card instance '{instance.InstanceId}' has unknown owner '{instance.OwnerPlayerId}'.");
        }

        if (!playerIds.Contains(instance.ControllerPlayerId))
        {
            throw new InvalidOperationException(
                $"Card instance '{instance.InstanceId}' has unknown controller '{instance.ControllerPlayerId}'.");
        }
    }

    private static void ValidateEffectResolutionStackEntry(EffectResolutionStackEntry entry, HashSet<string> playerIds)
    {
        if (entry is null)
        {
            throw new InvalidOperationException("Effect resolution stack entries cannot be null.");
        }

        if (string.IsNullOrWhiteSpace(entry.EntryId))
        {
            throw new InvalidOperationException("Effect resolution stack entries must have a non-empty EntryId.");
        }

        if (string.IsNullOrWhiteSpace(entry.SourceCardInstanceId))
        {
            throw new InvalidOperationException(
                $"Effect resolution stack entry '{entry.EntryId}' is missing SourceCardInstanceId.");
        }

        if (string.IsNullOrWhiteSpace(entry.EffectTypeKey))
        {
            throw new InvalidOperationException(
                $"Effect resolution stack entry '{entry.EntryId}' is missing EffectTypeKey.");
        }

        if (!playerIds.Contains(entry.SourcePlayerId))
        {
            throw new InvalidOperationException(
                $"Effect resolution stack entry '{entry.EntryId}' has unknown source player '{entry.SourcePlayerId}'.");
        }
    }
}