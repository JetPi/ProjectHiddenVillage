using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;
using ProjectHiddenVillage.Server.Engine;

namespace ProjectHiddenVillage.Server;

public sealed class InMemoryGameInstanceRegistry
{
    private const int GameCodeLength = 5;
    private const string GameCodeAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    private const string ActivateSupportActionPrefix = "activate-support:";
    private const string SummonToFieldActionPrefix = "summon-to-field:";
    private const string SetSupportActionPrefix = "set-support:";
    private const string BattleActionPrefix = "battle-action:";
    private const string LeaderEffectActionPrefix = "leader-effect:";
    private const string ResolveOptionalAttackEffectActionPrefix = "resolve-optional-attack-effect:";
    private const string SupportSlotIndexArgumentKey = "supportSlotIndex";
    private const string FallbackEffectKeyArgument = "__leaderEffectKey";
    private const string SummonTargetIdArgumentKey = "summonTargetId";
    private const int MaxSupportSlots = 5;
    private static readonly Regex GameCodePattern = new("^[A-Za-z0-9]{5}$", RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly IGameRuntimeEffectSpecResolver RuntimeEffectSpecResolver = new GameRuntimeEffectSpecResolver();
    private static readonly IGameEffectTargetResolver EffectTargetResolver = new EffectTargetResolver();

    // Used when a caller does not supply the DI-configured effect registry (unit-test composition):
    // support target planning then falls back to the rule-based candidate pool only.
    private static readonly IGameCardEffectRegistry EmptyEffectRegistry = new GameCardEffectRegistry([]);

    private readonly ConcurrentDictionary<string, GameInstance> instances =
        new(StringComparer.Ordinal);

    private readonly GameInstanceFactory factory;
    private readonly global::ProjectHiddenVillage.Server.Engine.GamePhaseService phaseService;
    private readonly IGameRuntimeDeckService runtimeDeckService;

    public InMemoryGameInstanceRegistry(GameInstanceFactory factory, global::ProjectHiddenVillage.Server.Engine.GamePhaseService phaseService)
    {
        this.factory = factory;
        this.phaseService = phaseService;
        runtimeDeckService = new Api.Services.Games.GameRuntimeDeckService(new GameEffectHandlingService());
    }

    public GameInstance Create(
        IReadOnlyList<Player> players,
        IReadOnlyDictionary<string, Card> cardDefinitions,
        string? preferredGameCode,
        Random? random = null)
    {
        var instance = factory.Create(players, cardDefinitions, random);

        if (!string.IsNullOrWhiteSpace(preferredGameCode))
        {
            var normalizedCode = preferredGameCode.Trim();
            if (!GameCodePattern.IsMatch(normalizedCode))
            {
                throw new ArgumentException("Preferred game code must be a 5-character alphanumeric string.", nameof(preferredGameCode));
            }

            instance.State.GameId = normalizedCode;
            if (instances.TryAdd(instance.Id, instance))
            {
                return instance;
            }

            throw new InvalidOperationException($"Game code '{normalizedCode}' is already in use.");
        }

        for (var attempt = 0; attempt < 128; attempt++)
        {
            instance.State.GameId = GenerateGameCode();
            if (instances.TryAdd(instance.Id, instance))
            {
                return instance;
            }
        }

        throw new InvalidOperationException("A unique game code could not be generated.");
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
            return instance;
        }
    }

