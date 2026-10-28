namespace ProjectHiddenVillage.Server;

/// <summary>
/// Deep copies and restores the parts of a game a rewind has to put back. <see cref="CopiedGameStateMembers"/> and
/// <see cref="SharedGameStateMembers"/> are an allow-list: <c>GameStateSnapshotContractTests</c> fails when a
/// <see cref="GameState"/> member is neither copied here nor deliberately shared, so a new field cannot be silently
/// dropped from a rewind.
/// </summary>
public static class GameStateSnapshot
{
    /// <summary>
    /// Card definitions are the game's catalogue, not board state: nothing mutates them during play, so clones share
    /// the same dictionary instead of paying for a copy at every rewind point.
    /// </summary>
    public static readonly IReadOnlySet<string> SharedGameStateMembers = new HashSet<string>(StringComparer.Ordinal)
    {
        nameof(GameState.CardDefinitions),
    };

    public static readonly IReadOnlySet<string> CopiedGameStateMembers = new HashSet<string>(StringComparer.Ordinal)
    {
        nameof(GameState.GameId),
        nameof(GameState.GameSeed),
        nameof(GameState.TurnNumber),
        nameof(GameState.ActivePlayerId),
        nameof(GameState.PriorityPlayerId),
        nameof(GameState.ConsecutivePasses),
        nameof(GameState.LastPhaseEntryChangedAnything),
        nameof(GameState.Phase),
        nameof(GameState.Outcome),
        nameof(GameState.PhaseDirectives),
        nameof(GameState.InsertedPhases),
        nameof(GameState.Player1CurrentChakras),
        nameof(GameState.Player2CurrentChakras),
        nameof(GameState.Player1SummonCard),
        nameof(GameState.Player2SummonCard),
        nameof(GameState.SummonCardReadyByPlayerId),
        nameof(GameState.Players),
        nameof(GameState.EffectResolutionStack),
        nameof(GameState.PassiveStates),
        nameof(GameState.RecordedCardMovements),
        nameof(GameState.EffectActivations),
        nameof(GameState.AppliedCardEffects),
        nameof(GameState.HasPendingAttack),
        nameof(GameState.PendingAttackDeclarationId),
        nameof(GameState.PendingAttackAttackerInstanceId),
        nameof(GameState.PendingAttackDefenderPlayerId),
        nameof(GameState.PendingAttackDefenderInstanceId),
        nameof(GameState.PendingAttackDefenderZone),
        nameof(GameState.PendingAttackOptionalEffectSourceCardInstanceId),
        nameof(GameState.PendingAttackOptionalEffectId),
        nameof(GameState.PendingAttackOptionalEffectPlayerId),
    };

