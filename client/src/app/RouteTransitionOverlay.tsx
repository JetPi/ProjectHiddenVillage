import { useEffect } from 'react'
import { Outlet, useLocation, useNavigation } from 'react-router-dom'
import { AppLoadingChip } from '@/components/feedback/AppLoadingChip'
import { showAppInfoToast } from '@/components/feedback/appToastNotifications'
import i18n from '@/i18n'
import { consumeAdminSignInNotice } from '@/app/guards/adminGuardNotice'

/**
 * The navigation scrim.
 *
 * It is mounted for the whole session (so the fade-out can play), which means it sits *over every page* - and it
 * must not carry a `backdrop-filter` while doing so. A full-viewport `backdrop-filter` turns the page underneath
 * into a filtered backdrop: it is rasterized through the blur layer and re-sampled as that layer's opacity
 * animates, so mounting a board underneath an active scrim makes the whole board visibly pop/jitter for the
 * length of the fade - the "the board shakes when I navigate into the game" report. `GameView`'s own `Panel`
 * already forces `backdropFilter: 'none'` for the same reason, and the scrim plus the chip reads identically
 * without it.
 *
 * Colours only, never filters: keep this rule if the scrim is restyled.
 */
export function RouteTransitionOverlay() {
  const navigation = useNavigation()
  const location = useLocation()
  const isNavigationBusy = navigation.state !== 'idle'

  // The admin guard bounces anonymous visitors to the login panel; it can only leave a flag behind, because a toast
  // raised inside its loader would fire before the redirect lands. The notice is emitted here, after the panel is
  // mounted, and the flag is consumed so no later navigation replays it.
  useEffect(() => {
    if (!consumeAdminSignInNotice()) {
      return
    }

    showAppInfoToast(i18n.t('admin.guard.signInRequired'), {
      id: 'admin-route-guard-status',
      position: 'top-right',
    })
  }, [location.pathname])

  return (
    <>
      <Outlet />
      <div
        data-testid="route-transition-overlay"
        data-navigation-busy={isNavigationBusy ? 'true' : 'false'}
        className={`pointer-events-none fixed inset-0 z-[120] bg-black/35 transition-opacity duration-200 ${isNavigationBusy ? 'opacity-100' : 'opacity-0'}`}
        aria-hidden={!isNavigationBusy}
      >
        <div className="grid h-full place-items-center">
          <AppLoadingChip />
        </div>
      </div>
    </>
  )
}
