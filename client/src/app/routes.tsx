import { createBrowserRouter } from 'react-router-dom'
import { LoginView } from '../views/login/LoginView'
import { GameView } from '../views/game/GameView'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <LoginView />,
  },
  {
    path: '/game',
    element: <GameView />,
  },
])
