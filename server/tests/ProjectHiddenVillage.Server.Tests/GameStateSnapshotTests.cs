using System.Reflection;
using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// A rewind point is only as good as its copy: a member the snapshot forgets is a piece of the board a redo silently
/// keeps from the future it just took back. The reflection test is the guard that turns "remember to add the new
/// field here" into a failing build.
/// </summary>
[TestClass]
public sealed class GameStateSnapshotTests
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);

    private readonly GameInstanceFactory factory = new();

    [TestMethod]
    public void EveryGameStateMember_IsEitherCopiedOrDeliberatelyShared()
    {
        var uncovered = typeof(GameState)
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(property => property.Name)
            .Where(name =>
                !GameStateSnapshot.CopiedGameStateMembers.Contains(name)
                && !GameStateSnapshot.SharedGameStateMembers.Contains(name))
            .ToArray();

        Assert.AreEqual(
            0,
            uncovered.Length,
            $"GameState members missing from the rewind snapshot: {string.Join(", ", uncovered)}");
    }

    [TestMethod]
    public void Clone_IsIndependentOfTheBoardItWasTakenFrom()
    {
        var state = CreateState();
        var clone = GameStateSnapshot.Clone(state);
        var snapshotJson = JsonSerializer.Serialize(clone, SerializerOptions);

        MutateEveryMember(state);

        Assert.AreEqual(snapshotJson, JsonSerializer.Serialize(clone, SerializerOptions));
    }

    [TestMethod]
    public void CopyInto_RestoresEveryCopiedMember()
    {
        var state = CreateState();
        var before = JsonSerializer.Serialize(state, SerializerOptions);
        var clone = GameStateSnapshot.Clone(state);

        MutateEveryMember(state);
        Assert.AreNotEqual(before, JsonSerializer.Serialize(state, SerializerOptions));

        GameStateSnapshot.CopyInto(state, clone);

        Assert.AreEqual(before, JsonSerializer.Serialize(state, SerializerOptions));
    }

    [TestMethod]
    public void CopyInto_LeavesTheCardMovementSequenceAhead_SoIdsAreNeverReused()
    {
        var state = CreateState();
        var clone = GameStateSnapshot.Clone(state);

        state.RecordCardMovement("draw", "card-instance-1", "p1", "Deck", "Hand");
        state.RecordCardMovement("discard", "card-instance-1", "p1", "Hand", "Trash");

        GameStateSnapshot.CopyInto(state, clone);
        state.RecordCardMovement("draw", "card-instance-1", "p1", "Trash", "Hand");

        var lastEventId = state.RecordedCardMovements[^1].EventId;
        Assert.AreEqual("movement:3", lastEventId);
    }

    private GameState CreateState()
    {
        var game = factory.Create(
            players:
            [
                new Player { Id = "p1", Deck = BuildDeck() },
                new Player { Id = "p2", Deck = BuildDeck() },
            ],
            cardDefinitions: BuildDefinitions(),
            random: new FixedIndexRandom(0));

        return game.State;
    }

    private static List<string> BuildDeck()
    {
        return ["leader-def", "card-1", "card-1", "card-1", "card-1", "card-1", "card-1", "card-1"];
    }

    /// <summary>Touches every copied member, so a copy that drops one cannot pass the round-trip test.</summary>
    private static void MutateEveryMember(GameState state)
    {
        state.TurnNumber += 1;
        state.ActivePlayerId = "p2";
        state.PriorityPlayerId = "p2";
        state.ConsecutivePasses += 1;
        state.LastPhaseEntryChangedAnything = !state.LastPhaseEntryChangedAnything;
        state.Phase = GamePhase.DrawInitialHand;
        state.Outcome = new GameOutcome
        {
            WinnerPlayerId = "p2",
            LoserPlayerIds = ["p1"],
            Reason = GameEndReason.DeckOut,
            TurnNumber = 7,
        };
        state.PhaseDirectives = new Queue<PhaseDirective>(
        [
            new PhaseDirective { Type = PhaseDirectiveType.SkipPhase, Phase = GamePhase.EndStep },
        ]);
        state.InsertedPhases = new Queue<GamePhase>([GamePhase.MainPhase]);
        state.Player1CurrentChakras[0] = !state.Player1CurrentChakras[0];
        state.Player2CurrentChakras[1] = !state.Player2CurrentChakras[1];
        state.Player1SummonCard = !state.Player1SummonCard;
        state.Player2SummonCard = !state.Player2SummonCard;
        state.SummonCardReadyByPlayerId["p1"] = !state.SummonCardReadyByPlayerId["p1"];
        state.Players[0].TurnCount += 1;
        state.Players[0].ResourcePool += 1;
        state.Players[0].DeckShuffleCount += 1;
        state.Players[0].LeaderCardInstance!.CurrentLife -= 1;
        state.Players[0].Hand.Clear();
        state.Players[0].DiscardPile.Add(new CardInstance
        {
            InstanceId = "discarded-1",
            CardDefinitionId = "card-1",
            OwnerPlayerId = "p1",
            ControllerPlayerId = "p1",
        });
        state.EffectResolutionStack.Add(new EffectResolutionStackEntry { EntryId = "stack-1" });
        state.PassiveStates.Add(new PassiveActivationState { PassiveKey = "passive-1", IsActive = true });
        state.EffectActivations.Add(new EffectActivationRecord("p1", "card-instance-1", "effect-1", 3));
        state.AppliedCardEffects.Add(new AppliedCardEffectState
        {
            Id = "effect-1",
            TargetCardInstanceId = "card-instance-1",
            ModifierKind = AppliedCardModifierKind.Attribute,
        });
        state.HasPendingAttack = !state.HasPendingAttack;
        state.PendingAttackDeclarationId = "declaration-1";
        state.PendingAttackAttackerInstanceId = "attacker-1";
        state.PendingAttackDefenderPlayerId = "p2";
        state.PendingAttackDefenderInstanceId = "defender-1";
        state.PendingAttackDefenderZone = PlayerZone.CharacterField;
        state.PendingAttackOptionalEffectSourceCardInstanceId = "source-1";
        state.PendingAttackOptionalEffectId = "optional-1";
        state.PendingAttackOptionalEffectPlayerId = "p2";
        state.RecordCardMovement("draw", "card-instance-1", "p1", "Deck", "Hand");
    }

    private static Dictionary<string, Card> BuildDefinitions()
    {
        return new Dictionary<string, Card>(StringComparer.Ordinal)
        {
            ["card-1"] = new Card
            {
                Id = "card-1",
                DisplayName = "card-1",
                Name = ["card-1"],
                Type = CardType.Character,
                Traits = [],
                Color = CardColor.Red,
                Description = string.Empty,
                Damage = 2,
                Power = 2,
                Conditions = [],
                Effects = [],
            },
            ["leader-def"] = new LeaderCard
            {
                Id = "leader-def",
                DisplayName = "Leader",
                Name = ["Leader"],
                Type = CardType.Leader,
                Traits = ["Leader"],
                Color = CardColor.Red,
                Life = 5,
                Effects = [],
            },
        };
    }

    private sealed class FixedIndexRandom(int fixedIndex) : Random
    {
        public override int Next(int maxValue)
        {
            return maxValue <= 0 ? 0 : fixedIndex % maxValue;
        }
    }
}
