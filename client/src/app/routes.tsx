import { createBrowserRouter } from 'react-router-dom'
import { RouteErrorBoundary } from '@/components/feedback/RouteErrorBoundary'
import { AuthRouteErrorBoundary } from '@/components/feedback/AuthRouteErrorBoundary'
import { AdminRouteErrorBoundary } from '@/components/feedback/AdminRouteErrorBoundary'
import { Navigate } from 'react-router-dom'
import { adminRouteGuard } from '@/app/guards/adminRouteGuard'
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
        // One gate for the whole subtree. The parent's loader runs before any child renders - and before a child can
        // be reached by URL - so a new admin screen is protected the moment it is added here. `children` stay
        // path-relative (`cards`, not `/admin/cards`) precisely so they cannot escape the parent.
        path: '/admin',
        loader: adminRouteGuard,
        errorElement: <AdminRouteErrorBoundary />,
        children: [
          {
            index: true,
            element: <Navigate to="/admin/cards" replace />,
          },
          {
            path: 'cards',
            lazy: async () => {
              const { CardAdminView } = await import('@/views/admin/CardAdminView')

              return {
                Component: CardAdminView,
              }
            },
          },
          {
            path: 'cards/new',
            lazy: async () => {
              const { CardAdminCreateView } = await import('@/views/admin/CardAdminCreateView')

              return {
                Component: CardAdminCreateView,
              }
            },
          },
          {
            path: 'decks',
            lazy: async () => {
              const { DeckAdminView } = await import('@/views/admin/DeckAdminView')

              return {
                Component: DeckAdminView,
              }
            },
          },
          {
            path: 'decks/:deckId',
            lazy: async () => {
              const { DeckAdminView } = await import('@/views/admin/DeckAdminView')

              return {
                Component: DeckAdminView,
              }
            },
          },
          {
            path: 'rulesets',
            lazy: async () => {
              const { DeckRulesetAdminView } = await import('@/views/admin/DeckRulesetAdminView')

              return {
                Component: DeckRulesetAdminView,
              }
            },
          },
        ],
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
