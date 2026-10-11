import type { TFunction } from 'i18next'
import { translateKey } from '@/i18n'

const phaseActionChipClassName =
  'h-full shrink-0 whitespace-nowrap rounded-md border border-[var(--border-subtle)] px-1.5 text-[10px] font-extrabold leading-none transition-[color,background-color,filter] duration-300 ease-out enabled:hover:brightness-120'

const invertedPhaseThemeClassByPhaseTheme: Record<string, string> = {
  'turn-indicator-orange turn-indicator-text-light-theme': 'turn-indicator-inverted-orange',
  'turn-indicator-blue turn-indicator-text-dark-theme': 'turn-indicator-inverted-blue',
  'turn-indicator-light-gray turn-indicator-text-black': 'turn-indicator-inverted-light-gray',
}

const PhaseValues = {
  'w-for-players': 'Waiting for player',
  'w-for-opponent': 'Waiting for opponent',
  'player-turn': 'Your turn',
  'opponent-turn': "Opponent's turn",
  'w-for-opponent-to-choose': 'Waiting for opponent to choose',
  'w-for-opponent-to-pick-starter': 'Waiting for opponent to choose who goes first',
  'w-for-opponent-to-mulligan': 'Waiting for opponent to choose mulligan',
  'your-attack-declaration': 'Your Attack Declaration',
  'opponent-attack-declaration': "Opponent Declares Attack",
  'effect-declaration': 'Effect Declaration',
  'your-support-cut-in': 'Your Support Cut-In',
  'opponent-support-cut-in': "Opponent Support Cut-In",
  'damage-step': 'Damage Step',
  'selecting-tribute-materials': 'Selecting tribute materials',
  'fulfilled-tribute-requirements': 'Fulfilled tribute requirements',
  'selecting-effect-targets': 'Selecting support targets',
  'fulfilled-effect-targets': 'Fulfilled target selection',
  'support-activated-your-response': 'Support Activated · Your Response',
  'support-activated-opponent-response': 'Support Activated · Opponent Response',
  // Effect selection prompts (GamePromptType.Effect): the middle indicator names what the player is picking,
  // keyed by the server's EffectSelectionPromptKind.
  'select-prompt-place-on-deck-top': 'Select a card to place on deck top',
  'select-prompt-place-on-deck-bottom': 'Select a card to place on the bottom of your deck',
  'select-prompt-discard-from-hand': 'Select a card to discard',
  'select-prompt-return-to-hand': 'Select a card to return to hand',
  'select-prompt-search-deck': 'Select a card from your deck',
  'select-prompt-summon-from-zone': 'Select a Character to summon',
  'select-prompt-destroy-from-zone': 'Select a Character to destroy',
  'select-prompt-freeze-from-zone': 'Select a Leader or Character to freeze',
  'select-prompt-generic': 'Select a card',
}

/**
 * Maps each `PhaseValues` identity token to its translation key. The tokens stay stable for comparisons
 * (theme classes, indicator switching); only the rendered text goes through `translatePhaseValue`.
 */
const PhaseValueKeys: Record<string, string> = {
  'w-for-players': 'game.phase.waitingForPlayers',
  'w-for-opponent': 'game.phase.waitingForOpponent',
  'player-turn': 'game.phase.yourTurn',
  'opponent-turn': 'game.phase.opponentTurn',
  'w-for-opponent-to-choose': 'game.phase.waitingForOpponentToChoose',
  'w-for-opponent-to-pick-starter': 'game.phase.waitingForOpponentToPickStarter',
  'w-for-opponent-to-mulligan': 'game.phase.waitingForOpponentToMulligan',
  'your-attack-declaration': 'game.phase.yourAttackDeclaration',
  'opponent-attack-declaration': 'game.phase.opponentAttackDeclaration',
  'effect-declaration': 'game.phase.effectDeclaration',
  'your-support-cut-in': 'game.phase.yourSupportCutIn',
  'opponent-support-cut-in': 'game.phase.opponentSupportCutIn',
  'damage-step': 'game.phase.damageStep',
  'selecting-tribute-materials': 'game.phase.selectingTributeMaterials',
  'fulfilled-tribute-requirements': 'game.phase.fulfilledTributeRequirements',
  'selecting-effect-targets': 'game.phase.selectingSupportTargets',
  'fulfilled-effect-targets': 'game.phase.fulfilledTargetSelection',
  'support-activated-your-response': 'game.phase.supportActivatedYourResponse',
  'support-activated-opponent-response': 'game.phase.supportActivatedOpponentResponse',
  'select-prompt-place-on-deck-top': 'game.phase.selectPlaceOnDeckTop',
  'select-prompt-place-on-deck-bottom': 'game.phase.selectPlaceOnDeckBottom',
  'select-prompt-discard-from-hand': 'game.phase.selectDiscardFromHand',
  'select-prompt-return-to-hand': 'game.phase.selectReturnToHand',
  'select-prompt-search-deck': 'game.phase.selectSearchDeck',
  'select-prompt-summon-from-zone': 'game.phase.selectSummonFromZone',
  'select-prompt-destroy-from-zone': 'game.phase.selectDestroyFromZone',
  'select-prompt-freeze-from-zone': 'game.phase.selectFreezeFromZone',
  'select-prompt-generic': 'game.phase.selectGeneric',
}

/**
 * Renders a phase value: a static PhaseValues token is translated, while an already-composed dynamic line
 * (e.g. tribute needs, which helpers build via `i18n.t`) passes through unchanged.
 */
function translatePhaseValue(t: TFunction, phaseValue: string): string {
  const key = PhaseValueKeys[phaseValue]
  return key ? translateKey(t, key) : phaseValue
}

export {
  phaseActionChipClassName,
  invertedPhaseThemeClassByPhaseTheme,
  PhaseValues,
  translatePhaseValue,
}