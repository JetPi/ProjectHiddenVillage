import { expect, test } from '@playwright/test'
import {
  closeMultiplayerPages,
  executeBattleActionViaHub,
  fetchGameState,
  openMultiplayerPages,
  resolveActorWithBottomBattleAction,
  resolveActorWithBottomHandAction,
  resolveBattleActionForSpecificCard,
  resolvePlayerState,
  setupMultiplayerGame,
} from './helpers/gameviewMultiplayerHelpers'
import {
  FIXTURE_CARD_IDS,
  createFixtureDeck,
  ensureFixtureCards,
} from './helpers/multiplayer/fixtures'

test.describe('GameView multiplayer battle visuals', () => {
  test.describe.configure({ timeout: 120_000 })

  // Both scenarios have to summon a character and battle with it on the same turn. No seeded card can do that
  // (N-007 needs 10+ power, N-011 needs two specific allies), so they play a deck built almost entirely from a
  // fixture card whose own passive grants [Rush].
  //
  // The card is created-or-reset here but not deleted in `afterAll`: that would remove it from under a concurrent
  // run of this same file (`--repeat-each` with more than one worker). Suite-level cleanup owns it instead - the
  // global teardown deletes every fixture card after all workers exit, and `globalSetup` sweeps any left by a run
  // that was killed before teardown could run.
  const THIS_SPEC_FIXTURE_IDS = [FIXTURE_CARD_IDS.rushCharacter]
  let rushDeckId = ''

  test.beforeAll(async ({ request }) => {
    await ensureFixtureCards(request, THIS_SPEC_FIXTURE_IDS)

    // 24 copies in a 25-card deck makes a rush card in the opening hand a certainty rather than a shuffle bet.
    rushDeckId = await createFixtureDeck(request, [
      '1x N-001',
      `24x ${FIXTURE_CARD_IDS.rushCharacter}`,
    ])
  })

  test('battle action click enters target selection mode with highlight classes', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request, 'default', { one: { deckId: rushDeckId } })
    const pages = await openMultiplayerPages(browser, setup)

    try {
      // Same reason as the refresh scenario below: the Battle action has to be available on the turn the card is
      // summoned, which only the Rush fixture provides.
      const summonActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon', {
        actorUserId: setup.playerOne.userId,
        cardDefinitionId: FIXTURE_CARD_IDS.rushCharacter,
      })
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
    const setup = await setupMultiplayerGame(request, 'default', { one: { deckId: rushDeckId } })
    const pages = await openMultiplayerPages(browser, setup)

    try {
      // Summon the Rush fixture specifically: the attack below has to happen on the turn this card arrives, so
      // leaving the choice to the shuffle is what made this test fail intermittently.
      const summonActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon', {
        actorUserId: setup.playerOne.userId,
        cardDefinitionId: FIXTURE_CARD_IDS.rushCharacter,
      })
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

      // The ring around the attacker has to paint over the neighbouring rows (the support row sits below the
      // battlefield row). It lives on the card, but a rested card is rotated and a transformed wrapper is its own
      // stacking context, so the card's own z-index can never cross into the row below - the *wrapper* must be
      // raised. Without that the outline disappears behind the concealed support card underneath.
      const attackerCard = battleActor.actorPage.locator(
        `[data-zone="character-field-card"][data-card-instance-id="${battleActor.cardInstanceId}"]`,
      )
      await expect(attackerCard).toHaveClass(/attack-link-card-outline/)

      const wrapperStacking = await attackerCard.evaluate((node) => {
        const wrapper = node.parentElement
        if (!wrapper) {
          return null
        }

        const style = window.getComputedStyle(wrapper)
        return { position: style.position, zIndex: style.zIndex }
      })

      expect(wrapperStacking?.position).toBe('relative')
      expect(Number(wrapperStacking?.zIndex ?? 0)).toBeGreaterThanOrEqual(200)

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

      // The arrowhead is rendered by us and follows the tail: it must point at the target. The bound is loose
      // on purpose now that the head is derived from the tail's end direction rather than aimed at the centre -
      // on a sweeping tail the chord of the last head length differs from the aim by a degree or two, and the
      // tail's "travels into the target" check below covers the direction itself. The tail's arc leans the head
      // the other way (it lobs over the chord and turns into the card, see `resolveAttackLinkCubic`), so the
      // arc reduces the deviation instead of adding to it.
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

      // The tail must leave and enter on the *visual* edges of the attacked pair. A rested card is tilted, so
      // its bounding-box anchors float off the card: the bbox's top/bottom edge midpoint sits out at the
      // rotated card's corner (the attacker is always rested, so this hits every attack), and its left/right
      // edge midpoint sits level with the card's centre - i.e. visibly below the tilted edge's midpoint. Both
      // ends must therefore sit roughly the gap away from the *rotated* card surface.
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

          // The card's tilt is applied by whatever owns its transform - a Tailwind `rotate` class or, after the
          // Motion migration, a Motion `rotate` on the card's wrapper. Read the effective rotation by walking up
          // from the card, so the measurement follows the visual tilt wherever it is applied.
          const readEffectiveRotationRad = (element: HTMLElement): number => {
            let node: HTMLElement | null = element
            while (node) {
              const style = getComputedStyle(node)
              const rotateMatch = (style.rotate ?? '').match(/(-?[\d.]+)deg/)
              if (rotateMatch) {
                return (Number.parseFloat(rotateMatch[1]) * Math.PI) / 180
              }
              if (style.transform && style.transform !== 'none') {
                const matrix = new DOMMatrixReadOnly(style.transform)
                if (matrix.a !== 1 || matrix.b !== 0) {
                  return Math.atan2(matrix.b, matrix.a)
                }
              }
              node = node.parentElement
            }
            return 0
          }

          const distanceToSurface = (element: HTMLElement, point: { x: number; y: number }) => {
            const rect = element.getBoundingClientRect()
            const angle = readEffectiveRotationRad(element)
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

      // The drawn tail is an arc, not a hook. This is the same measurement `gameview.attack-link-geometry.spec.ts`
      // pins on the curve maths; here it runs against the rendered path, so the geometry the board actually
      // composed (rotation offsets, gaps, the chosen anchor sides) is covered too. A corner concentrates the
      // direction change into one window of the curve; an arc spreads it.
      const readRenderedTailShape = async (): Promise<{ maxWindowTurn: number; endVsChord: number } | null> => (
        await battleActor.actorPage.evaluate(() => {
          const path = document.querySelector<SVGPathElement>('#attack-link-overlay svg path[stroke]')
          if (!path) {
            return null
          }

          const sampleCount = 100
          const windowSize = 10
          const total = path.getTotalLength()
          const points = Array.from({ length: sampleCount + 1 }, (_, index) => {
            const point = path.getPointAtLength((index / sampleCount) * total)
            return { x: point.x, y: point.y }
          })
          const angles = points.slice(1).map((point, index) => (
            (Math.atan2(point.y - points[index].y, point.x - points[index].x) * 180) / Math.PI
          ))
          const turn = (from: number, to: number): number => Math.abs(((to - from + 540) % 360) - 180)

          let maxWindowTurn = 0
          for (let index = 0; index + windowSize < angles.length; index += 1) {
            maxWindowTurn = Math.max(maxWindowTurn, turn(angles[index], angles[index + windowSize]))
          }

          const start = points[0]
          const end = points[points.length - 1]
          const chordDeg = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI

          return {
            maxWindowTurn: Math.round(maxWindowTurn),
            endVsChord: Math.round(turn(angles[angles.length - 1], chordDeg)),
          }
        })
      )

      await expect.poll(async () => (await readRenderedTailShape())?.maxWindowTurn ?? 999, {
        timeout: 8_000,
      }).toBeLessThan(20)
      await expect.poll(async () => (await readRenderedTailShape())?.endVsChord ?? 0, {
        timeout: 8_000,
      }).toBeGreaterThan(15)

      // The attacker is tilted from the backend's rested flag. Motion applies the rotation on the card's
      // wrapper rather than as a Tailwind class on the card, so assert the effective rotation instead.
      await expect.poll(async () => {
        return await attackerAfterReload.evaluate((element) => {
          let node: HTMLElement | null = element
          while (node) {
            const style = getComputedStyle(node)
            const rotateMatch = (style.rotate ?? '').match(/(-?[\d.]+)deg/)
            if (rotateMatch) {
              return Math.round(Number.parseFloat(rotateMatch[1]))
            }
            if (style.transform && style.transform !== 'none') {
              const matrix = new DOMMatrixReadOnly(style.transform)
              if (matrix.a !== 1 || matrix.b !== 0) {
                return Math.round((Math.atan2(matrix.b, matrix.a) * 180) / Math.PI)
              }
            }
            node = node.parentElement
          }
          return 0
        })
      }, {
        timeout: 8_000,
      }).toBe(14)

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
