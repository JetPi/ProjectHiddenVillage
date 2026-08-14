import { AppLoadingChip } from '../components/feedback/AppLoadingChip'

export function AppHydrateFallback() {
  return (
    <div className="app-loader-screen">
      <AppLoadingChip />
    </div>
  )
}
