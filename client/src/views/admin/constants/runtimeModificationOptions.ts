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
