import { Outlet, useNavigation } from 'react-router-dom'
import { AppLoadingChip } from '@/components/feedback/AppLoadingChip'

export function RouteTransitionOverlay() {
  const navigation = useNavigation()
  const isNavigationBusy = navigation.state !== 'idle'

  return (
    <>
      <Outlet />
      <div
        className={`pointer-events-none fixed inset-0 z-[120] bg-black/35 backdrop-blur-[2px] transition-opacity duration-200 ${isNavigationBusy ? 'opacity-100' : 'opacity-0'}`}
        aria-hidden={!isNavigationBusy}
      >
        <div className="grid h-full place-items-center">
          <AppLoadingChip />
        </div>
      </div>
    </>
  )
}
