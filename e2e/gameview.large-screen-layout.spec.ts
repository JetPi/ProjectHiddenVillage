import { expect, test } from '@playwright/test'
import {
  closeMultiplayerPages,
  openMultiplayerPages,
  resolveActorWithBottomHandAction,
  setupMultiplayerGame,
} from './helpers/gameviewMultiplayerHelpers'
import type { Page } from '@playwright/test'

/**
 * The board used to stop growing at 1050px while its labels stayed at 8-10px, so a bigger window made the play area
 * look smaller and the text harder to read at the same time. The sizing contract now has two ladders: `--game-unit`
 * (window height) drives every label, chip, icon and rail, and `--gameboard-max-width` (window width) drives how much
 * room the board claims. Above 1600px the surface also reserves a right gutter for the docked HUD.
 *
 * Above 1600px the surface reserves the HUD's column on both sides, so the board stays centred in the window with a
 * real margin either side instead of hugging one edge; that reservation is what sets the width at each rung here,
 * and the caps only take over on screens wider than 4K.
 *
 * The label ladder is a multiple of the window height with 1x at 720px, which is what keeps a label's share of its
 * card identical on a laptop and a 4K panel: 10px in a 78px pile card at 720p, 30px in a 234px one at 2160p.
 */
const RUNGS = [
  { width: 1280, height: 720, boardWidthPx: 1050, labelFontPx: 10, cardRadiusPx: 12, hudDocked: false },
  // The breakpoint itself: the reservation takes at most half of the slack beyond 1050px, so the board does not
  // snap narrower just because the HUD gutter started existing. The margin it leaves is already enough for the
  // 252px strip and its clearance, so the chat docks here too.
  { width: 1600, height: 900, boardWidthPx: 1050, labelFontPx: 12.5, cardRadiusPx: 15, hudDocked: true },
  { width: 1920, height: 1080, boardWidthPx: 1294, labelFontPx: 15, cardRadiusPx: 18, hudDocked: true },
  { width: 2560, height: 1440, boardWidthPx: 1755, labelFontPx: 20, cardRadiusPx: 24, hudDocked: true },
  { width: 3840, height: 2160, boardWidthPx: 2832, labelFontPx: 30, cardRadiusPx: 36, hudDocked: true },
] as const

const SIZE_TOLERANCE_PX = 2
// `PlayCard`'s frame ratio. A card that is height-driven but width-clamped loses it, which is what squashed the
// deck and trash piles once the rail stopped keeping up with the rows.
const CARD_ASPECT_RATIO = 200 / 277
const ASPECT_TOLERANCE = 0.02

// HUD body text floor per rung. The chrome ladder is `10 x unit x boost`, and the floors sit just under it so a
// regression in either factor fails loudly instead of quietly shrinking the panels.
const HUD_BODY_MIN_PX: Record<string, number> = {
  '1280x720': 0,
  '1600x900': 12,
  '1920x1080': 17,
  '2560x1440': 22,
  '3840x2160': 36,
}

