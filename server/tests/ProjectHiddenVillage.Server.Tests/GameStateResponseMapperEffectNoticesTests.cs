using Microsoft.VisualStudio.TestTools.UnitTesting;
using ProjectHiddenVillage.Server.Api.Services.Games;

namespace ProjectHiddenVillage.Server.Tests;

/// <summary>
/// Covers the out-of-band notice channel: the action-log entries an effect writes when it resolves with nothing
/// to act on are projected into <see cref="GameStateResponse.EffectNotices"/> for the player whose effect it
/// was, and an effect selection prompt also names the player that owns its candidate zone.
/// </summary>
[TestClass]
public sealed class GameStateResponseMapperEffectNoticesTests
{
    [TestMethod]
    public void ToGameStateResponse_ProjectsNoticeTail_ForTheActingPlayerOnly()
    {
        var game = CreateGame();

        // An unrelated log entry must never reach the notice channel.
        game.AddActionLogEntry(
            actionType: GameTriggeredEffectRunner.OnSummonSkippedActionType,
            message: "skipped",
            playerId: "p1");

        game.AddActionLogEntry(
            actionType: EffectNoticeActionTypes.NoValidTargets,
            message: "Gamabunta's effect had no valid targets.",
            playerId: "p1",
            metadata: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["sourceCardInstanceId"] = "gamabunta-1",
                ["sourceCardDisplayName"] = "Gamabunta",
                ["effectId"] = "on-summon",
                ["selectionPromptKind"] = nameof(EffectSelectionPromptKind.SummonFromZone),
            });

        game.AddActionLogEntry(
            actionType: EffectNoticeActionTypes.NoValidTargets,
            message: "Opponent's effect had no valid targets.",
            playerId: "p2");

        var responder = GameStateResponseMapper.ToGameStateResponse(game, "p1");
        var opponent = GameStateResponseMapper.ToGameStateResponse(game, "p2");

        Assert.IsNotNull(responder.EffectNotices);
        Assert.AreEqual(1, responder.EffectNotices!.Count);

        var notice = responder.EffectNotices[0];
        Assert.AreEqual("gamabunta-1", notice.SourceCardInstanceId);
        Assert.AreEqual("Gamabunta", notice.SourceCardDisplayName);
        Assert.AreEqual(nameof(EffectSelectionPromptKind.SummonFromZone), notice.SelectionPromptKind);
        Assert.AreEqual("p1", notice.PlayerId);
        Assert.AreEqual(EffectNoticeActionTypes.NoValidTargets, notice.ActionType);
        Assert.IsFalse(string.IsNullOrWhiteSpace(notice.NoticeId));

        Assert.IsNotNull(opponent.EffectNotices);
        Assert.AreEqual(1, opponent.EffectNotices!.Count);
        Assert.AreEqual("Opponent's effect had no valid targets.", opponent.EffectNotices[0].Message);
    }

    [TestMethod]
    public void ToGameStateResponse_PublishesTheCandidatePlayer_ForAnEffectSelectionPrompt()
    {
        var game = CreateGame();

        game.EnqueuePrompt(new GamePrompt
        {
            Type = GamePromptType.Effect,
            RequestedPlayerId = "p1",
            Options = ["trash-card-1"],
            SelectionPromptKind = EffectSelectionPromptKind.SummonFromZone,
            CandidateZone = PlayerZone.Trash,
            CandidatePlayerId = "p1",
        });

        var responder = GameStateResponseMapper.ToGameStateResponse(game, "p1");
        var opponent = GameStateResponseMapper.ToGameStateResponse(game, "p2");

        Assert.IsNotNull(responder.PendingPrompt);
        Assert.AreEqual(nameof(PlayerZone.Trash), responder.PendingPrompt!.CandidateZone);
        Assert.AreEqual(nameof(EffectSelectionPromptKind.SummonFromZone), responder.PendingPrompt.SelectionPromptKind);
        // The owner of the candidate zone is what tells the client whose trash to render - only the player the
        // prompt is waiting on gets it (the opponent's copy carries no candidates at all).
        Assert.AreEqual("p1", responder.PendingPrompt.CandidatePlayerId);
        Assert.IsTrue(responder.PendingPrompt.IsAwaitingRequestingPlayer);

        Assert.IsNotNull(opponent.PendingPrompt);
        Assert.IsFalse(opponent.PendingPrompt!.IsAwaitingRequestingPlayer);
        Assert.IsNull(opponent.PendingPrompt.CandidatePlayerId);
        Assert.IsNull(opponent.PendingPrompt.CandidateZone);
    }

    private static GameInstance CreateGame()
    {
        return new GameInstance(new GameState
        {
            GameId = "game-notices-1",
            Phase = GamePhase.MainPhase,
            ActivePlayerId = "p1",
            PriorityPlayerId = "p1",
            CardDefinitions = new Dictionary<string, Card>(StringComparer.Ordinal)
            {
                ["leader-def"] = new LeaderCard
                {
                    Id = "leader-def",
                    DisplayName = "Leader",
                    Name = ["Leader"],
                    Type = CardType.Leader,
                    Color = CardColor.Blue,
                    Traits = ["Leader"],
                    Life = 5,
                    RecoveryEffect = "Recover 1",
                },
            },
            Players =
            [
                new PlayerState { PlayerId = "p1", LeaderCardInstance = CreateLeader("p1") },
                new PlayerState { PlayerId = "p2", LeaderCardInstance = CreateLeader("p2") },
            ],
        });
    }

    private static LeaderCardInstanceState CreateLeader(string playerId)
    {
        return new LeaderCardInstanceState
        {
            InstanceId = $"leader-{playerId}",
            CardDefinitionId = "leader-def",
            OwnerPlayerId = playerId,
            ControllerPlayerId = playerId,
            Name = "Leader",
            Color = CardColor.Blue,
            Traits = ["Leader"],
            Damage = 0,
            Power = 0,
            TotalLife = 5,
            CurrentLife = 5,
            RecoveryEffect = "Recover 1",
        };
    }
}
