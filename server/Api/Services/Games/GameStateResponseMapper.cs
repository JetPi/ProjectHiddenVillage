using ProjectHiddenVillage.Server.Engine;
using ProjectHiddenVillage.Server.Engine.Interfaces;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public static class GameStateResponseMapper
{
    private static readonly IGamePhaseStateService PhaseStateService = new GamePhaseStateService();
    private static readonly GameEffectCanExecuteEvaluator LeaderEffectCanExecuteEvaluator = new(
        new EffectContextConditionEvaluator(),
        new EffectTargetResolver(),
        new GameValidTargetResultFactory(),
        new GameEffectConditionDiagnostics());
    private const string ConcealedCardDefinitionId = "concealed-card";
    private const string SummonToFieldActionPrefix = "summon-to-field:";
    private const string SetSupportActionPrefix = "set-support:";
    private const string LeaderEffectActionPrefix = "leader-effect:";

    public static GameStateResponse ToGameStateResponse(GameInstance game, string requestingPlayerId)
    {
        ArgumentNullException.ThrowIfNull(game);

        return ToGameStateResponse(game.State, requestingPlayerId, game.GetPendingPrompt());
    }

    public static GameStateResponse ToGameStateResponse(GameState state, string requestingPlayerId)
    {
        return ToGameStateResponse(state, requestingPlayerId, pendingPrompt: null);
    }

    private static GameStateResponse ToGameStateResponse(
        GameState state,
        string requestingPlayerId,
        GamePrompt? pendingPrompt)
    {
        var phaseData = PhaseStateService.GetPhaseData(state.Phase);

        return new GameStateResponse(
            GameId: state.GameId,
            TurnNumber: state.TurnNumber,
            ActivePlayerId: state.ActivePlayerId,
            PriorityPlayerId: state.PriorityPlayerId,
            Phase: state.Phase.ToString(),
            PendingPrompt: ToPendingPromptResponse(pendingPrompt, requestingPlayerId),
            AvailableActions: BuildAvailableActions(state, phaseData, requestingPlayerId, pendingPrompt),
            ActiveTemporaryEffects: CardRuntimeEffectStateService
                .BuildTemporaryEffectProjections(state)
                .Select(effect => new ActiveTemporaryEffectResponse(
                    EffectId: effect.EffectId,
                    SourceCardInstanceId: effect.SourceCardInstanceId,
                    TargetCardInstanceId: effect.TargetCardInstanceId,
                    ModifierKind: effect.ModifierKind,
                    DurationMode: effect.DurationMode,
                    Attribute: effect.Attribute,
                    Operation: effect.Operation,
                    Value: effect.Value,
                    Keyword: effect.Keyword,
                    FaceStateTargetCategory: effect.FaceStateTargetCategory,
                    TargetPlayerId: effect.TargetPlayerId,
                    AppliedTurnNumber: effect.AppliedTurnNumber))
                .ToList(),
            Players: state.Players
                .ConvertAll(player => ToPlayerZonesResponse(player, requestingPlayerId, state, pendingPrompt)));
    }

    private static PendingPromptResponse? ToPendingPromptResponse(GamePrompt? pendingPrompt, string requestingPlayerId)
    {
        if (pendingPrompt is null)
        {
            return null;
        }

        var isAwaitingRequestingPlayer = IsSamePlayerId(
            pendingPrompt.RequestedPlayerId,
            requestingPlayerId);

        var options = isAwaitingRequestingPlayer
            ? pendingPrompt.Options
            : [];

        return new PendingPromptResponse(
            PromptId: pendingPrompt.PromptId,
            Type: pendingPrompt.Type.ToString(),
            IsAwaitingRequestingPlayer: isAwaitingRequestingPlayer,
            Options: options);
    }

    private static IReadOnlyList<GameActionOptionResponse> BuildAvailableActions(
        GameState state,
        GamePhaseData phaseData,
        string requestingPlayerId,
        GamePrompt? pendingPrompt)
    {
        if (pendingPrompt is not null)
        {
            var isAwaitingRequestingPlayer = IsSamePlayerId(
                pendingPrompt.RequestedPlayerId,
                requestingPlayerId);

            if (!isAwaitingRequestingPlayer)
            {
                return [];
            }

            return pendingPrompt.Options.ConvertAll(option =>
                new GameActionOptionResponse(
                    ActionId: $"resolve-prompt:{option}",
                    Label: option,
                    IsEnabled: true));
        }

        var actions = new List<GameActionOptionResponse>();
        var isRequestingPlayerActive = IsSamePlayerId(state.ActivePlayerId, requestingPlayerId);
        var isRequestingPlayerPriority = IsSamePlayerId(state.PriorityPlayerId, requestingPlayerId);

        AddActivePlayerPhaseOptionActions(actions, phaseData, isRequestingPlayerActive);
        AddActionStepPriorityActions(actions, state.Phase, isRequestingPlayerPriority);
        AddDefaultAdvancePhaseAction(actions, phaseData, isRequestingPlayerActive);

        return actions;
    }

    private static void AddActivePlayerPhaseOptionActions(
        List<GameActionOptionResponse> actions,
        GamePhaseData phaseData,
        bool isRequestingPlayerActive)
    {
        if (!isRequestingPlayerActive || phaseData.AvailablePhaseOptions.Count == 0)
        {
            return;
        }

        if (phaseData.PhaseName == GamePhase.ActionStep)
        {
            return;
        }

        actions.AddRange(phaseData.AvailablePhaseOptions.Select(MapPhaseOptionToAction));
    }

    private static GameActionOptionResponse MapPhaseOptionToAction(string option)
    {
        return option switch
        {
            "endPhase" => new GameActionOptionResponse(
                ActionId: "turn-end",
                Label: "End Turn",
                IsEnabled: true),
            "declareAttack" => new GameActionOptionResponse(
                ActionId: "declare-attack",
                Label: "Declare Attack",
                IsEnabled: true),
            _ => new GameActionOptionResponse(
                ActionId: option,
                Label: option,
                IsEnabled: true)
        };
    }

    private static void AddActionStepPriorityActions(
        List<GameActionOptionResponse> actions,
        GamePhase phase,
        bool isRequestingPlayerPriority)
    {
        if (phase != GamePhase.ActionStep || !isRequestingPlayerPriority)
        {
            return;
        }

        actions.Add(new GameActionOptionResponse(ActionId: "pass-turn", Label: "Pass Turn", IsEnabled: true));
        actions.Add(new GameActionOptionResponse(ActionId: "declare-action", Label: "Declare Action", IsEnabled: true));
    }

    private static void AddDefaultAdvancePhaseAction(
        List<GameActionOptionResponse> actions,
        GamePhaseData phaseData,
        bool isRequestingPlayerActive)
    {
        if (!isRequestingPlayerActive || phaseData.AvailablePhaseOptions.Count > 0)
        {
            return;
        }

        if (phaseData.PhaseName == GamePhase.EndStep)
        {
            actions.Add(new GameActionOptionResponse(ActionId: "complete-end-step", Label: "Complete End Step", IsEnabled: true));
            return;
        }

        actions.Add(new GameActionOptionResponse(ActionId: "advance-phase", Label: "Advance Phase", IsEnabled: true));
    }

    private static PlayerZonesResponse ToPlayerZonesResponse(
        PlayerState player,
        string requestingPlayerId,
        GameState state,
        GamePrompt? pendingPrompt)
    {
        var isRequestingPlayer = IsSamePlayerId(player.PlayerId, requestingPlayerId);

        return new PlayerZonesResponse(
            PlayerId: player.PlayerId,
            TurnCount: player.TurnCount,
            IsSummonCardReady: state.IsSummonCardReady(player.PlayerId),
            Leader: ToLeaderCardInstanceResponse(player.LeaderCardInstance, state, player, isRequestingPlayer, pendingPrompt),
            Deck: isRequestingPlayer
                ? player.Deck.ConvertAll(card => ToCardInstanceResponse(card, state.CardDefinitions, PlayerZone.Deck))
                : player.Deck
                    .Where(card => IsVisibleToRequestingPlayer(card, PlayerZone.Deck, isRequestingPlayer))
                    .Select(card => ToCardInstanceResponse(card, state.CardDefinitions, PlayerZone.Deck, state, pendingPrompt, isRequestingPlayer))
                    .ToList(),
            DeckCount: player.Deck.Count,
            Hand: isRequestingPlayer
                ? player.Hand.ConvertAll(card => ToCardInstanceResponse(card, state.CardDefinitions, PlayerZone.Hand, state, pendingPrompt, isRequestingPlayer))
                : player.Hand
                    .Select(card => IsVisibleToRequestingPlayer(card, PlayerZone.Hand, isRequestingPlayer)
                        ? ToCardInstanceResponse(card, state.CardDefinitions, PlayerZone.Hand, state, pendingPrompt, isRequestingPlayer)
                        : ToConcealedCardInstanceResponse(card))
                    .ToList(),
            HandCount: player.Hand.Count,
            CharacterField: player.Battlefield.ConvertAll(card => ToCardInstanceResponse(card, state.CardDefinitions, PlayerZone.CharacterField, state, pendingPrompt, isRequestingPlayer)),
            SupportZone: player.SupportZone
                .Select(card => ToSupportCardInstanceResponse(card, state.CardDefinitions, state, pendingPrompt, isRequestingPlayer))
                .ToList(),
            Trash: player.DiscardPile.ConvertAll(card => ToCardInstanceResponse(card, state.CardDefinitions, PlayerZone.Trash)),
            ExileZone: player.ExileZone.ConvertAll(card => ToCardInstanceResponse(card, state.CardDefinitions, PlayerZone.ExileZone)));
    }

    private static bool IsVisibleToRequestingPlayer(CardInstance card, PlayerZone zone, bool isRequestingPlayer)
    {
        if (isRequestingPlayer)
        {
            return true;
        }

        if (!card.IsRevealedToBothPlayers)
        {
            return false;
        }

        return card.RevealedInZone == zone;
    }

    private static CardInstanceResponse ToSupportCardInstanceResponse(
        CardInstance card,
        IReadOnlyDictionary<string, Card> cardDefinitions,
        GameState state,
        GamePrompt? pendingPrompt,
        bool isRequestingPlayer)
    {
        var isConcealedFromOpponent = !IsVisibleToRequestingPlayer(card, PlayerZone.SupportZone, isRequestingPlayer: false);

        if (!IsVisibleToRequestingPlayer(card, PlayerZone.SupportZone, isRequestingPlayer))
        {
            return new CardInstanceResponse(
                InstanceId: card.InstanceId,
                CardDefinitionId: card.CardDefinitionId,
                OwnerPlayerId: card.OwnerPlayerId,
                ControllerPlayerId: card.ControllerPlayerId)
            {
                IsFaceUp = false,
                SupportSlotIndex = card.SupportSlotIndex,
                IsConcealedFromOpponent = isConcealedFromOpponent,
            };
        }

        var supportResponse = ToCardInstanceResponse(card, cardDefinitions, PlayerZone.SupportZone, state, pendingPrompt, isRequestingPlayer);
        return supportResponse with { IsConcealedFromOpponent = isConcealedFromOpponent };
    }

    private static CardInstanceResponse ToConcealedCardInstanceResponse(CardInstance card)
    {
        return new CardInstanceResponse(
            InstanceId: card.InstanceId,
            CardDefinitionId: ConcealedCardDefinitionId,
            OwnerPlayerId: card.OwnerPlayerId,
            ControllerPlayerId: card.ControllerPlayerId)
        {
            IsFaceUp = false,
        };
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

    private static CardInstanceResponse ToCardInstanceResponse(
        CardInstance card,
        IReadOnlyDictionary<string, Card> cardDefinitions,
        PlayerZone playerZone,
        GameState? state = null,
        GamePrompt? pendingPrompt = null,
        bool isRequestingPlayer = false)
    {
        var definition = cardDefinitions[card.CardDefinitionId];
        var resolvedPower = state is null
            ? card.PowerOverride ?? definition.Power
            : CardRuntimeEffectStateService.ResolveEffectivePower(state, card, definition);
        var resolvedDamage = state is null
            ? card.DamageOverride ?? definition.Damage
            : CardRuntimeEffectStateService.ResolveEffectiveDamage(state, card, definition);
        var baseHealth = definition is CharacterCard characterDefinition
            ? characterDefinition.Health
            : 0;
        var resolvedBaseHealth = state is null
            ? card.HealthOverride ?? baseHealth
            : CardRuntimeEffectStateService.ResolveEffectiveHealth(state, card, definition);
        var resolvedCurrentHealth = card.CurrentHealth ?? resolvedBaseHealth;
        var cardActions = BuildCardAvailableActions(card, playerZone, state, pendingPrompt, isRequestingPlayer);

        return playerZone switch
        {
            PlayerZone.Trash or
            PlayerZone.Hand or
            PlayerZone.CharacterField or
            PlayerZone.ExileZone =>
                new EnrichedCardInstanceResponse(
                    InstanceId: card.InstanceId,
                    CardDefinitionId: card.CardDefinitionId,
                    OwnerPlayerId: card.OwnerPlayerId,
                    ControllerPlayerId: card.ControllerPlayerId,
                    IsExhausted: card.IsExhausted,
                    IsRested: card.IsRested,
                    DisplayName: definition.DisplayName,
                    Type: definition.Type,
                    Color: definition.Color,
                    Traits: definition.Traits,
                    Health: resolvedCurrentHealth,
                    MaxHealth: baseHealth,
                    Damage: resolvedDamage,
                    Power: resolvedPower)
                {
                    IsFaceUp = card.IsFaceUp,
                    AvailableActions = cardActions
                },
            PlayerZone.SupportZone =>
                    isRequestingPlayer
                        ? new EnrichedCardInstanceResponse(
                            InstanceId: card.InstanceId,
                            CardDefinitionId: card.CardDefinitionId,
                            OwnerPlayerId: card.OwnerPlayerId,
                            ControllerPlayerId: card.ControllerPlayerId,
                            IsExhausted: card.IsExhausted,
                            IsRested: card.IsRested,
                            DisplayName: definition.DisplayName,
                            Type: definition.Type,
                            Color: definition.Color,
                            Traits: definition.Traits,
                            Health: resolvedCurrentHealth,
                            MaxHealth: baseHealth,
                            Damage: resolvedDamage,
                            Power: resolvedPower)
                        {
                            IsFaceUp = card.IsFaceUp,
                            SupportSlotIndex = card.SupportSlotIndex,
                            AvailableActions = cardActions
                        }
                        : new CardInstanceResponse(
                            InstanceId: card.InstanceId,
                            CardDefinitionId: card.CardDefinitionId,
                            OwnerPlayerId: card.OwnerPlayerId,
                            ControllerPlayerId: card.ControllerPlayerId)
                        {
                            IsFaceUp = card.IsFaceUp,
                            SupportSlotIndex = card.SupportSlotIndex,
                        },

            _ => new CardInstanceResponse(
                InstanceId: card.InstanceId,
                CardDefinitionId: card.CardDefinitionId,
                OwnerPlayerId: card.OwnerPlayerId,
                ControllerPlayerId: card.ControllerPlayerId)
        };
    }

    private static IReadOnlyList<GameActionOptionResponse> BuildCardAvailableActions(
        CardInstance card,
        PlayerZone playerZone,
        GameState? state,
        GamePrompt? pendingPrompt,
        bool isRequestingPlayer)
    {
        if (!isRequestingPlayer || state is null)
        {
            return [];
        }

        if (pendingPrompt is not null)
        {
            return [];
        }

        return playerZone switch
        {
            PlayerZone.Hand =>
                CanUseHandCardActions(card, state)
                    ? BuildHandAvailableActions(card, state)
                    : [],

            PlayerZone.SupportZone =>
                CanUseActionStepPriorityActions(card, state)
                    ? BuildSupportAvailableActions(card, state)
                    : [],

            PlayerZone.CharacterField =>
                !CanUseActionStepPriorityActions(card, state) || !CanDeclareBattleAction(card, state)
                    ? []
                    :
                    [
                        new GameActionOptionResponse(
                            ActionId: $"battle-action:{card.InstanceId}",
                            Label: "Battle",
                            IsEnabled: true)
                    ],

            _ => []
        };
    }

    private static IReadOnlyList<GameActionOptionResponse> BuildSupportAvailableActions(CardInstance card, GameState state)
    {
        if (!state.CardDefinitions.TryGetValue(card.CardDefinitionId, out var cardDefinition))
        {
            return [];
        }

        var primaryEffect = cardDefinition.Effects.FirstOrDefault();
        if (primaryEffect is null)
        {
            return
            [
                new GameActionOptionResponse(
                    ActionId: $"activate-support:{card.InstanceId}",
                    Label: EffectTiming.Unspecified.ToString(),
                    IsEnabled: true)
            ];
        }

        var actingPlayerState = state.Players.FirstOrDefault(player =>
            string.Equals(player.PlayerId, card.ControllerPlayerId, StringComparison.Ordinal));

        if (actingPlayerState is null)
        {
            return [];
        }

        GameInstance? evaluationGame = null;
        var (isEnabled, disabledReason) = EvaluateEffectAvailability(
            state,
            actingPlayerState,
            cardDefinition,
            card,
            primaryEffect,
            ref evaluationGame);

        return
        [
            new GameActionOptionResponse(
                ActionId: $"activate-support:{card.InstanceId}",
                Label: BuildEffectOptionLabel(primaryEffect),
                IsEnabled: isEnabled,
                DisabledReason: disabledReason)
        ];
    }

    private static bool CanUseHandCardActions(CardInstance card, GameState state)
    {
        return state.Phase == GamePhase.MainPhase
            && IsSamePlayerId(state.ActivePlayerId, card.ControllerPlayerId);
    }

    private static bool CanUseActionStepPriorityActions(CardInstance card, GameState state)
    {
        return state.Phase == GamePhase.ActionStep
            && IsSamePlayerId(state.PriorityPlayerId, card.ControllerPlayerId);
    }

    private static IReadOnlyList<GameActionOptionResponse> BuildHandAvailableActions(CardInstance card, GameState state)
    {
        if (!state.CardDefinitions.TryGetValue(card.CardDefinitionId, out var cardDefinition))
        {
            return [];
        }

        if (cardDefinition.Type is CardType.Chakra or CardType.Summon or CardType.Leader)
        {
            return [];
        }

        var actions = new List<GameActionOptionResponse>();
        var summonReady = state.IsSummonCardReady(card.ControllerPlayerId);

        if (cardDefinition.CannotBeNormalSummoned)
        {
            var specialSummonAllowed = CanSpecialSummonWithoutNormalSummon(cardDefinition);
            actions.Add(new GameActionOptionResponse(
                ActionId: $"{SummonToFieldActionPrefix}{card.InstanceId}",
                Label: "Summon",
                IsEnabled: specialSummonAllowed,
                DisabledReason: specialSummonAllowed
                    ? null
                    : "Summon requirements are not currently satisfiable."));
        }
        else
        {
            actions.Add(new GameActionOptionResponse(
                ActionId: $"{SummonToFieldActionPrefix}{card.InstanceId}",
                Label: "Summon",
                IsEnabled: summonReady,
                DisabledReason: summonReady ? null : "Your summon card is rested."));
        }

        if (IsSupportCapable(cardDefinition))
        {
            actions.Add(new GameActionOptionResponse(
                ActionId: $"{SetSupportActionPrefix}{card.InstanceId}",
                Label: "Set Support",
                IsEnabled: true));
        }

        return actions;
    }

    private static bool IsSupportCapable(Card cardDefinition)
    {
        if (cardDefinition is not CharacterCard characterCard)
        {
            return false;
        }

        return !string.IsNullOrWhiteSpace(characterCard.SupportName)
            || !string.IsNullOrWhiteSpace(characterCard.SupportEffect);
    }

    private static bool CanSpecialSummonWithoutNormalSummon(Card cardDefinition)
    {
        if (cardDefinition.Conditions.Count == 0)
        {
            return false;
        }

        return cardDefinition.Conditions.Any(condition =>
            string.Equals(condition, EffectConditionKeywords.SummonRequirements, StringComparison.OrdinalIgnoreCase)
            || string.Equals(condition, "hasSummonTarget", StringComparison.OrdinalIgnoreCase));
    }

    private static bool CanDeclareBattleAction(CardInstance card, GameState state)
    {
        if (card.IsRested)
        {
            return false;
        }

        if (card.IsExhausted)
        {
            return false;
        }

        var effectiveKeywords = CardRuntimeEffectStateService.ResolveEffectiveKeywords(state, card);
        if (effectiveKeywords.Any(keyword =>
            string.Equals(keyword, FreezeCardEffect.CannotAttackKeyword, StringComparison.OrdinalIgnoreCase)))
        {
            return false;
        }

        if (!card.EnteredFieldTurnNumber.HasValue || card.EnteredFieldTurnNumber.Value != state.TurnNumber)
        {
            return true;
        }

        return HasRushKeyword(card, state);
    }

    private static bool HasRushKeyword(CardInstance card, GameState state)
    {
        var effectiveKeywords = CardRuntimeEffectStateService.ResolveEffectiveKeywords(state, card);

        if (effectiveKeywords.Any(keyword =>
            string.Equals(keyword, EffectConditionKeywords.Rush, StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        if (!state.CardDefinitions.TryGetValue(card.CardDefinitionId, out var definition))
        {
            return false;
        }

        return definition.Conditions.Any(condition =>
            string.Equals(condition, EffectConditionKeywords.Rush, StringComparison.OrdinalIgnoreCase));
    }

    private static LeaderCardInstanceResponse ToLeaderCardInstanceResponse(
        LeaderCardInstanceState? leader,
        GameState state,
        PlayerState player,
        bool isRequestingPlayer,
        GamePrompt? pendingPrompt)
    {
        var resolvedPower = leader is null ? 0 : CardRuntimeEffectStateService.ResolveEffectiveLeaderPower(state, leader);
        var resolvedDamage = leader is null ? 0 : CardRuntimeEffectStateService.ResolveEffectiveLeaderDamage(state, leader);
        var resolvedCurrentLife = leader is null ? 0 : CardRuntimeEffectStateService.ResolveEffectiveLeaderCurrentLife(state, leader);
        var availableActions = BuildLeaderAvailableActions(leader, state, player, isRequestingPlayer, pendingPrompt);

        return new LeaderCardInstanceResponse(
            InstanceId: leader!.InstanceId,
            CardDefinitionId: leader!.CardDefinitionId,
            OwnerPlayerId: leader!.OwnerPlayerId,
            ControllerPlayerId: leader!.ControllerPlayerId,
            IsExhausted: false,
            DisplayName: leader!.Name,
            Color: leader!.Color,
            Traits: leader!.Traits,
            Damage: resolvedDamage,
            Power: resolvedPower,
            TotalLife: leader!.TotalLife,
            CurrentLife: resolvedCurrentLife,
            RecoveryEffect: leader!.RecoveryEffect)
        {
            AvailableActions = availableActions
        };
    }

    private static IReadOnlyList<GameActionOptionResponse> BuildLeaderAvailableActions(
        LeaderCardInstanceState? leader,
        GameState state,
        PlayerState player,
        bool isRequestingPlayer,
        GamePrompt? pendingPrompt)
    {
        if (!isRequestingPlayer || pendingPrompt is not null || leader is null)
        {
            return [];
        }

        if (!state.CardDefinitions.TryGetValue(leader.CardDefinitionId, out var leaderDefinition))
        {
            return [];
        }

        var candidateEffects = new List<(EffectSpec Effect, int Index, string EffectKey, string BaseLabel)>();
        foreach (var entry in leaderDefinition.Effects.Select((effect, index) => new { Effect = effect, Index = index }))
        {
            if (!IsLeaderEffectTimingAvailable(entry.Effect.Timing, state, player.PlayerId))
            {
                continue;
            }

            var effectKey = ResolveEffectKey(entry.Effect, entry.Index);
            var baseLabel = BuildEffectOptionLabel(entry.Effect);
            candidateEffects.Add((entry.Effect, entry.Index, effectKey, baseLabel));
        }

        if (candidateEffects.Count == 0)
        {
            return [];
        }

        var labelCounts = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var candidate in candidateEffects)
        {
            if (labelCounts.TryGetValue(candidate.BaseLabel, out var currentCount))
            {
                labelCounts[candidate.BaseLabel] = currentCount + 1;
                continue;
            }

            labelCounts[candidate.BaseLabel] = 1;
        }

        var labelOrdinals = new Dictionary<string, int>(StringComparer.Ordinal);
        var actions = new List<GameActionOptionResponse>(capacity: candidateEffects.Count);
        GameInstance? evaluationGame = null;
        foreach (var candidate in candidateEffects)
        {
            var label = candidate.BaseLabel;
            if (labelCounts[label] > 1)
            {
                labelOrdinals.TryGetValue(label, out var currentOrdinal);
                var nextOrdinal = currentOrdinal + 1;
                labelOrdinals[label] = nextOrdinal;
                label = $"{label} ({nextOrdinal})";
            }

            var actionId = $"{LeaderEffectActionPrefix}{leader.InstanceId}:{candidate.EffectKey}";
            var (isEnabled, disabledReason) = EvaluateEffectAvailability(
                state,
                player,
                leaderDefinition,
                sourceCardInstance: null,
                candidate.Effect,
                ref evaluationGame);

            actions.Add(new GameActionOptionResponse(
                ActionId: actionId,
                Label: label,
                IsEnabled: isEnabled,
                DisabledReason: disabledReason));
        }

        return actions;
    }

    private static string BuildCardEffectOptionLabel(GameState state, string cardDefinitionId)
    {
        if (!state.CardDefinitions.TryGetValue(cardDefinitionId, out var cardDefinition))
        {
            return EffectTiming.Unspecified.ToString();
        }

        var primaryEffect = cardDefinition.Effects.FirstOrDefault();
        if (primaryEffect is null)
        {
            return EffectTiming.Unspecified.ToString();
        }

        return BuildEffectOptionLabel(primaryEffect);
    }

    private static (bool IsEnabled, string? DisabledReason) EvaluateEffectAvailability(
        GameState state,
        PlayerState player,
        Card sourceCardDefinition,
        CardInstance? sourceCardInstance,
        EffectSpec effectSpec,
        ref GameInstance? evaluationGame)
    {
        if (RequiresTargets(effectSpec)
            && HasNoCardsInRequiredTargetZones(state, player.PlayerId, effectSpec))
        {
            return (false, "No valid targets available.");
        }

        if (effectSpec.EffectType == EffectKind.Recovery)
        {
            if (player.TurnCount < 2)
            {
                return (false, "Recovery can only be activated starting from your second turn.");
            }

            if (!HasFaceDownChakra(state, player.PlayerId))
            {
                return (false, "All chakra cards are already face up.");
            }
        }

        if (evaluationGame is null)
        {
            try
            {
                evaluationGame = new GameInstance(state);
            }
            catch (InvalidOperationException)
            {
                return (true, null);
            }
        }

        var arguments = new Dictionary<string, string>(StringComparer.Ordinal);
        if (effectSpec.ChakraCost is > 0)
        {
            arguments[ReactiveEffectExecutionConstants.SupportActivationChakraCostArgument] =
                effectSpec.ChakraCost.Value.ToString(System.Globalization.CultureInfo.InvariantCulture);
        }

        var context = new GameCardEffectContext(
            game: evaluationGame,
            actingPlayer: new Player { Id = player.PlayerId },
            sourceCardDefinition: sourceCardDefinition,
            sourceCardInstance: sourceCardInstance,
            arguments: arguments,
            selectedTargets: []);

        var canExecuteResult = LeaderEffectCanExecuteEvaluator.Evaluate(context, effectSpec, includeValidTargets: true);
        var requiresTargets = RequiresTargets(effectSpec);

        if (!canExecuteResult.CanExecute)
        {
            if (requiresTargets)
            {
                var resolvedTargets = new EffectTargetResolver().ResolveTargets(context, effectSpec);
                if (resolvedTargets.Count == 0)
                {
                    return (false, "No valid targets available.");
                }
            }

            return (false, canExecuteResult.FailedConditions.FirstOrDefault());
        }

        if (requiresTargets && canExecuteResult.ValidTargets.Count == 0)
        {
            return (false, "No valid targets available.");
        }

        return (true, null);
    }

    private static bool HasFaceDownChakra(GameState state, string playerId)
    {
        var playerIndex = state.Players.FindIndex(player =>
            string.Equals(player.PlayerId, playerId, StringComparison.Ordinal));

        var chakraStates = playerIndex switch
        {
            0 => state.Player1CurrentChakras,
            1 => state.Player2CurrentChakras,
            _ => null,
        };

        if (chakraStates is null)
        {
            return false;
        }

        return chakraStates.Any(isFaceUp => !isFaceUp);
    }

    private static bool RequiresTargets(EffectSpec effectSpec)
    {
        var targetRules = effectSpec.TargetRules;
        var hasExplicitTargetRules = targetRules.Rules.Count > 0
            || targetRules.ExactTargetCount.HasValue
            || targetRules.MinimumTargetCount.HasValue
            || targetRules.MaximumTargetCount.HasValue;

        if (hasExplicitTargetRules)
        {
            return true;
        }

        return effectSpec.AttributeModifications.Any(modification =>
            modification.TargetType == AttributeModificationTargetType.SelectedTargets);
    }

    private static bool HasNoCardsInRequiredTargetZones(GameState state, string actingPlayerId, EffectSpec effectSpec)
    {
        var targetRules = effectSpec.TargetRules;
        if (targetRules.Rules.Count == 0)
        {
            return false;
        }

        var hasCardsByRule = targetRules.Rules
            .Select(rule => RuleHasAnyCardsInScope(state, actingPlayerId, rule))
            .ToArray();

        return targetRules.Operator switch
        {
            RequirementGroupOperator.All => hasCardsByRule.Any(hasCards => !hasCards),
            _ => hasCardsByRule.All(hasCards => !hasCards),
        };
    }

    private static bool RuleHasAnyCardsInScope(GameState state, string actingPlayerId, EffectTargetRule rule)
    {
        var playersInScope = ResolveTargetPlayersInScope(state, actingPlayerId, rule.Scope);
        if (playersInScope.Count == 0)
        {
            return false;
        }

        if (rule.InZone == PlayerZone.Leader)
        {
            return playersInScope.Any(currentPlayer => currentPlayer.LeaderCardInstance is not null);
        }

        return playersInScope.Any(currentPlayer =>
            PlayerZoneCardAccessor.GetCards(rule.InZone, currentPlayer).Count > 0);
    }

    private static IReadOnlyList<PlayerState> ResolveTargetPlayersInScope(GameState state, string actingPlayerId, EffectTargetRange scope)
    {
        return scope switch
        {
            EffectTargetRange.Self => state.Players
                .Where(currentPlayer => string.Equals(currentPlayer.PlayerId, actingPlayerId, StringComparison.Ordinal))
                .ToList(),
            EffectTargetRange.Opponent => state.Players
                .Where(currentPlayer => !string.Equals(currentPlayer.PlayerId, actingPlayerId, StringComparison.Ordinal))
                .ToList(),
            EffectTargetRange.Any => state.Players,
            _ => [],
        };
    }

    private static string BuildEffectOptionLabel(EffectSpec effectSpec)
    {
        return effectSpec.EffectType switch
        {
            EffectKind.Recovery => nameof(EffectKind.Recovery),
            EffectKind.Support => nameof(EffectKind.Support),
            _ => BuildTimingLabel(effectSpec.Timing),
        };
    }

    private static string BuildTimingLabel(EffectTiming timing)
    {
        var rawLabel = timing.ToString();
        if (string.IsNullOrEmpty(rawLabel))
        {
            return rawLabel;
        }

        var builder = new System.Text.StringBuilder(rawLabel.Length + 8);

        for (var index = 0; index < rawLabel.Length; index++)
        {
            var currentCharacter = rawLabel[index];

            if (index > 0 && char.IsUpper(currentCharacter))
            {
                var previousCharacter = rawLabel[index - 1];
                var nextCharacterIsLower = index + 1 < rawLabel.Length && char.IsLower(rawLabel[index + 1]);

                if (char.IsLower(previousCharacter) || nextCharacterIsLower)
                {
                    builder.Append(' ');
                }
            }

            builder.Append(currentCharacter);
        }

        return builder.ToString();
    }

    private static bool IsLeaderEffectTimingAvailable(EffectTiming timing, GameState state, string actingPlayerId)
    {
        var isActivePlayer = IsSamePlayerId(state.ActivePlayerId, actingPlayerId);
        var isPriorityPlayer = IsSamePlayerId(state.PriorityPlayerId, actingPlayerId);

        return timing switch
        {
            EffectTiming.ActivateMain or EffectTiming.DuringYourMain =>
                state.Phase == GamePhase.MainPhase && isActivePlayer,
            EffectTiming.YourTurn => isActivePlayer,
            EffectTiming.Quick or EffectTiming.SupportActivated =>
                state.Phase == GamePhase.ActionStep && isPriorityPlayer,
            EffectTiming.DuringOpponentAttack =>
                state.Phase is GamePhase.AttackDeclaration or GamePhase.BlockerDeclaration or GamePhase.ActionStep
                && !isActivePlayer,
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

}
