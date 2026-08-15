import { createBrowserRouter } from 'react-router-dom'
import { RouteErrorBoundary } from '@/components/feedback/RouteErrorBoundary'
import { AuthRouteErrorBoundary } from '@/components/feedback/AuthRouteErrorBoundary'
import { Navigate } from 'react-router-dom'
import { RouteTransitionOverlay } from '@/app/RouteTransitionOverlay'
import { AppHydrateFallback } from '@/app/AppHydrateFallback'

export const router = createBrowserRouter([
  {
    element: <RouteTransitionOverlay />,
    HydrateFallback: AppHydrateFallback,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        path: '/',
        lazy: async () => {
          const [{ LoginView }, { loginAction, loginLoader }] = await Promise.all([
            import('@/views/login/LoginView'),
            import('@/views/login/handlers/loginRouteHandlers'),
          ])

          return {
            Component: LoginView,
            loader: loginLoader,
            action: loginAction,
          }
        },
      },
      {
        path: '/game/:joinCode',
        lazy: async () => {
          const [{ GameView }, { gameAction, gameLoader }] = await Promise.all([
            import('@/views/game/GameView'),
            import('@/views/game/handlers/gameRouteHandlers'),
          ])

          return {
            Component: GameView,
            loader: gameLoader,
            action: gameAction,
          }
        },
      },
      {
        path: '/game',
        element: <Navigate to="/" replace />,
      },
      {
        path: '/sign-in',
        lazy: async () => {
          const [{ SignInView }, { signInAction, signInLoader }] = await Promise.all([
            import('@/views/login/SignInView'),
            import('@/views/login/handlers/signInRouteHandlers'),
          ])

          return {
            Component: SignInView,
            loader: signInLoader,
            action: signInAction,
          }
        },
        errorElement: <AuthRouteErrorBoundary />,
      },
      {
        path: '*',
        lazy: async () => {
          const { NotFoundView } = await import('@/views/NotFoundView')

          return {
            Component: NotFoundView,
          }
        },
      },
    ],
  },
])
