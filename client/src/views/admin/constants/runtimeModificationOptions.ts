export const ATTRIBUTE_OPERATION_OPTIONS = ['Add', 'Subtract', 'Multiply', 'Set'] as const

export const ATTRIBUTE_TYPE_OPTIONS = [
  'Card Power',
  'Card Health',
  'Card Damage',
  'Leader Power',
  'Leader Damage',
  'Leader Current Life',
] as const

export const CHAKRA_OPERATION_OPTIONS = ['Pay', 'Recover'] as const

export const FACE_STATE_OPTIONS = ['Face Up', 'Face Down'] as const

export const FACE_STATE_TARGET_CATEGORY_OPTIONS = [
  'Chakra Card',
  'Support Zone Cards',
] as const

export const FACE_STATE_LOCK_OPERATION_OPTIONS = ['Cannot Turn Face Up'] as const

export const MOVE_CARD_OPERATION_OPTIONS = ['Move', 'Draw'] as const

export const MOVE_CARD_ZONE_OPTIONS = [
  'Hand',
  'Deck',
  'Trash',
  'Exile Zone',
  'Support Zone',
  'Character Field',
] as const

export const MOVE_CARD_DESTINATION_RANGE_OPTIONS = ['Self', 'Opponent', 'Any'] as const

export const MOVE_CARD_DECK_PLACEMENT_OPTIONS = ['Top', 'Bottom', 'Index'] as const

export const MOVE_CARD_MULTI_ORDERING_OPTIONS = ['Selected Order', 'Random'] as const

export const ATTRIBUTE_OPERATION_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Add': 'admin.options.attributeOperation.add',
  'Subtract': 'admin.options.attributeOperation.subtract',
  'Multiply': 'admin.options.attributeOperation.multiply',
  'Set': 'admin.options.attributeOperation.set',
}

export const ATTRIBUTE_TYPE_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Card Power': 'admin.options.attributeType.cardPower',
  'Card Health': 'admin.options.attributeType.cardHealth',
  'Card Damage': 'admin.options.attributeType.cardDamage',
  'Leader Power': 'admin.options.attributeType.leaderPower',
  'Leader Damage': 'admin.options.attributeType.leaderDamage',
  'Leader Current Life': 'admin.options.attributeType.leaderCurrentLife',
}

export const CHAKRA_OPERATION_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Pay': 'admin.options.chakraOperation.pay',
  'Recover': 'admin.options.chakraOperation.recover',
}

export const FACE_STATE_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Face Up': 'admin.options.faceState.faceUp',
  'Face Down': 'admin.options.faceState.faceDown',
}

export const FACE_STATE_TARGET_CATEGORY_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Chakra Card': 'admin.options.faceStateTargetCategory.chakraCard',
  'Support Zone Cards': 'admin.options.faceStateTargetCategory.supportZoneCards',
}

export const FACE_STATE_LOCK_OPERATION_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Cannot Turn Face Up': 'admin.options.faceStateLockOperation.cannotTurnFaceUp',
}

export const MOVE_CARD_OPERATION_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Move': 'admin.options.moveCardOperation.move',
  'Draw': 'admin.options.moveCardOperation.draw',
}

export const MOVE_CARD_ZONE_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Hand': 'admin.options.moveCardZone.hand',
  'Deck': 'admin.options.moveCardZone.deck',
  'Trash': 'admin.options.moveCardZone.trash',
  'Exile Zone': 'admin.options.moveCardZone.exileZone',
  'Support Zone': 'admin.options.moveCardZone.supportZone',
  'Character Field': 'admin.options.moveCardZone.characterField',
}

export const MOVE_CARD_DESTINATION_RANGE_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Self': 'admin.options.moveCardDestinationRange.self',
  'Opponent': 'admin.options.moveCardDestinationRange.opponent',
  'Any': 'admin.options.moveCardDestinationRange.any',
}

export const MOVE_CARD_DECK_PLACEMENT_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Top': 'admin.options.moveCardDeckPlacement.top',
  'Bottom': 'admin.options.moveCardDeckPlacement.bottom',
  'Index': 'admin.options.moveCardDeckPlacement.index',
}

export const MOVE_CARD_MULTI_ORDERING_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Selected Order': 'admin.options.moveCardMultiOrdering.selectedOrder',
  'Random': 'admin.options.moveCardMultiOrdering.random',
}
