using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;
using ProjectHiddenVillage.Server.Engine;

namespace ProjectHiddenVillage.Server;

public sealed partial class InMemoryGameInstanceRegistry
{
    private const string ActivateSupportActionPrefix = "activate-support:";
    private const string SummonToFieldActionPrefix = "summon-to-field:";
    private const string SetSupportActionPrefix = "set-support:";
    private const string BattleActionPrefix = "battle-action:";
    private const string LeaderEffectActionPrefix = "leader-effect:";

    /// <summary>
    /// A battlefield character's own ability (N-011's "[Activate: Main]"). Same payload shape as
    /// <see cref="LeaderEffectActionPrefix"/> because the abilities are authored the same way: a leader just
    /// lives outside the character field.
    /// </summary>
    private const string CharacterAbilityActionPrefix = "character-ability:";

    private const string ResolveOptionalAttackEffectActionPrefix = "resolve-optional-attack-effect:";
    private const string SupportSlotIndexArgumentKey = "supportSlotIndex";
    private const string SummonTargetIdArgumentKey = "summonTargetId";
    private const int MaxSupportSlots = 5;
    private static readonly IGameRuntimeEffectSpecResolver RuntimeEffectSpecResolver = new GameRuntimeEffectSpecResolver();
    private static readonly IGameEffectTargetResolver EffectTargetResolver = new EffectTargetResolver();

    // The evaluator the MainPhase auto-end probe uses. Same composition the response mapper publishes
    // availability with, so "there is still a legal ability" cannot disagree with the chips on the board.
    private static readonly IGameEffectCanExecuteEvaluator EffectCanExecuteEvaluator = new GameEffectCanExecuteEvaluator(
        new EffectContextConditionEvaluator(),
        new EffectTargetResolver(),
        new GameValidTargetResultFactory(),
        new GameEffectConditionDiagnostics());

    // Used when a caller does not supply the DI-configured effect registry (unit-test composition):
    // support target planning then falls back to the rule-based candidate pool only.
    private static readonly IGameCardEffectRegistry EmptyEffectRegistry = new GameCardEffectRegistry([]);

    private readonly ConcurrentDictionary<string, GameInstance> instances =
        new(StringComparer.Ordinal);

    /// <summary>One watchdog per game: the timer that resumes the drain when acknowledgements never arrive.</summary>
    private readonly ConcurrentDictionary<string, ITimer> presentationWatchdogs =
        new(StringComparer.Ordinal);

    /// <summary>One action-clock timer per game, armed for the deadline of the stop in progress.</summary>
    private readonly ConcurrentDictionary<string, ITimer> clockWatchdogs =
        new(StringComparer.Ordinal);

    private readonly GameInstanceFactory factory;
    private readonly IGameCodeAllocator codeAllocator;
    private readonly global::ProjectHiddenVillage.Server.Engine.GamePhaseService phaseService;
    private readonly IGameRuntimeDeckService runtimeDeckService;
    private readonly GamePhaseAutomationOptions phaseAutomation;
    private readonly IGamePresenceTracker? presenceTracker;
    private readonly IGameStateBroadcaster? stateBroadcaster;
    private readonly GameClockOptions clockOptions;
    private readonly GameRedoOptions redoOptions;
    private readonly TimeProvider timeProvider;

    public InMemoryGameInstanceRegistry(
        GameInstanceFactory factory,
        global::ProjectHiddenVillage.Server.Engine.GamePhaseService phaseService,
        GamePhaseAutomationOptions? phaseAutomation = null,
        IGamePresenceTracker? presenceTracker = null,
        IGameStateBroadcaster? stateBroadcaster = null,
        GameClockOptions? clockOptions = null,
        TimeProvider? timeProvider = null,
        GameRedoOptions? redoOptions = null,
        IGameCodeAllocator? codeAllocator = null)
    {
        this.factory = factory;
        // The allocator is the one authority on which codes are in use, shared with the rematch reservations so a
        // code cannot be handed to a live table and to a reserved table at the same time. Test compositions that do
        // not register it get a private one, which behaves exactly like the previous generate-and-retry loop.
        this.codeAllocator = codeAllocator ?? new GameCodeAllocator();
        this.phaseService = phaseService;
        // The phase automation is opt-in: a registry built without options - unit-test composition, and every
        // caller that predates the presentation contract - behaves exactly as it did before the engine owned
        // the non-interactive phases.
        this.phaseAutomation = phaseAutomation ?? new GamePhaseAutomationOptions();
        this.presenceTracker = presenceTracker;
        this.stateBroadcaster = stateBroadcaster;
        // Timers are driven by the injected clock, not the ambient one, so the timeout paths can be tested by
        // advancing a fake clock instead of waiting for real minutes to pass.
        this.clockOptions = clockOptions ?? new GameClockOptions();
        this.redoOptions = redoOptions ?? new GameRedoOptions();
        this.timeProvider = timeProvider ?? TimeProvider.System;
        runtimeDeckService = new Api.Services.Games.GameRuntimeDeckService(new GameEffectHandlingService());
    }

    public GameInstance Create(
        IReadOnlyList<Player> players,
        IReadOnlyDictionary<string, Card> cardDefinitions,
        string? preferredGameCode,
        Random? random = null,
        IReadOnlyList<string>? modifiers = null)
    {
        var instance = BuildInstance(players, cardDefinitions, random, modifiers);
        var allocation = codeAllocator.Allocate(preferredGameCode);

        switch (allocation.Status)
        {
            case GameCodeAllocationStatus.InvalidFormat:
                throw new ArgumentException(
                    "Preferred game code must be a 5-character alphanumeric string.",
                    nameof(preferredGameCode));
            case GameCodeAllocationStatus.InUse:
                throw new InvalidOperationException($"Game code '{allocation.Code}' is already in use.");
            case GameCodeAllocationStatus.Exhausted:
                throw new InvalidOperationException("A unique game code could not be generated.");
        }

        instance.State.GameId = allocation.Code;

        if (instances.TryAdd(allocation.Code, instance))
        {
            SyncClock(instance);
            return instance;
        }

        // The allocator is the only place codes are claimed, so a live table already holding a code it handed out
        // means the dictionary disagrees with it. Give the claim back instead of leaking it on the way out.
        codeAllocator.Release(allocation.Code);
        throw new InvalidOperationException($"Game code '{allocation.Code}' is already in use.");
    }

    /// <summary>
    /// Creates a table under a code that was claimed in advance - the rematch lobby. The code is adopted from the
    /// reservation rather than allocated again, so a reservation whose code is unknown fails here instead of
    /// quietly opening a table under somebody else's code.
    /// </summary>
    public GameInstance CreateWithReservedCode(
        IReadOnlyList<Player> players,
        IReadOnlyDictionary<string, Card> cardDefinitions,
        string reservedCode,
        Random? random = null,
        IReadOnlyList<string>? modifiers = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(reservedCode);

        var normalizedCode = reservedCode.Trim();

        if (!codeAllocator.TryAdopt(normalizedCode))
        {
            throw new ArgumentException(
                "The reserved game code is not claimed by any reservation.",
                nameof(reservedCode));
        }

        var instance = BuildInstance(players, cardDefinitions, random, modifiers);
        instance.State.GameId = normalizedCode;

        if (!instances.TryAdd(normalizedCode, instance))
        {
            throw new InvalidOperationException($"Game code '{normalizedCode}' is already in use.");
        }

        SyncClock(instance);
        return instance;
    }

    /// <summary>
    /// Builds the instance every creation path shares: the phase-automation ownership is stamped on and the host's
    /// modifiers are set before the first clock sync, so the table is never briefly created under a policy its host
    /// did not ask for (see <see cref="GameInstance.Modifiers"/>).
    /// </summary>
    private GameInstance BuildInstance(
        IReadOnlyList<Player> players,
        IReadOnlyDictionary<string, Card> cardDefinitions,
        Random? random,
        IReadOnlyList<string>? modifiers)
    {
        var instance = factory.Create(players, cardDefinitions, random);
        // The payload has to say who owns the non-interactive phases: with the automation on the client must not
        // be offered the system action at all (see GameInstance.IsPhaseAutomationEnabled).
        instance.IsPhaseAutomationEnabled = phaseAutomation.Enabled;

        if (modifiers is { Count: > 0 })
        {
            instance.Modifiers = modifiers;
        }

        return instance;
    }

    public GameInstance Create(
        IReadOnlyList<Player> players,
        IReadOnlyDictionary<string, Card> cardDefinitions,
        Random? random = null)
    {
        return Create(players, cardDefinitions, preferredGameCode: null, random);
    }

    public bool TryGet(string gameId, out GameInstance? instance)
    {
        var found = instances.TryGetValue(gameId, out var existing);
        instance = existing;
        return found;
    }

    /// <summary>Every table currently in the registry, for the retirement sweep and for diagnostics.</summary>
    public IReadOnlyList<GameInstance> Snapshot()
    {
        return instances.Values.ToList();
    }

    /// <summary>
    /// Drops a table that has gone out of use and gives its code back to the allocator. The watchdogs are disposed
    /// first: a timer that fires after the instance is gone would only log about a table that is intentionally
    /// finished. Returns false when the game is no longer registered, which makes retirement idempotent for a sweep
    /// that may look at the same table twice.
    /// </summary>
    public bool TryRetire(string gameId)
    {
        if (string.IsNullOrWhiteSpace(gameId))
        {
            return false;
        }

        var normalizedGameId = gameId.Trim();

        if (!instances.TryRemove(normalizedGameId, out var instance) || instance is null)
        {
            return false;
        }

        ClearPresentationWatchdog(normalizedGameId);
        ClearClockWatchdog(normalizedGameId);
        ClearRedoWatchdog(normalizedGameId);
        instance.StopClock();
        codeAllocator.Release(normalizedGameId);

        return true;
    }

    public GameInstance Join(string gameId, Player player, Random? random = null)
    {
        return Join(gameId, player, additionalCardDefinitions: null, random);
    }

    public GameInstance Join(
        string gameId,
        Player player,
        IReadOnlyDictionary<string, Card>? additionalCardDefinitions,
        Random? random = null)
    {
        var instance = GetRequired(gameId);

        lock (instance)
        {
            if (instance.State.Players.Count >= 2)
            {
                throw new InvalidOperationException($"Game instance '{gameId}' already has two players.");
            }

            if (additionalCardDefinitions is not null)
            {
                foreach (var (cardId, definition) in additionalCardDefinitions)
                {
                    if (!instance.State.CardDefinitions.ContainsKey(cardId))
                    {
                        instance.State.CardDefinitions[cardId] = definition;
                    }
                }
            }

            factory.JoinPlayer(instance, player, random);
            // The second player is in: the clock now has somebody to wait on, so this is where a game starts being
            // charged for its time.
            SyncClock(instance);
            return instance;
        }
    }

    public GameInstance ResolvePrompt(
        string gameId,
        string requestedPlayerId,
        string selectedOption,
        IGameReactiveEffectOrchestrator? reactiveEffectOrchestrator = null,
        IGameSequentialEffectExecutor? sequentialEffectExecutor = null)
    {
        var instance = GetRequired(gameId);

        lock (instance)
        {
            GameEndRules.ThrowIfGameOver(instance.State);
            ThrowIfRedoRequestPending(instance);

            var rewindPoint = CaptureRedoPoint(instance, requestedPlayerId);
            var phaseBeforeResolve = instance.State.Phase;
            // Captured before resolving: the continuation lives on the prompt, which the resolve dequeues.
            var resolvedPrompt = instance.GetPendingPrompt();
            instance.ResolvePrompt(requestedPlayerId, selectedOption);

            ResumeSuspendedEffectIfNeeded(instance, resolvedPrompt, selectedOption, sequentialEffectExecutor);

            if (ShouldAdvanceAfterPromptResolution(phaseBeforeResolve, instance.GetPendingPrompt()))
            {
                phaseService.AdvancePhase(instance);
            }

            SweepContinuousPassives(instance, reactiveEffectOrchestrator);
            AutoAdvanceMainPhaseIfNoLegalActions(instance);
            DrainIdlePhases(instance, reactiveEffectOrchestrator, sequentialEffectExecutor);

            instance.ValidateInvariants();
            EvaluateGameEnd(instance);
            SyncClock(instance, requestedPlayerId);
            CommitRedoPoint(instance, rewindPoint);
            return instance;
        }
    }

    /// <summary>
    /// Picks a chain back up when the resolved prompt was raised by an effect that deferred its target choice
    /// (see <see cref="EffectSelectionTiming.Prompted"/>): the answer becomes the suspended node's targets.
    /// </summary>
    private static void ResumeSuspendedEffectIfNeeded(
        GameInstance instance,
        GamePrompt? resolvedPrompt,
        string selectedOption,
        IGameSequentialEffectExecutor? sequentialEffectExecutor)
    {
        if (resolvedPrompt?.EffectContinuation is not { } continuation || sequentialEffectExecutor is null)
        {
            return;
        }

        var (candidatePlayerId, candidateZone) = ResolvePromptOptionTarget(instance, resolvedPrompt, selectedOption);

        IReadOnlyList<GameEffectTargetReference> selection =
        [
            new GameEffectTargetReference(candidatePlayerId, candidateZone, selectedOption)
        ];

        var resumeResult = sequentialEffectExecutor.Resume(instance, continuation, selection);
        if (resumeResult.IsError)
        {
            var error = resumeResult.Errors.First();
            throw new InvalidOperationException($"{error.Code}: {error.Description}");
        }
    }

    /// <summary>
    /// Where the answered option actually lives - its owner *and* its zone. A prompt names only one pair (its
    /// first candidate's), but a node's rules may collect candidates from several places at once: N-013's freeze
    /// offers "1 Leader or Character" across **both players'** leaders and battlefields, so the prompt's
    /// `CandidatePlayerId`/`CandidateZone` cannot be the answer's identity. The named pair is tried first (it is
    /// the server's own hint and the common case), then every other player's collections.
    /// </summary>
    private static (string PlayerId, PlayerZone Zone) ResolvePromptOptionTarget(
        GameInstance instance,
        GamePrompt prompt,
        string selectedOption)
    {
        var namedPlayerId = prompt.CandidatePlayerId ?? prompt.RequestedPlayerId;
        var namedZone = prompt.CandidateZone ?? PlayerZone.Hand;

        // The named player's collections are searched first (the prompt's hint), then the other player's. Card
        // instance ids are unique across the game, so the first collection that holds the id IS its zone.
        var playersInOrder = instance.State.Players
            .OrderBy(player => IsSamePlayerId(player.PlayerId, namedPlayerId) ? 0 : 1)
            .ToList();

        foreach (var player in playersInOrder)
        {
            foreach (var zone in PromptOptionZoneSearchOrder)
            {
                if (PromptOptionZoneContainsCard(player, zone, selectedOption))
                {
                    return (player.PlayerId, zone);
                }
            }
        }

        return (namedPlayerId, namedZone);
    }

    private static readonly PlayerZone[] PromptOptionZoneSearchOrder =
    [
        PlayerZone.Leader,
        PlayerZone.CharacterField,
        PlayerZone.Hand,
        PlayerZone.SupportZone,
        PlayerZone.Trash,
        PlayerZone.Deck,
        PlayerZone.ExileZone,
    ];

    private static bool PromptOptionZoneContainsCard(PlayerState player, PlayerZone zone, string cardInstanceId)
    {
        return PlayerZoneCardAccessor.GetCards(zone, player).Any(card =>
            string.Equals(card.InstanceId, cardInstanceId, StringComparison.Ordinal));
    }

    private static bool ShouldAdvanceAfterPromptResolution(GamePhase phaseBeforeResolve, GamePrompt? nextPendingPrompt)
    {
        if (nextPendingPrompt is not null)
        {
            return false;
        }

        return phaseBeforeResolve is GamePhase.ChooseStartingPlayer or GamePhase.Mulligan;
    }

    public GameInstance AdvancePhase(
        string gameId,
        IGameReactiveEffectOrchestrator? reactiveEffectOrchestrator = null,
        IGameSequentialEffectExecutor? sequentialEffectExecutor = null)
    {
        var instance = GetRequired(gameId);

        lock (instance)
        {
            GameEndRules.ThrowIfGameOver(instance.State);
            ThrowIfRedoRequestPending(instance);

            if (instance.GetPendingPrompt() is not null)
            {
                throw new InvalidOperationException("Cannot advance phase while a prompt is pending.");
            }

            var rewindPoint = CaptureRedoPoint(instance, instance.State.ActivePlayerId);
            var previousPhase = instance.State.Phase;
            phaseService.AdvancePhase(instance);
            // Leaving the cut-in ActionStep closes the window, so anything still pending resolves now.
            if (previousPhase == GamePhase.ActionStep)
            {
                ResolvePendingActivations(instance, sequentialEffectExecutor);
            }

            ApplyPendingAttackResolutionIfNeeded(instance, previousPhase);
            SweepContinuousPassives(instance, reactiveEffectOrchestrator);
            AutoAdvanceMainPhaseIfNoLegalActions(instance);
            DrainIdlePhases(instance, reactiveEffectOrchestrator, sequentialEffectExecutor);
            instance.ValidateInvariants();
            EvaluateGameEnd(instance);
            SyncClock(instance);
            CommitRedoPoint(instance, rewindPoint);
            return instance;
        }
    }

    public GameInstance DeclarePassInActionStep(
        string gameId,
        string playerId,
        IGameReactiveEffectOrchestrator? reactiveEffectOrchestrator = null,
        IGameSequentialEffectExecutor? sequentialEffectExecutor = null)
    {
        var instance = GetRequired(gameId);

        lock (instance)
        {
            GameEndRules.ThrowIfGameOver(instance.State);
            ThrowIfRedoRequestPending(instance);

            var rewindPoint = CaptureRedoPoint(instance, playerId);
            var previousPhase = instance.State.Phase;

            // MainPhase support reactions reuse the pass mechanism: a single decline by the priority
            // player closes the window, then the pending activations resolve and priority returns to the
            // turn player.
            if (instance.State.Phase == GamePhase.MainPhase)
            {
                var isWindowClosed = phaseService.DeclarePassInSupportWindow(instance, playerId);
                if (isWindowClosed)
                {
                    ResolvePendingActivations(instance, sequentialEffectExecutor);
                    instance.State.PriorityPlayerId = instance.State.ActivePlayerId;
                }

                AutoAdvanceMainPhaseIfNoLegalActions(instance);
                DrainIdlePhases(instance, reactiveEffectOrchestrator, sequentialEffectExecutor);
                instance.ValidateInvariants();
                EvaluateGameEnd(instance);
                SyncClock(instance, playerId);
                CommitRedoPoint(instance, rewindPoint);
                return instance;
            }

            var isCutInWindowClosed = phaseService.DeclarePassInActionStep(instance, playerId);
            if (isCutInWindowClosed)
            {
                // Both players passed, so the cut-in window is closed: replay any pending support
                // activations, most recent first, *before* the damage step so interrupts and K.O.s take
                // effect first. The queue must not resolve on the first pass - that applied the chain
                // while the window was still open, leaving the attack waiting for one more, pointless
                // pass *after* the effects had already resolved.
                ResolvePendingActivations(instance, sequentialEffectExecutor);
                ApplyPendingAttackResolutionIfNeeded(instance, previousPhase);
            }
            SweepContinuousPassives(instance, reactiveEffectOrchestrator);
            AutoAdvanceMainPhaseIfNoLegalActions(instance);
            DrainIdlePhases(instance, reactiveEffectOrchestrator, sequentialEffectExecutor);
            instance.ValidateInvariants();
            EvaluateGameEnd(instance);
            SyncClock(instance, playerId);
            CommitRedoPoint(instance, rewindPoint);
            return instance;
        }
    }

