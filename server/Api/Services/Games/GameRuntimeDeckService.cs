using System.Text.Json;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class GameRuntimeDeckService(IGameEffectHandlingService gameEffectHandlingService) : IGameRuntimeDeckService
{
	const int topDeck = 0;
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);

	public Card ToRuntimeCard(CardCatalogEntry entry)
	{
		var names = DeserializeOrDefault<List<string>>(entry.NameJson, []);
		var traits = DeserializeOrDefault<List<string>>(entry.TraitsJson, []);
		var conditions = DeserializeConditions(entry.ConditionsJson);
		var effects = DeserializeOrDefault<List<EffectSpec>>(entry.EffectsJson, []);

		Card card = entry.Type switch
		{
			CardType.Leader => new LeaderCard
			{
				Life = entry.Life ?? 0,
				RecoveryEffect = gameEffectHandlingService.ExtractRecoveryEffect(entry.Description)
			},
			CardType.Character or CardType.ExCharacter => new CharacterCard
			{
				Health = entry.Health ?? 0,
				SupportName = entry.SupportName ?? string.Empty,
				SupportEffect = entry.SupportEffect ?? string.Empty
			},
			_ => throw new InvalidOperationException($"Card type '{entry.Type}' cannot be instantiated as a runtime card.")
		};

		card.Id = entry.CardId;
		card.Image = entry.Image;
		card.OriginalId = entry.OriginalId;
		card.MainAlternate = entry.MainAlternate;
		card.Attribute = entry.Attribute;
		card.Name = names;
		card.DisplayName = entry.DisplayName;
		card.Type = entry.Type;
		card.Traits = traits;
		card.Color = entry.Color;
		card.Description = entry.Description;
		card.MainEffect = gameEffectHandlingService.ExtractMainEffect(entry.Description);
		card.Damage = entry.Damage;
		card.Power = entry.Power;
		card.CannotBeNormalSummoned = entry.CannotBeNormalSummoned;
		card.Conditions = conditions;
		card.Effects = effects;

		return card;
	}

	private static List<string> DeserializeConditions(string json)
	{
		if (string.IsNullOrWhiteSpace(json))
		{
			return [];
		}

		try
		{
			var asStrings = JsonSerializer.Deserialize<List<string>>(json, SerializerOptions);
			if (asStrings is not null)
			{
				return asStrings
					.Where(condition => !string.IsNullOrWhiteSpace(condition))
					.Select(condition => condition.Trim())
					.ToList();
			}
		}
		catch (JsonException)
		{
		}

		try
		{
			var legacy = JsonSerializer.Deserialize<List<LegacyConditionSpec>>(json, SerializerOptions) ?? [];
			return legacy
				.Select(condition => condition.Id)
				.Where(id => !string.IsNullOrWhiteSpace(id))
				.Select(id => id.Trim())
				.ToList();
		}
		catch (JsonException)
		{
			return [];
		}
	}

	public List<CardInstance> ToRuntimeDeck(
		IReadOnlyList<string> cardDefinitionIds,
		IReadOnlyDictionary<string, Card> cardDefinitions,
		string playerId)
	{
		if (string.IsNullOrWhiteSpace(playerId))
		{
			throw new ArgumentException("Player id must be provided.", nameof(playerId));
		}

		if (cardDefinitionIds is null)
		{
			throw new ArgumentNullException(nameof(cardDefinitionIds));
		}

		if (cardDefinitions is null)
		{
			throw new ArgumentNullException(nameof(cardDefinitions));
		}

		var rawDeck = new List<CardInstance>();

		foreach (var cardDefinitionId in cardDefinitionIds)
		{
			if (!cardDefinitions.TryGetValue(cardDefinitionId, out var definition))
			{
				continue;
			}

			if (definition.Type == CardType.Leader)
			{
				continue;
			}

			if (definition.Type is not (CardType.Character or CardType.ExCharacter))
			{
				throw new InvalidOperationException($"Card '{cardDefinitionId}' has non-instantiable type '{definition.Type}'.");
			}

			rawDeck.Add(new CardInstance
			{
				InstanceId = Guid.NewGuid().ToString("N"),
				CardDefinitionId = cardDefinitionId,
				OwnerPlayerId = playerId,
				ControllerPlayerId = playerId,
				IsExhausted = false,
				IsRested = false
			});
		}

		return DeckShuffle(rawDeck);
	}

	public List<CardInstance> DeckShuffle(List<CardInstance> deck, Random? random = null)
	{
		GameDeckShuffle.Shuffle(deck, random);
		return deck;
	}

	public CardInstance MoveCardToZone(
		GameInstance gameInstance,
		string playerId,
		PlayerZone sourceZone,
		PlayerZone destinationZone,
		string cardInstanceId,
		int? destinationIndex = null,
		string? destinationPlayerId = null,
		bool allowCrossPlayer = false)
	{
        ArgumentNullException.ThrowIfNull(gameInstance);

        if (string.IsNullOrWhiteSpace(playerId))
		{
			throw new ArgumentException("Player id must be provided.", nameof(playerId));
		}

		if (string.IsNullOrWhiteSpace(cardInstanceId))
		{
			throw new ArgumentException("Card instance id must be provided.", nameof(cardInstanceId));
		}

		var resolvedDestinationPlayerId = string.IsNullOrWhiteSpace(destinationPlayerId)
			? playerId
			: destinationPlayerId;

		var isCrossPlayerMove = !string.Equals(playerId, resolvedDestinationPlayerId, StringComparison.Ordinal);
		if (isCrossPlayerMove && !allowCrossPlayer)
		{
			throw new InvalidOperationException(
				$"Cross-player zone moves require '{nameof(allowCrossPlayer)}' to be true. Source player '{playerId}', destination player '{resolvedDestinationPlayerId}'.");
		}

		var sourceList = ResolvePlayerZone(gameInstance, playerId, sourceZone);
		var destinationList = ResolvePlayerZone(gameInstance, resolvedDestinationPlayerId, destinationZone);

		var sourceIndex = sourceList.FindIndex(card =>
			string.Equals(card.InstanceId, cardInstanceId, StringComparison.Ordinal));

		if (sourceIndex < 0)
		{
			throw new InvalidOperationException(
				$"Card instance '{cardInstanceId}' was not found in source zone '{sourceZone}' for player '{playerId}'.");
		}

		var movedCard = sourceList[sourceIndex];
		sourceList.RemoveAt(sourceIndex);

		var insertIndex = destinationIndex ?? topDeck;
		if (ReferenceEquals(sourceList, destinationList) && destinationIndex.HasValue && destinationIndex.Value > sourceIndex)
		{
			insertIndex--;
		}

		if (insertIndex < topDeck || insertIndex > destinationList.Count)
		{
			throw new ArgumentOutOfRangeException(
				nameof(destinationIndex),
				destinationIndex,
				$"Destination index must be between {topDeck} and {destinationList.Count}.");
		}

		if (isCrossPlayerMove)
		{
			movedCard.ControllerPlayerId = resolvedDestinationPlayerId;
		}

		if (destinationZone == PlayerZone.CharacterField)
		{
			movedCard.EnteredFieldTurnNumber = gameInstance.State.TurnNumber;
			movedCard.IsRested = false;
		}

		destinationList.Insert(insertIndex, movedCard);
		return movedCard;
	}

	public CardInstance? DrawCardFromDeck(GameInstance gameInstance, string playerId)
	{
		ArgumentNullException.ThrowIfNull(gameInstance);

		if (string.IsNullOrWhiteSpace(playerId))
		{
			throw new ArgumentException("Player id must be provided.", nameof(playerId));
		}

		var deck = ResolvePlayerZone(gameInstance, playerId, PlayerZone.Deck);
		var bottomDeck = deck.Count - 1;

		if (bottomDeck < topDeck)
		{
			return null;
		}

		var topCard = deck[topDeck];
		return MoveCardToZone(
			gameInstance,
			playerId,
			PlayerZone.Deck,
			PlayerZone.Hand,
			topCard.InstanceId);
	}

	public CardInstance MoveCardFromHandToField(GameInstance gameInstance, string playerId, string cardInstanceId)
	{
		return MoveCardToZone(
			gameInstance,
			playerId,
		    PlayerZone.Hand,
			PlayerZone.CharacterField,
			cardInstanceId);
	}

	public CardInstance MoveCardFromFieldToTrash(GameInstance gameInstance, string playerId, string cardInstanceId)
	{
		return MoveCardToZone(
			gameInstance,
			playerId,
			PlayerZone.CharacterField,
			PlayerZone.Trash,
			cardInstanceId);
	}

	public CardInstance MoveCardFromHandToSupportZone(
		GameInstance gameInstance,
		string playerId,
		string cardInstanceId,
		int supportZoneIndex)
	{
		return MoveCardToZone(
			gameInstance,
			playerId,
			PlayerZone.Hand,
			PlayerZone.SupportZone,
			cardInstanceId,
			destinationIndex: supportZoneIndex);
	}

	public CardInstance MoveCardFromSupportZoneToTrash(GameInstance gameInstance, string playerId, string cardInstanceId)
	{
		return MoveCardToZone(
			gameInstance,
			playerId,
			PlayerZone.SupportZone,
			PlayerZone.Trash,
			cardInstanceId);
	}

	public CardInstance MoveCardFromHandToTopDeck(GameInstance gameInstance, string playerId, string cardInstanceId)
	{
		return MoveCardToZone(
			gameInstance,
			playerId,
			PlayerZone.Hand,
			PlayerZone.Deck,
			cardInstanceId,
			destinationIndex: topDeck);
	}

	public CardInstance MoveCardFromZoneToExileZone(
		GameInstance gameInstance,
		string playerId,
		PlayerZone sourceZone,
		string cardInstanceId)
	{
		return MoveCardToZone(
			gameInstance,
			playerId,
			sourceZone,
			PlayerZone.ExileZone,
			cardInstanceId);
	}

	private static List<CardInstance> ResolvePlayerZone(GameInstance gameInstance, string playerId, PlayerZone zone)
	{
		var player = gameInstance.State.Players.FirstOrDefault(current =>
			string.Equals(current.PlayerId, playerId, StringComparison.Ordinal));

		if (player is null)
		{
			throw new InvalidOperationException($"Player '{playerId}' was not found in game '{gameInstance.Id}'.");
		}

		return zone switch
		{
			PlayerZone.Hand => player.Hand,
			PlayerZone.Deck => player.Deck,
			PlayerZone.Trash => player.DiscardPile,
			PlayerZone.ExileZone => player.ExileZone,
			PlayerZone.SupportZone => player.SupportZone,
			PlayerZone.CharacterField => player.Battlefield,
			_ => throw new ArgumentOutOfRangeException(nameof(zone), zone, "Unsupported zone.")
		};
	}

	private static T DeserializeOrDefault<T>(string json, T fallback)
	{
		if (string.IsNullOrWhiteSpace(json))
		{
			return fallback;
		}

		try
		{
			return JsonSerializer.Deserialize<T>(json, SerializerOptions) ?? fallback;
		}
		catch (JsonException)
		{
			return fallback;
		}
	}

	private sealed record LegacyConditionSpec(string Id);
}
