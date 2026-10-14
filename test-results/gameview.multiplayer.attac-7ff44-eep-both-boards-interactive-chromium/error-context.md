# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: gameview.multiplayer.attack-sequence.spec.ts >> GameView multiplayer attack sequence >> two attacks across a turn change resolve and keep both boards interactive
- Location: e2e/gameview.multiplayer.attack-sequence.spec.ts:106:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "MainPhase:true"
Received: "MainPhase:false"

Call Log:
- Timeout 45000ms exceeded while waiting on the predicate
```

# Test source

```ts
  43  |       fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken),
  44  |       fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken),
  45  |     ])
  46  | 
  47  |     if (playerOneState.phase !== 'ActionStep') {
  48  |       return
  49  |     }
  50  | 
  51  |     const playerOneCanPass = playerOneState.availableActions.some((action) => action.actionId === 'pass-turn' && action.isEnabled)
  52  |     const playerTwoCanPass = playerTwoState.availableActions.some((action) => action.actionId === 'pass-turn' && action.isEnabled)
  53  | 
  54  |     if (playerOneCanPass) {
  55  |       await declarePassInActionStepViaHub(setup.gameCode, setup.playerOne)
  56  |     } else if (playerTwoCanPass) {
  57  |       await declarePassInActionStepViaHub(setup.gameCode, setup.playerTwo)
  58  |     }
  59  | 
  60  |     // When neither snapshot offered a pass (priority can swap between the read and the ack, and a
  61  |     // prompt can stall the window) this waits and re-reads instead of abandoning the window on one
  62  |     // unlucky sample.
  63  |     await wait(300)
  64  |   }
  65  | }
  66  | 
  67  | async function waitForMainPhase(
  68  |   request: import('@playwright/test').APIRequestContext,
  69  |   setup: Awaited<ReturnType<typeof setupMultiplayerGame>>,
  70  | ): Promise<void> {
  71  |   await expect.poll(async () => {
  72  |     const state = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
  73  |     return state.phase
  74  |   }, { timeout: 25_000 }).toBe('MainPhase')
  75  | }
  76  | 
  77  | function isPlayerOneActive(
  78  |   state: { activePlayerId: string },
  79  |   setup: Awaited<ReturnType<typeof setupMultiplayerGame>>,
  80  | ): boolean {
  81  |   const activeUserId = state.activePlayerId.replace(/-/g, '').toLowerCase()
  82  |   return activeUserId === setup.playerOne.normalizedUserId.replace(/-/g, '').toLowerCase()
  83  |     || activeUserId === setup.playerOne.userId.replace(/-/g, '').toLowerCase()
  84  | }
  85  | 
  86  | // The regression guard: after each attack the acting player must still be able to take a
  87  | // main-phase action. A stalled client (or stalled auto-advance) leaves the board without
  88  | // any legal action until the page is refreshed.
  89  | async function expectActivePlayerCanAct(
  90  |   request: import('@playwright/test').APIRequestContext,
  91  |   setup: Awaited<ReturnType<typeof setupMultiplayerGame>>,
  92  | ): Promise<void> {
  93  |   await expect.poll(async () => {
  94  |     const playerOneState = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
  95  |     const activeState = isPlayerOneActive(playerOneState, setup)
  96  |       ? playerOneState
  97  |       : await fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken)
  98  | 
  99  |     return activeState.availableActions.some((action) => action.actionId === 'turn-end' && action.isEnabled)
  100 |   }, { timeout: 25_000 }).toBe(true)
  101 | }
  102 | 
  103 | test.describe('GameView multiplayer attack sequence', () => {
  104 |   test.describe.configure({ timeout: 180_000 })
  105 | 
  106 |   test('two attacks across a turn change resolve and keep both boards interactive', async ({ browser, request }) => {
  107 |     const setup = await setupMultiplayerGame(request)
  108 |     const pages = await openMultiplayerPages(browser, setup)
  109 | 
  110 |     try {
  111 |       const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
  112 |       const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
  113 |       const otherPlayer = startingOwner.userId === setup.playerOne.userId ? setup.playerTwo : setup.playerOne
  114 | 
  115 |       await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')
  116 |       await advanceToMulliganPromptIfNeeded(request, setup)
  117 |       await resolveAllMulliganPrompts(request, setup, 'noMulligan')
  118 | 
  119 |       const summonFor = async (actorUserId: string): Promise<string> => {
  120 |         const actor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon', { actorUserId })
  121 |         const card = actor.actorPage.locator(`[data-testid="bottom-hand-card-${actor.cardInstanceId}"]`)
  122 |         await card.hover()
  123 |         await card.getByRole('button', { name: /^summon$/i }).click()
  124 |         await wait(1_200)
  125 |         return actor.cardInstanceId
  126 |       }
  127 | 
  128 |       const endTurnViaUi = async (): Promise<void> => {
  129 |         const state = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
  130 |         const activeUserId = state.activePlayerId.toLowerCase()
  131 |         const isPlayerOneActive = activeUserId === setup.playerOne.userId.toLowerCase()
  132 |           || activeUserId === setup.playerOne.normalizedUserId.toLowerCase()
  133 |         const activePage = isPlayerOneActive ? pages.playerOnePage : pages.playerTwoPage
  134 | 
  135 |         await activePage.getByTestId('pass-turn-button').click()
  136 |         // This waits on an infrastructure round trip (two clients acking an engine-driven turn hand-over), not
  137 |         // on an animation: on a loaded machine the EndStep -> Draw -> Ready chain plus the REST polls can take
  138 |         // well past 25 s even though nothing is wrong. The condition asserted below is unchanged - only the
  139 |         // wait budget is generous.
  140 |         await expect.poll(async () => {
  141 |           const nextState = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
  142 |           return `${nextState.phase}:${nextState.activePlayerId.toLowerCase() !== state.activePlayerId.toLowerCase()}`
> 143 |         }, { timeout: 45_000 }).toBe('MainPhase:true')
      |                                 ^ Error: expect(received).toBe(expected) // Object.is equality
  144 |       }
  145 | 
  146 |       // Both attackers are summoned one turn ahead so they are not summon-sick when attacking.
  147 |       const firstAttacker = await summonFor(startingOwner.userId)
  148 |       await endTurnViaUi()
  149 |       const secondAttacker = await summonFor(otherPlayer.userId)
  150 |       await endTurnViaUi()
  151 | 
  152 |       // Attack #1 by the starting owner.
  153 |       const firstAttack = await resolveActorWithBottomBattleAction(request, setup, pages)
  154 |       expect(firstAttack.cardInstanceId).toBe(firstAttacker)
  155 |       // The attack resolution has to be visible on the board - the attacker lunges out and back. The counter
  156 |       // observes that yoyo on the attacker's own card element.
  157 |       await installCardLungeCounter(firstAttack.actorPage)
  158 |       await executeBattleActionViaHub(setup.gameCode, firstAttack.actor, firstAttack.actionId, firstAttack.cardInstanceId)
  159 |       await passThroughActionStep(request, setup)
  160 |       await waitForMainPhase(request, setup)
  161 |       await expectActivePlayerCanAct(request, setup)
  162 | 
  163 |       await endTurnViaUi()
  164 | 
  165 |       // Attack #2 by the other player on their next turn - the reported failure window.
  166 |       const secondAttack = await resolveActorWithBottomBattleAction(request, setup, pages)
  167 |       expect(secondAttack.cardInstanceId).toBe(secondAttacker)
  168 |       await executeBattleActionViaHub(setup.gameCode, secondAttack.actor, secondAttack.actionId, secondAttack.cardInstanceId)
  169 |       await passThroughActionStep(request, setup)
  170 |       await waitForMainPhase(request, setup)
  171 |       await expectActivePlayerCanAct(request, setup)
  172 | 
  173 |       await expect.poll(async () => getCardLungeCount(firstAttack.actorPage), { timeout: 8_000 }).toBeGreaterThan(0)
  174 |     } finally {
  175 |       await closeMultiplayerPages(pages)
  176 |     }
  177 |   })
  178 | })
  179 | 
```