test.describe('GameView large-screen layout', () => {
  test.describe.configure({ timeout: 180_000 })

  /**
   * The board starts empty, so the loop above can only measure the frames that are always on screen. A summoned
   * card is the one surface that used to come from a flex row as `h-full w-full`, which overrode the art ratio and
   * stretched the card to its share of the row.
   */
  test('a summoned battlefield card keeps the art ratio and sits fully inside its row at 4K', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const summonActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon')
      const page = summonActor.actorPage
      const handCard = page.locator(`[data-testid="bottom-hand-card-${summonActor.cardInstanceId}"]`)

      await handCard.hover()
      await handCard.getByRole('button', { name: /^summon$/i }).click()

      const fieldCard = page.locator('[data-zone="character-field-card"]').first()
      await expect(fieldCard).toBeVisible({ timeout: 15_000 })

      await page.setViewportSize({ width: 3840, height: 2160 })
      await page.waitForTimeout(500)

      // The card's own options must still appear on hover at 4K: the report was "no details, no game options" from a
      // running build, so this pins the layer rather than trusting the layout math.
      await fieldCard.hover()
      await page.waitForTimeout(400)
      const overlay = await fieldCard.evaluate((element) => {
        const controls = element.querySelector('.card-overlay-controls')
        const chip = element.querySelector('.card-overlay-controls button')

        return {
          opacity: controls ? Number.parseFloat(getComputedStyle(controls).opacity) : null,
          chipCount: element.querySelectorAll('.card-overlay-controls button').length,
          chipVisible: chip instanceof HTMLElement ? chip.getBoundingClientRect().width > 0 : false,
        }
      })
      expect(overlay.opacity, 'the battlefield card options should fade in on hover at 4K').not.toBeNull()
      expect(overlay.opacity!).toBeGreaterThan(0.5)
      expect(overlay.chipCount, 'the battlefield card should render its option chips').toBeGreaterThan(0)
      expect(overlay.chipVisible, 'the battlefield card option chip should have a size').toBe(true)

      const box = await fieldCard.boundingBox()
      expect(box, 'the summoned card had no box').not.toBeNull()
      expect(
        Math.abs(box!.width / box!.height - CARD_ASPECT_RATIO),
        'the summoned card should keep the art ratio at 4K',
      ).toBeLessThan(ASPECT_TOLERANCE)

      const geometry = await fieldCard.evaluate((element) => {
        const row = element.closest('[data-zone="character-field-row"]')
        const cardRect = element.getBoundingClientRect()
        const rowRect = row?.getBoundingClientRect() ?? null

        return {
          rowOverflow: row ? row.scrollWidth - row.clientWidth : 0,
          insideRow: rowRect !== null
            && cardRect.left >= rowRect.left - 1
            && cardRect.right <= rowRect.right + 1
            && cardRect.top >= rowRect.top - 1
            && cardRect.bottom <= rowRect.bottom + 1,
        }
      })

      expect(geometry.insideRow, 'the summoned card should sit inside its row').toBe(true)
      expect(geometry.rowOverflow, 'the battlefield row should not need to scroll').toBeLessThanOrEqual(1)
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  test('the board and its labels climb the ladder and never cover the docked HUD', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const page = pages.playerOnePage
      await expect(page.getByTestId('game-board')).toBeVisible({ timeout: 30_000 })

      for (const rung of RUNGS) {
        await page.setViewportSize({ width: rung.width, height: rung.height })
        // The board animates its split when the height changes; measure once it has settled.
        await page.waitForTimeout(450)

        const board = await page.locator('[data-game-board]').boundingBox()
        expect(board, `the board had no box at ${rung.width}x${rung.height}`).not.toBeNull()

        expect(
          board!.width,
          `the board should claim ${rung.boardWidthPx}px at ${rung.width}x${rung.height}`,
        ).toBeGreaterThanOrEqual(rung.boardWidthPx - SIZE_TOLERANCE_PX)
        expect(
          board!.width,
          `the board should not exceed ${rung.boardWidthPx}px at ${rung.width}x${rung.height}`,
        ).toBeLessThanOrEqual(rung.boardWidthPx + SIZE_TOLERANCE_PX)

        // Centred with a real margin either side: the HUD's column is reserved symmetrically, so the play area never
        // sits flush against one edge of the window.
        const leftMargin = board!.x
        const rightMargin = rung.width - (board!.x + board!.width)
        expect(
          Math.abs(leftMargin - rightMargin),
          `the board should be centred at ${rung.width}x${rung.height} (left ${leftMargin}, right ${rightMargin})`,
        ).toBeLessThanOrEqual(SIZE_TOLERANCE_PX)

        const labelFontPx = await readPileLabelFontPx(page)
        expect(
          labelFontPx,
          `an in-card label should be about ${rung.labelFontPx}px at ${rung.width}x${rung.height}`,
        ).toBeGreaterThanOrEqual(rung.labelFontPx - SIZE_TOLERANCE_PX)
        expect(
          labelFontPx,
          `an in-card label should not exceed ${rung.labelFontPx}px at ${rung.width}x${rung.height}`,
        ).toBeLessThanOrEqual(rung.labelFontPx + SIZE_TOLERANCE_PX)

        // The three board bands keep their share of the window at every rung (`0.6fr / 6.1fr / 1.85fr`, so the player's
        // hand is ~21% of the height at any size). Capping the hand bands at large sizes made the hand zones look
        // shrunken on a 4K screen next to a laptop, which is the opposite of the consistency this ladder is for.
        const handRow = await page.locator('[data-testid="bottom-hand-row"]').first().boundingBox()
        expect(handRow, `the bottom hand row had no box at ${rung.width}x${rung.height}`).not.toBeNull()
        expect(
          handRow!.height / rung.height,
          `the hand zone should keep its share of the window at ${rung.width}x${rung.height}`,
        ).toBeGreaterThan(0.17)
        expect(
          handRow!.height / rung.height,
          `the hand zone should keep its share of the window at ${rung.width}x${rung.height}`,
        ).toBeLessThan(0.24)

        // Every framed surface keeps the art's ratio: the leader, the pile cards the rail used to squash, and the
        // hand row.
        const ratios = await readCardAspectRatios(page)
        for (const [name, ratio] of Object.entries(ratios)) {
          expect(ratio, `${name} card had no box at ${rung.width}x${rung.height}`).not.toBeNull()
          expect(
            Math.abs(ratio! - CARD_ASPECT_RATIO),
            `the ${name} card lost its aspect ratio at ${rung.width}x${rung.height}`,
          ).toBeLessThan(ASPECT_TOLERANCE)
        }

        // The two leaders are the same card in mirrored slots, so they must measure the same and sit fully inside
        // their frames: the lower one used to stretch its frame to the rail width and clip differently.
        const leaders = await readLeaderSlots(page)
        expect(leaders.top.width, `the leaders should match at ${rung.width}x${rung.height}`)
          .toBeCloseTo(leaders.bottom.width, 0)
        expect(leaders.top.height, `the leaders should match at ${rung.width}x${rung.height}`)
          .toBeCloseTo(leaders.bottom.height, 0)
        for (const [side, leader] of Object.entries(leaders)) {
          expect(
            Math.abs(leader.ratio - CARD_ASPECT_RATIO),
            `the ${side} leader lost its aspect ratio at ${rung.width}x${rung.height}`,
          ).toBeLessThan(ASPECT_TOLERANCE)
          // One radius, scaled with the card, and the image inheriting it: a fixed 12px corner on a 510px leader
          // reads as square, and an image radius that differs from the frame's shows a rim.
          expect(
            leader.radius,
            `the ${side} leader corner should scale with the card at ${rung.width}x${rung.height}`,
          ).toBeCloseTo(rung.cardRadiusPx, 0)
          expect(
            leader.imageRadius,
            `the ${side} leader image should inherit the card radius at ${rung.width}x${rung.height}`,
          ).toBeCloseTo(leader.radius, 0)
          // The art must fill the card exactly; a smaller image box means `object-cover` is cropping it.
          expect(
            Math.abs(leader.imageWidth - leader.width),
            `the ${side} leader art should fill the card width at ${rung.width}x${rung.height}`,
          ).toBeLessThanOrEqual(2)
          expect(
            Math.abs(leader.imageHeight - leader.height),
            `the ${side} leader art should fill the card height at ${rung.width}x${rung.height}`,
          ).toBeLessThanOrEqual(2)
          expect(
            leader.frameScrollWidth,
            `the ${side} leader is clipped by its frame at ${rung.width}x${rung.height}`,
          ).toBeLessThanOrEqual(leader.frameClientWidth + 1)
          expect(
            leader.rectLeft,
            `the ${side} leader starts outside the board at ${rung.width}x${rung.height}`,
          ).toBeGreaterThanOrEqual(board!.x - 1)
          expect(
            leader.rectRight,
            `the ${side} leader ends outside the board at ${rung.width}x${rung.height}`,
          ).toBeLessThanOrEqual(board!.x + board!.width + 1)
        }

        // Hover parity: the leader's preview affordance is always mounted, so it is the stable probe for "the hover
        // layer still works and still scales".
        const topLeader = page.locator('[data-zone="leader-card"][data-slot-side="top"]').first()
        await topLeader.hover()
        // The layer fades in over 200ms, so measure after the transition has had time to land.
        await page.waitForTimeout(400)
        const hover = await topLeader.evaluate((element) => {
          const float = element.querySelector('.card-overlay-float')

          return float
            ? { opacity: Number.parseFloat(getComputedStyle(float).opacity), width: float.getBoundingClientRect().width }
            : null
        })
        if (hover !== null) {
          expect(hover.opacity, `the leader hover control should appear at ${rung.width}x${rung.height}`)
            .toBeGreaterThan(0.5)
          expect(hover.width, `the leader hover control should have a size at ${rung.width}x${rung.height}`)
            .toBeGreaterThan(0)
        }

        // The leader's damage chip is deliberately narrower than tall; its width has to be a unit multiple too, or it
        // collapses to 16px wide next to a 24-unit height (the "damage indicator is squished" report).
        const damageBadge = page.locator('[data-zone="leader-card"] .card-overlay-badge').first()
        const badge = await damageBadge.evaluate((element) => {
          const rect = element.getBoundingClientRect()

          return { width: rect.width, height: rect.height }
        })
        expect(badge.height, `the damage chip should be 24 units tall at ${rung.width}x${rung.height}`)
          .toBeCloseTo(rung.cardRadiusPx * 2, 0)
        expect(
          badge.width / badge.height,
          `the damage chip should keep its shape at ${rung.width}x${rung.height}`,
        ).toBeGreaterThan(0.55)
        expect(
          badge.width / badge.height,
          `the damage chip should keep its shape at ${rung.width}x${rung.height}`,
        ).toBeLessThan(0.8)

        // The phase row's chips: horizontal padding must scale with the type, not sit at a fixed 6px.
        const phaseChip = page.locator('[data-testid^="phase-action-chip-"]').first()
        if (await phaseChip.count() > 0) {
          const chipMetrics = await phaseChip.evaluate((element) => {
            const style = getComputedStyle(element)

            return { pad: Number.parseFloat(style.paddingLeft), font: Number.parseFloat(style.fontSize) }
          })
          expect(
            chipMetrics.pad / chipMetrics.font,
            `the phase chip padding should keep its share at ${rung.width}x${rung.height}`,
          ).toBeGreaterThan(0.4)
        }

        // The overlays joined the same ladder: the starting-player question and the docked HUD body text must be
        // readable at this rung rather than staying at laptop sizes.
        const dialogTitlePx = await readPromptTitleFontPx(page)
        if (dialogTitlePx !== null) {
          expect(
            dialogTitlePx,
            `the prompt title should be at least 1.5x an in-card label at ${rung.width}x${rung.height}`,
          ).toBeGreaterThanOrEqual(rung.labelFontPx * 1.5)
        }

        if (rung.hudDocked) {
          const hudBodyPx = await readHudBodyFontPx(page)
          expect(
            hudBodyPx,
            `the HUD body text is too small at ${rung.width}x${rung.height}`,
          ).toBeGreaterThanOrEqual(HUD_BODY_MIN_PX[`${rung.width}x${rung.height}`] ?? 0)
        }

        // The ladder is capped by the room the shell actually gives the board, so it must never overflow sideways.
        const horizontalOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        )
        expect(
          horizontalOverflow,
          `the document should not scroll sideways at ${rung.width}x${rung.height}`,
        ).toBeLessThanOrEqual(1)

        const chatPanel = page.locator('[data-testid="game-chat-panel"]')
        if (rung.hudDocked) {
          await expect(chatPanel, `the chat should dock at ${rung.width}x${rung.height}`).toBeVisible({
            timeout: 15_000,
          })
          const chatBox = await chatPanel.boundingBox()
          expect(chatBox).not.toBeNull()
          expect(
            board!.x + board!.width,
            `the board should stop short of the HUD at ${rung.width}x${rung.height}`,
          ).toBeLessThanOrEqual(chatBox!.x)
        } else {
          await expect(
            chatPanel,
            `the chat should stay behind the sidebar button at ${rung.width}x${rung.height}`,
          ).toHaveCount(0)
        }
      }
    } finally {
      await closeMultiplayerPages(pages)
    }
  })
})

