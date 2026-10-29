# Card Art Size Standardization

Goal: stop board card art from blurring / going pixelated / appearing to warp by giving every card surface
one shared sizing contract instead of the previous mix, and by letting the browser pick a source width that
matches the rendered box and the device pixel ratio.

Status: implemented. Section 4 is what the code now does; section 5 records the decisions that were taken.

## 1. How art is produced

- A master upload is capped at the widest allowed variant width: [`CardArtOptions.ResolveMasterWidth()`](server/Api/Services/CardArt/CardArtOptions.cs:39) → `AllowedWidths.Max()`.
- The ladder lives only in [`CardArtOptions`](server/Api/Services/CardArt/CardArtOptions.cs:20); `appsettings.json` no longer restates it, so the code default is the single source of truth (a deployment can still override `CardArt:AllowedWidths`).
- The read path resizes per requested `w`, preserves aspect ratio with Lanczos3 ([`CardArtImageProcessor.ResizeToWebpAsync()`](server/Api/Services/CardArt/CardArtImageProcessor.cs:30)), and serves the master directly when `w >= master width` ([`CardArtService.ResolveAsync()`](server/Api/Services/CardArt/CardArtService.cs:87)).
- So the server never warps an image and never upscales past the master; it can now return up to 900 px wide.

## 2. Sweep: which source width is used where

| Surface | Component | Width today |
| --- | --- | --- |
| Leader card | [`LeaderCard`](client/src/components/ui/cards/LeaderCard.tsx:88) via [`resolveLeaderCard`](client/src/views/game/utils/functions/cards/index.ts:82) | ladder, `sizes` = 290 px |
| Battlefield card | [`BattleFieldRow`](client/src/views/game/components/BattleFieldRow.tsx:82) | ladder, `sizes` = 170 px |
| Support slot | [`ZoneCardSlots`](client/src/views/game/components/ZoneCardSlots.tsx:148) | ladder, `sizes` = 92 px |
| Hand card | [`BottomHandReorderRow`](client/src/views/game/components/BottomHandReorderRow.tsx:74) | ladder, `sizes` = 120 px |
| Revealed top hand card | [`GameView`](client/src/views/game/GameView.tsx:348) | ladder, `sizes` = 120 px |
| Deck reveal / trash top | [`PlayPileZone`](client/src/components/ui/game/PlayPileZone.tsx:108) | ladder, `sizes` = 208 px |
| Prompt card tile | [`GamePromptOverlay`](client/src/views/game/components/GamePromptOverlay.tsx:91) | ladder, `sizes` = 124 px |
| Trash / deck list row | [`CardListOverlay`](client/src/components/ui/cards/CardListOverlay.tsx:38) | ladder, `sizes` = 56 px |
| Card preview panel | [`CardPreviewCard`](client/src/components/ui/cards/CardPreviewCard.tsx:148) | ladder, `sizes` = `min(92vw, 22rem)` |
| Admin catalogue tile | [`CardAdminCardTile`](client/src/views/admin/components/catalog/CardAdminCardTile.tsx:105) | ladder, `sizes` = 320 px thumb / 160 px |
| Admin art picker | [`CardAdminArtPicker`](client/src/views/admin/components/detail/CardAdminArtPicker.tsx:51) | ladder, `sizes` = 160 px |
| Card back | [`CardBack`](client/src/components/ui/cards/CardBack.tsx:15) | static 1066x1475 asset, intrinsic 600x831 |
| Chakra HUD | [`ResourceChakraGrid`](client/src/components/ui/game/ResourceChakraGrid.tsx:41) | static `-hud` webp, 70x98 for face and back |

Board geometry that drives those boxes: board `max-w-[1050px]` with `lg:grid-cols-[1.1fr_1.7fr_1.1fr]` ([`GAMEBOARD_MAX_WIDTH_CLASS`](client/src/views/game/utils/contants.ts:20)), grid rows `1fr 1fr auto 1fr 1fr` ([`GameZones`](client/src/views/game/components/GameZones.tsx:272)), rail cap `--resource-rail-max-width: 208px` ([`index.css`](client/src/index.css:78)). Card width is `row height x 0.722`, not a fixed number - which is exactly why a single 240 px file could not serve every surface.

## 3. Defects that were found