    public static GameState Clone(GameState state)
    {
        ArgumentNullException.ThrowIfNull(state);

        var clone = new GameState
        {
            GameId = state.GameId,
            GameSeed = state.GameSeed,
            TurnNumber = state.TurnNumber,
            ActivePlayerId = state.ActivePlayerId,
            PriorityPlayerId = state.PriorityPlayerId,
            ConsecutivePasses = state.ConsecutivePasses,
            LastPhaseEntryChangedAnything = state.LastPhaseEntryChangedAnything,
            Phase = state.Phase,
            Outcome = CloneOutcome(state.Outcome),
            PhaseDirectives = new Queue<PhaseDirective>(state.PhaseDirectives.Select(CloneDirective)),
            InsertedPhases = new Queue<GamePhase>(state.InsertedPhases),
            CardDefinitions = state.CardDefinitions,
            Player1CurrentChakras = (bool[])state.Player1CurrentChakras.Clone(),
            Player2CurrentChakras = (bool[])state.Player2CurrentChakras.Clone(),
            Player1SummonCard = state.Player1SummonCard,
            Player2SummonCard = state.Player2SummonCard,
            SummonCardReadyByPlayerId = new Dictionary<string, bool>(state.SummonCardReadyByPlayerId, StringComparer.Ordinal),
            Players = state.Players.Select(ClonePlayer).ToList(),
            EffectResolutionStack = state.EffectResolutionStack.Select(CloneStackEntry).ToList(),
            PassiveStates = state.PassiveStates.Select(ClonePassiveState).ToList(),
            EffectActivations = [.. state.EffectActivations],
            AppliedCardEffects = state.AppliedCardEffects.Select(CloneAppliedEffect).ToList(),
            HasPendingAttack = state.HasPendingAttack,
            PendingAttackDeclarationId = state.PendingAttackDeclarationId,
            PendingAttackAttackerInstanceId = state.PendingAttackAttackerInstanceId,
            PendingAttackDefenderPlayerId = state.PendingAttackDefenderPlayerId,
            PendingAttackDefenderInstanceId = state.PendingAttackDefenderInstanceId,
            PendingAttackDefenderZone = state.PendingAttackDefenderZone,
            PendingAttackOptionalEffectSourceCardInstanceId = state.PendingAttackOptionalEffectSourceCardInstanceId,
            PendingAttackOptionalEffectId = state.PendingAttackOptionalEffectId,
            PendingAttackOptionalEffectPlayerId = state.PendingAttackOptionalEffectPlayerId,
        };

        clone.RecordedCardMovements.AddRange(state.RecordedCardMovements);
        return clone;
    }

    /// <summary>
    /// Writes a snapshot back onto the live state. The object is reused instead of replaced so nothing holding
    /// <see cref="GameInstance.State"/> sees a different instance. <see cref="GameState.CardDefinitions"/> is left
    /// alone, and the card-movement sequence keeps counting: the client de-duplicates animation events by id, so a
    /// restored tail must never hand out an id a client has already handled.
    /// </summary>
    public static void CopyInto(GameState target, GameState source)
    {
        ArgumentNullException.ThrowIfNull(target);
        ArgumentNullException.ThrowIfNull(source);

        target.GameId = source.GameId;
        target.GameSeed = source.GameSeed;
        target.TurnNumber = source.TurnNumber;
        target.ActivePlayerId = source.ActivePlayerId;
        target.PriorityPlayerId = source.PriorityPlayerId;
        target.ConsecutivePasses = source.ConsecutivePasses;
        target.LastPhaseEntryChangedAnything = source.LastPhaseEntryChangedAnything;
        target.Phase = source.Phase;
        target.Outcome = CloneOutcome(source.Outcome);
        target.PhaseDirectives = new Queue<PhaseDirective>(source.PhaseDirectives.Select(CloneDirective));
        target.InsertedPhases = new Queue<GamePhase>(source.InsertedPhases);
        target.Player1CurrentChakras = (bool[])source.Player1CurrentChakras.Clone();
        target.Player2CurrentChakras = (bool[])source.Player2CurrentChakras.Clone();
        target.Player1SummonCard = source.Player1SummonCard;
        target.Player2SummonCard = source.Player2SummonCard;
        target.SummonCardReadyByPlayerId = new Dictionary<string, bool>(source.SummonCardReadyByPlayerId, StringComparer.Ordinal);
        target.Players = source.Players.Select(ClonePlayer).ToList();
        target.EffectResolutionStack = source.EffectResolutionStack.Select(CloneStackEntry).ToList();
        target.PassiveStates = source.PassiveStates.Select(ClonePassiveState).ToList();
        target.EffectActivations = [.. source.EffectActivations];
        target.AppliedCardEffects = source.AppliedCardEffects.Select(CloneAppliedEffect).ToList();
        target.HasPendingAttack = source.HasPendingAttack;
        target.PendingAttackDeclarationId = source.PendingAttackDeclarationId;
        target.PendingAttackAttackerInstanceId = source.PendingAttackAttackerInstanceId;
        target.PendingAttackDefenderPlayerId = source.PendingAttackDefenderPlayerId;
        target.PendingAttackDefenderInstanceId = source.PendingAttackDefenderInstanceId;
        target.PendingAttackDefenderZone = source.PendingAttackDefenderZone;
        target.PendingAttackOptionalEffectSourceCardInstanceId = source.PendingAttackOptionalEffectSourceCardInstanceId;
        target.PendingAttackOptionalEffectId = source.PendingAttackOptionalEffectId;
        target.PendingAttackOptionalEffectPlayerId = source.PendingAttackOptionalEffectPlayerId;

        target.RecordedCardMovements.Clear();
        target.RecordedCardMovements.AddRange(source.RecordedCardMovements);
    }