    public GameInstance ResolvePrompt(
        string gameId,
        string requestedPlayerId,
        string selectedOption,
        IGameReactiveEffectOrchestrator? reactiveEffectOrchestrator = null)
    {
        var instance = GetRequired(gameId);

        lock (instance)
        {
            var phaseBeforeResolve = instance.State.Phase;
            instance.ResolvePrompt(requestedPlayerId, selectedOption);

            if (ShouldAdvanceAfterPromptResolution(phaseBeforeResolve, instance.GetPendingPrompt()))
            {
                phaseService.AdvancePhase(instance);
            }

            SweepContinuousPassives(instance, reactiveEffectOrchestrator);
            AutoAdvanceMainPhaseIfNoLegalActions(instance);

            instance.ValidateInvariants();
            return instance;
        }
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
            if (instance.GetPendingPrompt() is not null)
            {
                throw new InvalidOperationException("Cannot advance phase while a prompt is pending.");
            }

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
            instance.ValidateInvariants();
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
            var previousPhase = instance.State.Phase;

            // MainPhase support reactions reuse the pass mechanism: the window stays open until both
            // players pass, then the pending activations resolve and priority returns to the turn player.
            if (instance.State.Phase == GamePhase.MainPhase)
            {
                var isWindowClosed = phaseService.DeclarePassInSupportWindow(instance, playerId);
                if (isWindowClosed)
                {
                    ResolvePendingActivations(instance, sequentialEffectExecutor);
                    instance.State.PriorityPlayerId = instance.State.ActivePlayerId;
                }

                AutoAdvanceMainPhaseIfNoLegalActions(instance);
                instance.ValidateInvariants();
                return instance;
            }

            phaseService.DeclarePassInActionStep(instance, playerId);
            // Both players passed (or the active player passed out of the window): replay any pending
            // support activations, most recent first, *before* the damage step so interrupts and K.O.s
            // take effect first.
            ResolvePendingActivations(instance, sequentialEffectExecutor);
            ApplyPendingAttackResolutionIfNeeded(instance, previousPhase);
            SweepContinuousPassives(instance, reactiveEffectOrchestrator);
            AutoAdvanceMainPhaseIfNoLegalActions(instance);
            instance.ValidateInvariants();
            return instance;
        }
    }

    public GameInstance DeclareActionInActionStep(string gameId, string playerId)
    {
        var instance = GetRequired(gameId);

        lock (instance)
        {
            phaseService.DeclareActionInActionStep(instance, playerId);
            AutoAdvanceMainPhaseIfNoLegalActions(instance);
            instance.ValidateInvariants();
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
            var phaseBeforeActionExecution = instance.State.Phase;

            switch (actionPrefix)
            {
                case ActivateSupportActionPrefix:
                    ExecuteActivateSupportAction(instance, request.PlayerId, request, sequentialEffectExecutor, actingPlayer, arguments);
                    break;
                case SummonToFieldActionPrefix:
                    ExecuteSummonToFieldAction(instance, request.PlayerId, request, actingPlayer);
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

            instance.ValidateInvariants();
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
                LeaderEffectActionPrefix => BuildLeaderCardActionTargets(
                    instance,
                    request.ActionId,
                    request.SourceCardInstanceId,
                    request.PlayerId,
                    actingPlayer,
                    arguments,
                    canExecuteEvaluator),
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
            // Leaving the MainPhase closes any open support reaction window.
            ResolvePendingActivations(instance, sequentialEffectExecutor);
            phaseService.DeclareEndStep(instance);
            AutoAdvanceMainPhaseIfNoLegalActions(instance);
            instance.ValidateInvariants();
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
            // A turn can never end with an activation still waiting to resolve.
            ResolvePendingActivations(instance, sequentialEffectExecutor);
            phaseService.CompleteEndStep(instance);
            SweepContinuousPassives(instance, reactiveEffectOrchestrator);
            instance.ValidateInvariants();
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

    private static string GenerateGameCode()
    {
        return string.Create(GameCodeLength, 0, static (buffer, _) =>
        {
            for (var index = 0; index < buffer.Length; index++)
            {
                buffer[index] = GameCodeAlphabet[RandomNumberGenerator.GetInt32(GameCodeAlphabet.Length)];
            }
        });
    }

    private static string? ResolveActionPrefix(string actionId)
    {
        if (actionId.StartsWith(LeaderEffectActionPrefix, StringComparison.Ordinal))
        {
            return LeaderEffectActionPrefix;
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
        if (actionPrefix == LeaderEffectActionPrefix)
        {
            if (!TryParseLeaderEffectActionId(actionId, out var parsedLeaderInstanceId, out _))
            {
                throw new InvalidOperationException($"Card action '{actionId}' is invalid.");
            }

            return parsedLeaderInstanceId;
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

    private static bool TryParseLeaderEffectActionId(string actionId, out string leaderInstanceId, out string effectKey)
    {
        leaderInstanceId = string.Empty;
        effectKey = string.Empty;

        if (!actionId.StartsWith(LeaderEffectActionPrefix, StringComparison.Ordinal))
        {
            return false;
        }

        var payload = actionId[LeaderEffectActionPrefix.Length..];
        var delimiterIndex = payload.IndexOf(':');
        if (delimiterIndex <= 0 || delimiterIndex >= payload.Length - 1)
        {
            return false;
        }

        leaderInstanceId = payload[..delimiterIndex].Trim();
        effectKey = payload[(delimiterIndex + 1)..].Trim();
        return !string.IsNullOrWhiteSpace(leaderInstanceId) && !string.IsNullOrWhiteSpace(effectKey);
    }

    private static bool IsLeaderEffectTimingAvailable(EffectTiming timing, GameState state, string actingPlayerId)
    {
        var isActivePlayer = IsSamePlayerId(state.ActivePlayerId, actingPlayerId);
        var isPriorityPlayer = IsSamePlayerId(state.PriorityPlayerId, actingPlayerId);

        return timing switch
        {
            EffectTiming.ActivateMain or EffectTiming.DuringYourMain =>
                state.Phase == GamePhase.MainPhase && isActivePlayer,
            EffectTiming.WhenAttacking =>
                state.IsAttackDeclarationWindow() && isActivePlayer,
            EffectTiming.YourTurn =>
                isActivePlayer,
            EffectTiming.Quick =>
                state.Phase == GamePhase.ActionStep && isPriorityPlayer,
            EffectTiming.SupportActivated =>
                state.Phase == GamePhase.ActionStep && isPriorityPlayer,
            EffectTiming.DuringOpponentAttack =>
                state.HasPendingAttack && state.Phase == GamePhase.ActionStep && !isActivePlayer,
            _ => false,
        };
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

    private GameCardActionTargetsResponse BuildLeaderCardActionTargets(
        GameInstance instance,
        string actionId,
        string sourceCardInstanceId,
        string playerId,
        PlayerState actingPlayer,
        IReadOnlyDictionary<string, string> arguments,
        IGameEffectCanExecuteEvaluator canExecuteEvaluator)
    {
        var leaderInstance = actingPlayer.LeaderCardInstance;
        if (leaderInstance is null
            || !string.Equals(leaderInstance.InstanceId, sourceCardInstanceId, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                $"Leader card instance '{sourceCardInstanceId}' was not found for player '{playerId}'.");
        }

        if (!instance.State.CardDefinitions.TryGetValue(leaderInstance.CardDefinitionId, out var sourceCardDefinition))
        {
            throw new InvalidOperationException($"Card definition '{leaderInstance.CardDefinitionId}' was not found.");
        }

        if (!TryParseLeaderEffectActionId(actionId, out _, out var effectKey))
        {
            throw new InvalidOperationException($"Card action '{actionId}' is invalid.");
        }

        var effectWithIndex = sourceCardDefinition.Effects
            .Select((effect, index) => new { Effect = effect, Index = index })
            .FirstOrDefault(entry => MatchesEffectKey(entry.Effect, entry.Index, effectKey));

        if (effectWithIndex is null)
        {
            throw new InvalidOperationException($"Leader effect '{effectKey}' was not found on '{sourceCardDefinition.Id}'.");
        }

        var effectSpec = effectWithIndex.Effect;

        // A once-per-turn effect already used this turn reports the restriction even when its timing
        // window has since closed, so the player gets the actionable reason instead of a phase message.
        if (effectSpec.GlobalRestrictions == EffectRestrictions.OncePerTurn
            && instance.State.IsEffectUsedThisTurn(playerId, sourceCardInstanceId, effectKey))
        {
            return BuildOncePerTurnDisabledResponse(actionId, sourceCardInstanceId, effectSpec);
        }

        var timingAvailable = IsLeaderEffectTimingAvailable(effectSpec.Timing, instance.State, playerId);
        if (!timingAvailable)
        {
            return new GameCardActionTargetsResponse(
                ActionId: actionId,
                SourceCardInstanceId: sourceCardInstanceId,
                IsEnabled: false,
                DisabledReason: $"Leader effect '{effectSpec.Timing}' timing is not available right now.",
                MinimumTargetCount: effectSpec.TargetRules.MinimumTargetCount,
                MaximumTargetCount: effectSpec.TargetRules.MaximumTargetCount,
                ExactTargetCount: effectSpec.TargetRules.ExactTargetCount,
                AutoSelectAllValidTargets: effectSpec.TargetRules.AutoSelectAllValidTargets,
                ValidTargets: []);
        }

        var context = new GameCardEffectContext(
            game: instance,
            actingPlayer: new Player { Id = playerId },
            sourceCardDefinition: sourceCardDefinition,
            sourceCardInstance: null,
            arguments: arguments,
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
        var leaderInstance = actingPlayer.LeaderCardInstance;
        if (leaderInstance is null
            || !string.Equals(leaderInstance.InstanceId, request.SourceCardInstanceId, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                $"Leader card instance '{request.SourceCardInstanceId}' was not found for player '{playerId}'.");
        }

        if (!instance.State.CardDefinitions.TryGetValue(leaderInstance.CardDefinitionId, out var sourceCardDefinition))
        {
            throw new InvalidOperationException($"Card definition '{leaderInstance.CardDefinitionId}' was not found.");
        }

        if (!TryParseLeaderEffectActionId(request.ActionId, out _, out var effectKey))
        {
            throw new InvalidOperationException($"Card action '{request.ActionId}' is invalid.");
        }

        var effectWithIndex = sourceCardDefinition.Effects
            .Select((effect, index) => new { Effect = effect, Index = index })
            .FirstOrDefault(entry => MatchesEffectKey(entry.Effect, entry.Index, effectKey));

        if (effectWithIndex is null)
        {
            throw new InvalidOperationException($"Leader effect '{effectKey}' was not found on '{sourceCardDefinition.Id}'.");
        }

        var effectSpec = effectWithIndex.Effect;
        if (effectSpec.GlobalRestrictions == EffectRestrictions.OncePerTurn
            && instance.State.IsEffectUsedThisTurn(playerId, request.SourceCardInstanceId, effectKey))
        {
            throw new InvalidOperationException(EffectRestrictionMessages.OncePerTurn);
        }

        if (!IsLeaderEffectTimingAvailable(effectSpec.Timing, instance.State, playerId))
        {
            throw new InvalidOperationException($"Leader effect '{effectSpec.Timing}' timing is not available right now.");
        }

        arguments[ReactiveEffectExecutionConstants.ActiveEffectSpecIdArgument] = string.IsNullOrWhiteSpace(effectSpec.Id)
            ? effectSpec.RuntimeEffectType.ToString()
            : effectSpec.Id;
        arguments[FallbackEffectKeyArgument] = effectKey;

        var selectedTargets = request.SelectedTargets ?? [];
        var context = new GameCardEffectContext(
            game: instance,
            actingPlayer: new Player { Id = playerId },
            sourceCardDefinition: sourceCardDefinition,
            sourceCardInstance: null,
            arguments: arguments,
            selectedTargets: selectedTargets);

        var executeResult = sequentialEffectExecutor.Execute(context);
        if (executeResult.IsError)
        {
            throw new InvalidOperationException(executeResult.FirstError.Description);
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
            instance.AddActionLogEntry(
                actionType: "support_activation_skipped",
                message: $"Skipped support activation '{entry.EntryId}': its source card is no longer in play.",
                playerId: entry.SourcePlayerId);
            return;
        }

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
                    actionType: "support_activation_failed",
                    message: $"Support activation '{entry.EntryId}' failed: {executeResult.FirstError.Description}",
                    playerId: entry.SourcePlayerId);
            }
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

        attacker.IsRested = true;
        instance.State.HasPendingAttack = true;
        instance.State.PendingAttackDeclarationId = Guid.NewGuid().ToString("N");
        instance.State.PendingAttackAttackerInstanceId = attacker.InstanceId;
        instance.State.PendingAttackDefenderPlayerId = defenderPlayer.PlayerId;
        instance.State.PendingAttackDefenderInstanceId = selectedTarget.CardInstanceId;
        instance.State.PendingAttackDefenderZone = targetZone;

        ExecuteAutomaticWhenAttackingEffects(instance, playerId, attacker, sequentialEffectExecutor)
            .ToList()
            .ForEach(failure => RecordSkippedWhenAttackingEffect(instance, playerId, attacker, failure));
        EnsurePendingAttackAttackerRemainsRested(instance.State);

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

                    var singleEffectDefinition = CloneCardDefinitionWithEffectChain(sourceCardDefinition, effectWithIndex.Effect);

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

        EnsurePendingAttackAttackerRemainsRested(instance.State);

        var defenderPlayerId = instance.State.PendingAttackDefenderPlayerId;
        ClearPendingOptionalAttackEffectState(instance.State);
        EnterSupportCutInWindow(instance.State, defenderPlayerId);
    }

    private static void EnsurePendingAttackAttackerRemainsRested(GameState state)
    {
        if (!state.HasPendingAttack || string.IsNullOrWhiteSpace(state.PendingAttackAttackerInstanceId))
        {
            return;
        }

        var attacker = FindCardInstanceWithOwner(state, state.PendingAttackAttackerInstanceId)?.Card;

        if (attacker is not null)
        {
            attacker.IsRested = true;
        }
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
        var failures = new List<string>();

        foreach (var effectSpec in sourceCardDefinition.Effects)
        {
            if (effectSpec.Timing != EffectTiming.WhenAttacking || effectSpec.IsOptional)
            {
                continue;
            }

            var arguments = new Dictionary<string, string>(StringComparer.Ordinal)
            {
                [ReactiveEffectExecutionConstants.ActiveEffectSpecIdArgument] = string.IsNullOrWhiteSpace(effectSpec.Id)
                    ? effectSpec.RuntimeEffectType.ToString()
                    : effectSpec.Id,
            };

            // The sequential executor walks the supplied definition, so keep the effect's own chain
            // reachable (on-success / on-failure branch targets) while still making this effect the
            // entry node. Cloning down to the single effect made the executor fail with
            // "Could not resolve branch target effect id '...'" for chained effects.
            var singleEffectDefinition = CloneCardDefinitionWithEffectChain(sourceCardDefinition, effectSpec);

            var context = new GameCardEffectContext(
                game: instance,
                actingPlayer: new Player { Id = actingPlayerId },
                sourceCardDefinition: singleEffectDefinition,
                sourceCardInstance: sourceCardInstance,
                arguments: arguments,
                selectedTargets: []);

            var executeResult = sequentialEffectExecutor.Execute(context);
            if (executeResult.IsError)
            {
                var firstError = executeResult.FirstError;
                failures.Add($"{effectSpec.Id}: {firstError.Code} - {firstError.Description}");
            }
        }

        return failures;
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
        var attackerInstanceId = attacker?.InstanceId ?? "unknown";
        var message = $"Skipped 'When Attacking' effect on card '{attackerInstanceId}': {failure}";

        instance.AddActionLogEntry(
            actionType: "when_attacking_effect_skipped",
            message: message,
            playerId: playerId,
            metadata: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["attackerCardInstanceId"] = attackerInstanceId,
            });
    }

    /// <summary>
    /// Clones a card definition down to a single triggering effect plus every effect reachable from it
    /// through its on-success / on-failure branches, so chained (subordinate) effects still resolve
    /// while unrelated effects on the same card stay dormant.
    /// </summary>
    private static Card CloneCardDefinitionWithEffectChain(Card sourceCardDefinition, EffectSpec triggerEffectSpec)
    {
        var includedEffectIds = new HashSet<string>(StringComparer.Ordinal);
        var effectsToVisit = new Queue<string>();
        var effectById = sourceCardDefinition.Effects
            .Where(effect => !string.IsNullOrWhiteSpace(effect.Id))
            .ToDictionary(effect => effect.Id.Trim(), effect => effect, StringComparer.Ordinal);

        void TrackBranch(string? branchEffectId)
        {
            if (string.IsNullOrWhiteSpace(branchEffectId))
            {
                return;
            }

            var normalizedBranchId = branchEffectId.Trim();
            if (includedEffectIds.Add(normalizedBranchId))
            {
                effectsToVisit.Enqueue(normalizedBranchId);
            }
        }

        TrackBranch(triggerEffectSpec.Id);
        TrackBranch(triggerEffectSpec.OnSuccessEffectId);
        TrackBranch(triggerEffectSpec.OnFailureEffectId);

        while (effectsToVisit.Count > 0)
        {
            var effectId = effectsToVisit.Dequeue();
            if (!effectById.TryGetValue(effectId, out var chainedEffect))
            {
                continue;
            }

            TrackBranch(chainedEffect.OnSuccessEffectId);
            TrackBranch(chainedEffect.OnFailureEffectId);
        }

        var chainedEffects = new List<EffectSpec>
        {
            triggerEffectSpec,
        };

        chainedEffects.AddRange(sourceCardDefinition.Effects
            .Where(effect => !ReferenceEquals(effect, triggerEffectSpec))
            .Where(effect => !string.IsNullOrWhiteSpace(effect.Id) && includedEffectIds.Contains(effect.Id.Trim())));

        return CloneCardDefinitionWithEffects(sourceCardDefinition, chainedEffects);
    }

    private static Card CloneCardDefinitionWithEffects(Card sourceCardDefinition, IReadOnlyList<EffectSpec> effects)
    {
        return CardDefinitionCloner.CloneWithEffects(sourceCardDefinition, effects);
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

    private void AutoAdvanceMainPhaseIfNoLegalActions(GameInstance instance)
    {
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

    private void ExecuteSummonToFieldAction(
        GameInstance instance,
        string playerId,
        GameCardActionExecutionRequest request,
        PlayerState actingPlayer)
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
            ExecuteSummonRequirementAction(instance, playerId, request, actingPlayer, sourceCardInstance, sourceCardDefinition);
            return;
        }

        var movedCard = MoveCardToZone(
            instance,
            playerId,
            sourceCardInstanceId,
            PlayerZone.Hand,
            PlayerZone.CharacterField,
            destinationIndex: null);

        movedCard.IsRested = false;

        if (requiresReadySummonCard)
        {
            instance.State.SetSummonCardReady(playerId, false);
        }
    }

    private void ExecuteSummonRequirementAction(
        GameInstance instance,
        string playerId,
        GameCardActionExecutionRequest request,
        PlayerState actingPlayer,
        CardInstance sourceCardInstance,
        Card sourceCardDefinition)
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

        movedCard.IsRested = false;
        movedCard.EnteredFieldTurnNumber = instance.State.TurnNumber;
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

        MoveCardToZone(
            instance,
            playerId,
            sourceCardInstanceId,
            PlayerZone.Hand,
            PlayerZone.SupportZone,
            slotIndex);
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