import { expect, test } from '@playwright/test'
import {
  advanceToMulliganPromptIfNeeded,
  closeMultiplayerPages,
  executeBattleActionViaHub,
  fetchGameState,
  openMultiplayerPages,
  resolveActorWithBottomBattleAction,
  resolveActorWithBottomHandAction,
  resolveAllMulliganPrompts,
  resolveBattleActionForSpecificCard,
  resolvePlayerState,
  resolvePromptViaHub,
  resolveStartingPromptOwner,
  setupMultiplayerGame,
} from './helpers/gameviewMultiplayerHelpers'

test.describe('GameView multiplayer battle visuals', () => {
  test.describe.configure({ timeout: 120_000 })

  test('battle action click enters target selection mode with highlight classes', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

      await advanceToMulliganPromptIfNeeded(request, setup)
      await resolveAllMulliganPrompts(request, setup, 'noMulligan')

      const summonActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon')
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

      const battleActor = await resolveActorWithBottomBattleAction(request, setup, pages)
      const battleCard = battleActor.actorPage.locator(`[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${battleActor.cardInstanceId}"]`)

      await expect(battleCard).toBeVisible()
      await battleCard.hover()
      await battleCard.getByRole('button', { name: new RegExp(`^${battleActor.actionLabel}$`, 'i') }).click()

      await expect(battleActor.actorPage.getByRole('button', { name: /cancel attack target selection/i })).toBeVisible({ timeout: 8_000 })

      await expect.poll(async () => {
        return await battleActor.actorPage
          .locator('.battle-target-top, .battle-target-bottom, .battle-target-leader-top, .battle-target-leader-bottom')
          .count()
      }, {
        timeout: 8_000,
      }).toBeGreaterThan(0)

      await expect(battleActor.actorPage.getByTestId('cancel-target-mode-button')).toBeVisible({ timeout: 8_000 })
      await battleActor.actorPage.getByTestId('cancel-target-mode-button').click()

      await expect.poll(async () => {
        return await battleActor.actorPage
          .locator('.battle-target-top, .battle-target-bottom, .battle-target-leader-top, .battle-target-leader-bottom')
          .count()
      }, {
        timeout: 8_000,
      }).toBe(0)
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  test('refresh during pending attack keeps attacker rested from backend state', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

      await advanceToMulliganPromptIfNeeded(request, setup)
      await resolveAllMulliganPrompts(request, setup, 'noMulligan')

      const summonActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon')
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

      const battleActor = await resolveBattleActionForSpecificCard(
        request,
        setup,
        pages,
        summonActor.actor,
        summonActor.cardInstanceId,
      )

      const selectedTarget = await executeBattleActionViaHub(
        setup.gameCode,
        battleActor.actor,
        battleActor.actionId,
        battleActor.cardInstanceId,
      )

      await expect.poll(async () => {
        return await battleActor.actorPage.locator('#attack-link-overlay').count()
      }, {
        timeout: 8_000,
      }).toBeGreaterThan(0)

      await expect.poll(async () => {
        return await battleActor.actorPage.locator('#attack-link-overlay svg path').count()
      }, {
        timeout: 8_000,
      }).toBeGreaterThan(0)

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, battleActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, battleActor.actor)
        const attackerCard = actorState.characterField.find((card) => card.instanceId === battleActor.cardInstanceId)

        return {
          found: Boolean(attackerCard),
          hasRestFlag: attackerCard ? Object.prototype.hasOwnProperty.call(attackerCard, 'isRested') : false,
          isRested: attackerCard?.isRested ?? false,
        }
      }, {
        timeout: 12_000,
      }).toEqual({
        found: true,
        hasRestFlag: true,
        isRested: true,
      })

      await battleActor.actorPage.reload()
      await expect(battleActor.actorPage.getByTestId('game-board')).toBeVisible()

      const attackerAfterReload = battleActor.actorPage.locator(
        `[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${battleActor.cardInstanceId}"]`,
      )
      const targetAfterReload = battleActor.actorPage.locator(
        `[data-card-instance-id="${selectedTarget.targetCardInstanceId}"]`,
      )

      await expect(attackerAfterReload).toBeVisible()
      await expect(targetAfterReload).toBeVisible()
      await expect.poll(async () => {
        return await battleActor.actorPage.locator('#attack-link-overlay').count()
      }, {
        timeout: 8_000,
      }).toBeGreaterThan(0)

      // The arrowhead is rendered by us and follows the tail: it must point at the target (react-xarrows
      // derives its own head rotation from the anchor side, which can end up pointing away from it). The
      // bound is loose on purpose now that the head is measured from the tail rather than aimed at the
      // centre - on a sweeping tail the chord of the last head length differs from the aim by a degree or
      // two, and the tail's "travels into the target" check below covers the direction itself.
      await expect.poll(async () => {
        return await battleActor.actorPage.evaluate((targetInstanceId) => {
          const head = document.querySelector<SVGSVGElement>('[data-testid="attack-link-head"]')
          const target = document.querySelector<HTMLElement>(`[data-card-instance-id="${targetInstanceId}"]`)
          if (!head || !target) return null

          const headRect = head.getBoundingClientRect()
          const targetRect = target.getBoundingClientRect()
          const targetCenterX = targetRect.left + targetRect.width / 2
          const targetCenterY = targetRect.top + targetRect.height / 2
          const aimDeg = (Math.atan2(targetCenterY - headRect.top, targetCenterX - headRect.left) * 180) / Math.PI

          const rotationMatch = (head.querySelector('g')?.getAttribute('transform') ?? '').match(/rotate\((-?[\d.]+)\)/)
          if (!rotationMatch) return null

          const rotationDeg = Number.parseFloat(rotationMatch[1])
          const deltaDeg = ((aimDeg - rotationDeg + 540) % 360) - 180
          return Math.abs(deltaDeg)
        }, selectedTarget.targetCardInstanceId)
      }, {
        timeout: 8_000,
      }).toBeLessThan(25)

      // The head's tip lands on the tail's end (so the dashed tail and the head read as one continuous
      // arrow, covering the dash pattern's final gap), the tail travels *into* the target rather than
      // arriving backwards from beyond it, and the head follows the tail's end direction. Both points are
      // read through the elements' own `getScreenCTM()`, so this is the drawn geometry and not a repeat of
      // the placement maths under test.
      await expect.poll(async () => {
        return await battleActor.actorPage.evaluate((targetInstanceId) => {
          const head = document.querySelector<SVGSVGElement>('[data-testid="attack-link-head"]')
          const headGroup = head?.querySelector('g')
          const path = document.querySelector<SVGPathElement>('#attack-link-overlay svg path[stroke]')
          const target = document.querySelector<HTMLElement>(`[data-card-instance-id="${targetInstanceId}"]`)
          if (!head || !headGroup || !path || !target) return null

          const rotationMatch = (headGroup.getAttribute('transform') ?? '').match(/rotate\((-?[\d.]+)\)/)
          if (!rotationMatch) return null
          const rotationDeg = Number.parseFloat(rotationMatch[1])

          const total = path.getTotalLength()
          const tailEnd = path.getPointAtLength(total)
          const tailBefore = path.getPointAtLength(Math.max(0, total - 8))
          const pathCtm = path.getScreenCTM()
          const headCtm = headGroup.getScreenCTM()
          if (!pathCtm || !headCtm) return null

          const tailEndScreen = tailEnd.matrixTransform(pathCtm)
          const tailBeforeScreen = tailBefore.matrixTransform(pathCtm)
          // The head path is a unit shape with its tip vertex at (1, 0.5).
          const tip = new DOMPoint(1, 0.5).matrixTransform(headCtm)
          const tipToTailEnd = Math.hypot(tip.x - tailEndScreen.x, tip.y - tailEndScreen.y)

          // Does the tail's end direction point at the target (into the card) rather than away from it?
          const tangentX = tailEndScreen.x - tailBeforeScreen.x
          const tangentY = tailEndScreen.y - tailBeforeScreen.y
          const targetRect = target.getBoundingClientRect()
          const intoTargetX = targetRect.left + targetRect.width / 2 - tailEndScreen.x
          const intoTargetY = targetRect.top + targetRect.height / 2 - tailEndScreen.y
          const travelsIntoTarget = tangentX * intoTargetX + tangentY * intoTargetY > 0

          const tangentDeg = (Math.atan2(tangentY, tangentX) * 180) / Math.PI
          const headVsTailDeg = Math.abs(((rotationDeg - tangentDeg + 540) % 360) - 180)

          return {
            tipToTailEnd: Math.round(tipToTailEnd),
            hasGlow: getComputedStyle(head).filter.includes('drop-shadow'),
            // Bucketed to 5 degrees: the chord over the last 8px differs slightly from the exact end
            // tangent on a curved (sweeping) tail, but a head fighting the tail reads as 180.
            headVsTailDeg: travelsIntoTarget ? Math.round(headVsTailDeg / 5) * 5 : 180,
          }
        }, selectedTarget.targetCardInstanceId)
      }, {
        timeout: 8_000,
      }).toEqual({ tipToTailEnd: 0, hasGlow: true, headVsTailDeg: 0 })

      // The tail must leave and enter on the *visual* edges of the attacked pair. A rested card is tilted,
      // and react-xarrows anchors on the bounding box: the bbox's top/bottom edge midpoint floats out at
      // the rotated card's corner (the attacker is always rested, so this hits every attack), and its
      // left/right edge midpoint sits level with the card's centre - i.e. visibly below the tilted edge's
      // midpoint. Both ends must therefore sit roughly the gap away from the *rotated* card surface.
      await expect.poll(async () => {
        return await battleActor.actorPage.evaluate(([sourceInstanceId, targetInstanceId]) => {
          const path = document.querySelector<SVGPathElement>('#attack-link-overlay svg path[stroke]')
          const source = document.querySelector<HTMLElement>(`[data-card-instance-id="${sourceInstanceId}"]`)
          const target = document.querySelector<HTMLElement>(`[data-card-instance-id="${targetInstanceId}"]`)
          if (!path || !source || !target) return null

          const pathCtm = path.getScreenCTM()
          if (!pathCtm) return null
          const toScreen = (length: number) => path.getPointAtLength(length).matrixTransform(pathCtm)
          const startScreen = toScreen(0)
          const endScreen = toScreen(path.getTotalLength())

          const distanceToSurface = (element: HTMLElement, point: { x: number; y: number }) => {
            const rect = element.getBoundingClientRect()
            const style = getComputedStyle(element)
            // Tailwind v4 emits the rested tilt as the standalone `rotate` property (the `transform`
            // property stays "none" while the card is visually tilted) - reading it from `transform`
            // alone would measure the anchor against the unrotated box and hide the drift.
            const rotateMatch = (style.rotate ?? '').match(/(-?[\d.]+)deg/)
            const angle = rotateMatch
              ? (Number.parseFloat(rotateMatch[1]) * Math.PI) / 180
              : style.transform && style.transform !== 'none'
                ? Math.atan2(new DOMMatrixReadOnly(style.transform).b, new DOMMatrixReadOnly(style.transform).a)
                : 0
            // Distances are rotation invariant, so bring the point into the card's own frame and measure
            // against its unrotated layout box: 0 = the anchor sits on the card.
            const dx = point.x - (rect.left + rect.width / 2)
            const dy = point.y - (rect.top + rect.height / 2)
            const localX = dx * Math.cos(-angle) - dy * Math.sin(-angle)
            const localY = dx * Math.sin(-angle) + dy * Math.cos(-angle)
            return Math.round(Math.hypot(
              Math.max(Math.abs(localX) - element.offsetWidth / 2, 0),
              Math.max(Math.abs(localY) - element.offsetHeight / 2, 0),
            ))
          }

          return {
            // ~8.5px source gap (cos of the tilt) vs ~15-17px out at the bounding-box corner.
            sourceOnVisualEdge: distanceToSurface(source, startScreen) <= 11,
            // ~16px target gap from the rotated surface vs ~28px when only the bbox edge is used.
            targetOnVisualEdge: (() => {
              const distance = distanceToSurface(target, endScreen)
              return distance >= 13 && distance <= 19
            })(),
          }
        }, [battleActor.cardInstanceId, selectedTarget.targetCardInstanceId])
      }, {
        timeout: 8_000,
      }).toEqual({ sourceOnVisualEdge: true, targetOnVisualEdge: true })

      await expect.poll(async () => {
        return await attackerAfterReload.getAttribute('class')
      }, {
        timeout: 8_000,
      }).toContain('rotate-[14deg]')

      await expect.poll(async () => {
        return await attackerAfterReload.getAttribute('class')
      }, {
        timeout: 8_000,
      }).toContain('attack-link-card-outline')

      await expect.poll(async () => {
        const targetClassName = await targetAfterReload.getAttribute('class')
        return Boolean(
          targetClassName?.includes('attack-link-card-outline')
          || targetClassName?.includes('attack-link-leader-outline'),
        )
      }, {
        timeout: 8_000,
      }).toBe(true)

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, battleActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, battleActor.actor)
        const attackerCard = actorState.characterField.find((card) => card.instanceId === battleActor.cardInstanceId)

        return {
          found: Boolean(attackerCard),
          hasRestFlag: attackerCard ? Object.prototype.hasOwnProperty.call(attackerCard, 'isRested') : false,
          isRested: attackerCard?.isRested ?? false,
        }
      }, {
        timeout: 8_000,
      }).toEqual({
        found: true,
        hasRestFlag: true,
        isRested: true,
      })
    } finally {
      await closeMultiplayerPages(pages)
    }
  })
})
