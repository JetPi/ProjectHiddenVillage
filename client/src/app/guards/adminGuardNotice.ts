/**
 * Hand-off between the admin route guard and the shell.
 *
 * The guard runs inside a loader and immediately throws a redirect, so a toast raised there would be created before
 * the redirect lands - sonner queues it, but the toast is measured and dismissed around a navigation that is still
 * in flight, and in practice it never reached the screen. Raising it from the shell's effect instead means it is
 * emitted after the login panel is mounted, by which point the toaster is present.
 *
 * Memory-only on purpose: the notice describes the navigation that just happened, and nothing about it should
 * survive a reload.
 */
let pendingSignInNotice = false

/** Called by the guard when it bounced an anonymous visitor off an admin URL. */
export function markAdminSignInNotice(): void {
  pendingSignInNotice = true
}

/** Reads and clears the flag, so a later unrelated navigation cannot replay the notice. */
export function consumeAdminSignInNotice(): boolean {
  const pending = pendingSignInNotice
  pendingSignInNotice = false

  return pending
}