/**
 * The pile label is the smallest piece of type on the board and it is readable from the first frame, which makes it a
 * stable probe for the unit: it is `--game-font-sm`, i.e. `10 x --game-unit`.
 */
async function readPileLabelFontPx(page: Page): Promise<number> {
  const pileLabel = page.locator('[data-testid="trash-pile-card"]').first()
  await expect(pileLabel).toBeVisible({ timeout: 15_000 })

  return pileLabel.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
}

/**
 * Width over height for the surfaces that are most at risk of being clamped: the leader (height-driven inside the
 * rail), a pile card (height-driven inside a two-column rail), and a hand card.
 */
async function readLeaderSlots(page: Page): Promise<Record<'top' | 'bottom', {
  width: number
  height: number
  ratio: number
  radius: number
  imageRadius: number
  imageWidth: number
  imageHeight: number
  frameClientWidth: number
  frameScrollWidth: number
  rectLeft: number
  rectRight: number
}>> {
  const read = async (side: 'top' | 'bottom') => {
    const card = page.locator(`[data-zone="leader-card"][data-slot-side="${side}"]`).first()
    await expect(card, `the ${side} leader should be on the board`).toBeVisible({ timeout: 15_000 })

    return card.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const frame = element.parentElement
      const image = element.querySelector('img')
      const imageRect = image?.getBoundingClientRect() ?? null

      return {
        width: rect.width,
        height: rect.height,
        ratio: rect.height > 0 ? rect.width / rect.height : 0,
        radius: Number.parseFloat(getComputedStyle(element).borderTopLeftRadius),
        imageRadius: image ? Number.parseFloat(getComputedStyle(image).borderTopLeftRadius) : 0,
        imageWidth: imageRect?.width ?? 0,
        imageHeight: imageRect?.height ?? 0,
        frameClientWidth: frame?.clientWidth ?? 0,
        frameScrollWidth: frame?.scrollWidth ?? 0,
        rectLeft: rect.left,
        rectRight: rect.right,
      }
    })
  }

  return { top: await read('top'), bottom: await read('bottom') }
}

