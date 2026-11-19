namespace ProjectHiddenVillage.Server;

public enum EffectKind
{
    Unknown,
    Support,
    Recovery,
    SummonRequirement,
    Rush,
    Activated,
}

public enum EffectRestrictions
{
    None,
    OncePerTurn
}

public enum EffectTargetRange
{
    Self,
    Opponent,
    Any,
}

public enum AttributeModificationTargetType
{
    SelectedTargets,
    Leader
}

public enum AttributeModificationOperation
{
    Add,
    Subtract,
    Multiply,
    Set
}

public enum EffectAttributeType
{
    CardPower,
    CardHealth,
    CardDamage,
    LeaderPower,
    LeaderDamage,
    LeaderCurrentLife
}

public enum KeywordModificationTargetType
{
    SourceCard,
    SelectedTargets
}

public enum KeywordModificationOperation
{
    Add,
    Remove
}

public enum PassiveMode
{
    None,
    Continuous,
    Triggered
}

public enum EffectDurationMode
{
    Instant,
    DuringThisTurn,
    DuringOpponentNextTurn,
    UntilTheEndOfYourNextTurn,
    DuringThisBattle,
    Continuous
}

public enum PassiveTriggerKind
{
    StatsChanged,
    ZoneChanged,
    TurnChanged,
    PhaseChanged,
    StackResolved,
    Any
}

public enum PassiveReevaluationScope
{
    SourceCardOnly,
    SourceController,
    WholeGame
}

public enum PassiveConsequenceTargetPolicy
{
    SourceCard,
    TriggerSelectedTargets
}

public enum ChakraAdjustmentOperation
{
    Pay,
    Recover,
}

public enum FaceStateTargetCategory
{
    ChakraCard,
    SupportZoneCards,
    SummonCard,
    Leader,
    CharacterField,
}

public enum FaceStateLockOperation
{
    CannotTurnFaceUp,
}

public enum EffectExecutionTargetSource
{
    SelectedTargets,
    SourceCard,
    None,

    /// <summary>
    /// The selection an earlier step of the same chain made - the answer the chain was started with, or the one
    /// its <see cref="RuntimeEffects.SelectTargets"/> step asked for. Used by a step that must act on a card
    /// chosen before the chain reached it (N-013: choose the card, reveal the top of the deck, then freeze the
    /// chosen card only if the reveal matched).
    /// </summary>
    ChainTargets,
}

public enum EffectExecutionFlowMode
{
    PerStep,
    AtomicChain,
}

public enum EffectTiming
{
    Unspecified,
    ActivateMain,
    DuringOpponentAttack,
    SupportActivated,
    Quick,
    OnSummon,
    DuringYourMain,
    YourTurn,
    WhenAttacking,
}

public enum TributeTargetRole
{
    TributeMaterial,
    SummonCandidate,
}