    public static List<GamePrompt> ClonePrompts(IEnumerable<GamePrompt> prompts)
    {
        ArgumentNullException.ThrowIfNull(prompts);
        return prompts.Select(ClonePrompt).ToList();
    }

    private static PhaseDirective CloneDirective(PhaseDirective directive) =>
        new()
        {
            Type = directive.Type,
            Phase = directive.Phase,
        };

    private static GameOutcome? CloneOutcome(GameOutcome? outcome) =>
        outcome is null
            ? null
            : new GameOutcome
            {
                WinnerPlayerId = outcome.WinnerPlayerId,
                LoserPlayerIds = [.. outcome.LoserPlayerIds],
                Reason = outcome.Reason,
                TurnNumber = outcome.TurnNumber,
            };

    private static PlayerState ClonePlayer(PlayerState player) =>
        new()
        {
            PlayerId = player.PlayerId,
            DeckShuffleSeed = player.DeckShuffleSeed,
            DeckShuffleCount = player.DeckShuffleCount,
            TurnCount = player.TurnCount,
            ResourcePool = player.ResourcePool,
            LeaderCardInstance = player.LeaderCardInstance is null ? null : CloneLeader(player.LeaderCardInstance),
            Deck = player.Deck.Select(CloneCard).ToList(),
            Hand = player.Hand.Select(CloneCard).ToList(),
            Battlefield = player.Battlefield.Select(CloneCard).ToList(),
            DiscardPile = player.DiscardPile.Select(CloneCard).ToList(),
            SupportZone = player.SupportZone.Select(CloneCard).ToList(),
            ExileZone = player.ExileZone.Select(CloneCard).ToList(),
        };

    private static CardInstance CloneCard(CardInstance card) =>
        card is LeaderCardInstanceState leader
            ? CloneLeader(leader)
            : CopyCardIdentity(card, new CardInstance());

    private static LeaderCardInstanceState CloneLeader(LeaderCardInstanceState leader)
    {
        var clone = new LeaderCardInstanceState
        {
            Name = leader.Name,
            Color = leader.Color,
            Description = leader.Description,
            Traits = [.. leader.Traits],
            Damage = leader.Damage,
            Power = leader.Power,
            RecoveryEffect = leader.RecoveryEffect,
            TotalLife = leader.TotalLife,
            CurrentLife = leader.CurrentLife,
        };

        return (LeaderCardInstanceState)CopyCardIdentity(leader, clone);
    }

    private static CardInstance CopyCardIdentity(CardInstance source, CardInstance target)
    {
        target.InstanceId = source.InstanceId;
        target.CardDefinitionId = source.CardDefinitionId;
        target.OwnerPlayerId = source.OwnerPlayerId;
        target.ControllerPlayerId = source.ControllerPlayerId;
        target.IsExhausted = source.IsExhausted;
        target.IsRested = source.IsRested;
        target.PowerOverride = source.PowerOverride;
        target.DamageOverride = source.DamageOverride;
        target.HealthOverride = source.HealthOverride;
        target.CurrentHealth = source.CurrentHealth;
        target.RuntimeKeywords = [.. source.RuntimeKeywords];
        target.EffectsSuppressedWhileOnField = source.EffectsSuppressedWhileOnField;
        target.EnteredFieldTurnNumber = source.EnteredFieldTurnNumber;
        target.IsRevealedToBothPlayers = source.IsRevealedToBothPlayers;
        target.RevealedInZone = source.RevealedInZone;
        target.IsFaceUp = source.IsFaceUp;
        target.SupportSlotIndex = source.SupportSlotIndex;
        return target;
    }

