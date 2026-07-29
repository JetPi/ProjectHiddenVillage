import { createBrowserRouter } from 'react-router-dom'
import { LoginView } from '../views/login/LoginView'
import { SignInView } from '../views/login/SignInView'
import { GameView } from '../views/game/GameView'
import { RouteErrorBoundary } from '../components/feedback/RouteErrorBoundary'

export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        path: '/',
        element: <LoginView />,
      },
      {
        path: '/game',
        element: <GameView />,
      },
      {
        path: '/sign-in',
        element: <SignInView />,
      },
    ],
  },
])
