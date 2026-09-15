import { expect, test } from '@playwright/test'
import {
  advanceToMulliganPromptIfNeeded,
  closeMultiplayerPages,
  declarePassInActionStepViaHub,
  fetchGameState,
  openMultiplayerPages,
  resolveActorWithBottomHandAction,
  resolveAllMulliganPrompts,
  resolvePlayerState,
  resolvePromptViaHub,
  resolveStartingPromptOwner,
  setupMultiplayerGame,
} from './helpers/gameviewMultiplayerHelpers'

test.describe('GameView multiplayer support activation', () => {
  test.describe.configure({ timeout: 180_000 })

  // Seed profile `default` deck "one" (leader N-001) contains the real support cards:
  //  - N-007 (Minato) is a plain summonable Character, used to put a card on the field.
  //  - N-004 (Naruto Uzumaki, Rasengan) is "[During Your Main] K.O. all Characters." for 2 chakra and
  //    targets every character (auto-select-all), which makes the resolution easy to observe.
  const SUMMONABLE_CHARACTER_CARD_DEFINITION_ID = 'N-007'
  const SUPPORT_CARD_DEFINITION_ID = 'N-004'

  test('support activated from hand resolves after the opponent passes', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

      await advanceToMulliganPromptIfNeeded(request, setup)
      await resolveAllMulliganPrompts(request, setup, 'noMulligan')

      // 1. Put a character on the field so "K.O. all Characters" has something to destroy.
      const summonActor = await resolveActorWithBottomHandAction(
        request,
        setup,
        pages,
        'Summon',
        { cardDefinitionId: SUMMONABLE_CHARACTER_CARD_DEFINITION_ID },
      )
      const summonCard = summonActor.actorPage.locator(`[data-testid="bottom-hand-card-${summonActor.cardInstanceId}"]`)
      await summonCard.hover()
      await summonCard.getByRole('button', { name: /^summon$/i }).click()

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, summonActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, summonActor.actor)
        return actorState.characterField.some((card) => card.instanceId === summonActor.cardInstanceId)
      }, {
        timeout: 12_000,
      }).toBe(true)

      // 2. Activate the support straight from hand: your-turn supports may be played from hand.
      const supportActor = await resolveActorWithBottomHandAction(
        request,
        setup,
        pages,
        'Support',
        { cardDefinitionId: SUPPORT_CARD_DEFINITION_ID, actorUserId: summonActor.actor.userId },
      )
      const supportCard = supportActor.actorPage.locator(`[data-testid="bottom-hand-card-${supportActor.cardInstanceId}"]`)
      await supportCard.hover()
      await supportCard.getByRole('button', { name: /^support$/i }).click()

      const opponent = supportActor.actor.userId === setup.playerOne.userId ? setup.playerTwo : setup.playerOne

      // 3. The activation opens a reaction window: it is paid for and queued, but nothing has resolved
      //    yet and the opponent holds priority with a pass available.
      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, opponent.session.accessToken)
        const opponentState = resolvePlayerState(state, opponent)
        const actorState = resolvePlayerState(state, supportActor.actor)
        return {
          chakraSpent: actorState.resourcePool,
          supportStillInHand: actorState.hand.some((card) => card.instanceId === supportActor.cardInstanceId),
          opponentHoldsPriority: (state.priorityPlayerId ?? '') !== '',
          opponentCanPass: (state.availableActions ?? []).some((action) => action.actionId === 'pass-turn'),
          battlefieldStillPopulated: actorState.characterField.length,
        }
      }, {
        timeout: 12_000,
      }).toEqual({
        chakraSpent: 3,
        supportStillInHand: false,
        opponentHoldsPriority: true,
        opponentCanPass: true,
        battlefieldStillPopulated: 1,
      })

      // 4. Both players pass: the activation resolves and K.O.s every character on the board.
      await declarePassInActionStepViaHub(setup.gameCode, opponent)
      await declarePassInActionStepViaHub(setup.gameCode, supportActor.actor)

      await expect.poll(async () => {
        const [actorState, opponentState] = await Promise.all([
          fetchGameState(request, setup.gameCode, supportActor.actor.session.accessToken),
          fetchGameState(request, setup.gameCode, opponent.session.accessToken),
        ])

        return {
          actorCharacters: resolvePlayerState(actorState, supportActor.actor).characterField.length,
          opponentCharacters: resolvePlayerState(opponentState, opponent).characterField.length,
          actorTrash: resolvePlayerState(actorState, supportActor.actor).trash.length,
        }
      }, {
        timeout: 12_000,
      }).toEqual({
        actorCharacters: 0,
        opponentCharacters: 0,
        // The summoned character plus the support card that was activated from hand.
        actorTrash: 2,
      })
    } finally {
      await closeMultiplayerPages(pages)
    }
  })
})
