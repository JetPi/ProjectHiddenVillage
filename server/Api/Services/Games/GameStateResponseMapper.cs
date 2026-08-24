using ProjectHiddenVillage.Server.Engine;
using ProjectHiddenVillage.Server.Engine.Interfaces;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public static class GameStateResponseMapper
{
    private static readonly IGamePhaseStateService PhaseStateService = new GamePhaseStateService();
    private const string ConcealedCardDefinitionId = "concealed-card";

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
            Leader: ToLeaderCardInstanceResponse(player.LeaderCardInstance),
            Deck: isRequestingPlayer
                ? player.Deck.ConvertAll(card => ToCardInstanceResponse(card, state.CardDefinitions, PlayerZone.Deck)) : [],
            DeckCount: player.Deck.Count,
            Hand: isRequestingPlayer
                ? player.Hand.ConvertAll(card => ToCardInstanceResponse(card, state.CardDefinitions, PlayerZone.Hand, state, pendingPrompt, isRequestingPlayer))
                : player.Hand.ConvertAll(ToConcealedCardInstanceResponse),
            HandCount: player.Hand.Count,
            CharacterField: player.Battlefield.ConvertAll(card => ToCardInstanceResponse(card, state.CardDefinitions, PlayerZone.CharacterField, state, pendingPrompt, isRequestingPlayer)),
            SupportZone: player.SupportZone.ConvertAll(card => ToCardInstanceResponse(card, state.CardDefinitions, PlayerZone.SupportZone, state, pendingPrompt, isRequestingPlayer)),
            Trash: player.DiscardPile.ConvertAll(card => ToCardInstanceResponse(card, state.CardDefinitions, PlayerZone.Trash)),
            ExileZone: player.ExileZone.ConvertAll(card => ToCardInstanceResponse(card, state.CardDefinitions, PlayerZone.ExileZone)));
    }

    private static CardInstanceResponse ToConcealedCardInstanceResponse(CardInstance card)
    {
        return new CardInstanceResponse(
            InstanceId: card.InstanceId,
            CardDefinitionId: ConcealedCardDefinitionId,
            OwnerPlayerId: card.OwnerPlayerId,
            ControllerPlayerId: card.ControllerPlayerId);
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
        var resolvedPower = card.PowerOverride ?? definition.Power;
        var resolvedDamage = card.DamageOverride ?? definition.Damage;
        var baseHealth = definition is CharacterCard characterDefinition
            ? characterDefinition.Health
            : 0;
        var resolvedBaseHealth = card.HealthOverride ?? baseHealth;
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
                            AvailableActions = cardActions
                        }
                        : new CardInstanceResponse(
                            InstanceId: card.InstanceId,
                            CardDefinitionId: card.CardDefinitionId,
                            OwnerPlayerId: card.OwnerPlayerId,
                            ControllerPlayerId: card.ControllerPlayerId),

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

        var isPriorityPlayer = string.Equals(state.PriorityPlayerId, card.ControllerPlayerId, StringComparison.Ordinal);
        if (!isPriorityPlayer || state.Phase != GamePhase.ActionStep)
        {
            return [];
        }

        return playerZone switch
        {
            PlayerZone.Hand =>
            [
                new GameActionOptionResponse(
                    ActionId: $"play-card:{card.InstanceId}",
                    Label: "Play",
                    IsEnabled: true)
            ],

            PlayerZone.SupportZone =>
            [
                new GameActionOptionResponse(
                    ActionId: $"activate-support:{card.InstanceId}",
                    Label: "Activate",
                    IsEnabled: true)
            ],

            PlayerZone.CharacterField =>
                !CanDeclareBattleAction(card, state)
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

        if (!card.EnteredFieldTurnNumber.HasValue || card.EnteredFieldTurnNumber.Value != state.TurnNumber)
        {
            return true;
        }

        return HasRushKeyword(card, state);
    }

    private static bool HasRushKeyword(CardInstance card, GameState state)
    {
        if (card.RuntimeKeywords.Any(keyword =>
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

    private static LeaderCardInstanceResponse ToLeaderCardInstanceResponse(LeaderCardInstanceState? leader)
    {
        return new LeaderCardInstanceResponse(
            InstanceId: leader!.InstanceId,
            CardDefinitionId: leader!.CardDefinitionId,
            OwnerPlayerId: leader!.OwnerPlayerId,
            ControllerPlayerId: leader!.ControllerPlayerId,
            IsExhausted: false,
            DisplayName: leader!.Name,
            Color: leader!.Color,
            Traits: leader!.Traits,
            Damage: leader!.Damage,
            Power: leader!.Power,
            TotalLife: leader!.TotalLife,
            CurrentLife: leader!.CurrentLife,
            RecoveryEffect: leader!.RecoveryEffect);
    }
}
