using ErrorOr;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class DestroyCardEffect : IGameCardEffect
{
    public const string EffectKey = "DestroyCard";

    public string EffectTypeKey => EffectKey;

    public bool CanExecute(GameCardEffectContext context)
    {
        var cardDestroyEffect = context.SourceCardDefinition.Effects.FindAll(eff => eff.RuntimeEffectType == RuntimeEffects.DestroyCard).FirstOrDefault();

        if (cardDestroyEffect is null)
        {
            return false;
        }

        var requestingPlayer = context.ActingPlayer;
        var gameState = context.Game.State;
        var requestingPlayerState = context.Game.State.Players.Find(player => player.PlayerId == requestingPlayer.Id)!;
        var opposingPlayerState = context.Game.State.Players.Find(player => player.PlayerId != requestingPlayer.Id)!;

        var cardConditions = cardDestroyEffect.ContextRules.ToList();
        var playerConditions = cardConditions.Select(ruleSet => ruleSet.Player).Where(playerCondition => playerCondition is not null).ToList();
        var opponentConditions = cardConditions.Select(ruleSet => ruleSet.Opponent).Where(opponentCondition => opponentCondition is not null).ToList();

        if (playerConditions.Any())
        {
            foreach (var condition in playerConditions)
            {
                return CheckConditionsAgainstInstance(condition!, requestingPlayerState, gameState);
            }
        }

        if (opponentConditions.Any())
        {
            foreach (var condition in opponentConditions)
            {
                return CheckConditionsAgainstInstance(condition!, opposingPlayerState, gameState);
            }
        }


        return context is not null;
    }

    public bool CheckConditionsAgainstInstance(EffectContextCondition condition, PlayerState playerState, GameState gameState)
    {
        if (condition.InZone != null)
        {
            var zoneToCheck = condition.InZone.Value;

            var zoneInstance = GetZoneByEnum(zoneToCheck!, playerState);

            if (condition.InZoneAmount is not null)
            {
                var checkVal = zoneInstance.FindAll(cardInstance => CheckTraits(condition.InZoneAmount, gameState.CardDefinitions[cardInstance.CardDefinitionId]));
                return condition.InZoneAmount.Amount == checkVal.Count;
            }
            if (condition.InZoneAmountMin is not null)
            {
                var checkVal = zoneInstance.FindAll(cardInstance => CheckTraits(condition.InZoneAmountMin, gameState.CardDefinitions[cardInstance.CardDefinitionId]));
                return condition.InZoneAmountMin.Amount <= checkVal.Count;
            }
            if (condition.InZoneAmountMax is not null)
            {
                var checkVal = zoneInstance.FindAll(cardInstance => CheckTraits(condition.InZoneAmountMax, gameState.CardDefinitions[cardInstance.CardDefinitionId]));
                return condition.InZoneAmountMax.Amount >= checkVal.Count;
            }

        }
        return true;
    }

    public bool CheckTraits(ZoneAmountRestriction zoneRestriction, Card cardDefinition)
    {
        if (zoneRestriction.HasName?.Any() is true)
        {
            foreach (var name in zoneRestriction.HasName)
            {
                if (cardDefinition.Name.Contains(name))
                {
                    return true;
                }
            }
        }
        if (zoneRestriction.HasTrait?.Any() is true)
        {
            foreach (var trait in zoneRestriction.HasTrait)
            {
                if (cardDefinition.Traits.Contains(trait))
                {
                    return true;
                }
            }
        }
        if (zoneRestriction.HasColor?.Any() is true)
        {
            foreach (var color in zoneRestriction.HasColor)
            {
                if (cardDefinition.Color == color)
                {
                    return true;
                }
            }
        }
        if (zoneRestriction.HasType?.Any() is true)
        {
            foreach (var type in zoneRestriction.HasType)
            {
                if (cardDefinition.Type == type)
                {
                    return true;
                }
            }
        }
        return false;
    }

    public List<CardInstance> GetZoneByEnum(PlayerZone zone, PlayerState playerInstance)
    {
        return zone switch
        {
            PlayerZone.CharacterField => playerInstance.Battlefield,
            PlayerZone.Deck => playerInstance.Deck,
            PlayerZone.Trash => playerInstance.DiscardPile,
            PlayerZone.Hand => playerInstance.Hand,
            PlayerZone.SupportZone => playerInstance.SupportZone,
            PlayerZone.ExileZone => playerInstance.ExileZone,
            _ => throw new ArgumentOutOfRangeException()
        };
    }

    public IReadOnlyList<GameEffectTargetReference> GetValidTargets(GameCardEffectContext context)
    {
        return [];
    }

    public ErrorOr<Success> Execute(GameCardEffectContext context)
    {
        return Result.Success;
    }
}