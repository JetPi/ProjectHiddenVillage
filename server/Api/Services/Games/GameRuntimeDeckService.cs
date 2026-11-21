using System.Text.Json;
using ProjectHiddenVillage.Server.Api.Serialization;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Api.Services.Games;

public sealed class GameRuntimeDeckService(IGameEffectHandlingService gameEffectHandlingService) : IGameRuntimeDeckService
{
	const int topDeck = 0;
	private static readonly JsonSerializerOptions SerializerOptions = CreateSerializerOptions();

	private static JsonSerializerOptions CreateSerializerOptions()
	{
		var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
		options.Converters.Add(new FlexibleEnumJsonConverterFactory());
		return options;
	}

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
		string playerId,
		Random? random = null)
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

		return DeckShuffle(rawDeck, random);
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

		// Every destination precondition is resolved before anything leaves the source zone. A refused move used
		// to throw *after* the card had been taken out of its zone, which left the instance in no zone at all: the
		// caller reported an error, the hub still published the mutated state, and both players lost the card for
		// good (see plans/trash-pile-card-loss-diagnosis.md).
		//
		// A support destination is not a list position: its index is a slot, resolved by its own rule below. Every
		// other destination is validated against its size before the removal. For a same-zone move the requested
		// index is compared with the size *before* the card is taken out, which is the same accepted range the old
		// post-removal check accepted: the decrement below maps `index == Count` onto the post-removal list end.
		if (destinationZone != PlayerZone.SupportZone
			&& destinationIndex.HasValue
			&& (destinationIndex.Value < topDeck || destinationIndex.Value > destinationList.Count))
		{
			throw new ArgumentOutOfRangeException(
				nameof(destinationIndex),
				destinationIndex,
				$"Destination index must be between {topDeck} and {destinationList.Count}.");
		}

		// The support slot is resolved before the removal for the same reason: a full row or an occupied/out-of-
		// range requested slot refuses the move while the card is still in its source zone.
		int? supportSlotIndexToAssign = null;
		if (destinationZone == PlayerZone.SupportZone)
		{
			// Heal a row that already holds two cards on one slot before asking it for a free one.
			SupportSlotRules.NormalizeSlots(destinationList);

			// Moving within the row: the card's own slot must not count as occupied by itself.
			var supportAssignmentRow = ReferenceEquals(sourceList, destinationList)
				? destinationList
					.Where(card => !string.Equals(card.InstanceId, cardInstanceId, StringComparison.Ordinal))
					.ToList()
				: destinationList;

			if (!SupportSlotRules.TryResolveSlot(supportAssignmentRow, destinationIndex, out var resolvedSupportSlotIndex))
			{
				throw new InvalidOperationException("No empty support slot is available for this card.");
			}

			supportSlotIndexToAssign = resolvedSupportSlotIndex;
		}

		var insertIndex = destinationIndex ?? topDeck;
		if (ReferenceEquals(sourceList, destinationList) && destinationIndex.HasValue && destinationIndex.Value > sourceIndex)
		{
			insertIndex--;
		}

		var movedCard = sourceList[sourceIndex];
		sourceList.RemoveAt(sourceIndex);

		// Slot bookkeeping for the row the card is leaving has to clear before it can claim a new slot, so it
		// stays immediately after the removal.
		if (sourceZone == PlayerZone.SupportZone)
		{
			movedCard.SupportSlotIndex = null;
		}

		// The card enters its destination as the first statement after the removal: the destination index is
		// validated and the support slot is resolved, so neither insert can fail. Everything below only mutates
		// the card, which is what makes it impossible for a later failure to leave the card in no zone.
		if (destinationZone == PlayerZone.SupportZone)
		{
			movedCard.SupportSlotIndex = supportSlotIndexToAssign!.Value;
			destinationList.Add(movedCard);

			// Stable order on purpose: the client paints one card per slot, so a row it receives twice must not
			// shuffle. `List.Sort` is not stable and left the duplicate pair in an arbitrary order.
			var orderedSupportCards = destinationList
				.OrderBy(card => card.SupportSlotIndex ?? int.MaxValue)
				.ThenBy(card => card.InstanceId, StringComparer.Ordinal)
				.ToList();
			destinationList.Clear();
			destinationList.AddRange(orderedSupportCards);
		}
		else
		{
			destinationList.Insert(insertIndex, movedCard);
		}

		if (movedCard.IsRevealedToBothPlayers && movedCard.RevealedInZone != destinationZone)
		{
			movedCard.IsRevealedToBothPlayers = false;
			movedCard.RevealedInZone = null;
		}

		// Leaving the field drops every runtime value the card accumulated while it was there (stat overrides,
		// damage, granted keywords, suppression) and dispels temporary effects aimed at it, so it cannot carry
		// stale buffs into the trash and back. Runs for both destinations, including the SupportZone fast-path.
		if (sourceZone == PlayerZone.CharacterField)
		{
			CharacterFieldStateRules.ApplyOnFieldExit(gameInstance.State, movedCard);
		}

		if (isCrossPlayerMove)
		{
			movedCard.ControllerPlayerId = resolvedDestinationPlayerId;
		}

		// Entering the field is a fresh placement: CharacterFieldStateRules clears any runtime value and dispels
		// any temporary effect the instance kept from a previous stint, then stamps the summon-turn marker and
		// stands it up. (The exit half already ran above.)
		if (destinationZone == PlayerZone.CharacterField)
		{
			CharacterFieldStateRules.ApplyOnFieldEntry(gameInstance.State, movedCard, gameInstance.State.TurnNumber);
		}

		RecordZoneMove(gameInstance, movedCard, resolvedDestinationPlayerId, sourceZone, destinationZone);
		return movedCard;
	}

	/// <summary>
	/// Records a zone-to-zone move for the animation-event tail. This service is the engine's choke point for moves
	/// a card performs by travelling between zones, so recording here is what lets a client animate a move because
	/// the engine said it happened - instead of inferring it from a count delta that a batched push can
	/// mis-attribute (see <see cref="CardMovementRecord"/>).
	/// </summary>
	private static void RecordZoneMove(
		GameInstance gameInstance,
		CardInstance movedCard,
		string destinationPlayerId,
		PlayerZone sourceZone,
		PlayerZone destinationZone)
	{
		var movementKind = CardMovementKinds.ResolveForZonePair(sourceZone, destinationZone);
		if (movementKind is null)
		{
			return;
		}

		gameInstance.State.RecordCardMovement(
			kind: movementKind,
			cardInstanceId: movedCard.InstanceId,
			playerId: destinationPlayerId,
			fromZone: sourceZone.ToString(),
			toZone: destinationZone.ToString());
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
			// Drawing from an empty deck is a losing condition even when an effect (rather than the
			// DrawPhase) asked for the card.
			GameEndRules.TryResolveDeckOut(gameInstance.State, playerId);
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