    private static EffectResolutionStackEntry CloneStackEntry(EffectResolutionStackEntry entry) =>
        new()
        {
            EntryId = entry.EntryId,
            SourcePlayerId = entry.SourcePlayerId,
            SourceZone = entry.SourceZone,
            SourceCardInstanceId = entry.SourceCardInstanceId,
            EffectTypeKey = entry.EffectTypeKey,
            ActivatedEffectId = entry.ActivatedEffectId,
            SelectedTargets = [.. entry.SelectedTargets],
            Arguments = new Dictionary<string, string>(entry.Arguments, StringComparer.Ordinal),
            IsNegated = entry.IsNegated,
        };

    private static PassiveActivationState ClonePassiveState(PassiveActivationState state) =>
        new()
        {
            PassiveKey = state.PassiveKey,
            SourceCardInstanceId = state.SourceCardInstanceId,
            SourcePlayerId = state.SourcePlayerId,
            EffectSpecId = state.EffectSpecId,
            IsActive = state.IsActive,
            LastChangedAtTurn = state.LastChangedAtTurn,
            LastChangedAtPhase = state.LastChangedAtPhase,
        };

    private static AppliedCardEffectState CloneAppliedEffect(AppliedCardEffectState effect) =>
        new()
        {
            Id = effect.Id,
            SourceCardInstanceId = effect.SourceCardInstanceId,
            EffectSpecId = effect.EffectSpecId,
            TargetCardInstanceId = effect.TargetCardInstanceId,
            ModifierKind = effect.ModifierKind,
            DurationMode = effect.DurationMode,
            AttributeType = effect.AttributeType,
            AttributeOperation = effect.AttributeOperation,
            AttributeValue = effect.AttributeValue,
            AttributeMinimumValue = effect.AttributeMinimumValue,
            AttributeMaximumValue = effect.AttributeMaximumValue,
            KeywordOperation = effect.KeywordOperation,
            Keyword = effect.Keyword,
            FaceStateTargetCategory = effect.FaceStateTargetCategory,
            FaceStateLockOperation = effect.FaceStateLockOperation,
            TargetPlayerId = effect.TargetPlayerId,
            AppliedByPlayerId = effect.AppliedByPlayerId,
            AppliedTurnNumber = effect.AppliedTurnNumber,
        };

    private static GamePrompt ClonePrompt(GamePrompt prompt) =>
        new()
        {
            PromptId = prompt.PromptId,
            Type = prompt.Type,
            RequestedPlayerId = prompt.RequestedPlayerId,
            Options = [.. prompt.Options],
            SelectionPromptKind = prompt.SelectionPromptKind,
            CandidateZone = prompt.CandidateZone,
            CandidatePlayerId = prompt.CandidatePlayerId,
            MinimumSelection = prompt.MinimumSelection,
            MaximumSelection = prompt.MaximumSelection,
            EffectContinuation = prompt.EffectContinuation is null ? null : CloneContinuation(prompt.EffectContinuation),
        };

    private static PendingEffectContinuation CloneContinuation(PendingEffectContinuation continuation) =>
        new()
        {
            PromptId = continuation.PromptId,
            ResumeNodeId = continuation.ResumeNodeId,
            ActingPlayerId = continuation.ActingPlayerId,
            SourceCardDefinitionId = continuation.SourceCardDefinitionId,
            SourceCardInstanceId = continuation.SourceCardInstanceId,
            Arguments = new Dictionary<string, string>(continuation.Arguments, StringComparer.Ordinal),
            SelectedTargets = [.. continuation.SelectedTargets],
            RevealPresentation = continuation.RevealPresentation is null
                ? null
                : new PendingRevealPresentation
                {
                    PresentedTargets = [.. continuation.RevealPresentation.PresentedTargets],
                },
        };
}
