# Taking a move back

A player asks for a redo, the table freezes, and only the other player's agreement moves the board. What an
approval restores is the newest **rewind point**: the board as it was when somebody was last in control.

## Where it lives

- `GameInstance.RewindPoints` (`server/Models/Game/GameInstance.Redo.cs`) is the stack. A point is captured
  **before** every player-initiated mutation and committed only when that mutation changed the board
  (`GameStateFingerprint`), so a refused action leaves nothing behind.
- `GameStateSnapshot` deep-copies and restores the state, with an explicit copied/shared allow-list that
  `GameStateSnapshotTests` reflects over. `CardDefinitions` is shared; the action log is neither copied nor restored.
  The card-movement sequence keeps counting across a restore, because the client de-duplicates animation events by id.
- `InMemoryGameInstanceRegistry.Redo.cs` owns the consent: `RequestRedo`, `RespondToRedo`, `CancelRedo`,
  `ReleaseRedoRequest` and the response watchdog.
- `GamesHub.RedoActions.cs` gives the three calls their own hub paths, like the acknowledgement and the forfeit: the
  request is what freezes the table, so it cannot sit behind the gate that refuses mutations while one is out.
- Client: the sidebar undo button asks (`requestRedo`), `RedoWaitingBanner` is the requester's side with the
  withdrawal, `RedoConsentDialog` is the opponent's answer. The dialog is anchored in the upper half at `z-[400]`,
  because a centred `z-[80]` card was painted under the turn banner with its title clipped.
- `client/src/i18n/index.ts` reloads on a hot update: i18next binds its resources at init, so an edited `en.json`
  used to leave the new components rendering raw keys until a manual refresh.

## Rules that are load-bearing

- A request needs no prompt, no outstanding presentation and a point that differs from the live board; otherwise it
  is refused with a message the client shows as an action error.
- The target point is frozen on the request, and the answer must match the request id.
- One approval consumes one point and drops the points newer than it; older points stay, so repeated approvals walk
  further back (bounded by `GameRedo:MaxRewindPoints`).
- The clock is stopped while a request waits (`GameClockStopResolver`) and re-armed with a forced rearm afterwards.
- The request lapses after `GameRedo:ResponseTimeoutMs`, and is dropped when either participant disconnects.
- `lastRewindId` marks a rewind push: `useAdoptRewindPush` adopts its movement tail as already seen and drops the
  stale hand snapshot, so the board paints the restored position instead of flying cards back into it.
- The log records `redo_requested` / `redo_accepted` / `redo_declined` / `redo_cancelled`, published through the
  allow-list and phrased by the client like every other entry.

## Verified

- `GameStateSnapshotTests` (copy independence, restore round-trip, movement-id rule, reflection contract) and
  `InMemoryGameInstanceRegistryRedoTests` (request, freeze, decline, accept, chaining, wrong answerer, superseded id,
  timeout, disconnect release, withdrawal, point coverage, published payload). 897 server tests green.
- `e2e/gameview.multiplayer.redo.spec.ts`: a declined request leaves the summoned card on the field and logs both
  halves; an accepted one puts it back in hand, and a second acceptance lands on a different rewind point. It also
  pins the dialog's own copy and that it sits above the middle line, so a missing translation or a buried overlay
  fails the suite instead of waiting for someone to look at the board.
- `npm --prefix client run typecheck` and `npm run lint:client` clean.

## Open items

- A rewind may fly one card back (the returning card's ghost), which reads as the move being undone rather than as
  the restored payload being replayed.
- Time spent on the undone action is not refunded to the actor's clock pool.
