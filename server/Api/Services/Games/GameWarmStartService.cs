using ErrorOr;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Engine;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

/// <summary>
/// Drives the opening to the first MainPhase on the server, for the e2e suite. See
/// <see cref="IGameWarmStartService"/> for why this is safe before any client connects.
///
/// It talks to the registry directly (rather than <c>IGamePhaseHandlingService</c>) because the opening prompts
/// resolve no card effects: the registry's prompt overload without the effect orchestration is exactly the path
/// <c>GamePhaseAutomationDrainTests</c> uses, and keeping the dependency narrow keeps this testable with a real
/// in-memory registry and no fakes.
/// </summary>
public sealed class GameWarmStartService(
    InMemoryGameInstanceRegistry registry,
    GamePhaseAutomationOptions phaseAutomation) : IGameWarmStartService
{
    /// <summary>
    /// The opening is a handful of steps (deal, two mulligans, draw, refresh). The budget turns a phase graph that
    /// stops looping wrongly into an error instead of an unbounded loop.
    /// </summary>
    private const int StepBudget = 16;

    private const string KeepHandOption = "noMulligan";

    public ErrorOr<GameWarmStartResult> WarmStart(string gameCode, int startingPlayerPosition = 0)
    {
        if (!phaseAutomation.Enabled)
        {
            return Error.Validation(
                code: "Game.WarmStart.AutomationDisabled",
                description: "Warm start needs GamePhaseAutomation:Enabled, because the opening phases are engine-owned.");
        }

        if (startingPlayerPosition < 0)
        {
            return Error.Validation(
                code: "Game.WarmStart.InvalidStartingPlayer",
                description: "The starting player position cannot be negative.");
        }

        var normalizedGameCode = gameCode?.Trim().ToUpperInvariant() ?? string.Empty;
        if (normalizedGameCode.Length == 0)
        {
            return Error.Validation(
                code: "Game.WarmStart.MissingGameCode",
                description: "Game code is required.");
        }

        if (!registry.TryGet(normalizedGameCode, out var instance) || instance is null)
        {
            return Error.NotFound(
                code: "Game.WarmStart.NotFound",
                description: $"Game instance '{normalizedGameCode}' was not found.");
        }

        for (var step = 0; step < StepBudget; step += 1)
        {
            var startingPlayerId = instance.State.Players.ElementAtOrDefault(startingPlayerPosition)?.PlayerId ?? string.Empty;
            if (startingPlayerId.Length == 0)
            {
                return Error.Validation(
                    code: "Game.WarmStart.UnknownStartingPlayer",
                    description: $"The game has no player at join position {startingPlayerPosition}.");
            }

            if (instance.PendingPhasePresentation is { } presentation)
            {
                // Only happens when a client is already watching (a warm start on a live game); with nobody
                // connected the engine mints nothing and never lands here.
                foreach (var playerId in presentation.RequiredAckPlayerIds.ToArray())
                {
                    registry.AcknowledgePhasePresentation(instance.Id, playerId, presentation.PresentationId);
                }

                continue;
            }

            if (instance.GetPendingPrompt() is { } prompt)
            {
                registry.ResolvePrompt(
                    instance.Id,
                    prompt.RequestedPlayerId,
                    ResolveOpeningPromptOption(prompt, startingPlayerId));

                continue;
            }

            if (instance.State.Phase == GamePhase.MainPhase)
            {
                return new GameWarmStartResult(
                    instance.Id,
                    instance.State.Phase.ToString(),
                    instance.State.ActivePlayerId,
                    instance.State.TurnNumber);
            }

            // Nothing is pending, the phase is not one a player owns, and the engine did not walk any further:
            // the drain is not running (a configuration problem), so report it instead of spinning.
            return Error.Unexpected(
                code: "Game.WarmStart.Stalled",
                description: $"The opening stopped on {instance.State.Phase} with nothing pending and not in the MainPhase.");
        }

        return Error.Unexpected(
            code: "Game.WarmStart.StepBudgetExhausted",
            description: $"The opening did not reach the MainPhase within {StepBudget} steps (last phase: {instance.State.Phase}).");
    }

    /// <summary>
    /// The starting-player prompt names one player and offers <c>goFirst</c>/<c>goSecond</c> to *that* player, so
    /// choosing who starts means picking the option that makes the wanted player the active one.
    /// </summary>
    private static string ResolveOpeningPromptOption(GamePrompt prompt, string startingPlayerId)
    {
        if (prompt.Type != GamePromptType.ChooseStartingPlayer)
        {
            // Mulligan prompts (the only other kind the opening produces) keep the dealt hand.
            return prompt.Options.Contains(KeepHandOption)
                ? KeepHandOption
                : prompt.Options.FirstOrDefault() ?? string.Empty;
        }

        return string.Equals(prompt.RequestedPlayerId, startingPlayerId, StringComparison.Ordinal)
            ? "goFirst"
            : "goSecond";
    }
}