1. **Under-specified source for every board surface.** Everything resolved at 240 px, including the leader and battlefield cards drawn 150 to 290 px wide: a 1.3x to 2.4x CSS upscale and up to ~7x at 3x DPR.
2. **No `srcSet`/`sizes` in [`CardImage`](client/src/components/ui/cards/CardImage.tsx:59).** Device pixel ratio was ignored; the only responsive image in the app was the admin picker.
3. **Ladder gap.** Nothing between 240 and 600, and nothing at all above 600.
4. **Three aspect ratios for the same art.** `200/277`, `600/831` and `5/7` (0.7143 against 0.7220), which cropped ~1 percent in the admin tile.
5. **Mixed `object-fit`.** `object-contain` on board surfaces, `object-cover` on overlays, hand and reveal: the same card was framed differently by location.
6. **`imageRendering` was a public prop** offering `pixelated` / `crisp-edges`, and every surface re-declared `[image-rendering:auto]`.
7. **HUD intrinsic size mismatch.** `70x98` for a face and `70x97` for a back in the same frame.
8. **Card backs had no intrinsic dimensions.**
9. **Preload fought the ladder.** Board plus preview for every visible card, on every device.

## 4. What was implemented

- **Width ladder, one place:** [`CARD_ART_WIDTHS`](client/src/services/api/cardArt.ts:13) = `120 / 240 / 360 / 600 / 900`, exported as `CARD_ART_WIDTH_LADDER`, mirrored by `CardArtOptions.AllowedWidths` and guarded by [`CardArtOptionsTests`](server/tests/ProjectHiddenVillage.Server.Tests/CardArtOptionsTests.cs:20).
- **`CardImage` is responsive:** [`buildCardArtSrcSet()`](client/src/services/api/cardArt.ts:57) turns the ladder into `srcset` whenever a `card` is supplied, `sizes` comes from `CARD_SIZES`, and intrinsic `width`/`height` come from `CARD_ART_ASPECT` so a card reserves its box before decode. `src`-only callers (bundled assets, staged admin uploads) behave exactly as before.
- **One role per surface:** [`CARD_SIZES`](client/src/components/ui/cards/constants/index.ts:31) holds `leader`, `battlefieldCard`, `supportSlot`, `handCard`, `pileCard`, `promptTile`, `listRow`, `previewPanel`, `adminTile`, `adminThumb`. No call site invents a box any more.
- **Board view models carry the ladder:** [`ILeaderCardViewModel`](client/src/views/game/types/hub/viewModels.ts:16) and [`INonLeaderCardViewModel`](client/src/views/game/types/hub/viewModels.ts:42) gained `imageSrcSet`, built in [`resolveLeaderCard`](client/src/views/game/utils/functions/cards/index.ts:82) and [`resolveNonLeaderCards`](client/src/views/game/utils/functions/cards/index.ts:125).
- **One aspect token:** `CARD_ART_ASPECT_CLASS` (`aspect-[600/831]`) replaced `aspect-[5/7]` and the `aspect-[200/277]` literals in [`PlayCard`](client/src/components/ui/game/PlayCard.tsx:15), [`GameHandRow`](client/src/views/game/components/GameHandRow.tsx:9) and [`BattleFieldRow`](client/src/views/game/components/BattleFieldRow.tsx:163).
- **One fit policy:** `object-cover` for framed surfaces (`CARD_ART_IMAGE_CLASS`), `object-contain` only for the preview panel (`CARD_ART_FIT_CLASS`).
- **`imageRendering` removed** from [`ICardImageProps`](client/src/components/ui/types/index.ts:38); the duplicated `[image-rendering:auto]` fragments are gone.
- **Assets standardized:** card backs render with intrinsic dimensions; the HUD face and back share one 70x98 box.
- **Preload follows the ladder:** [`resolveVisibleCardArtPreloadWidth()`](client/src/services/cardPreloadService.ts:30) picks the smallest step that covers a 290 px card at the current DPR (max 3x), so a 1x screen warms 360 instead of 600 and a 3x screen warms 900.
- **Regression coverage:** [`gameview.card-art-fidelity.spec.ts`](e2e/gameview.card-art-fidelity.spec.ts:19) asserts the leader card offers every ladder width, declares its `sizes`, and resolves a source at least as wide as the box it is drawn in (and at least 2x that on a 2x screen).

## 5. Decisions taken

- **Master cap raised from 600 to 900** so 3x and 4K screens stay crisp on the largest surface. `ResolveMasterWidth()` follows the ladder automatically, so uploads are stored up to 900 px wide.
- **The author-facing minimum stayed at 600.** `CARD_ART_MIN_SOURCE_WIDTH` no longer mirrors the master cap: a 600-900 px upload is stored at its own width and answers the larger ladder steps with what it has, because the read path never upscales. Raising the gate to 900 would have rejected art that already works (and the admin create flow documents 800 px as acceptable).
- **`80` kept in the allowlist** for back-compat with any stale request; the client never asks for it.
- **Old 600 px masters stay valid.** The read path serves a master directly for any `w >= master width` and refuses to upscale, so an existing 600 px master keeps answering 900 with its own bytes - slightly soft at 3x, never stretched from a variant.
- **Existing cached variants do not need clearing.** Cache keys include both width and version, so new ladder steps simply add files and the orphan sweeper collects the widths nobody asks for any more.
