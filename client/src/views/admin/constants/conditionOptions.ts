/**
 * The card-condition keywords the catalogue understands. This mirrors the server's
 * `EffectConditionKeywords.All` and is only a fallback for the metadata request; the live list comes from
 * `GET /api/card/catalog/effect-condition-keywords`.
 */
export const CARD_CONDITION_OPTIONS_FALLBACK = [
  'Activate: Main',
  'Recovery',
  "During Your Opponent's Attack",
  'Support',
  'Quick',
  'Rush',
  'Summon Requirements',
  'On Summon',
  'Named Card Reference',
  'During Your Main',
  'Your Turn',
  'Support Activated',
  'Once Per Turn',
  'When Attacking',
  'Not Affected By Opponent Support Effects',
] as const