/**
 * The starting-player / mulligan question, measured only while it is on screen: some setups answer it before this
 * spec looks, and a missing prompt is not a layout failure.
 */
async function readPromptTitleFontPx(page: Page): Promise<number | null> {
  const title = page.locator('[data-testid="prompt-overlay"] h2').first()
  if (await title.count() === 0 || !(await title.isVisible())) {
    return null
  }

  return title.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
}

/** The docked chat panel's empty-state line, a stable sample of HUD body text. */
async function readHudBodyFontPx(page: Page): Promise<number> {
  const body = page.locator('[data-testid="game-chat-empty"]').first()
  await expect(body).toBeVisible({ timeout: 15_000 })

  return body.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
}

async function readCardAspectRatios(page: Page): Promise<Record<string, number | null>> {
  const targets: Array<{ name: string; selector: string }> = [
    { name: 'leader', selector: '[data-zone="leader-card"]' },
    // The empty support slot is a `PlayCard` frame too, so it exercises the same ratio contract on the starting board.
    { name: 'support-slot', selector: '[data-zone="support"]' },
    { name: 'pile', selector: '[data-testid="trash-pile-card"]' },
    { name: 'hand', selector: '[data-testid="bottom-hand-row"] [data-hand-instance-id]' },
  ]
  const ratios: Record<string, number | null> = {}

  for (const target of targets) {
    const card = page.locator(target.selector).first()
    ratios[target.name] = await card.count() === 0
      ? null
      : await card.evaluate((element) => {
        const rect = element.getBoundingClientRect()

        return rect.height > 0 ? rect.width / rect.height : null
      })
  }

  return ratios
}
