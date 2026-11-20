import { expect, test } from '@playwright/test'
import { createFixtureDeck } from './helpers/multiplayer/fixtures'
import {
  closeMultiplayerPages,
  openMultiplayerPages,
  resolveActorWithBottomHandAction,
  setupMultiplayerGame,
} from './helpers/gameviewMultiplayerHelpers'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// N-007 (Minato) is a plain normal-summonable Character with no on-summon prompt, so the summon is a single,
// predictable action - which is exactly what the log has to record.
const SUMMONABLE_CHARACTER_CARD_DEFINITION_ID = 'N-007'

test.describe('GameView multiplayer action log', () => {
  test.describe.configure({ timeout: 240_000 })

  let summonDeckOne = ''
  let summonDeckTwo = ''

  test.beforeAll(async ({ request }) => {
    // 24 copies in a 25-card deck makes a summonable character in the opening hand a certainty rather than the
    // shuffle bet the seeded default deck would be.
    summonDeckOne = await createFixtureDeck(request, ['1x N-001', '24x N-007'])
    summonDeckTwo = await createFixtureDeck(request, ['1x N-012', '24x N-007'])
  })

  test('opens from the sidebar, records a summon and collapses on an outside click', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request, 'default', {
      one: { deckId: summonDeckOne },
      two: { deckId: summonDeckTwo },
    })
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const summonActor = await resolveActorWithBottomHandAction(
        request,
        setup,
        pages,
        'Summon',
        { cardDefinitionId: SUMMONABLE_CHARACTER_CARD_DEFINITION_ID },
      )

      // The helper only resolves who may act and with what; the summon itself is the click below.
      const summonCard = summonActor.actorPage.locator(`[data-testid="bottom-hand-card-${summonActor.cardInstanceId}"]`)
      await summonCard.hover()
      await summonCard.getByRole('button', { name: /^summon$/i }).click()

      const actorPage = summonActor.actorPage
      const gameBoard = actorPage.locator('[data-testid="game-board"]')

      // Let the summon's arrival animation finish: it briefly overlays the board, and measuring mid-flight would
      // compare two different layout moments instead of closed-versus-open panel.
      await wait(800)

      const boardBefore = await gameBoard.boundingBox()
      expect(boardBefore).not.toBeNull()

      const logToggle = actorPage.locator('[data-testid="action-log-toggle"]')
      // Reading the log is not a game action, so the control is never gated by the action lock.
      await expect(logToggle).toBeEnabled()
      await logToggle.click()

      const panel = actorPage.locator('[data-testid="action-log-panel"]')
      await expect(panel).toBeVisible()
      await expect(panel).toHaveAttribute('data-mode', 'compact')

      // The compact column shares the right edge with the sidebar rail on this viewport, so the panel has to win the
      // stacking contest: the log is what the reader just opened, and it may not sit behind the icons it covers.
      const railToggleBox = await logToggle.boundingBox()
      expect(railToggleBox).not.toBeNull()
      const topmostAtRailToggle = await actorPage.evaluate(({ x, y }) => {
        const hit = document.elementFromPoint(x, y)
        return hit !== null && hit.closest('[data-testid="action-log-panel"]') !== null
      }, {
        x: railToggleBox!.x + railToggleBox!.width / 2,
        y: railToggleBox!.y + railToggleBox!.height / 2,
      })
      expect(topmostAtRailToggle).toBe(true)

      // The compact panel is an overlay beside the board: it must not resize the board, whose geometry the attack
      // links and card flights are anchored to.
      const boardAfterOpen = await gameBoard.boundingBox()
      expect(boardAfterOpen).not.toBeNull()
      expect(Math.round(boardAfterOpen!.width)).toBe(Math.round(boardBefore!.width))
      expect(Math.round(boardAfterOpen!.height)).toBe(Math.round(boardBefore!.height))

      const summonEntry = panel
        .locator('[data-testid="action-log-entry"][data-action-type="card_summoned"]')
        .last()
      await expect(summonEntry).toBeVisible()
      await expect(summonEntry).toContainText(/summoned/i)

      // An entry is two rows: the actor pill and the phase share a header row, and the sentence gets the width below
      // them. Sharing one row squeezed the sentence into a one-word column as soon as the phase name was long
      // ("CHOOSE STARTING PLAYER"), so the text row has to fill the entry.
      const entryRows = await summonEntry.evaluate((entry) => {
        const entryBox = entry.getBoundingClientRect()
        const header = entry.firstElementChild
        const text = entry.lastElementChild
        const textBox = text ? text.getBoundingClientRect() : null
        return {
          innerWidth: entryBox.width - Number.parseFloat(getComputedStyle(entry).paddingLeft) * 2,
          textWidth: textBox?.width ?? 0,
          textTop: textBox?.top ?? 0,
          headerBottom: header ? header.getBoundingClientRect().bottom : 0,
        }
      })
      expect(entryRows.textWidth).toBeGreaterThanOrEqual(entryRows.innerWidth - 2)
      expect(entryRows.textTop).toBeGreaterThanOrEqual(entryRows.headerBottom - 1)

      // Whichever metadata a row carries - the reason ("Turn Start") or the phase ("End Step") - it sits flush with the
      // entry's right edge. One of them hugging the pill while the other sat at the far edge read as two kinds of row.
      const metaRightGaps = await panel.evaluate((element) => Array.from(
        element.querySelectorAll('[data-testid="action-log-entry"]'),
      ).flatMap((entry) => {
        const meta = entry.querySelector('[data-testid="action-log-details"], [data-testid="action-log-phase"]')
        if (!meta) {
          return []
        }
        const paddingRight = Number.parseFloat(getComputedStyle(entry).paddingRight)
        return [Math.round((entry.getBoundingClientRect().right - paddingRight) - meta.getBoundingClientRect().right)]
      }))
      expect(metaRightGaps.length).toBeGreaterThan(0)
      for (const gap of metaRightGaps) {
        expect(gap, 'the entry metadata should be right-aligned').toBeLessThanOrEqual(2)
        expect(gap, 'the entry metadata should be right-aligned').toBeGreaterThanOrEqual(-2)
      }

      // Nothing the panel renders may carry an engine identifier. The audit message is only a development aid, so a
      // row showing a player or entry id means the phrasing path regressed. No row may claim a prompt was answered
      // either: reveals are acknowledged by the client, and the log has to say what happened instead.
      const renderedEntries = await panel.getByTestId('action-log-entry').allInnerTexts()
      expect(renderedEntries.length).toBeGreaterThan(0)
      for (const renderedEntry of renderedEntries) {
        expect(renderedEntry).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
        expect(renderedEntry).not.toMatch(/\b[0-9a-f]{20,}\b/i)
        expect(renderedEntry).not.toMatch(/answered a prompt/i)
      }

      // One header per turn: a repeated header means an entry lost its turn context and split the group.
      const turnHeaders = await panel.getByTestId('action-log-turn').allInnerTexts()
      for (let index = 1; index < turnHeaders.length; index += 1) {
        expect(turnHeaders[index]).not.toBe(turnHeaders[index - 1])
      }

      // Expanding is the panel's own affordance. An outside click returns it to the compact column - the log stays
      // open, because only a close control closes it.
      await panel.locator('[data-testid="action-log-expand"]').click()
      await expect(panel).toHaveAttribute('data-mode', 'expanded')

      await actorPage.mouse.click(8, 8)
      await expect(panel).toHaveAttribute('data-mode', 'compact')
      await expect(panel).toBeVisible()

      // Covering the rail means burying its log toggle, so the panel carries its own X: without it the reader would
      // have no way back out of a log they opened by accident.
      const panelClose = panel.locator('[data-testid="action-log-close"]')
      await expect(panelClose).toBeVisible()
      await panelClose.click()
      await expect(panel).toBeHidden()

      // With the panel gone the rail's own control is hit-testable again, and it still toggles both ways.
      await expect(logToggle).toBeVisible()
      await logToggle.click()
      await expect(panel).toBeVisible()
      await panel.locator('[data-testid="action-log-close"]').click()
      await expect(panel).toBeHidden()
    } finally {
      await closeMultiplayerPages(pages)
    }
  })
})