    public GameInstance DeclareActionInActionStep(string gameId, string playerId)
    {
        var instance = GetRequired(gameId);

        lock (instance)
        {
            GameEndRules.ThrowIfGameOver(instance.State);
            ThrowIfRedoRequestPending(instance);

            var rewindPoint = CaptureRedoPoint(instance, playerId);
            phaseService.DeclareActionInActionStep(instance, playerId);
            AutoAdvanceMainPhaseIfNoLegalActions(instance);
            DrainIdlePhases(instance);
            instance.ValidateInvariants();
            EvaluateGameEnd(instance);
            SyncClock(instance, playerId);
            CommitRedoPoint(instance, rewindPoint);
            return instance;
        }
    }

    public GameInstance ExecuteCardAction(
        string gameId,
        GameCardActionExecutionRequest request,
        IGameSequentialEffectExecutor sequentialEffectExecutor,
        IGameReactiveEffectOrchestrator? reactiveEffectOrchestrator = null)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentNullException.ThrowIfNull(sequentialEffectExecutor);

        var instance = GetRequired(gameId);

        lock (instance)
        {
            GameEndRules.ThrowIfGameOver(instance.State);
            ThrowIfRedoRequestPending(instance);

            var rewindPoint = CaptureRedoPoint(instance, request.PlayerId);

            if (instance.GetPendingPrompt() is not null)
            {
                throw new InvalidOperationException("Cannot execute card actions while a prompt is pending.");
            }

            if (string.IsNullOrWhiteSpace(request.ActionId))
            {
                throw new ArgumentException("ActionId is required.", nameof(request));
            }

            var actionPrefix = ResolveActionPrefix(request.ActionId);
            if (actionPrefix is null)
            {
                throw new InvalidOperationException($"Card action '{request.ActionId}' is not supported yet.");
            }

            ValidateCardActionWindow(instance, request.PlayerId, actionPrefix);

            var actionCardInstanceId = ResolveActionSourceCardInstanceId(request.ActionId, actionPrefix);
            if (!string.Equals(actionCardInstanceId, request.SourceCardInstanceId, StringComparison.Ordinal))
            {
                throw new InvalidOperationException("ActionId source card does not match SourceCardInstanceId.");
            }

            var actingPlayer = instance.State.Players.FirstOrDefault(player =>
                IsSamePlayerId(player.PlayerId, request.PlayerId));
            if (actingPlayer is null)
            {
                throw new InvalidOperationException($"Player '{request.PlayerId}' was not found in game.");
            }

            var arguments = request.Arguments is null
                ? new Dictionary<string, string>(StringComparer.Ordinal)
                : new Dictionary<string, string>(request.Arguments, StringComparer.Ordinal);

            // `isSecondTurnOrLater` is authored on the leader Recovery nodes (N-001/N-012) and is matched
            // against the execution arguments (GameSequentialEffectExecutor.ConditionMatches), which nothing
            // else supplies: without it the condition never matched and the step was skipped with no failure
            // branch, so Recovery looked enabled but changed nothing. Server-authoritative: a value the client
            // sent is overwritten.
            arguments[EffectExecutionConditionArgumentKey.IsSecondTurnOrLater.ToWireValue()] =
                actingPlayer.TurnCount >= 2 ? bool.TrueString : bool.FalseString;

            var phaseBeforeActionExecution = instance.State.Phase;

            switch (actionPrefix)
            {
                case ActivateSupportActionPrefix:
                    ExecuteActivateSupportAction(instance, request.PlayerId, request, sequentialEffectExecutor, actingPlayer, arguments);
                    break;
                case SummonToFieldActionPrefix:
                    ExecuteSummonToFieldAction(instance, request.PlayerId, request, actingPlayer, sequentialEffectExecutor);
                    break;
                case SetSupportActionPrefix:
                    ExecuteSetSupportAction(instance, request.PlayerId, request.SourceCardInstanceId, actingPlayer, arguments);
                    break;
                case BattleActionPrefix:
                    ExecuteBattleAction(instance, request.PlayerId, request, actingPlayer, sequentialEffectExecutor);
                    break;
                case LeaderEffectActionPrefix:
                    ExecuteLeaderEffectAction(instance, request.PlayerId, request, sequentialEffectExecutor, actingPlayer, arguments);
                    break;
                case CharacterAbilityActionPrefix:
                    ExecuteCharacterAbilityAction(instance, request.PlayerId, request, sequentialEffectExecutor, actingPlayer, arguments);
                    break;
                case ResolveOptionalAttackEffectActionPrefix:
                    ExecuteResolveOptionalAttackEffectAction(instance, request.PlayerId, request, sequentialEffectExecutor);
                    break;
                default:
                    throw new InvalidOperationException($"Card action '{request.ActionId}' is not supported yet.");
            }

            if (phaseBeforeActionExecution == GamePhase.ActionStep
                && instance.State.Phase == GamePhase.ActionStep)
            {
                phaseService.DeclareActionInActionStep(instance, request.PlayerId);
            }

            SweepContinuousPassives(instance, reactiveEffectOrchestrator);
            AutoAdvanceMainPhaseIfNoLegalActions(instance);
            DrainIdlePhases(instance, reactiveEffectOrchestrator, sequentialEffectExecutor);

            instance.ValidateInvariants();
            EvaluateGameEnd(instance);
            SyncClock(instance, request.PlayerId);
            CommitRedoPoint(instance, rewindPoint);
            return instance;
        }
    }

    public GameCardActionTargetsResponse GetCardActionTargets(
        string gameId,
        GameCardActionTargetsRequest request,
        IGameEffectCanExecuteEvaluator canExecuteEvaluator,
        IGameCardEffectRegistry? effectRegistry = null)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentNullException.ThrowIfNull(canExecuteEvaluator);

        var instance = GetRequired(gameId);

        lock (instance)
        {
            // A finished game publishes no card action at all: the client only ever sees the result overlay.
            if (GameEndRules.IsGameOver(instance.State))
            {
                return new GameCardActionTargetsResponse(
                    ActionId: request.ActionId,
                    SourceCardInstanceId: request.SourceCardInstanceId,
                    IsEnabled: false,
                    DisabledReason: GameEndRules.GameOverMessage,
                    MinimumTargetCount: null,
                    MaximumTargetCount: null,
                    ExactTargetCount: null,
                    AutoSelectAllValidTargets: false,
                    ValidTargets: []);
            }

            if (instance.GetPendingPrompt() is not null)
            {
                throw new InvalidOperationException("Cannot fetch card action targets while a prompt is pending.");
            }

            if (string.IsNullOrWhiteSpace(request.ActionId))
            {
                throw new ArgumentException("ActionId is required.", nameof(request));
            }

            var actionPrefix = ResolveActionPrefix(request.ActionId);
            if (actionPrefix is null)
            {
                throw new InvalidOperationException($"Card action '{request.ActionId}' is not supported yet.");
            }

            ValidateCardActionWindow(instance, request.PlayerId, actionPrefix);

            var actionCardInstanceId = ResolveActionSourceCardInstanceId(request.ActionId, actionPrefix);
            if (!string.Equals(actionCardInstanceId, request.SourceCardInstanceId, StringComparison.Ordinal))
            {
                throw new InvalidOperationException("ActionId source card does not match SourceCardInstanceId.");
            }

            var actingPlayer = instance.State.Players.FirstOrDefault(player =>
                IsSamePlayerId(player.PlayerId, request.PlayerId));
            if (actingPlayer is null)
            {
                throw new InvalidOperationException($"Player '{request.PlayerId}' was not found in game.");
            }

            var arguments = request.Arguments is null
                ? new Dictionary<string, string>(StringComparer.Ordinal)
                : new Dictionary<string, string>(request.Arguments, StringComparer.Ordinal);

            return actionPrefix switch
            {
                SummonToFieldActionPrefix => BuildSummonCardActionTargets(
                    instance,
                    request.ActionId,
                    request.SourceCardInstanceId,
                    request.PlayerId,
                    actingPlayer,
                    arguments,
                    canExecuteEvaluator),
                ActivateSupportActionPrefix => BuildSupportCardActionTargets(
                    instance,
                    request.ActionId,
                    request.SourceCardInstanceId,
                    request.PlayerId,
                    actingPlayer,
                    arguments,
                    canExecuteEvaluator,
                    effectRegistry ?? EmptyEffectRegistry),
                BattleActionPrefix => BuildBattleCardActionTargets(
                    instance,
                    request.ActionId,
                    request.SourceCardInstanceId,
                    request.PlayerId,
                    actingPlayer),
                LeaderEffectActionPrefix => BuildCardAbilityActionTargets(
                    instance,
                    request.ActionId,
                    request.SourceCardInstanceId,
                    request.PlayerId,
                    actingPlayer,
                    arguments,
                    canExecuteEvaluator,
                    actionPrefix,
                    isLeader: true),
                CharacterAbilityActionPrefix => BuildCardAbilityActionTargets(
                    instance,
                    request.ActionId,
                    request.SourceCardInstanceId,
                    request.PlayerId,
                    actingPlayer,
                    arguments,
                    canExecuteEvaluator,
                    actionPrefix,
                    isLeader: false),
                _ => new GameCardActionTargetsResponse(
                    ActionId: request.ActionId,
                    SourceCardInstanceId: request.SourceCardInstanceId,
                    IsEnabled: true,
                    DisabledReason: null,
                    MinimumTargetCount: null,
                    MaximumTargetCount: null,
                    ExactTargetCount: null,
                    AutoSelectAllValidTargets: false,
                    ValidTargets: []),
            };
        }
    }

    private GameCardActionTargetsResponse BuildSummonCardActionTargets(
        GameInstance instance,
        string actionId,
        string sourceCardInstanceId,
        string playerId,
        PlayerState actingPlayer,
        IReadOnlyDictionary<string, string> arguments,
        IGameEffectCanExecuteEvaluator canExecuteEvaluator)
    {
        var sourceCardInstance = actingPlayer.Hand.FirstOrDefault(card =>
            string.Equals(card.InstanceId, sourceCardInstanceId, StringComparison.Ordinal));
        if (sourceCardInstance is null)
        {
            throw new InvalidOperationException(
                $"Hand card instance '{sourceCardInstanceId}' was not found for player '{playerId}'.");
        }

        if (!instance.State.CardDefinitions.TryGetValue(sourceCardInstance.CardDefinitionId, out var sourceCardDefinition))
        {
            throw new InvalidOperationException($"Card definition '{sourceCardInstance.CardDefinitionId}' was not found.");
        }

        if (sourceCardDefinition.Type is CardType.Chakra or CardType.Summon or CardType.Leader)
        {
            return new GameCardActionTargetsResponse(
                ActionId: actionId,
                SourceCardInstanceId: sourceCardInstanceId,
                IsEnabled: false,
                DisabledReason: $"Card '{sourceCardDefinition.Id}' cannot be summoned to the battlefield from hand.",
                MinimumTargetCount: null,
                MaximumTargetCount: null,
                ExactTargetCount: null,
                AutoSelectAllValidTargets: false,
                ValidTargets: []);
        }

        if (!sourceCardDefinition.CannotBeNormalSummoned)
        {
            var summonReady = instance.State.IsSummonCardReady(playerId);
            return new GameCardActionTargetsResponse(
                ActionId: actionId,
                SourceCardInstanceId: sourceCardInstanceId,
                IsEnabled: summonReady,
                DisabledReason: summonReady ? null : "Your summon card is rested.",
                MinimumTargetCount: null,
                MaximumTargetCount: null,
                ExactTargetCount: null,
                AutoSelectAllValidTargets: false,
                ValidTargets: []);
        }

        var summonRequirement = TryCreateSummonRequirementActionContext(
            instance,
            playerId,
            sourceCardInstance,
            sourceCardDefinition,
            arguments,
            selectedTargets: [],
            out var context,
            out var effectSpec,
            out var failureResponse);

        if (!summonRequirement)
        {
            return failureResponse!;
        }

        var hasTributeComposition = effectSpec!.TargetRules.TributeComposition is not null;

        // For tribute compositions the generic target-count gate would compare the (currently
        // empty) selection against the effect-level target counts. Those counts describe the whole
        // selection including the summon candidate, which is the hand card being summoned and is
        // never part of the material selection - so availability is decided below by the tribute
        // composition's distinct-material solver instead.
        var canExecuteResult = canExecuteEvaluator.Evaluate(context!, effectSpec!, includeValidTargets: !hasTributeComposition);

        IReadOnlyList<GameEffectTargetReference> validTributeTargets;

        if (hasTributeComposition)
        {
            validTributeTargets = EffectTargetResolver.ResolveTargets(context!, effectSpec!);

            if (canExecuteResult.CanExecute
                && !TributeTargetCompositionValidator.TryValidateMaterialAvailability(
                    context!,
                    effectSpec!,
                    validTributeTargets,
                    out var materialAvailabilityError))
            {
                canExecuteResult.CanExecute = false;
                canExecuteResult.FailedConditions.Add(materialAvailabilityError);
            }
        }
        else
        {
            validTributeTargets = ResolveTributeMaterialTargets(context!, effectSpec!, canExecuteResult);
        }

        return new GameCardActionTargetsResponse(
            ActionId: actionId,
            SourceCardInstanceId: sourceCardInstanceId,
            IsEnabled: canExecuteResult.CanExecute,
            DisabledReason: canExecuteResult.CanExecute
                ? null
                : canExecuteResult.FailedConditions.FirstOrDefault(),
            MinimumTargetCount: TributeMaterialRequirementBuilder.ResolveMinimumTargetCount(effectSpec!.TargetRules),
            MaximumTargetCount: TributeMaterialRequirementBuilder.ResolveMaximumTargetCount(effectSpec.TargetRules),
            ExactTargetCount: TributeMaterialRequirementBuilder.ResolveExactTargetCount(effectSpec.TargetRules),
            AutoSelectAllValidTargets: effectSpec.TargetRules.AutoSelectAllValidTargets,
            ValidTargets: validTributeTargets,
            RequirementLabels: BuildTributeRequirementLabels(
                instance.State,
                actingPlayer,
                sourceCardInstance,
                effectSpec.TargetRules,
                validTributeTargets),
            MaterialRequirements: TributeMaterialRequirementBuilder.BuildGroups(effectSpec.TargetRules));
    }

    public GameInstance DeclareEndStep(string gameId, IGameSequentialEffectExecutor? sequentialEffectExecutor = null)
    {
        var instance = GetRequired(gameId);

        lock (instance)
        {
            GameEndRules.ThrowIfGameOver(instance.State);
            ThrowIfRedoRequestPending(instance);

            var rewindPoint = CaptureRedoPoint(instance, instance.State.ActivePlayerId);

            // Leaving the MainPhase closes any open support reaction window.
            ResolvePendingActivations(instance, sequentialEffectExecutor);
            phaseService.DeclareEndStep(instance);
            AutoAdvanceMainPhaseIfNoLegalActions(instance);
            DrainIdlePhases(instance, null, sequentialEffectExecutor);
            instance.ValidateInvariants();
            EvaluateGameEnd(instance);
            SyncClock(instance, instance.State.ActivePlayerId);
            CommitRedoPoint(instance, rewindPoint);
            return instance;
        }
    }

    public GameInstance CompleteEndStep(
        string gameId,
        IGameReactiveEffectOrchestrator? reactiveEffectOrchestrator = null,
        IGameSequentialEffectExecutor? sequentialEffectExecutor = null)
    {
        var instance = GetRequired(gameId);

        lock (instance)
        {
            GameEndRules.ThrowIfGameOver(instance.State);
            ThrowIfRedoRequestPending(instance);

            // The player whose turn is ending: the clock must credit the input to them before the turn swaps.
            var completingPlayerId = instance.State.ActivePlayerId;
            var rewindPoint = CaptureRedoPoint(instance, completingPlayerId);

            // A turn can never end with an activation still waiting to resolve.
            ResolvePendingActivations(instance, sequentialEffectExecutor);
            phaseService.CompleteEndStep(instance);
            SweepContinuousPassives(instance, reactiveEffectOrchestrator);
            DrainIdlePhases(instance, reactiveEffectOrchestrator, sequentialEffectExecutor);
            instance.ValidateInvariants();
            EvaluateGameEnd(instance);
            SyncClock(instance, completingPlayerId);
            CommitRedoPoint(instance, rewindPoint);
            return instance;
        }
    }

    /// <summary>
    /// Re-runs conditional continuous passives after a structural state change (turn end, phase
    /// entry, card action, prompt resolution, battle resolution). Those changes are not reported by
    /// the effects themselves, so a passive whose condition changed indirectly - a temporary power
    /// boost expiring at end step and dropping the card below a "Power N or more" threshold,
    /// temporary damage being reset, the board refreshing, a defender leaving play - would otherwise
    /// keep its stale keyword or bonus until an unrelated effect happened to re-evaluate it.
    /// </summary>
    private static void SweepContinuousPassives(
        GameInstance instance,
        IGameReactiveEffectOrchestrator? reactiveEffectOrchestrator)
    {
        // A phase entry can end the game (a deck-out resolves inside the draw), and a finished game has no
        // board left to re-evaluate.
        if (GameEndRules.IsGameOver(instance.State))
        {
            return;
        }

        if (reactiveEffectOrchestrator is null)
        {
            return;
        }

        var mutationEvent = new GameMutationEvent
        {
            Kind = GameMutationKind.CardStatChanged,
            GameId = instance.State.GameId,
            ActingPlayerId = instance.State.ActivePlayerId,
            TurnNumber = instance.State.TurnNumber,
            Phase = instance.State.Phase,
            AffectedCardInstanceIds = instance.State.Players
                .SelectMany(player => player.Battlefield)
                .Select(card => card.InstanceId)
                .ToList(),
            AffectedPlayerIds = instance.State.Players.Select(player => player.PlayerId).ToList(),
        };

        // actingPlayerId stays null so every consequence executes as the controller of the card that
        // owns the passive instead of as whichever player happened to trigger the structural change.
        var orchestrationResult = reactiveEffectOrchestrator.ApplyPostMutationEffects(
            instance,
            mutationEvent,
            actingPlayerId: null,
            new PassiveChainResolutionOptions { ContinuousPassivesOnly = true });

        if (orchestrationResult.IsError)
        {
            var error = orchestrationResult.Errors.First();
            throw new InvalidOperationException($"{error.Code}: {error.Description}");
        }
    }

    private GameInstance GetRequired(string gameId)
    {
        if (string.IsNullOrWhiteSpace(gameId))
        {
            throw new InvalidOperationException("Game id is required.");
        }

        if (!instances.TryGetValue(gameId, out var instance) || instance is null)
        {
            throw new KeyNotFoundException($"Game instance '{gameId}' was not found.");
        }

        return instance;
    }

    private static string? ResolveActionPrefix(string actionId)
    {
        if (actionId.StartsWith(LeaderEffectActionPrefix, StringComparison.Ordinal))
        {
            return LeaderEffectActionPrefix;
        }

        if (actionId.StartsWith(CharacterAbilityActionPrefix, StringComparison.Ordinal))
        {
            return CharacterAbilityActionPrefix;
        }

        if (actionId.StartsWith(ActivateSupportActionPrefix, StringComparison.Ordinal))
        {
            return ActivateSupportActionPrefix;
        }

        if (actionId.StartsWith(SummonToFieldActionPrefix, StringComparison.Ordinal))
        {
            return SummonToFieldActionPrefix;
        }

        if (actionId.StartsWith(SetSupportActionPrefix, StringComparison.Ordinal))
        {
            return SetSupportActionPrefix;
        }

        if (actionId.StartsWith(BattleActionPrefix, StringComparison.Ordinal))
        {
            return BattleActionPrefix;
        }

        if (actionId.StartsWith(ResolveOptionalAttackEffectActionPrefix, StringComparison.Ordinal))
        {
            return ResolveOptionalAttackEffectActionPrefix;
        }

        return null;
    }

    private static void ValidateCardActionWindow(GameInstance instance, string playerId, string actionPrefix)
    {
        // An open MainPhase support reaction window only admits support responses: summons, battle
        // declarations and other card actions resume once both players have passed.
        if (instance.State.Phase == GamePhase.MainPhase
            && SupportTimingRules.HasPendingSupportActivation(instance.State)
            && actionPrefix != ActivateSupportActionPrefix)
        {
            throw new InvalidOperationException(
                "A support activation is waiting for responses. Pass or activate another support.");
        }

        if (actionPrefix is SummonToFieldActionPrefix or SetSupportActionPrefix)
        {
            if (instance.State.Phase != GamePhase.MainPhase)
            {
                throw new InvalidOperationException("Hand card actions can only be executed during MainPhase.");
            }

            if (!IsSamePlayerId(instance.State.ActivePlayerId, playerId))
            {
                throw new InvalidOperationException("Only the active player can execute hand card actions.");
            }

            return;
        }

        if (actionPrefix == BattleActionPrefix)
        {
            if (instance.State.Phase != GamePhase.MainPhase)
            {
                throw new InvalidOperationException("Battle actions can only be executed during MainPhase.");
            }

            if (!IsSamePlayerId(instance.State.ActivePlayerId, playerId))
            {
                throw new InvalidOperationException("Only the active player can execute battle actions.");
            }

            return;
        }

        if (actionPrefix == CharacterAbilityActionPrefix)
        {
            // "[Activate: Main]" on a battlefield character: the card's own ability, activatable by its
            // controller during their own MainPhase (a rested character keeps its ability - only the
            // leader's Recovery rests the card it belongs to).
            if (instance.State.Phase != GamePhase.MainPhase)
            {
                throw new InvalidOperationException("Card abilities can only be activated during MainPhase.");
            }

            if (!IsSamePlayerId(instance.State.ActivePlayerId, playerId))
            {
                throw new InvalidOperationException("Only the active player can activate card abilities.");
            }

            return;
        }

        if (actionPrefix == ResolveOptionalAttackEffectActionPrefix)
        {
            if (instance.State.Phase != GamePhase.AttackDeclaration)
            {
                throw new InvalidOperationException("Optional attack effect choice can only be resolved during attack declaration.");
            }

            if (!IsSamePlayerId(instance.State.PendingAttackOptionalEffectPlayerId, playerId))
            {
                throw new InvalidOperationException("Only the attacking player can resolve optional attack effect choice.");
            }

            return;
        }

        if (actionPrefix == LeaderEffectActionPrefix)
        {
            return;
        }

        if (actionPrefix == ActivateSupportActionPrefix)
        {
            var isActivePlayer = IsSamePlayerId(instance.State.ActivePlayerId, playerId);
            if (isActivePlayer)
            {
                if (instance.State.Phase is GamePhase.MainPhase or GamePhase.ActionStep)
                {
                    if (instance.State.Phase == GamePhase.ActionStep
                        && !IsSamePlayerId(instance.State.PriorityPlayerId, playerId))
                    {
                        throw new InvalidOperationException("Only the priority player can execute card actions.");
                    }

                    return;
                }

                throw new InvalidOperationException("Support actions on your turn can only be executed during MainPhase or ActionStep.");
            }

            if (instance.State.Phase == GamePhase.MainPhase)
            {
                // A support activated during the MainPhase opens a reaction window: the opponent may
                // respond from their support area while they hold priority.
                if (SupportTimingRules.HasPendingSupportActivation(instance.State)
                    && IsSamePlayerId(instance.State.PriorityPlayerId, playerId))
                {
                    return;
                }

                throw new InvalidOperationException("Only the active player can execute support actions during MainPhase.");
            }

            if (instance.State.Phase is not (GamePhase.AttackDeclaration or GamePhase.BlockerDeclaration or GamePhase.ActionStep))
            {
                throw new InvalidOperationException("Opponent-turn supports can only be executed during attack response windows.");
            }

            if (instance.State.Phase == GamePhase.ActionStep
                && !IsSamePlayerId(instance.State.PriorityPlayerId, playerId))
            {
                throw new InvalidOperationException("Only the priority player can execute card actions.");
            }

            return;
        }

        if (instance.State.Phase != GamePhase.ActionStep)
        {
            throw new InvalidOperationException("Card actions can only be executed during ActionStep.");
        }

        if (!IsSamePlayerId(instance.State.PriorityPlayerId, playerId))
        {
            throw new InvalidOperationException("Only the priority player can execute card actions.");
        }
    }

    private static bool IsSamePlayerId(string? left, string? right)
    {
        if (string.IsNullOrWhiteSpace(left) || string.IsNullOrWhiteSpace(right))
        {
            return false;
        }

        if (Guid.TryParse(left, out var leftGuid) && Guid.TryParse(right, out var rightGuid))
        {
            return leftGuid == rightGuid;
        }

        return string.Equals(left.Trim(), right.Trim(), StringComparison.OrdinalIgnoreCase);
    }

    // Resolves a live card instance a player can act from: battlefield cards and the leader.
    private static CardInstance? FindOwnedCardInstance(PlayerState player, string? instanceId)
    {
        if (string.IsNullOrWhiteSpace(instanceId))
        {
            return null;
        }

        var battlefieldCard = player.Battlefield.FirstOrDefault(card =>
            string.Equals(card.InstanceId, instanceId, StringComparison.Ordinal));
        if (battlefieldCard is not null)
        {
            return battlefieldCard;
        }

        var leader = player.LeaderCardInstance;
        return leader is not null
            && string.Equals(leader.InstanceId, instanceId, StringComparison.Ordinal)
                ? leader
                : null;
    }

    private static (PlayerState Player, CardInstance Card)? FindCardInstanceWithOwner(
        GameState state,
        string? instanceId)
    {
        foreach (var player in state.Players)
        {
            var card = FindOwnedCardInstance(player, instanceId);
            if (card is not null)
            {
                return (player, card);
            }
        }

        return null;
    }

    private static string ResolveActionSourceCardInstanceId(string actionId, string actionPrefix)
    {
        if (actionPrefix is LeaderEffectActionPrefix or CharacterAbilityActionPrefix)
        {
            if (!TryParseAbilityActionId(actionId, actionPrefix, out var parsedSourceCardInstanceId, out _))
            {
                throw new InvalidOperationException($"Card action '{actionId}' is invalid.");
            }

            return parsedSourceCardInstanceId;
        }

        if (actionPrefix == BattleActionPrefix)
        {
            return actionId[actionPrefix.Length..].Trim();
        }

        if (actionPrefix == ResolveOptionalAttackEffectActionPrefix)
        {
            var payload = actionId[actionPrefix.Length..].Trim();
            var delimiterIndex = payload.IndexOf(':');
            if (delimiterIndex <= 0 || delimiterIndex >= payload.Length - 1)
            {
                throw new InvalidOperationException($"Card action '{actionId}' is invalid.");
            }

            return payload[..delimiterIndex].Trim();
        }

        return actionId[actionPrefix.Length..].Trim();
    }

    private static bool TryParseAbilityActionId(
        string actionId,
        string actionPrefix,
        out string sourceCardInstanceId,
        out string effectKey)
    {
        sourceCardInstanceId = string.Empty;
        effectKey = string.Empty;

        if (!actionId.StartsWith(actionPrefix, StringComparison.Ordinal))
        {
            return false;
        }

        var payload = actionId[actionPrefix.Length..];
        var delimiterIndex = payload.IndexOf(':');
        if (delimiterIndex <= 0 || delimiterIndex >= payload.Length - 1)
        {
            return false;
        }

        sourceCardInstanceId = payload[..delimiterIndex].Trim();
        effectKey = payload[(delimiterIndex + 1)..].Trim();
        return !string.IsNullOrWhiteSpace(sourceCardInstanceId) && !string.IsNullOrWhiteSpace(effectKey);
    }

    private static string ResolveEffectKey(EffectSpec effectSpec, int effectIndex)
    {
        if (!string.IsNullOrWhiteSpace(effectSpec.Id))
        {
            return effectSpec.Id.Trim();
        }

        return $"index-{effectIndex}";
    }

    private static bool MatchesEffectKey(EffectSpec effectSpec, int effectIndex, string effectKey)
    {
        var resolvedEffectKey = ResolveEffectKey(effectSpec, effectIndex);
        return string.Equals(resolvedEffectKey, effectKey, StringComparison.Ordinal);
    }

    private GameCardActionTargetsResponse BuildSupportCardActionTargets(
        GameInstance instance,
        string actionId,
        string sourceCardInstanceId,
        string playerId,
        PlayerState actingPlayer,
        IReadOnlyDictionary<string, string> arguments,
        IGameEffectCanExecuteEvaluator canExecuteEvaluator,
        IGameCardEffectRegistry effectRegistry)
    {
        var isFromSupportZone = true;
        var sourceCardInstance = actingPlayer.SupportZone.FirstOrDefault(card =>
            string.Equals(card.InstanceId, sourceCardInstanceId, StringComparison.Ordinal));
        if (sourceCardInstance is null)
        {
            isFromSupportZone = false;
            sourceCardInstance = actingPlayer.Hand.FirstOrDefault(card =>
                string.Equals(card.InstanceId, sourceCardInstanceId, StringComparison.Ordinal));
        }

        if (sourceCardInstance is null)
        {
            throw new InvalidOperationException(
                $"Support card instance '{sourceCardInstanceId}' was not found for player '{playerId}'.");
        }

        if (!instance.State.CardDefinitions.TryGetValue(sourceCardInstance.CardDefinitionId, out var sourceCardDefinition))
        {
            throw new InvalidOperationException($"Card definition '{sourceCardInstance.CardDefinitionId}' was not found.");
        }

        // The card's own data decides which effect the player is activating (see
        // SupportActivationPlanner): timing, once-per-turn and cost all belong to that entry effect,
        // while the target requirement comes from the whole chain.
        var entryEffect = SupportActivationPlanner.ResolveEntry(sourceCardDefinition);
        if (entryEffect is null)
        {
            return new GameCardActionTargetsResponse(
                ActionId: actionId,
                SourceCardInstanceId: sourceCardInstanceId,
                IsEnabled: false,
                DisabledReason: "This card has no support effect to activate.",
                MinimumTargetCount: null,
                MaximumTargetCount: null,
                ExactTargetCount: null,
                AutoSelectAllValidTargets: false,
                ValidTargets: []);
        }

        var effectKey = ResolveEffectKey(entryEffect, effectIndex: 0);
        if (entryEffect.GlobalRestrictions == EffectRestrictions.OncePerTurn
            && instance.State.IsEffectUsedThisTurn(playerId, sourceCardInstanceId, effectKey))
        {
            return BuildOncePerTurnDisabledResponse(
                actionId,
                sourceCardInstanceId,
                entryEffect);
        }

        if (!SupportTimingRules.IsTimingAvailable(entryEffect.Timing, instance.State, playerId, isFromSupportZone))
        {
            return new GameCardActionTargetsResponse(
                ActionId: actionId,
                SourceCardInstanceId: sourceCardInstanceId,
                IsEnabled: false,
                DisabledReason: "Support timing is not available right now.",
                MinimumTargetCount: entryEffect.TargetRules.MinimumTargetCount,
                MaximumTargetCount: entryEffect.TargetRules.MaximumTargetCount,
                ExactTargetCount: entryEffect.TargetRules.ExactTargetCount,
                AutoSelectAllValidTargets: entryEffect.TargetRules.AutoSelectAllValidTargets,
                ValidTargets: []);
        }

        var activationArguments = new Dictionary<string, string>(arguments, StringComparer.Ordinal);
        var activationCost = SupportActivationPlanner.ResolveActivationCost(entryEffect);
        if (activationCost > 0)
        {
            activationArguments[ReactiveEffectExecutionConstants.SupportActivationChakraCostArgument] =
                activationCost.ToString(System.Globalization.CultureInfo.InvariantCulture);
        }

        var context = new GameCardEffectContext(
            game: instance,
            actingPlayer: new Player { Id = playerId },
            sourceCardDefinition: sourceCardDefinition,
            sourceCardInstance: sourceCardInstance,
            arguments: activationArguments,
            selectedTargets: []);

        var canExecuteResult = canExecuteEvaluator.Evaluate(context, entryEffect, includeValidTargets: false);
        if (!canExecuteResult.CanExecute)
        {
            return new GameCardActionTargetsResponse(
                ActionId: actionId,
                SourceCardInstanceId: sourceCardInstanceId,
                IsEnabled: false,
                DisabledReason: canExecuteResult.FailedConditions.FirstOrDefault(),
                MinimumTargetCount: entryEffect.TargetRules.MinimumTargetCount,
                MaximumTargetCount: entryEffect.TargetRules.MaximumTargetCount,
                ExactTargetCount: entryEffect.TargetRules.ExactTargetCount,
                AutoSelectAllValidTargets: entryEffect.TargetRules.AutoSelectAllValidTargets,
                ValidTargets: []);
        }

        var plan = SupportActivationTargetPlanner.Build(
            instance,
            sourceCardDefinition,
            sourceCardInstance,
            effectRegistry,
            playerId);

        return new GameCardActionTargetsResponse(
            ActionId: actionId,
            SourceCardInstanceId: sourceCardInstanceId,
            IsEnabled: plan.IsEnabled,
            DisabledReason: plan.DisabledReason,
            MinimumTargetCount: plan.MinimumTargetCount,
            MaximumTargetCount: plan.MaximumTargetCount,
            ExactTargetCount: plan.ExactTargetCount,
            AutoSelectAllValidTargets: plan.AutoSelectAllValidTargets,
            ValidTargets: plan.ValidTargets);
    }

    private static GameCardActionTargetsResponse BuildBattleCardActionTargets(
        GameInstance instance,
        string actionId,
        string sourceCardInstanceId,
        string playerId,
        PlayerState actingPlayer)
    {
        var attacker = FindOwnedCardInstance(actingPlayer, sourceCardInstanceId);
        if (attacker is null)
        {
            throw new InvalidOperationException(
                $"Card instance '{sourceCardInstanceId}' was not found for player '{playerId}'.");
        }

        if (attacker.IsRested)
        {
            return new GameCardActionTargetsResponse(
                ActionId: actionId,
                SourceCardInstanceId: sourceCardInstanceId,
                IsEnabled: false,
                DisabledReason: "Only active cards can declare attacks.",
                MinimumTargetCount: 1,
                MaximumTargetCount: 1,
                ExactTargetCount: 1,
                AutoSelectAllValidTargets: false,
                ValidTargets: []);
        }

        var defenderPlayer = instance.State.Players.FirstOrDefault(player =>
            !IsSamePlayerId(player.PlayerId, playerId));
        if (defenderPlayer is null || defenderPlayer.LeaderCardInstance is null)
        {
            return new GameCardActionTargetsResponse(
                ActionId: actionId,
                SourceCardInstanceId: sourceCardInstanceId,
                IsEnabled: false,
                DisabledReason: "No valid defender target is available.",
                MinimumTargetCount: 1,
                MaximumTargetCount: 1,
                ExactTargetCount: 1,
                AutoSelectAllValidTargets: false,
                ValidTargets: []);
        }

        var validTargets = new List<GameEffectTargetReference>
        {
            new(
                PlayerId: defenderPlayer.PlayerId,
                Zone: PlayerZone.Leader,
                CardInstanceId: defenderPlayer.LeaderCardInstance.InstanceId)
        };

        validTargets.AddRange(defenderPlayer.Battlefield
            .Where(card => card.IsRested)
            .Select(card => new GameEffectTargetReference(
                PlayerId: defenderPlayer.PlayerId,
                Zone: PlayerZone.CharacterField,
                CardInstanceId: card.InstanceId)));

        return new GameCardActionTargetsResponse(
            ActionId: actionId,
            SourceCardInstanceId: sourceCardInstanceId,
            IsEnabled: validTargets.Count > 0,
            DisabledReason: validTargets.Count > 0 ? null : "No valid defender target is available.",
            MinimumTargetCount: 1,
            MaximumTargetCount: 1,
            ExactTargetCount: 1,
            AutoSelectAllValidTargets: false,
            ValidTargets: validTargets);
    }

    /// <summary>
    /// Publishes the targets of one card ability: the leader's <c>leader-effect:</c> options and a battlefield
    /// character's <c>character-ability:</c> options share this, because the abilities are authored the same
    /// way. Only the source instance differs (the leader lives outside the character field), which is also
    /// what the effect context receives.
    /// </summary>
    private GameCardActionTargetsResponse BuildCardAbilityActionTargets(
        GameInstance instance,
        string actionId,
        string sourceCardInstanceId,
        string playerId,
        PlayerState actingPlayer,
        IReadOnlyDictionary<string, string> arguments,
        IGameEffectCanExecuteEvaluator canExecuteEvaluator,
        string actionPrefix,
        bool isLeader)
    {
        CardInstance? sourceCardInstance;
        if (isLeader)
        {
            sourceCardInstance = actingPlayer.LeaderCardInstance;
        }
        else
        {
            sourceCardInstance = actingPlayer.Battlefield.FirstOrDefault(card =>
                string.Equals(card.InstanceId, sourceCardInstanceId, StringComparison.Ordinal));
        }

        if (sourceCardInstance is null
            || !string.Equals(sourceCardInstance.InstanceId, sourceCardInstanceId, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                isLeader
                    ? $"Leader card instance '{sourceCardInstanceId}' was not found for player '{playerId}'."
                    : $"Battlefield card instance '{sourceCardInstanceId}' was not found for player '{playerId}'.");
        }

        if (!instance.State.CardDefinitions.TryGetValue(sourceCardInstance.CardDefinitionId, out var sourceCardDefinition))
        {
            throw new InvalidOperationException($"Card definition '{sourceCardInstance.CardDefinitionId}' was not found.");
        }

        if (!TryParseAbilityActionId(actionId, actionPrefix, out _, out var effectKey))
        {
            throw new InvalidOperationException($"Card action '{actionId}' is invalid.");
        }

        var effectWithIndex = sourceCardDefinition.Effects
            .Select((effect, index) => new { Effect = effect, Index = index })
            .FirstOrDefault(entry => MatchesEffectKey(entry.Effect, entry.Index, effectKey));

        if (effectWithIndex is null)
        {
            throw new InvalidOperationException(
                $"Card ability '{effectKey}' was not found on '{sourceCardDefinition.Id}'.");
        }

        var effectSpec = effectWithIndex.Effect;

        // The same shape gate the executor and the chip builder use: a chain step, a passive or the card's
        // summon requirement is not an ability this player can activate, so it never offers candidates.
        if (!CardAbilityTimingRules.IsIndependentlyActivatableAbility(effectSpec))
        {
            return new GameCardActionTargetsResponse(
                ActionId: actionId,
                SourceCardInstanceId: sourceCardInstanceId,
                IsEnabled: false,
                DisabledReason: EffectRestrictionMessages.NotAnActivatedAbility,
                MinimumTargetCount: effectSpec.TargetRules.MinimumTargetCount,
                MaximumTargetCount: effectSpec.TargetRules.MaximumTargetCount,
                ExactTargetCount: effectSpec.TargetRules.ExactTargetCount,
                AutoSelectAllValidTargets: effectSpec.TargetRules.AutoSelectAllValidTargets,
                ValidTargets: []);
        }

        // A once-per-turn effect already used this turn reports the restriction even when its timing
        // window has since closed, so the player gets the actionable reason instead of a phase message.
        if (effectSpec.GlobalRestrictions == EffectRestrictions.OncePerTurn
            && instance.State.IsEffectUsedThisTurn(playerId, sourceCardInstanceId, effectKey))
        {
            return BuildOncePerTurnDisabledResponse(actionId, sourceCardInstanceId, effectSpec);
        }

        var timingAvailable = CardAbilityTimingRules.IsAbilityTimingAvailable(effectSpec.Timing, instance.State, playerId);
        if (!timingAvailable)
        {
            return new GameCardActionTargetsResponse(
                ActionId: actionId,
                SourceCardInstanceId: sourceCardInstanceId,
                IsEnabled: false,
                DisabledReason: $"Card ability '{effectSpec.Timing}' timing is not available right now.",
                MinimumTargetCount: effectSpec.TargetRules.MinimumTargetCount,
                MaximumTargetCount: effectSpec.TargetRules.MaximumTargetCount,
                ExactTargetCount: effectSpec.TargetRules.ExactTargetCount,
                AutoSelectAllValidTargets: effectSpec.TargetRules.AutoSelectAllValidTargets,
                ValidTargets: []);
        }

        var effectArguments = new Dictionary<string, string>(arguments, StringComparer.Ordinal);
        if (effectSpec.ChakraCost is > 0)
        {
            // The same argument the mapper's availability gate supplies, so this response checks the cost
            // like the published chip does (the executor charges `effectSpec.ChakraCost` on submit).
            effectArguments[ReactiveEffectExecutionConstants.SupportActivationChakraCostArgument] =
                effectSpec.ChakraCost.Value.ToString(System.Globalization.CultureInfo.InvariantCulture);
        }

        var context = new GameCardEffectContext(
            game: instance,
            actingPlayer: new Player { Id = playerId },
            sourceCardDefinition: sourceCardDefinition,
            sourceCardInstance: sourceCardInstance,
            arguments: effectArguments,
            selectedTargets: []);

        var canExecuteResult = canExecuteEvaluator.Evaluate(context, effectSpec, includeValidTargets: true);
        var validTargets = ResolveValidTargetsForResponse(context, effectSpec, canExecuteResult);
        return ToCardActionTargetsResponse(actionId, sourceCardInstanceId, effectSpec, canExecuteResult, validTargets);
    }

    private static GameCardActionTargetsResponse BuildOncePerTurnDisabledResponse(
        string actionId,
        string sourceCardInstanceId,
        EffectSpec effectSpec)
    {
        return new GameCardActionTargetsResponse(
            ActionId: actionId,
            SourceCardInstanceId: sourceCardInstanceId,
            IsEnabled: false,
            DisabledReason: EffectRestrictionMessages.OncePerTurn,
            MinimumTargetCount: effectSpec.TargetRules.MinimumTargetCount,
            MaximumTargetCount: effectSpec.TargetRules.MaximumTargetCount,
            ExactTargetCount: effectSpec.TargetRules.ExactTargetCount,
            AutoSelectAllValidTargets: effectSpec.TargetRules.AutoSelectAllValidTargets,
            ValidTargets: []);
    }

    private static GameCardActionTargetsResponse ToCardActionTargetsResponse(
        string actionId,
        string sourceCardInstanceId,
        EffectSpec effectSpec,
        CanExecuteResult canExecuteResult,
        IReadOnlyList<GameEffectTargetReference> validTargets)
    {
        return new GameCardActionTargetsResponse(
            ActionId: actionId,
            SourceCardInstanceId: sourceCardInstanceId,
            IsEnabled: canExecuteResult.CanExecute,
            DisabledReason: canExecuteResult.FailedConditions.Count == 0
                ? null
                : canExecuteResult.FailedConditions[0],
            MinimumTargetCount: effectSpec.TargetRules.MinimumTargetCount,
            MaximumTargetCount: effectSpec.TargetRules.MaximumTargetCount,
            ExactTargetCount: effectSpec.TargetRules.ExactTargetCount,
            AutoSelectAllValidTargets: effectSpec.TargetRules.AutoSelectAllValidTargets,
            ValidTargets: validTargets);
    }

    private static IReadOnlyList<GameEffectTargetReference> ResolveValidTargetsForResponse(
        GameCardEffectContext context,
        EffectSpec effectSpec,
        CanExecuteResult canExecuteResult)
    {
        if (!canExecuteResult.CanExecute)
        {
            return [];
        }

        // A node that defers its target choice asks the player *after* the chain's earlier steps have run, so
        // there is nothing to publish up front: offering candidates here would make the client pick before
        // (for example) the draw that changes the hand. The engine sends the candidates with the prompt instead.
        if (effectSpec.SelectionTiming == EffectSelectionTiming.Prompted)
        {
            return [];
        }

        if (effectSpec.TargetRules.Rules.Count == 0)
        {
            return [];
        }

        var targetResolver = new Api.Services.Games.EffectTargetResolver();
        return targetResolver.ResolveTargets(context, effectSpec);
    }

    private void ExecuteLeaderEffectAction(
        GameInstance instance,
        string playerId,
        GameCardActionExecutionRequest request,
        IGameSequentialEffectExecutor sequentialEffectExecutor,
        PlayerState actingPlayer,
        Dictionary<string, string> arguments)
    {
        ExecuteCardAbilityAction(
            instance,
            playerId,
            request,
            sequentialEffectExecutor,
            actingPlayer,
            arguments,
            LeaderEffectActionPrefix,
            isLeader: true);
    }

    private void ExecuteCharacterAbilityAction(
        GameInstance instance,
        string playerId,
        GameCardActionExecutionRequest request,
        IGameSequentialEffectExecutor sequentialEffectExecutor,
        PlayerState actingPlayer,
        Dictionary<string, string> arguments)
    {
        ExecuteCardAbilityAction(
            instance,
            playerId,
            request,
            sequentialEffectExecutor,
            actingPlayer,
            arguments,
            CharacterAbilityActionPrefix,
            isLeader: false);
    }

    /// <summary>
    /// Executes one card ability: the leader's <c>leader-effect:</c> options and a battlefield character's
    /// <c>character-ability:</c> options (N-011's "[Activate: Main]") share the whole path, because abilities
    /// are authored the same way. The effect context receives the acting card's source instance either way
    /// (leader or battlefield card), so source-scoped and duration-scoped nodes resolve like they do anywhere
    /// else - without it a "[During This Turn] +3 power" became a permanent <c>PowerOverride</c> instead of a
    /// duration-scoped applied effect that <c>CompleteEndStep</c> clears.
    /// </summary>
    private void ExecuteCardAbilityAction(
        GameInstance instance,
        string playerId,
        GameCardActionExecutionRequest request,
        IGameSequentialEffectExecutor sequentialEffectExecutor,
        PlayerState actingPlayer,
        Dictionary<string, string> arguments,
        string actionPrefix,
        bool isLeader)
    {
        var sourceCardInstance = isLeader
            ? actingPlayer.LeaderCardInstance
            : actingPlayer.Battlefield.FirstOrDefault(card =>
                string.Equals(card.InstanceId, request.SourceCardInstanceId, StringComparison.Ordinal));

        if (sourceCardInstance is null
            || !string.Equals(sourceCardInstance.InstanceId, request.SourceCardInstanceId, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                isLeader
                    ? $"Leader card instance '{request.SourceCardInstanceId}' was not found for player '{playerId}'."
                    : $"Battlefield card instance '{request.SourceCardInstanceId}' was not found for player '{playerId}'.");
        }

        if (!instance.State.CardDefinitions.TryGetValue(sourceCardInstance.CardDefinitionId, out var sourceCardDefinition))
        {
            throw new InvalidOperationException($"Card definition '{sourceCardInstance.CardDefinitionId}' was not found.");
        }

        if (!TryParseAbilityActionId(request.ActionId, actionPrefix, out _, out var effectKey))
        {
            throw new InvalidOperationException($"Card action '{request.ActionId}' is invalid.");
        }

        var effectWithIndex = sourceCardDefinition.Effects
            .Select((effect, index) => new { Effect = effect, Index = index })
            .FirstOrDefault(entry => MatchesEffectKey(entry.Effect, entry.Index, effectKey));

        if (effectWithIndex is null)
        {
            throw new InvalidOperationException(
                $"Card ability '{effectKey}' was not found on '{sourceCardDefinition.Id}'.");
        }

        var effectSpec = effectWithIndex.Effect;

        // A node that is not an independently activatable ability cannot be reached through the ability path,
        // however the request was crafted: a chain step (a subordinate node), a passive, or the card's summon
        // requirement. The mapper never publishes a chip for those, so refusing here keeps a direct submit from
        // re-running a chain the board never offered (N-022's Tribute node executed the whole reveal+summon
        // chain this way).
        if (!CardAbilityTimingRules.IsIndependentlyActivatableAbility(effectSpec))
        {
            throw new InvalidOperationException(EffectRestrictionMessages.NotAnActivatedAbility);
        }

        if (effectSpec.GlobalRestrictions == EffectRestrictions.OncePerTurn
            && instance.State.IsEffectUsedThisTurn(playerId, request.SourceCardInstanceId, effectKey))
        {
            throw new InvalidOperationException(EffectRestrictionMessages.OncePerTurn);
        }

        if (!CardAbilityTimingRules.IsAbilityTimingAvailable(effectSpec.Timing, instance.State, playerId))
        {
            throw new InvalidOperationException(
                $"Card ability '{effectSpec.Timing}' timing is not available right now.");
        }

        // The mapper's availability gate uses the same rules, so a direct submit of a chip the board shows as
        // disabled fails loudly instead of silently changing nothing.
        if (effectSpec.EffectType == EffectKind.Recovery
            && !ChakraRecoveryRules.CanActivateLeaderRecovery(instance.State, actingPlayer, out var recoveryDisabledReason))
        {
            throw new InvalidOperationException(recoveryDisabledReason);
        }

        arguments[ReactiveEffectExecutionConstants.ActiveEffectSpecIdArgument] = string.IsNullOrWhiteSpace(effectSpec.Id)
            ? effectSpec.RuntimeEffectType.ToString()
            : effectSpec.Id;
        arguments[ReactiveEffectExecutionConstants.AbilityKeyArgument] = effectKey;

        var selectedTargets = request.SelectedTargets ?? [];
        var context = new GameCardEffectContext(
            game: instance,
            actingPlayer: new Player { Id = playerId },
            sourceCardDefinition: sourceCardDefinition,
            sourceCardInstance: sourceCardInstance,
            arguments: arguments,
            selectedTargets: selectedTargets);

        var executeResult = sequentialEffectExecutor.Execute(context);
        if (executeResult.IsError)
        {
            throw new InvalidOperationException(executeResult.FirstError.Description);
        }

        // A leader effect and a character ability share this path, so the log distinguishes them by the action
        // type and carries the activated effect's type: a Recovery reads as "recovered chakra", everything else
        // as an ability.
        LogBoardAction(
            instance,
            isLeader ? GameActionLogActionTypes.LeaderAbilityUsed : GameActionLogActionTypes.CharacterAbilityUsed,
            playerId,
            effectSpec.EffectType == EffectKind.Recovery
                ? $"{sourceCardDefinition.DisplayName} recovered chakra."
                : $"{sourceCardDefinition.DisplayName} used an ability.",
            GameActionLogCategory.Action,
            sourceCardInstance: sourceCardInstance,
            sourceCardDefinition: sourceCardDefinition,
            extraMetadata: new[]
            {
                ("abilityKey", effectKey),
                ("effectType", effectSpec.EffectType.ToString()),
            });

        // "[Recovery] ... rest this card and flip all of your CHAKRA face-up": the rest is part of the
        // ability's cost and no authored payload carries it, so the registry pays it here (the attack
        // declaration rests its attacker the same way). OnEnterRefreshPhase readies the card again.
        if (effectSpec.EffectType == EffectKind.Recovery)
        {
            sourceCardInstance.IsRested = true;
        }

        if (effectSpec.GlobalRestrictions == EffectRestrictions.OncePerTurn)
        {
            instance.State.MarkEffectUsedThisTurn(playerId, request.SourceCardInstanceId, effectKey);
        }
    }

    private void ExecuteActivateSupportAction(
        GameInstance instance,
        string playerId,
        GameCardActionExecutionRequest request,
        IGameSequentialEffectExecutor sequentialEffectExecutor,
        PlayerState actingPlayer,
        Dictionary<string, string> arguments)
    {
        var isFromSupportZone = true;
        var sourceCardInstance = actingPlayer.SupportZone.FirstOrDefault(card =>
            string.Equals(card.InstanceId, request.SourceCardInstanceId, StringComparison.Ordinal));
        if (sourceCardInstance is null)
        {
            isFromSupportZone = false;
            sourceCardInstance = actingPlayer.Hand.FirstOrDefault(card =>
                string.Equals(card.InstanceId, request.SourceCardInstanceId, StringComparison.Ordinal));
        }

        if (sourceCardInstance is null)
        {
            throw new InvalidOperationException(
                $"Support card instance '{request.SourceCardInstanceId}' was not found for player '{playerId}'.");
        }

        // One activation per card and chain: while this card's activation is still queued it cannot be
        // activated again (the mapper stops publishing the action too - see SupportTimingRules).
        if (SupportTimingRules.IsCardPendingOnResolutionStack(instance.State, sourceCardInstance.InstanceId))
        {
            throw new InvalidOperationException(EffectRestrictionMessages.AlreadyActivatedInChain);
        }

        if (!SupportTimingRules.IsZoneAllowed(instance.State, playerId, isFromSupportZone))
        {
            throw new InvalidOperationException("Opponent-turn supports, including Quick, must be played from support area.");
        }

        if (!instance.State.CardDefinitions.TryGetValue(sourceCardInstance.CardDefinitionId, out var sourceCardDefinition))
        {
            throw new InvalidOperationException(
                $"Card definition '{sourceCardInstance.CardDefinitionId}' was not found.");
        }

        var entryEffect = SupportActivationPlanner.ResolveEntry(sourceCardDefinition);
        if (entryEffect is null)
        {
            throw new InvalidOperationException(
                $"Card '{sourceCardDefinition.Id}' has no support effect to activate.");
        }

        var entryEffectKey = ResolveEffectKey(entryEffect, effectIndex: 0);
        if (entryEffect.GlobalRestrictions == EffectRestrictions.OncePerTurn
            && instance.State.IsEffectUsedThisTurn(playerId, sourceCardInstance.InstanceId, entryEffectKey))
        {
            throw new InvalidOperationException(EffectRestrictionMessages.OncePerTurn);
        }

        if (!SupportTimingRules.IsTimingAvailable(entryEffect.Timing, instance.State, playerId, isFromSupportZone))
        {
            throw new InvalidOperationException("Support timing is not available right now.");
        }

        var selectedTargets = request.SelectedTargets ?? [];

        // The activation is paid and consumed now, but its effect resolves when the window closes: a
        // Support Activated response has to be able to negate it first (see ResolvePendingActivations).
        var activationCost = SupportActivationPlanner.ResolveActivationCost(entryEffect);
        if (activationCost > 0)
        {
            if (actingPlayer.ResourcePool < activationCost)
            {
                throw new InvalidOperationException(
                    $"Player '{playerId}' does not have enough chakra to pay {activationCost}.");
            }

            actingPlayer.ResourcePool -= activationCost;
            arguments[ReactiveEffectExecutionConstants.SupportActivationChakraCostArgument] =
                activationCost.ToString(System.Globalization.CultureInfo.InvariantCulture);
        }

        RevealActivatedSupportCard(sourceCardInstance, isFromSupportZone);

        // Activation flips the card face up (see RevealActivatedSupportCard), so the name is public by the time
        // this entry is recorded.
        LogBoardAction(
            instance,
            GameActionLogActionTypes.SupportActivated,
            playerId,
            $"{sourceCardDefinition.DisplayName} was activated.",
            GameActionLogCategory.Action,
            sourceCardInstance: sourceCardInstance,
            sourceCardDefinition: sourceCardDefinition,
            extraMetadata: new[] { ("activatedFrom", isFromSupportZone ? PlayerZone.SupportZone.ToString() : PlayerZone.Hand.ToString()) });

        instance.State.EffectResolutionStack.Add(new EffectResolutionStackEntry
        {
            SourcePlayerId = playerId,
            SourceZone = isFromSupportZone ? PlayerZone.SupportZone : PlayerZone.Hand,
            SourceCardInstanceId = sourceCardInstance.InstanceId,
            EffectTypeKey = ResolveActivationEffectTypeKey(entryEffect),
            ActivatedEffectId = entryEffectKey,
            SelectedTargets = [.. selectedTargets],
            Arguments = new Dictionary<string, string>(arguments, StringComparer.Ordinal),
        });

        if (entryEffect.GlobalRestrictions == EffectRestrictions.OncePerTurn)
        {
            instance.State.MarkEffectUsedThisTurn(playerId, sourceCardInstance.InstanceId, entryEffectKey);
        }

        if (!isFromSupportZone)
        {
            runtimeDeckService.MoveCardToZone(
                instance,
                playerId,
                PlayerZone.Hand,
                PlayerZone.Trash,
                sourceCardInstance.InstanceId);
        }

        // A MainPhase activation opens a reaction window too: [Support Activated] cards in the
        // opponent's support area may respond before it resolves, so priority passes to them for that
        // window (see SupportTimingRules). Nothing resolves until both players pass.
        if (instance.State.Phase == GamePhase.MainPhase)
        {
            instance.State.PriorityPlayerId = ResolveOpponentPlayerId(instance.State, playerId);
            instance.State.ConsecutivePasses = 0;
        }
    }

    private static string ResolveOpponentPlayerId(GameState state, string playerId)
    {
        var opponent = state.Players.FirstOrDefault(player => !IsSamePlayerId(player.PlayerId, playerId));
        return opponent?.PlayerId ?? string.Empty;
    }

    private static string ResolveActivationEffectTypeKey(EffectSpec? entryEffect)
    {
        if (entryEffect is null)
        {
            return string.Empty;
        }

        return RuntimeEffectKeys.TryResolve(entryEffect.RuntimeEffectType, out var effectKey)
            ? effectKey
            : entryEffect.RuntimeEffectType.ToString();
    }

    /// <summary>
    /// A support activated from the support area is revealed so the opponent can see (and respond to)
    /// the card that is on the resolution stack. Reveals are cleared when the card changes zone.
    /// </summary>
    private static void RevealActivatedSupportCard(CardInstance sourceCardInstance, bool isFromSupportZone)
    {
        if (!isFromSupportZone)
        {
            return;
        }

        sourceCardInstance.IsFaceUp = true;
        sourceCardInstance.IsRevealedToBothPlayers = true;
        sourceCardInstance.RevealedInZone = PlayerZone.SupportZone;
    }

    /// <summary>
    /// Replays pending support activations, most recently activated first (see the game rules'
    /// "multiple supports chain"). Negated activations are discarded without executing: their cost was
    /// already paid when they were activated.
    /// </summary>
    private void ResolvePendingActivations(
        GameInstance instance,
        IGameSequentialEffectExecutor? sequentialEffectExecutor)
    {
        if (sequentialEffectExecutor is null)
        {
            // Callers that do not drive effects leave the activation queued for the next window close.
            return;
        }

        while (true)
        {
            var entryIndex = instance.State.EffectResolutionStack.FindLastIndex(entry =>
                !string.IsNullOrWhiteSpace(entry.ActivatedEffectId));
            if (entryIndex < 0)
            {
                return;
            }

            var entry = instance.State.EffectResolutionStack[entryIndex];
            instance.State.EffectResolutionStack.RemoveAt(entryIndex);

            if (entry.IsNegated)
            {
                DiscardUsedSupportSource(instance, entry);
                continue;
            }

            ExecutePendingActivation(instance, entry, sequentialEffectExecutor);
            DiscardUsedSupportSource(instance, entry);
        }
    }

    /// <summary>
    /// A support activated from the support area is used up: once the activation has been replayed (or was
    /// negated - the cost is still paid, so the support is still spent) the card leaves the support area for
    /// the trash. Hand activations were already discarded when they were queued, and a card that left play
    /// in the meantime is left alone.
    /// </summary>
    private void DiscardUsedSupportSource(GameInstance instance, EffectResolutionStackEntry entry)
    {
        if (entry.SourceZone != PlayerZone.SupportZone)
        {
            return;
        }

        var sourcePlayer = instance.State.Players.FirstOrDefault(player =>
            IsSamePlayerId(player.PlayerId, entry.SourcePlayerId));
        var sourceCard = sourcePlayer?.SupportZone.FirstOrDefault(card =>
            string.Equals(card.InstanceId, entry.SourceCardInstanceId, StringComparison.Ordinal));

        if (sourcePlayer is null || sourceCard is null)
        {
            return;
        }

        MoveCardToZone(
            instance,
            sourcePlayer.PlayerId,
            sourceCard.InstanceId,
            PlayerZone.SupportZone,
            PlayerZone.Trash,
            destinationIndex: null);
    }

    private void ExecutePendingActivation(
        GameInstance instance,
        EffectResolutionStackEntry entry,
        IGameSequentialEffectExecutor sequentialEffectExecutor)
    {
        var sourcePlayer = instance.State.Players.FirstOrDefault(player =>
            IsSamePlayerId(player.PlayerId, entry.SourcePlayerId));
        var sourceCardInstance = sourcePlayer is null
            ? null
            : FindCardInstanceAcrossZones(sourcePlayer, entry.SourceCardInstanceId);

        if (sourcePlayer is null
            || sourceCardInstance is null
            || !instance.State.CardDefinitions.TryGetValue(sourceCardInstance.CardDefinitionId, out var sourceCardDefinition))
        {
            // The stack entry id moves into metadata: the message can reach a player as fallback wording, and an
            // engine id there would be noise at best.
            instance.AddActionLogEntry(
                actionType: GameActionLogActionTypes.SupportActivationSkipped,
                message: "A support activation fizzled because its card had left play.",
                playerId: entry.SourcePlayerId,
                metadata: new Dictionary<string, string>(StringComparer.Ordinal)
                {
                    ["stackEntryId"] = entry.EntryId,
                },
                category: GameActionLogCategory.Effect);
            return;
        }

        // The replay is the activator's own action: the activation was validated and paid when it was queued,
        // but the gate that validated it may still ask for priority (N-008's interrupt is only legal for the
        // priority holder). The pass that closed the window cleared priority, so the replay hands it back to
        // the activator for the duration and restores what was there afterwards - otherwise the interrupt
        // would silently take its failure branch and the attack would resolve as if it had never answered.
        var priorityBeforeReplay = instance.State.PriorityPlayerId;
        instance.State.PriorityPlayerId = entry.SourcePlayerId;
        try
        {
            // The card can declare several unlinked roots (N-016: the chakra lock *and* the negate) and the
            // sequential executor walks one chain per call, so the activation is replayed group by group. Each
            // group is rebuilt from the card's data with its source-supplied nodes normalised, so the replay
            // executes exactly the activation the player paid for.
            foreach (var activationGroup in SupportActivationPlanner.PlanActivationGroups(sourceCardDefinition))
            {
                var context = new GameCardEffectContext(
                    game: instance,
                    actingPlayer: new Player { Id = entry.SourcePlayerId },
                    sourceCardDefinition: SupportActivationNormalizer.NormalizeForActivation(
                        instance.State,
                        sourceCardDefinition,
                        sourceCardInstance,
                        activationGroup),
                    sourceCardInstance: sourceCardInstance,
                    arguments: new Dictionary<string, string>(entry.Arguments, StringComparer.Ordinal)
                    {
                        [ReactiveEffectExecutionConstants.ActivationCostPaidArgument] = bool.TrueString,
                    },
                    selectedTargets: [.. entry.SelectedTargets]);

                var executeResult = sequentialEffectExecutor.Execute(context);
                if (executeResult.IsError)
                {
                    // A single unresolvable activation must not strand both players: log it and continue.
                    instance.AddActionLogEntry(
                        actionType: GameActionLogActionTypes.SupportActivationFailed,
                        message: "A support activation fizzled.",
                        playerId: entry.SourcePlayerId,
                        metadata: new Dictionary<string, string>(StringComparer.Ordinal)
                        {
                            ["stackEntryId"] = entry.EntryId,
                            ["failureDescription"] = executeResult.FirstError.Description,
                        },
                        category: GameActionLogCategory.Effect);
                }
            }
        }
        finally
        {
            instance.State.PriorityPlayerId = priorityBeforeReplay;
        }
    }

    private static CardInstance? FindCardInstanceAcrossZones(PlayerState player, string cardInstanceId)
    {
        foreach (var zone in new[]
        {
            PlayerZone.CharacterField,
            PlayerZone.SupportZone,
            PlayerZone.Hand,
            PlayerZone.Trash,
            PlayerZone.ExileZone,
            PlayerZone.Deck,
        })
        {
            var zoneCard = PlayerZoneCardAccessor.GetCards(zone, player).FirstOrDefault(card =>
                string.Equals(card.InstanceId, cardInstanceId, StringComparison.Ordinal));
            if (zoneCard is not null)
            {
                return zoneCard;
            }
        }

        var leader = player.LeaderCardInstance;
        return leader is not null
            && string.Equals(leader.InstanceId, cardInstanceId, StringComparison.Ordinal)
                ? leader
                : null;
    }

    private void ExecuteBattleAction(
        GameInstance instance,
        string playerId,
        GameCardActionExecutionRequest request,
        PlayerState actingPlayer,
        IGameSequentialEffectExecutor sequentialEffectExecutor)
    {
        var attacker = FindOwnedCardInstance(actingPlayer, request.SourceCardInstanceId);
        if (attacker is null)
        {
            throw new InvalidOperationException(
                $"Card instance '{request.SourceCardInstanceId}' was not found for player '{playerId}'.");
        }

        if (attacker.IsRested)
        {
            throw new InvalidOperationException("Attacking card must be active before declaring an attack.");
        }

        var selectedTarget = request.SelectedTargets?.FirstOrDefault();
        if (selectedTarget is null)
        {
            throw new InvalidOperationException("Battle actions require an explicit defender target.");
        }

        var defenderPlayer = instance.State.Players.FirstOrDefault(player =>
            !IsSamePlayerId(player.PlayerId, playerId));
        if (defenderPlayer is null)
        {
            throw new InvalidOperationException("A defender could not be resolved for this attack.");
        }

        if (!string.Equals(selectedTarget.PlayerId, defenderPlayer.PlayerId, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Battle defender target must belong to the opposing player.");
        }

        var targetZone = selectedTarget.Zone;
        if (targetZone == PlayerZone.CharacterField)
        {
            var targetId = selectedTarget.CardInstanceId;
            if (string.IsNullOrWhiteSpace(targetId))
            {
                throw new InvalidOperationException("Character attacks require a defender target.");
            }

            var defendingCard = defenderPlayer.Battlefield.FirstOrDefault(card =>
                string.Equals(card.InstanceId, targetId, StringComparison.Ordinal));

            if (defendingCard is null)
            {
                throw new InvalidOperationException("The selected defending character was not found.");
            }

            if (!defendingCard.IsRested)
            {
                throw new InvalidOperationException("You can only attack defending characters that are in rest mode.");
            }
        }
        else if (targetZone == PlayerZone.Leader)
        {
            if (!string.IsNullOrWhiteSpace(selectedTarget.CardInstanceId)
                && defenderPlayer.LeaderCardInstance is not null
                && !string.Equals(defenderPlayer.LeaderCardInstance.InstanceId, selectedTarget.CardInstanceId, StringComparison.Ordinal))
            {
                throw new InvalidOperationException("Leader attack target does not match defender leader.");
            }
        }
        else
        {
            throw new InvalidOperationException("Battle target must be a leader or a character in play.");
        }

        // The rest is the attack's declaration cost, paid exactly once here: the rest of the attack sequence
        // (when-attacking effects, the support cut-in, the interrupt, the damage step) never writes restedness
        // again, so an effect that stands this card back up keeps it standing until the refresh phase re-readies
        // it as usual.
        attacker.IsRested = true;
        instance.State.HasPendingAttack = true;
        instance.State.PendingAttackDeclarationId = Guid.NewGuid().ToString("N");
        instance.State.PendingAttackAttackerInstanceId = attacker.InstanceId;
        instance.State.PendingAttackDefenderPlayerId = defenderPlayer.PlayerId;
        instance.State.PendingAttackDefenderInstanceId = selectedTarget.CardInstanceId;
        instance.State.PendingAttackDefenderZone = targetZone;

        var defenderInstance = targetZone == PlayerZone.Leader
            ? defenderPlayer.LeaderCardInstance
            : defenderPlayer.Battlefield.FirstOrDefault(card =>
                string.Equals(card.InstanceId, selectedTarget.CardInstanceId, StringComparison.Ordinal));

        var attackerDefinition = instance.State.CardDefinitions.TryGetValue(attacker.CardDefinitionId, out var resolvedAttackerDefinition)
            ? resolvedAttackerDefinition
            : null;
        var defenderDefinition = defenderInstance is not null
            && instance.State.CardDefinitions.TryGetValue(defenderInstance.CardDefinitionId, out var resolvedDefenderDefinition)
                ? resolvedDefenderDefinition
                : null;

        // The attack is public the instant it is declared: the attacker is rested and the defender is named on
        // both boards, so the log entry carries both names.
        LogBoardAction(
            instance,
            GameActionLogActionTypes.AttackDeclared,
            playerId,
            $"{attackerDefinition?.DisplayName ?? attacker.InstanceId} declared an attack on "
                + $"{defenderDefinition?.DisplayName ?? "the opposing leader"}.",
            GameActionLogCategory.Action,
            sourceCardInstance: attacker,
            sourceCardDefinition: attackerDefinition,
            targetCardInstance: defenderInstance,
            targetCardDefinition: defenderDefinition,
            extraMetadata: new[] { ("defenderZone", targetZone.ToString()) });

        ExecuteAutomaticWhenAttackingEffects(instance, playerId, attacker, sequentialEffectExecutor)
            .ToList()
            .ForEach(failure => RecordSkippedWhenAttackingEffect(instance, playerId, attacker, failure));

        if (TryPrepareOptionalWhenAttackingChoice(instance, playerId, attacker))
        {
            instance.State.Phase = GamePhase.AttackDeclaration;
            instance.State.PriorityPlayerId = string.Empty;
            instance.State.ConsecutivePasses = 0;
            return;
        }

        EnterSupportCutInWindow(instance.State, defenderPlayer.PlayerId);
    }

    /// <summary>
    /// Runs the mandatory "When Attacking" effects of the attacker. Failures are reported back to the
    /// caller instead of thrown: an unsupported effect (for example a chain whose branch target is
    /// missing, or an effect that needs targets the attack step cannot collect yet) must not abort the
    /// attack after the attacker was already rested, because that leaves the game half-mutated with no
    /// way for either client to continue.
    /// </summary>
    private static IReadOnlyList<string> ExecuteAutomaticWhenAttackingEffects(
        GameInstance instance,
        string actingPlayerId,
        CardInstance attacker,
        IGameSequentialEffectExecutor sequentialEffectExecutor)
    {
        if (instance.State.CardDefinitions.TryGetValue(attacker.CardDefinitionId, out var attackerDefinition))
        {
            return ExecuteAutomaticWhenAttackingEffectsForSource(
                instance,
                actingPlayerId,
                sourceCardDefinition: attackerDefinition,
                sourceCardInstance: attacker,
                sequentialEffectExecutor);
        }

        return [];
    }

    private static bool TryPrepareOptionalWhenAttackingChoice(GameInstance instance, string actingPlayerId, CardInstance attacker)
    {
        if (!instance.State.CardDefinitions.TryGetValue(attacker.CardDefinitionId, out var attackerDefinition))
        {
            return false;
        }

        var optionalEffect = attackerDefinition.Effects.FirstOrDefault(effect =>
            effect.Timing == EffectTiming.WhenAttacking && effect.IsOptional);

        if (optionalEffect is null)
        {
            ClearPendingOptionalAttackEffectState(instance.State);
            return false;
        }

        instance.State.PendingAttackOptionalEffectSourceCardInstanceId = attacker.InstanceId;
        instance.State.PendingAttackOptionalEffectId = ResolveEffectKey(optionalEffect, 0);
        instance.State.PendingAttackOptionalEffectPlayerId = actingPlayerId;
        return true;
    }

    private static void ExecuteResolveOptionalAttackEffectAction(
        GameInstance instance,
        string playerId,
        GameCardActionExecutionRequest request,
        IGameSequentialEffectExecutor sequentialEffectExecutor)
    {
        if (!TryParseResolveOptionalAttackEffectActionId(request.ActionId, out var sourceCardInstanceId, out var decision))
        {
            throw new InvalidOperationException($"Card action '{request.ActionId}' is invalid.");
        }

        if (!string.Equals(sourceCardInstanceId, instance.State.PendingAttackOptionalEffectSourceCardInstanceId, StringComparison.Ordinal)
            || !IsSamePlayerId(playerId, instance.State.PendingAttackOptionalEffectPlayerId))
        {
            throw new InvalidOperationException("Optional attack effect choice does not match pending attack context.");
        }

        if (string.Equals(decision, "yes", StringComparison.Ordinal))
        {
            var actingPlayer = instance.State.Players.FirstOrDefault(player =>
                IsSamePlayerId(player.PlayerId, playerId));

            var sourceCardInstance = actingPlayer?.Battlefield.FirstOrDefault(card =>
                string.Equals(card.InstanceId, sourceCardInstanceId, StringComparison.Ordinal));

            if (sourceCardInstance is not null
                && instance.State.CardDefinitions.TryGetValue(sourceCardInstance.CardDefinitionId, out var sourceCardDefinition))
            {
                var effectWithIndex = sourceCardDefinition.Effects
                    .Select((effect, index) => new { Effect = effect, Index = index })
                    .FirstOrDefault(entry =>
                        entry.Effect.Timing == EffectTiming.WhenAttacking
                        && entry.Effect.IsOptional
                        && string.Equals(ResolveEffectKey(entry.Effect, entry.Index), instance.State.PendingAttackOptionalEffectId, StringComparison.Ordinal));

                if (effectWithIndex is not null)
                {
                    var arguments = new Dictionary<string, string>(StringComparer.Ordinal)
                    {
                        [ReactiveEffectExecutionConstants.ActiveEffectSpecIdArgument] = string.IsNullOrWhiteSpace(effectWithIndex.Effect.Id)
                            ? effectWithIndex.Effect.RuntimeEffectType.ToString()
                            : effectWithIndex.Effect.Id,
                    };

                    var singleEffectDefinition = GameTriggeredEffectRunner.CloneCardDefinitionWithEffectChain(sourceCardDefinition, effectWithIndex.Effect);

                    var context = new GameCardEffectContext(
                        game: instance,
                        actingPlayer: new Player { Id = playerId },
                        sourceCardDefinition: singleEffectDefinition,
                        sourceCardInstance: sourceCardInstance,
                        arguments: arguments,
                        selectedTargets: []);

                    var executeResult = sequentialEffectExecutor.Execute(context);
                    if (executeResult.IsError)
                    {
                        var firstError = executeResult.FirstError;
                        RecordSkippedWhenAttackingEffect(
                            instance,
                            playerId,
                            sourceCardInstance,
                            $"{effectWithIndex.Effect.Id}: {firstError.Code} - {firstError.Description}");
                    }
                }
            }
        }

        var optionalChoicePlayer = instance.State.Players.FirstOrDefault(player =>
            IsSamePlayerId(player.PlayerId, playerId));
        var optionalChoiceSource = optionalChoicePlayer?.Battlefield.FirstOrDefault(card =>
            string.Equals(card.InstanceId, sourceCardInstanceId, StringComparison.Ordinal));
        var optionalChoiceDefinition = optionalChoiceSource is not null
            && instance.State.CardDefinitions.TryGetValue(optionalChoiceSource.CardDefinitionId, out var resolvedOptionalChoiceDefinition)
                ? resolvedOptionalChoiceDefinition
                : null;
        var isOptionalChoiceAccepted = string.Equals(decision, "yes", StringComparison.Ordinal);

        LogBoardAction(
            instance,
            GameActionLogActionTypes.OptionalAttackEffectAnswered,
            playerId,
            isOptionalChoiceAccepted
                ? "The optional when-attacking effect was used."
                : "The optional when-attacking effect was declined.",
            GameActionLogCategory.Action,
            sourceCardInstance: optionalChoiceSource,
            sourceCardDefinition: optionalChoiceDefinition,
            extraMetadata: new[] { ("decision", decision) });

        var defenderPlayerId = instance.State.PendingAttackDefenderPlayerId;
        ClearPendingOptionalAttackEffectState(instance.State);
        EnterSupportCutInWindow(instance.State, defenderPlayerId);
    }

    private static bool TryParseResolveOptionalAttackEffectActionId(string actionId, out string sourceCardInstanceId, out string decision)
    {
        sourceCardInstanceId = string.Empty;
        decision = string.Empty;

        if (!actionId.StartsWith(ResolveOptionalAttackEffectActionPrefix, StringComparison.Ordinal))
        {
            return false;
        }

        var payload = actionId[ResolveOptionalAttackEffectActionPrefix.Length..].Trim();
        var delimiterIndex = payload.IndexOf(':');
        if (delimiterIndex <= 0 || delimiterIndex >= payload.Length - 1)
        {
            return false;
        }

        sourceCardInstanceId = payload[..delimiterIndex].Trim();
        decision = payload[(delimiterIndex + 1)..].Trim();
        return !string.IsNullOrWhiteSpace(sourceCardInstanceId)
            && (string.Equals(decision, "yes", StringComparison.Ordinal) || string.Equals(decision, "no", StringComparison.Ordinal));
    }

    /// <summary>
    /// Records one published board action.
    ///
    /// The metadata keys written here are the ones <see cref="GameStateResponseMapper"/> lifts into
    /// <see cref="ActionLogEntryResponse"/>, so the client can phrase the entry from the action type and the card
    /// it names instead of parsing <see cref="GameActionLogEntry.Message"/>. The phase and turn are always
    /// attached because the log panel groups by them.
    /// </summary>
    private static void LogBoardAction(
        GameInstance instance,
        string actionType,
        string playerId,
        string message,
        GameActionLogCategory category,
        CardInstance? sourceCardInstance = null,
        Card? sourceCardDefinition = null,
        CardInstance? targetCardInstance = null,
        Card? targetCardDefinition = null,
        GameActionLogVisibility visibility = GameActionLogVisibility.Public,
        (string Key, string Value)[]? extraMetadata = null)
    {
        var metadata = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["phase"] = instance.State.Phase.ToString(),
            ["turnNumber"] = instance.State.TurnNumber.ToString(System.Globalization.CultureInfo.InvariantCulture),
        };

        if (sourceCardInstance is not null)
        {
            metadata["cardInstanceId"] = sourceCardInstance.InstanceId;
        }

        if (sourceCardDefinition is not null)
        {
            metadata["cardDefinitionId"] = sourceCardDefinition.Id;
            metadata["displayName"] = sourceCardDefinition.DisplayName;
        }

        if (targetCardInstance is not null)
        {
            metadata["targetInstanceId"] = targetCardInstance.InstanceId;
        }

        if (targetCardDefinition is not null)
        {
            metadata["targetDisplayName"] = targetCardDefinition.DisplayName;
        }

        if (extraMetadata is not null)
        {
            foreach (var (key, value) in extraMetadata)
            {
                metadata[key] = value;
            }
        }

        instance.AddActionLogEntry(
            actionType,
            message,
            // A request may carry an equivalent GUID form (stripped hyphens, for instance), which the action paths
            // accept on purpose. The log stores the player the game actually knows, so attribution and the
            // owner-only filter keep working.
            ResolveCanonicalPlayerId(instance, playerId),
            metadata,
            category: category,
            visibility: visibility);
    }

    private static string ResolveCanonicalPlayerId(GameInstance instance, string playerId)
    {
        if (string.IsNullOrWhiteSpace(playerId))
        {
            return string.Empty;
        }

        var player = instance.State.Players.FirstOrDefault(candidate =>
            IsSamePlayerId(candidate.PlayerId, playerId));

        return player?.PlayerId ?? playerId;
    }

    private static void EnterSupportCutInWindow(GameState state, string defenderPlayerId)
    {
        state.Phase = GamePhase.ActionStep;
        state.PriorityPlayerId = defenderPlayerId;
        state.ConsecutivePasses = 0;
    }

    private static void ClearPendingOptionalAttackEffectState(GameState state)
    {
        state.PendingAttackOptionalEffectSourceCardInstanceId = string.Empty;
        state.PendingAttackOptionalEffectId = string.Empty;
        state.PendingAttackOptionalEffectPlayerId = string.Empty;
    }

    private static IReadOnlyList<string> ExecuteAutomaticWhenAttackingEffectsForSource(
        GameInstance instance,
        string actingPlayerId,
        Card sourceCardDefinition,
        CardInstance? sourceCardInstance,
        IGameSequentialEffectExecutor sequentialEffectExecutor)
    {
        return GameTriggeredEffectRunner.ExecuteAutomaticTimedEffects(
            instance,
            actingPlayerId,
            sourceCardDefinition,
            sourceCardInstance,
            EffectTiming.WhenAttacking,
            sequentialEffectExecutor);
    }

    /// <summary>
    /// Records an unsupported / failing "When Attacking" effect instead of failing the whole attack.
    /// The attack sequence always continues (attacker rested, cut-in window opened), so a single
    /// effect the engine or UI cannot process yet cannot strand both players on a stale snapshot.
    /// </summary>
    private static void RecordSkippedWhenAttackingEffect(
        GameInstance instance,
        string playerId,
        CardInstance? attacker,
        string failure)
    {
        GameTriggeredEffectRunner.RecordSkippedTriggeredEffect(
            instance,
            playerId,
            attacker,
            EffectTiming.WhenAttacking,
            failure);
    }

    // Attackers always fight with their current (effect-modified) stats so battle damage matches the
    // values the client is shown. Leaders keep their power/damage on the leader instance.
    private static int ResolveAttackPower(GameInstance instance, CardInstance attacker, Card attackerDefinition)
    {
        return attacker is LeaderCardInstanceState leaderAttacker
            ? CardRuntimeEffectStateService.ResolveEffectiveLeaderPower(instance.State, leaderAttacker)
            : CardRuntimeEffectStateService.ResolveEffectivePower(instance.State, attacker, attackerDefinition);
    }

    private static int ResolveAttackDamage(GameInstance instance, CardInstance attacker, Card attackerDefinition)
    {
        return attacker is LeaderCardInstanceState leaderAttacker
            ? CardRuntimeEffectStateService.ResolveEffectiveLeaderDamage(instance.State, leaderAttacker)
            : CardRuntimeEffectStateService.ResolveEffectiveDamage(instance.State, attacker, attackerDefinition);
    }

    private static void ResolveLeaderAttack(GameInstance instance, CardInstance attacker, PlayerState defenderPlayer)
    {
        var leader = defenderPlayer.LeaderCardInstance
            ?? throw new InvalidOperationException("Defender leader is missing.");

        if (!instance.State.CardDefinitions.TryGetValue(attacker.CardDefinitionId, out var attackerDefinition))
        {
            throw new InvalidOperationException($"Card definition '{attacker.CardDefinitionId}' was not found.");
        }

        var attackDamage = ResolveAttackDamage(instance, attacker, attackerDefinition);
        leader.CurrentLife = Math.Max(0, leader.CurrentLife - attackDamage);
    }

    private void ResolveCharacterAttack(
        GameInstance instance,
        CardInstance attacker,
        PlayerState defenderPlayer,
        CardInstance defender)
    {
        if (!instance.State.CardDefinitions.TryGetValue(attacker.CardDefinitionId, out var attackerDefinition))
        {
            throw new InvalidOperationException($"Card definition '{attacker.CardDefinitionId}' was not found.");
        }

        if (!instance.State.CardDefinitions.TryGetValue(defender.CardDefinitionId, out var defenderDefinition)
            || defenderDefinition is not CharacterCard defenderCharacterDefinition)
        {
            throw new InvalidOperationException($"Card definition '{defender.CardDefinitionId}' was not found or is not a character.");
        }

        var attackerPower = ResolveAttackPower(instance, attacker, attackerDefinition);
        // Health is max health minus damage taken this turn, so the max has to be the effective value.
        var defenderMaxHealth = CardRuntimeEffectStateService.ResolveEffectiveHealth(
            instance.State,
            defender,
            defenderCharacterDefinition);
        var defenderCurrentHealth = defender.CurrentHealth ?? defenderMaxHealth;
        var nextHealth = defenderCurrentHealth - attackerPower;
        defender.CurrentHealth = nextHealth;

        if (nextHealth > 0)
        {
            return;
        }

        runtimeDeckService.MoveCardToZone(
            instance,
            defenderPlayer.PlayerId,
            PlayerZone.CharacterField,
            PlayerZone.Trash,
            defender.InstanceId);
    }

    private static bool HasAnyMainPhaseLegalAction(GameInstance instance)
    {
        // A finished game has no legal MainPhase action, whatever is left on the board.
        if (GameEndRules.IsGameOver(instance.State))
        {
            return false;
        }

        if (instance.State.Phase != GamePhase.MainPhase)
        {
            return true;
        }

        var activePlayer = instance.State.Players.FirstOrDefault(player =>
            IsSamePlayerId(player.PlayerId, instance.State.ActivePlayerId));
        if (activePlayer is null)
        {
            return false;
        }

        var hasHandAction = activePlayer.Hand.Any(card =>
        {
            if (!instance.State.CardDefinitions.TryGetValue(card.CardDefinitionId, out var definition))
            {
                return false;
            }

            if (definition.Type is CardType.Chakra or CardType.Summon or CardType.Leader)
            {
                return false;
            }

            if (definition.CannotBeNormalSummoned)
            {
                return CanExecuteSummonRequirement(instance, activePlayer.PlayerId, card, definition) || IsSupportCapable(definition);
            }

            return instance.State.IsSummonCardReady(activePlayer.PlayerId) || IsSupportCapable(definition);
        });

        if (hasHandAction)
        {
            return true;
        }

        // An activatable support already set in the support area is a legal MainPhase action. Without
        // this a player whose only play is a set support would be auto-ended out of their MainPhase,
        // even though the support zone publishes an enabled support chip for them.
        if (activePlayer.SupportZone.Any(card => CanActivateSupportNow(instance, activePlayer.PlayerId, card)))
        {
            return true;
        }

        // A battlefield character's own "[Activate: Main]" ability (N-011) is a legal MainPhase action too.
        // Without this a player whose only play is that ability would be auto-ended out of their MainPhase
        // while the card publishes an enabled `character-ability:` chip.
        if (activePlayer.Battlefield.Any(card => CanActivateCardAbilityNow(instance, activePlayer.PlayerId, card)))
        {
            return true;
        }

        // A card only counts as a legal action when it can actually declare battle: active, able to
        // attack, and past summon sickness unless it has Rush. Leaders rest but never exhaust
        // (exhaustion marks a card that left play) and are always on the field.
        if (activePlayer.Battlefield.Any(card => BattleActionRules.CanDeclareBattleAction(instance.State, card)))
        {
            return true;
        }

        var leader = activePlayer.LeaderCardInstance;
        return leader is not null
            && BattleActionRules.CanDeclareBattleAction(instance.State, leader, isLeader: true);
    }

    /// <summary>
    /// Cheap legality probe for the MainPhase auto-end check: an activation must have an entry effect,
    /// an open timing window, no spent once-per-turn restriction and enough chakra. Target availability
    /// is checked by the submit path (and by the mapper when it publishes the chip); this probe exists so
    /// a set support is not silently skipped as "no legal action".
    /// </summary>
    private static bool CanActivateSupportNow(GameInstance instance, string playerId, CardInstance card)
    {
        if (!instance.State.CardDefinitions.TryGetValue(card.CardDefinitionId, out var definition))
        {
            return false;
        }

        var entryEffect = SupportActivationPlanner.ResolveEntry(definition);
        if (entryEffect is null)
        {
            return false;
        }

        if (!SupportTimingRules.IsTimingAvailable(entryEffect.Timing, instance.State, playerId, isFromSupportZone: true))
        {
            return false;
        }

        var effectKey = ResolveEffectKey(entryEffect, effectIndex: 0);
        if (entryEffect.GlobalRestrictions == EffectRestrictions.OncePerTurn
            && instance.State.IsEffectUsedThisTurn(playerId, card.InstanceId, effectKey))
        {
            return false;
        }

        var activationCost = SupportActivationPlanner.ResolveActivationCost(entryEffect);
        var actingPlayer = instance.State.Players.FirstOrDefault(player => IsSamePlayerId(player.PlayerId, playerId));
        return activationCost <= 0 || (actingPlayer is not null && actingPlayer.ResourcePool >= activationCost);
    }

    /// <summary>
    /// Cheap legality probe for the MainPhase auto-end check: the card publishes at least one independently
    /// activatable ability (the same shape gate the chip builder and the executor use) whose timing window is
    /// open, whose once-per-turn restriction is unspent and whose context rules (N-011's "if you have
    /// [Shikamaru Nara] and [Choji Akimichi] on the field") can execute. Target availability is checked by the
    /// submit path and by the mapper's chip; this probe exists so a battlefield ability is not silently skipped
    /// as "no legal action".
    /// </summary>
    private static bool CanActivateCardAbilityNow(GameInstance instance, string playerId, CardInstance card)
    {
        if (!instance.State.CardDefinitions.TryGetValue(card.CardDefinitionId, out var definition))
        {
            return false;
        }

        foreach (var entry in definition.Effects.Select((effect, index) => new { Effect = effect, Index = index }))
        {
            if (!CardAbilityTimingRules.IsIndependentlyActivatableAbility(entry.Effect)
                || !CardAbilityTimingRules.IsAbilityTimingAvailable(entry.Effect.Timing, instance.State, playerId))
            {
                continue;
            }

            var effectKey = ResolveEffectKey(entry.Effect, entry.Index);
            if (entry.Effect.GlobalRestrictions == EffectRestrictions.OncePerTurn
                && instance.State.IsEffectUsedThisTurn(playerId, card.InstanceId, effectKey))
            {
                continue;
            }

            var context = new GameCardEffectContext(
                game: instance,
                actingPlayer: new Player { Id = playerId },
                sourceCardDefinition: definition,
                sourceCardInstance: card,
                arguments: new Dictionary<string, string>(StringComparer.Ordinal),
                selectedTargets: []);

            if (EffectCanExecuteEvaluator.Evaluate(context, entry.Effect, includeValidTargets: false).CanExecute)
            {
                return true;
            }
        }

        return false;
    }

    private void ApplyPendingAttackResolutionIfNeeded(GameInstance instance, GamePhase previousPhase)
    {
        if (instance.State.Phase != GamePhase.AttackResolution)
        {
            return;
        }

        if (!instance.State.HasPendingAttack)
        {
            return;
        }

        // AttackResolution is the damage step in the current sequence model.
        ApplyPendingAttackDamage(instance);
    }

    private void ApplyPendingAttackDamage(GameInstance instance)
    {
        var attacker = FindCardInstanceWithOwner(instance.State, instance.State.PendingAttackAttackerInstanceId)?.Card;

        if (attacker is null)
        {
            ClearPendingAttackState(instance.State);
            return;
        }

        var defenderPlayer = instance.State.Players.FirstOrDefault(player =>
            string.Equals(player.PlayerId, instance.State.PendingAttackDefenderPlayerId, StringComparison.Ordinal));
        if (defenderPlayer is null)
        {
            ClearPendingAttackState(instance.State);
            return;
        }

        var defenderZone = instance.State.PendingAttackDefenderZone;
        if (defenderZone == PlayerZone.Leader)
        {
            ResolveLeaderAttack(instance, attacker, defenderPlayer);
            ClearPendingAttackState(instance.State);
            return;
        }

        if (defenderZone != PlayerZone.CharacterField)
        {
            ClearPendingAttackState(instance.State);
            return;
        }

        var defender = defenderPlayer.Battlefield.FirstOrDefault(card =>
            string.Equals(card.InstanceId, instance.State.PendingAttackDefenderInstanceId, StringComparison.Ordinal));
        if (defender is null)
        {
            ClearPendingAttackState(instance.State);
            return;
        }

        ResolveCharacterAttack(instance, attacker, defenderPlayer, defender);
        ClearPendingAttackState(instance.State);
    }

    private static void ClearPendingAttackState(GameState state)
    {
        state.HasPendingAttack = false;
        state.PendingAttackDeclarationId = string.Empty;
        state.PendingAttackAttackerInstanceId = string.Empty;
        state.PendingAttackDefenderPlayerId = string.Empty;
        state.PendingAttackDefenderInstanceId = string.Empty;
        state.PendingAttackDefenderZone = null;
        ClearPendingOptionalAttackEffectState(state);
    }

    /// <summary>
    /// Walks the phases the engine owns (<see cref="GamePhaseData.ShouldAutoAdvance"/>), one step at a time,
    /// stopping wherever the board owes somebody something: a prompt, an unacknowledged phase presentation, an
    /// interactive phase or the end of the game. With the automation switched off this does nothing, and the
    /// client keeps driving those phases as it did before the presentation contract existed.
    ///
    /// A phase that produced something a client animates mints a <see cref="PendingPhasePresentation"/> for the
    /// connected participants and stops, so the acknowledgement decides when the next step happens; a phase
    /// with nothing to show is walked straight through.
    /// </summary>
    private void DrainIdlePhases(
        GameInstance instance,
        IGameReactiveEffectOrchestrator? reactiveEffectOrchestrator = null,
        IGameSequentialEffectExecutor? sequentialEffectExecutor = null,
        bool phaseAlreadyPresented = false)
    {
        if (!phaseAutomation.Enabled)
        {
            return;
        }

        var stepBudget = Math.Max(phaseAutomation.MaxDrainSteps, 1);

        for (var step = 0; step < stepBudget; step++)
        {
            if (!CanDrainPhase(instance))
            {
                return;
            }

            // The phase the engine is sitting in - entered by the mutation that called us, or by the previous
            // step - may be one a client has to present before anything else happens (EndStep's turn swap, the
            // damage step, a draw). A phase whose presentation was just acknowledged is skipped instead: it has
            // been presented, so the engine may now leave it.
            if (phaseAlreadyPresented)
            {
                phaseAlreadyPresented = false;
            }
            else
            {
                var currentPhaseData = phaseService.GetPhaseData(instance.State.Phase);
                if (currentPhaseData.PresentationKind != PhasePresentationKind.None
                    && PhaseHasSomethingToPresent(instance, currentPhaseData.PresentationKind)
                    && TryMintPresentation(instance, currentPhaseData.PresentationKind))
                {
                    return;
                }
            }

            var previousPhase = instance.State.Phase;
            phaseService.AdvancePhase(instance);

            // Leaving the cut-in ActionStep closes the window, so anything still pending resolves now. The drain
            // never walks out of ActionStep (it is interactive), so this stays a safety net for a phase graph
            // change rather than a path in use.
            if (previousPhase == GamePhase.ActionStep)
            {
                ResolvePendingActivations(instance, sequentialEffectExecutor);
            }

            ApplyPendingAttackResolutionIfNeeded(instance, previousPhase);
            SweepContinuousPassives(instance, reactiveEffectOrchestrator);
            AutoAdvanceMainPhaseIfNoLegalActions(instance);

            if (GameEndRules.IsGameOver(instance.State))
            {
                // A phase entry can end the game (a deck-out during the draw): the result overlay is the only
                // affordance left, so nothing is presented and nothing is owed.
                instance.ClearPhasePresentation();
                return;
            }
        }

        if (!CanDrainPhase(instance))
        {
            // The loop ended because the engine reached a phase somebody owns (or has something to wait for),
            // which is the normal exit.
            return;
        }

        // Not reaching a phase a player owns inside the budget means the phase graph is looping, which would
        // otherwise hold the instance lock for good. Leave a trace instead of throwing: the table keeps the last
        // state and a client can still act on it.
        instance.AddActionLogEntry(
            actionType: "phase_automation_budget_exhausted",
            message: $"The phase automation took {stepBudget} steps without reaching a phase a player owns.",
            metadata: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["phase"] = instance.State.Phase.ToString(),
                ["maxDrainSteps"] = stepBudget.ToString(System.Globalization.CultureInfo.InvariantCulture),
            });
    }

    /// <summary>
    /// Whether the engine may take another step right now: the phase has to be one it owns, and nothing may be
    /// waiting on a player (a prompt, an open support window) or on a client (an outstanding presentation).
    /// </summary>
    private bool CanDrainPhase(GameInstance instance)
    {
        if (instance.PendingPhasePresentation is not null || instance.GetPendingPrompt() is not null)
        {
            return false;
        }

        if (GameEndRules.IsGameOver(instance.State))
        {
            return false;
        }

        if (SupportTimingRules.HasPendingSupportActivation(instance.State))
        {
            // An open support window is a decision, even in a phase the engine otherwise owns.
            return false;
        }

        return phaseService.GetPhaseData(instance.State.Phase).ShouldAutoAdvance;
    }

    /// <summary>
    /// Whether the current stop is worth parking the table for. The "Ready" presentation exists to show rested
    /// cards standing back up, so a RefreshPhase that readied nothing is walked straight through instead of
    /// costing the clients a whole acknowledgement round trip for a transition with nothing to show. Every other
    /// kind has something to present.
    /// </summary>
    private static bool PhaseHasSomethingToPresent(GameInstance instance, PhasePresentationKind kind)
    {
        return kind != PhasePresentationKind.Ready || instance.State.LastPhaseEntryChangedAnything;
    }

    /// <summary>
    /// Stops the drain on the current phase for the connected participants. Returns false when nobody is
    /// watching: there is nobody to present it to, so the drain keeps walking and a client that connects later
    /// simply pulls the state it missed without animating the transitions in between.
    /// </summary>
    private bool TryMintPresentation(GameInstance instance, PhasePresentationKind kind)
    {
        var requiredAckPlayerIds = presenceTracker?.GetConnectedPlayerIds(instance.Id) ?? [];
        if (requiredAckPlayerIds.Count == 0)
        {
            return false;
        }

        var presentation = instance.MintPhasePresentation(kind, requiredAckPlayerIds);
        ArmPresentationWatchdog(instance.Id, presentation.PresentationId);
        return true;
    }

    /// <summary>
    /// Arms the "acknowledgements never arrived" watchdog. It is what keeps a hung, reloading or disconnected
    /// client from stranding the table: the transition is already on screen, so the engine resumes and a late
    /// acknowledgement is ignored instead of replayed.
    /// </summary>
    private void ArmPresentationWatchdog(string gameId, string presentationId)
    {
        ClearPresentationWatchdog(gameId);

        if (phaseAutomation.PresentationAckTimeoutMs <= 0)
        {
            return;
        }

        var watchdog = timeProvider.CreateTimer(
            callback: _ => ResumeAfterPresentationTimeout(gameId, presentationId),
            state: null,
            dueTime: TimeSpan.FromMilliseconds(phaseAutomation.PresentationAckTimeoutMs),
            period: Timeout.InfiniteTimeSpan);

        presentationWatchdogs[gameId] = watchdog;
    }

    private void ClearPresentationWatchdog(string gameId)
    {
        if (presentationWatchdogs.TryRemove(gameId, out var watchdog))
        {
            watchdog.Dispose();
        }
    }

    /// <summary>
    /// The watchdog fired: nobody acknowledged the presentation in time. Resuming changes the state outside any
    /// hub call, so the clients are told to pull it again through the broadcaster.
    /// </summary>
    private void ResumeAfterPresentationTimeout(string gameId, string presentationId)
    {
        ClearPresentationWatchdog(gameId);

        if (!instances.TryGetValue(gameId, out var instance) || instance is null)
        {
            return;
        }

        var didResume = false;

        lock (instance)
        {
            var presentation = instance.PendingPhasePresentation;
            if (presentation is null
                || !string.Equals(presentation.PresentationId, presentationId, StringComparison.Ordinal))
            {
                // Acknowledged, or superseded, in the meantime: nothing is owed any more.
                return;
            }

            instance.AddActionLogEntry(
                actionType: "phase_presentation_timed_out",
                message: $"Phase {presentation.Phase} presentation was not acknowledged within "
                    + $"{phaseAutomation.PresentationAckTimeoutMs} ms.",
                metadata: new Dictionary<string, string>(StringComparer.Ordinal)
                {
                    ["presentationId"] = presentation.PresentationId,
                    ["presentationKind"] = presentation.Kind.ToString(),
                    ["phase"] = presentation.Phase.ToString(),
                    ["requiredAckPlayerIds"] = string.Join(",", presentation.RequiredAckPlayerIds),
                    ["acknowledgedPlayerIds"] = string.Join(",", presentation.AcknowledgedPlayerIds),
                });

            instance.ClearPhasePresentation();
            // The phase that was presented is the one to leave now: re-presenting it would loop.
            DrainIdlePhases(instance, phaseAlreadyPresented: true);
            instance.ValidateInvariants();
            EvaluateGameEnd(instance);
            SyncClock(instance);
            didResume = true;
        }

        if (didResume)
        {
            NotifyStateInvalidated(instance.Id);
        }
    }

    /// <summary>
    /// Records one participant's acknowledgement and takes the next phase step once every required player has
    /// presented. An acknowledgement for a superseded or expired presentation - or from a player who was never
    /// required - is ignored: neither is something a player should ever see an error for.
    /// </summary>
    public GameInstance AcknowledgePhasePresentation(string gameId, string playerId, string presentationId)
    {
        var instance = GetRequired(gameId);

        lock (instance)
        {
            GameEndRules.ThrowIfGameOver(instance.State);

            if (!instance.AcknowledgePhasePresentation(presentationId, playerId))
            {
                return instance;
            }

            if (instance.PendingPhasePresentation is { IsSatisfied: true })
            {
                ClearPresentationWatchdog(instance.Id);
                instance.ClearPhasePresentation();
                DrainIdlePhases(instance, phaseAlreadyPresented: true);
                instance.ValidateInvariants();
                EvaluateGameEnd(instance);
                // The drain may have landed on an interactive phase somebody now owes an answer in: that is the
                // stop the clock resumes on, and its budget starts fresh rather than counting the ack wait.
                SyncClock(instance);
            }

            return instance;
        }
    }

    /// <summary>
    /// Drops a participant who is no longer connected from the outstanding presentation, so a closed tab can
    /// never hold the table until the watchdog fires. When that lets the engine resume, the clients are notified
    /// here: this path has no hub mutation of its own to carry the notification.
    /// </summary>
    public GameInstance ReleasePhasePresentationRequirement(string gameId, string playerId)
    {
        var instance = GetRequired(gameId);
        var didResume = false;

        lock (instance)
        {
            if (!instance.ReleasePhasePresentationRequirement(playerId)
                || instance.PendingPhasePresentation is not { IsSatisfied: true })
            {
                return instance;
            }

            ClearPresentationWatchdog(instance.Id);
            instance.ClearPhasePresentation();
            DrainIdlePhases(instance, phaseAlreadyPresented: true);
            instance.ValidateInvariants();
            EvaluateGameEnd(instance);
            SyncClock(instance);
            didResume = true;
        }

        if (didResume)
        {
            NotifyStateInvalidated(instance.Id);
        }

        return instance;
    }

    /// <summary>
    /// Ends the game on the player's own request: they lose, the opponent wins. It goes through the same write-once
    /// forfeit resolution the clock uses, so the board is irrelevant, and it deliberately does not drain or wait for
    /// anything - a player who wants out must never be held by a transition, a presentation or the opponent's turn.
    ///
    /// A finished game is returned untouched: resigning twice, or resigning after the opponent already won, is not
    /// an error the client should ever have to handle.
    /// </summary>
    public GameInstance ForfeitGame(string gameId, string playerId)
    {
        var instance = GetRequired(gameId);

        lock (instance)
        {
            if (GameEndRules.IsGameOver(instance.State))
            {
                return instance;
            }

            if (!instance.State.Players.Any(player => IsSamePlayerId(player.PlayerId, playerId)))
            {
                throw new InvalidOperationException($"Player '{playerId}' was not found in game.");
            }

            // Nothing may outlive the game: the stop in progress, the presentation the clients owe an ack for, a
            // redo request nobody can answer now, and the watchdogs that would otherwise fire on a finished table.
            ClearClockWatchdog(instance.Id);
            ClearPresentationWatchdog(instance.Id);
            ClearRedoWatchdog(instance.Id);
            instance.ClearPhasePresentation();
            instance.ClearRedoRequest();
            instance.StopClock();

            GameEndRules.ResolveForfeit(instance.State, playerId, GameEndReason.Resigned);
            GameEndRules.EnsureGameEndLogged(instance);
            instance.ValidateInvariants();

            return instance;
        }
    }

    /// <summary>
    /// Tells the clients the state changed, for the changes that did not come from a hub call of their own (the
    /// presentation watchdog, a disconnecting participant).
    /// </summary>
    private void NotifyStateInvalidated(string gameId)
    {
        if (stateBroadcaster is null)
        {
            return;
        }

        _ = stateBroadcaster.NotifyGameStateInvalidatedAsync(gameId);
    }

    /// <summary>The action-log entry a stop's timeout is recorded with.</summary>
    private const string ClockTimedOutActionType = "clock_timed_out";

    /// <summary>
    /// Reconciles the action clock with the state the mutation just produced: seeds the clock, charges the player
    /// whose stop just ended, resets strikes for a player who answered, and re-arms the next stop's deadline.
    /// <paramref name="actingPlayerId"/> is whoever submitted the mutation (<c>null</c> for system-driven ones).
    /// </summary>
    private void SyncClock(GameInstance instance, string? actingPlayerId = null, bool forceRearm = false)
    {
        var now = timeProvider.GetUtcNow();
        var clock = instance.StartClock(ResolveClockPolicy(instance), timeProvider);

        if (!clock.IsEnabled || GameEndRules.IsGameOver(instance.State))
        {
            // Nothing is owed: an untimed ruleset never arms a timer, and a finished game has nobody left to time
            // out. Disarming here is what keeps a watchdog from resurrecting a finished table.
            clock.Stop();
            ClearClockWatchdog(instance.Id);
            return;
        }

        var result = clock.SyncTo(GameClockStopResolver.Resolve(instance), now, actingPlayerId, forceRearm);

        if (result.HasExhaustedPool)
        {
            // A spent pool is a loss: the player who ran out of time cannot win by refusing to play.
            GameEndRules.ResolveForfeit(instance.State, result.ExhaustedPlayerId!, GameEndReason.ClockExpired);
            GameEndRules.EnsureGameEndLogged(instance);
            clock.Stop();
            ClearClockWatchdog(instance.Id);
            return;
        }

        if (!result.Rearmed)
        {
            return;
        }

        if (clock.DeadlineUtc is { } deadline && clock.IsRunning)
        {
            ArmClockWatchdog(instance.Id, deadline, clock.DeadlineToken);
            return;
        }

        ClearClockWatchdog(instance.Id);
    }

    /// <summary>
    /// The policy a game runs under: its ruleset's snapshot (or the deployment default for an unbound game), with the
    /// host's "time relaxed" modifier applied last. This is the one place a modifier can change the clock, so the
    /// snapshot on the instance stays the only thing a running game is judged by.
    /// </summary>
    private GameClockPolicy ResolveClockPolicy(GameInstance instance)
    {
        var basePolicy = instance.Ruleset is { } binding
            ? clockOptions.Apply(binding.Clock)
            : clockOptions.DefaultPolicy;

        return instance.IsTimeRelaxed ? basePolicy.WithoutClock() : basePolicy;
    }

    /// <summary>
    /// Arms the stop's deadline. The timer carries the deadline token it was armed with, so a timer that fires
    /// after the stop moved on (an action re-armed it, the turn ended) is recognised as stale and ignored rather
    /// than ending a stop that is no longer in progress.
    /// </summary>
    private void ArmClockWatchdog(string gameId, DateTimeOffset deadlineUtc, long token)
    {
        ClearClockWatchdog(gameId);

        var delay = deadlineUtc - timeProvider.GetUtcNow();
        if (delay < TimeSpan.Zero)
        {
            delay = TimeSpan.Zero;
        }

        var watchdog = timeProvider.CreateTimer(
            callback: _ => OnClockDeadline(gameId, token),
            state: null,
            dueTime: delay,
            period: Timeout.InfiniteTimeSpan);

        clockWatchdogs[gameId] = watchdog;
    }

    private void ClearClockWatchdog(string gameId)
    {
        if (clockWatchdogs.TryRemove(gameId, out var watchdog))
        {
            watchdog.Dispose();
        }
    }

    /// <summary>
    /// The clock ran out on the player who owed the answer. Records the strike, ends the game if that was the
    /// ruleset's limit (or the player's pool is spent), and otherwise has the engine take its yield move for them
    /// and resume. The state changes outside any hub call, so the clients are told to pull it again.
    /// </summary>
    private void OnClockDeadline(string gameId, long token)
    {
        if (!instances.TryGetValue(gameId, out var instance) || instance is null)
        {
            ClearClockWatchdog(gameId);
            return;
        }

        var didChange = false;

        lock (instance)
        {
            var clock = instance.Clock;
            if (clock is null || !clock.IsRunning || clock.DeadlineToken != token)
            {
                // Superseded (an action re-armed the stop) or stopped: no deadline is owed.
                return;
            }

            var now = timeProvider.GetUtcNow();
            if (clock.DeadlineUtc is not { } deadline)
            {
                return;
            }

            if (now < deadline)
            {
                // A timer that fired early: wait out the remainder instead of ending a stop that is still live.
                ArmClockWatchdog(gameId, deadline, token);
                return;
            }

            if (GameEndRules.IsGameOver(instance.State))
            {
                clock.Stop();
                ClearClockWatchdog(gameId);
                return;
            }

            var ownerPlayerId = clock.OwningPlayerId!;
            var stopKind = clock.StopKind;
            var strikes = clock.RegisterTimeout(now);
            var forfeitLimit = clock.Policy.TimeoutsBeforeForfeit;
            var secondsLeftInPool = (int)Math.Ceiling(clock.RemainingPool(ownerPlayerId).TotalSeconds);
            var isPoolExhausted = secondsLeftInPool <= 0;

            instance.AddActionLogEntry(
                actionType: ClockTimedOutActionType,
                message: $"A player ran out of time in {instance.State.Phase}.",
                playerId: ownerPlayerId,
                metadata: new Dictionary<string, string>(StringComparer.Ordinal)
                {
                    ["phase"] = instance.State.Phase.ToString(),
                    ["turnNumber"] = instance.State.TurnNumber.ToString(System.Globalization.CultureInfo.InvariantCulture),
                    ["stopKind"] = stopKind.ToString(),
                    ["consecutiveTimeouts"] = strikes.ToString(System.Globalization.CultureInfo.InvariantCulture),
                    ["timeoutsBeforeForfeit"] = forfeitLimit.ToString(System.Globalization.CultureInfo.InvariantCulture),
                    ["secondsRemainingInPool"] = secondsLeftInPool.ToString(System.Globalization.CultureInfo.InvariantCulture),
                },
                category: GameActionLogCategory.Clock);

            if (isPoolExhausted || strikes >= forfeitLimit)
            {
                // Stalling or walking away is a loss, not a draw: the opponent wins whatever the board says.
                GameEndRules.ResolveForfeit(
                    instance.State,
                    ownerPlayerId,
                    isPoolExhausted ? GameEndReason.ClockExpired : GameEndReason.ForfeitByTimeout);
                GameEndRules.EnsureGameEndLogged(instance);
                clock.Stop();
                ClearClockWatchdog(gameId);
                instance.ValidateInvariants();
            }
            else
            {
                ApplyTimeoutYield(instance, ownerPlayerId);
                SweepContinuousPassives(instance, null);
                AutoAdvanceMainPhaseIfNoLegalActions(instance);
                DrainIdlePhases(instance);
                instance.ValidateInvariants();
                EvaluateGameEnd(instance);
                // forceRearm covers the case where the yield could not change the stop (nothing to yield from):
                // the same player is asked again with a full budget, and the strike they just earned stands.
                SyncClock(instance, forceRearm: true);
            }

            didChange = true;
        }

        if (didChange)
        {
            NotifyStateInvalidated(gameId);
        }
    }

    /// <summary>
    /// The only moves a timeout may make on a player's behalf: yield the stop or decline the choice. It never
    /// spends a resource, moves a card, declares an attack, activates a support or picks a target - a stop whose
    /// only answers change the board (an effect selection prompt) is left standing and the strike is the whole
    /// response, so an absent player forfeits while a present one loses nothing but time.
    /// </summary>
    private bool ApplyTimeoutYield(GameInstance instance, string ownerPlayerId)
    {
        var state = instance.State;

        if (instance.GetPendingPrompt() is { } prompt)
        {
            if (ResolveTimeoutPromptOption(prompt) is not { } safeOption)
            {
                return false;
            }

            var phaseBeforeResolve = state.Phase;
            instance.ResolvePrompt(ownerPlayerId, safeOption, resolvedByTimeout: true);

            if (ShouldAdvanceAfterPromptResolution(phaseBeforeResolve, instance.GetPendingPrompt()))
            {
                phaseService.AdvancePhase(instance);
            }

            return true;
        }

        if (state.Phase == GamePhase.MainPhase && SupportTimingRules.HasPendingSupportActivation(state))
        {
            phaseService.DeclarePassInSupportWindow(instance, ownerPlayerId);
            ResolvePendingActivations(instance, null);
            state.PriorityPlayerId = state.ActivePlayerId;
            return true;
        }

        switch (state.Phase)
        {
            case GamePhase.MainPhase:
                phaseService.DeclareEndStep(instance);
                return true;

            case GamePhase.ActionStep:
                var isCutInWindowClosed = phaseService.DeclarePassInActionStep(instance, ownerPlayerId);
                if (isCutInWindowClosed)
                {
                    ResolvePendingActivations(instance, null);
                    ApplyPendingAttackResolutionIfNeeded(instance, GamePhase.ActionStep);
                }

                return true;

            case GamePhase.AttackDeclaration when !string.IsNullOrWhiteSpace(state.PendingAttackOptionalEffectSourceCardInstanceId):
                var defenderPlayerId = state.PendingAttackDefenderPlayerId;
                ClearPendingOptionalAttackEffectState(state);
                EnterSupportCutInWindow(state, defenderPlayerId);
                return true;

            default:
                return false;
        }
    }

    /// <summary>
    /// The safe answer to a setup prompt: declining the mulligan keeps the hand the player was dealt, and choosing
    /// to go second takes no tempo. Every other prompt (an effect selection) needs a choice that changes the board,
    /// so it has no safe answer and returns null.
    /// </summary>
    private static string? ResolveTimeoutPromptOption(GamePrompt prompt)
    {
        return prompt.Type switch
        {
            GamePromptType.Mulligan => prompt.Options.FirstOrDefault(option =>
                string.Equals(option, "noMulligan", StringComparison.Ordinal)),
            GamePromptType.ChooseStartingPlayer => prompt.Options.FirstOrDefault(option =>
                string.Equals(option, "goSecond", StringComparison.Ordinal))
                ?? prompt.Options.FirstOrDefault(),
            _ => null
        };
    }

    private void AutoAdvanceMainPhaseIfNoLegalActions(GameInstance instance)
    {
        // A finished game has no phase left to auto-advance into.
        if (GameEndRules.IsGameOver(instance.State))
        {
            return;
        }

        if (instance.GetPendingPrompt() is not null)
        {
            return;
        }

        // An open support reaction window is not "no legal actions": the pending activation has to be
        // answered (or passed) before the MainPhase can be left.
        if (SupportTimingRules.HasPendingSupportActivation(instance.State))
        {
            return;
        }

        if (!HasAnyMainPhaseLegalAction(instance))
        {
            phaseService.DeclareEndStep(instance);
            phaseService.AdvancePhase(instance);
        }
    }

    /// <summary>
    /// Evaluates the game-end conditions at a mutation boundary, after the whole action (or effect chain)
    /// has been applied - a leader whose life reached 0 mid-chain must not leave the engine half-way
    /// through it. The outcome is written once; <see cref="GameEndRules.EnsureGameEndLogged"/> records it
    /// in the action log the first time it is observed.
    /// </summary>
    private static void EvaluateGameEnd(GameInstance instance)
    {
        GameEndRules.TryResolveLeaderDefeat(instance.State);
        GameEndRules.EnsureGameEndLogged(instance);
    }

    private void ExecuteSummonToFieldAction(
        GameInstance instance,
        string playerId,
        GameCardActionExecutionRequest request,
        PlayerState actingPlayer,
        IGameSequentialEffectExecutor? sequentialEffectExecutor = null)
    {
        var sourceCardInstanceId = request.SourceCardInstanceId;
        var sourceCardInstance = actingPlayer.Hand.FirstOrDefault(card =>
            string.Equals(card.InstanceId, sourceCardInstanceId, StringComparison.Ordinal));
        if (sourceCardInstance is null)
        {
            throw new InvalidOperationException(
                $"Hand card instance '{sourceCardInstanceId}' was not found for player '{playerId}'.");
        }

        if (!instance.State.CardDefinitions.TryGetValue(sourceCardInstance.CardDefinitionId, out var sourceCardDefinition))
        {
            throw new InvalidOperationException(
                $"Card definition '{sourceCardInstance.CardDefinitionId}' was not found.");
        }

        if (sourceCardDefinition.Type is CardType.Chakra or CardType.Summon or CardType.Leader)
        {
            throw new InvalidOperationException(
                $"Card '{sourceCardDefinition.Id}' cannot be summoned to the battlefield from hand.");
        }

        var requiresReadySummonCard = !sourceCardDefinition.CannotBeNormalSummoned;
        if (requiresReadySummonCard && !instance.State.IsSummonCardReady(playerId))
        {
            throw new InvalidOperationException("Your summon card is rested.");
        }

        if (sourceCardDefinition.CannotBeNormalSummoned)
        {
            ExecuteSummonRequirementAction(
                instance,
                playerId,
                request,
                actingPlayer,
                sourceCardInstance,
                sourceCardDefinition,
                sequentialEffectExecutor);
            return;
        }

        var movedCard = MoveCardToZone(
            instance,
            playerId,
            sourceCardInstanceId,
            PlayerZone.Hand,
            PlayerZone.CharacterField,
            destinationIndex: null);

        // MoveCardToZone already reset the card's runtime state on field entry (see CharacterFieldStateRules),
        // so it lands standing - no per-call IsRested bookkeeping is needed here.

        if (requiresReadySummonCard)
        {
            instance.State.SetSummonCardReady(playerId, false);
        }

        // The card is on the field, so naming it publicly leaks nothing: the summon is what revealed it.
        LogBoardAction(
            instance,
            GameActionLogActionTypes.CardSummoned,
            playerId,
            $"{sourceCardDefinition.DisplayName} was summoned.",
            GameActionLogCategory.Action,
            sourceCardInstance: movedCard,
            sourceCardDefinition: sourceCardDefinition);

        // The card is on the field now, so its mandatory "[On Summon]" effects run. Failures are logged,
        // never thrown: the summon already happened and both clients have to keep moving.
        GameTriggeredEffectRunner.ExecuteAutomaticOnSummonEffects(instance, playerId, movedCard, sequentialEffectExecutor);
    }

    private void ExecuteSummonRequirementAction(
        GameInstance instance,
        string playerId,
        GameCardActionExecutionRequest request,
        PlayerState actingPlayer,
        CardInstance sourceCardInstance,
        Card sourceCardDefinition,
        IGameSequentialEffectExecutor? sequentialEffectExecutor = null)
    {
        var selectedTargets = request.SelectedTargets ?? [];
        if (selectedTargets.Count == 0)
        {
            throw new InvalidOperationException("Summon requirements require selecting tribute targets before summoning.");
        }

        if (!TryCreateSummonRequirementActionContext(
                instance,
                playerId,
                sourceCardInstance,
                sourceCardDefinition,
                request.Arguments,
                selectedTargets,
                out var context,
                out var effectSpec,
                out var failureResponse))
        {
            throw new InvalidOperationException(failureResponse!.DisabledReason ?? "Summon requirements are not currently satisfiable.");
        }

        var canExecuteEvaluator = new GameEffectCanExecuteEvaluator(
            new EffectContextConditionEvaluator(),
            new EffectTargetResolver(),
            new GameValidTargetResultFactory(),
            new GameEffectConditionDiagnostics());

        var hasTributeComposition = effectSpec!.TargetRules.TributeComposition is not null;
        var canExecuteResult = canExecuteEvaluator.Evaluate(context!, effectSpec!, includeValidTargets: !hasTributeComposition);
        if (!canExecuteResult.CanExecute)
        {
            throw new InvalidOperationException(canExecuteResult.FailedConditions.FirstOrDefault() ?? "Summon requirements are not currently satisfiable.");
        }

        var validTributeTargets = ResolveTributeMaterialTargets(context!, effectSpec!, canExecuteResult);
        if (!selectedTargets.All(selected => validTributeTargets.Any(valid =>
            string.Equals(valid.PlayerId, selected.PlayerId, StringComparison.Ordinal)
            && valid.Zone == selected.Zone
            && string.Equals(valid.CardInstanceId, selected.CardInstanceId, StringComparison.Ordinal))))
        {
            throw new InvalidOperationException("One or more selected tribute targets are invalid.");
        }

        foreach (var tributeTarget in selectedTargets)
        {
            runtimeDeckService.MoveCardToZone(
                instance,
                tributeTarget.PlayerId,
                tributeTarget.Zone,
                PlayerZone.Trash,
                tributeTarget.CardInstanceId);
        }

        var movedCard = MoveCardToZone(
            instance,
            playerId,
            sourceCardInstance.InstanceId,
            PlayerZone.Hand,
            PlayerZone.CharacterField,
            destinationIndex: null);

        // MoveCardToZone already reset the card's runtime state (see CharacterFieldStateRules): it lands standing
        // with a fresh summon-turn marker, so no extra bookkeeping is needed here.

        LogBoardAction(
            instance,
            GameActionLogActionTypes.CardSummonedWithRequirement,
            playerId,
            $"{sourceCardDefinition.DisplayName} was summoned by paying its requirement.",
            GameActionLogCategory.Action,
            sourceCardInstance: movedCard,
            sourceCardDefinition: sourceCardDefinition,
            extraMetadata: new[] { ("tributedCount", selectedTargets.Count.ToString(System.Globalization.CultureInfo.InvariantCulture)) });

        // A requirement (tribute) summon is a normal summon too: the card's mandatory "[On Summon]" effects
        // run as soon as it lands on the field.
        GameTriggeredEffectRunner.ExecuteAutomaticOnSummonEffects(instance, playerId, movedCard, sequentialEffectExecutor);
    }

    private void ExecuteSetSupportAction(
        GameInstance instance,
        string playerId,
        string sourceCardInstanceId,
        PlayerState actingPlayer,
        IReadOnlyDictionary<string, string> arguments)
    {
        var sourceCardInstance = actingPlayer.Hand.FirstOrDefault(card =>
            string.Equals(card.InstanceId, sourceCardInstanceId, StringComparison.Ordinal));
        if (sourceCardInstance is null)
        {
            throw new InvalidOperationException(
                $"Hand card instance '{sourceCardInstanceId}' was not found for player '{playerId}'.");
        }

        if (!instance.State.CardDefinitions.TryGetValue(sourceCardInstance.CardDefinitionId, out var sourceCardDefinition))
        {
            throw new InvalidOperationException(
                $"Card definition '{sourceCardInstance.CardDefinitionId}' was not found.");
        }

        if (!IsSupportCapable(sourceCardDefinition))
        {
            throw new InvalidOperationException(
                $"Card '{sourceCardDefinition.Id}' cannot be set to support zone.");
        }

        if (!TryResolveSupportSlotIndex(actingPlayer, arguments, out var slotIndex))
        {
            throw new InvalidOperationException("No empty support slot is available for this card.");
        }

        var movedSupportCard = MoveCardToZone(
            instance,
            playerId,
            sourceCardInstanceId,
            PlayerZone.Hand,
            PlayerZone.SupportZone,
            slotIndex);

        // The support lands face down, so the entry is public - the opponent watched a card appear in the support
        // area - but it deliberately does not name the card. Withholding the name is what keeps a face-down row
        // from becoming readable through the log.
        LogBoardAction(
            instance,
            GameActionLogActionTypes.SupportSet,
            playerId,
            "A support card was set face down.",
            GameActionLogCategory.Action,
            sourceCardInstance: movedSupportCard,
            extraMetadata: new[] { ("slotIndex", slotIndex.ToString(System.Globalization.CultureInfo.InvariantCulture)) });
    }

    /// <summary>
    /// Resolves where a set support lands. Players never pick a slot: the card goes to the leftmost empty
    /// support slot, so an explicit index is only honoured when it is valid *and* free (kept for clients that
    /// still send one and for tests that pin a specific slot).
    /// </summary>
    private static bool TryResolveSupportSlotIndex(
        PlayerState actingPlayer,
        IReadOnlyDictionary<string, string> arguments,
        out int slotIndex)
    {
        var occupiedSlots = actingPlayer.SupportZone
            .Select((card, currentIndex) => card.SupportSlotIndex ?? currentIndex)
            .ToHashSet();

        if (arguments.TryGetValue(SupportSlotIndexArgumentKey, out var rawSlot)
            && int.TryParse(rawSlot, out var requestedSlotIndex))
        {
            if (requestedSlotIndex < 0 || requestedSlotIndex >= MaxSupportSlots)
            {
                throw new InvalidOperationException("A valid support slot index is required.");
            }

            if (occupiedSlots.Contains(requestedSlotIndex))
            {
                throw new InvalidOperationException($"Support slot {requestedSlotIndex} is already occupied.");
            }

            slotIndex = requestedSlotIndex;
            return true;
        }

        for (var candidateSlot = 0; candidateSlot < MaxSupportSlots; candidateSlot++)
        {
            if (occupiedSlots.Contains(candidateSlot))
            {
                continue;
            }

            slotIndex = candidateSlot;
            return true;
        }

        slotIndex = -1;
        return false;
    }

    private CardInstance MoveCardToZone(
        GameInstance instance,
        string playerId,
        string cardInstanceId,
        PlayerZone sourceZone,
        PlayerZone destinationZone,
        int? destinationIndex)
    {
        return runtimeDeckService.MoveCardToZone(
            instance,
            playerId,
            sourceZone,
            destinationZone,
            cardInstanceId,
            destinationIndex: destinationIndex);
    }

    private static bool IsSupportCapable(Card card)
    {
        if (card is not CharacterCard characterCard)
        {
            return false;
        }

        return !string.IsNullOrWhiteSpace(characterCard.SupportName)
            || !string.IsNullOrWhiteSpace(characterCard.SupportEffect);
    }

    private static bool CanExecuteSummonRequirement(
        GameInstance instance,
        string playerId,
        CardInstance sourceCardInstance,
        Card cardDefinition)
    {
        if (!TryCreateSummonRequirementActionContext(
                instance,
                playerId,
                sourceCardInstance,
                cardDefinition,
                arguments: null,
                selectedTargets: [],
                out var context,
                out var effectSpec,
                out _))
        {
            return false;
        }

        var canExecuteEvaluator = new GameEffectCanExecuteEvaluator(
            new EffectContextConditionEvaluator(),
            new EffectTargetResolver(),
            new GameValidTargetResultFactory(),
            new GameEffectConditionDiagnostics());

        var result = canExecuteEvaluator.Evaluate(context!, effectSpec!, includeValidTargets: false);
        if (!result.CanExecute)
        {
            return false;
        }

        if (effectSpec!.TargetRules.TributeComposition is not null)
        {
            var materialTargets = EffectTargetResolver.ResolveTargets(context!, effectSpec!);
            return TributeTargetCompositionValidator.TryValidateMaterialAvailability(
                context!,
                effectSpec!,
                materialTargets,
                out _);
        }

        return true;
    }

    private static bool TryCreateSummonRequirementActionContext(
        GameInstance instance,
        string playerId,
        CardInstance sourceCardInstance,
        Card sourceCardDefinition,
        IReadOnlyDictionary<string, string>? arguments,
        IReadOnlyList<GameEffectTargetReference> selectedTargets,
        out GameCardEffectContext? context,
        out EffectSpec? effectSpec,
        out GameCardActionTargetsResponse? failureResponse)
    {
        context = null;
        effectSpec = null;
        failureResponse = null;

        if (sourceCardDefinition.Conditions.Count == 0)
        {
            failureResponse = BuildSummonRequirementDisabledResponse(sourceCardInstance.InstanceId, "Summon requirements are not currently satisfiable.");
            return false;
        }

        var hasSummonRequirementMarker = sourceCardDefinition.Conditions.Any(condition =>
            string.Equals(condition, EffectConditionKeywords.SummonRequirements, StringComparison.OrdinalIgnoreCase)
            || string.Equals(condition, "hasSummonTarget", StringComparison.OrdinalIgnoreCase));

        if (!hasSummonRequirementMarker)
        {
            failureResponse = BuildSummonRequirementDisabledResponse(sourceCardInstance.InstanceId, "Summon requirements are not currently satisfiable.");
            return false;
        }

        var normalizedArguments = arguments is null
            ? new Dictionary<string, string>(StringComparer.Ordinal)
            : new Dictionary<string, string>(arguments, StringComparer.Ordinal);
        normalizedArguments[SummonTargetIdArgumentKey] = sourceCardInstance.InstanceId;

        context = new GameCardEffectContext(
            game: instance,
            actingPlayer: new Player { Id = playerId },
            sourceCardDefinition: sourceCardDefinition,
            sourceCardInstance: sourceCardInstance,
            arguments: normalizedArguments,
            selectedTargets: selectedTargets);

        effectSpec = RuntimeEffectSpecResolver.Resolve(context, RuntimeEffects.Tribute);
        if (effectSpec is null)
        {
            failureResponse = BuildSummonRequirementDisabledResponse(sourceCardInstance.InstanceId, "Summon requirements are not currently satisfiable.");
            return false;
        }

        return true;
    }

    private static GameCardActionTargetsResponse BuildSummonRequirementDisabledResponse(string sourceCardInstanceId, string disabledReason)
    {
        return new GameCardActionTargetsResponse(
            ActionId: $"{SummonToFieldActionPrefix}{sourceCardInstanceId}",
            SourceCardInstanceId: sourceCardInstanceId,
            IsEnabled: false,
            DisabledReason: disabledReason,
            MinimumTargetCount: null,
            MaximumTargetCount: null,
            ExactTargetCount: null,
            AutoSelectAllValidTargets: false,
            ValidTargets: []);
    }

    private static IReadOnlyList<GameEffectTargetReference> ResolveTributeMaterialTargets(
        GameCardEffectContext context,
        EffectSpec effectSpec,
        CanExecuteResult canExecuteResult)
    {
        if (!canExecuteResult.CanExecute)
        {
            return [];
        }

        var validTargets = EffectTargetResolver.ResolveTargets(context, effectSpec);

        // When a tribute composition is declared, EffectTargetResolver already returns only cards
        // eligible as tribute material (summon-candidate rules are skipped, identity predicates are
        // ignored, and the summon candidate itself is excluded when distinctness is required).
        if (effectSpec.TargetRules.TributeComposition is not null)
        {
            return validTargets;
        }

        var tributeRules = effectSpec.TargetRules.Rules
            .Where(rule => rule.TributeRole == TributeTargetRole.TributeMaterial)
            .ToList();

        if (tributeRules.Count == 0)
        {
            return validTargets;
        }

        var actingPlayerState = context.Game.State.Players.FirstOrDefault(player =>
            string.Equals(player.PlayerId, context.ActingPlayer.Id, StringComparison.Ordinal));
        if (actingPlayerState is null)
        {
            return [];
        }

        return validTargets
            .Where(target => tributeRules.Any(rule => TargetMatchesRuleForSummonRequirement(
                target,
                rule,
                actingPlayerState,
                context.Game.State,
                context.SourceCardInstance)))
            .ToList();
    }

    private static bool TargetMatchesRuleForSummonRequirement(
        GameEffectTargetReference target,
        EffectTargetRule rule,
        PlayerState actingPlayerState,
        GameState gameState,
        CardInstance? sourceCardInstance)
    {
        if (target.Zone != rule.InZone)
        {
            return false;
        }

        if (rule.Scope == EffectTargetRange.Self
            && !string.Equals(target.PlayerId, actingPlayerState.PlayerId, StringComparison.Ordinal))
        {
            return false;
        }

        if (rule.Scope == EffectTargetRange.Opponent
            && string.Equals(target.PlayerId, actingPlayerState.PlayerId, StringComparison.Ordinal))
        {
            return false;
        }

        var targetPlayerState = gameState.Players.FirstOrDefault(player =>
            string.Equals(player.PlayerId, target.PlayerId, StringComparison.Ordinal));
        if (targetPlayerState is null)
        {
            return false;
        }

        var zoneCards = PlayerZoneCardAccessor.GetCards(rule.InZone, targetPlayerState);
        var cardInstance = zoneCards.FirstOrDefault(card =>
            string.Equals(card.InstanceId, target.CardInstanceId, StringComparison.Ordinal));
        if (cardInstance is null)
        {
            return false;
        }

        if (!gameState.CardDefinitions.TryGetValue(cardInstance.CardDefinitionId, out var cardDefinition))
        {
            return false;
        }

        return ZoneCardRestrictionMatcher.Matches(gameState, cardDefinition, rule.Restriction, cardInstance, sourceCardInstance);
    }

    private static IReadOnlyList<GameCardActionTargetRequirementResponse>? BuildTributeRequirementLabels(
        GameState gameState,
        PlayerState actingPlayerState,
        CardInstance? summonCandidateInstance,
        EffectTargetRuleSet targetRules,
        IReadOnlyList<GameEffectTargetReference> validTargets)
    {
        if (targetRules.TributeComposition is null || validTargets.Count == 0)
        {
            return null;
        }

        var materialRules = targetRules.Rules
            .Where(rule => rule.TributeRole != TributeTargetRole.SummonCandidate)
            .ToList();

        if (materialRules.Count == 0)
        {
            return null;
        }

        var matches = TributeMaterialAssignmentSolver.ComputeMaterialRuleMatches(
            gameState,
            actingPlayerState,
            summonCandidateInstance,
            materialRules,
            targetRules.TributeComposition,
            validTargets);

        var responses = new List<GameCardActionTargetRequirementResponse>(validTargets.Count);
        for (var targetIndex = 0; targetIndex < validTargets.Count; targetIndex++)
        {
            var fulfilledLabels = new List<string>();
            for (var ruleIndex = 0; ruleIndex < materialRules.Count; ruleIndex++)
            {
                if (!matches[ruleIndex].Contains(targetIndex))
                {
                    continue;
                }

                var label = TributeRequirementDescription.BuildShortLabel(materialRules[ruleIndex]);
                if (label is not null)
                {
                    fulfilledLabels.Add(label);
                }
            }

            responses.Add(new GameCardActionTargetRequirementResponse(
                CardInstanceId: validTargets[targetIndex].CardInstanceId,
                RequirementLabels: fulfilledLabels.Distinct(StringComparer.OrdinalIgnoreCase).ToList()));
        }

        return responses;
    }
}