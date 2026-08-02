import { createBrowserRouter } from 'react-router-dom'
import { LoginView } from '../views/login/LoginView'
import { SignInView } from '../views/login/SignInView'
import { GameView } from '../views/game/GameView'
import { RouteErrorBoundary } from '../components/feedback/RouteErrorBoundary'
import { AuthRouteErrorBoundary } from '../components/feedback/AuthRouteErrorBoundary'
import { loginAction, loginLoader } from '../views/login/handlers/loginRouteHandlers'
import { signInAction, signInLoader } from '../views/login/handlers/signInRouteHandlers'
import { NotFoundView } from '../views/NotFoundView'
import { Navigate } from 'react-router-dom'

export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        path: '/',
        element: <LoginView />,
        loader: loginLoader,
        action: loginAction,
      },
      {
        path: '/game',
        element: <GameView />,
      },
      {
        path: '/sign-in',
        element: <SignInView />,
        loader: signInLoader,
        action: signInAction,
        errorElement: <AuthRouteErrorBoundary />,
      },
      {
        path: '/signin',
        element: <Navigate to="/sign-in" replace />,
      },
      {
        path: '/sign-up',
        element: <Navigate to="/sign-in" replace />,
      },
      {
        path: '*',
        element: <NotFoundView />,
      },
    ],
  },
])
