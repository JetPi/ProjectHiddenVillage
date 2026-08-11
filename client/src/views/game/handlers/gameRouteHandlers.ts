import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router-dom'
import {
  fetchGameCards,
  fetchGameState,
} from '../../../services/api/gameApi'
import { readAuthSession } from '../../../state/authSession'
import { getApiErrorMessage } from '../../utils/getApiErrorMessage'
import type { IGameActionData, IGameLoaderData } from '../types/routeData'

function resolveJoinCode(params: LoaderFunctionArgs['params']): string {
  const joinCode = params.joinCode?.trim() ?? ''
  if (!joinCode) {
    throw new Response('Game code is required.', { status: 400 })
  }

  return joinCode
}

function normalizeRuntimePlayerId(userId: string): string {
  return userId.trim().toLowerCase().replace(/-/g, '')
}

function resolveActionPlayerId(): string {
  const authSession = readAuthSession()
  const playerId = normalizeRuntimePlayerId(authSession?.userId ?? '')
  if (!playerId) {
    throw new Error('You must be logged in to perform game actions.')
  }

  return playerId
}

export async function gameLoader({ params }: LoaderFunctionArgs): Promise<IGameLoaderData> {
  const joinCode = resolveJoinCode(params)

  try {
    const [gameCards, gameState] = await Promise.all([
      fetchGameCards(joinCode),
      fetchGameState(joinCode),
    ])

    return {
      joinCode,
      gameCards,
      gameState,
    }
  } catch (error) {
    throw new Response(getApiErrorMessage(error, 'Unable to load this game.'), { status: 400 })
  }
}

export async function gameAction({ params, request }: ActionFunctionArgs): Promise<IGameActionData> {
  resolveJoinCode(params)
  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? '').trim()

  if (!intent) {
    return {}
  }

  if (intent === 'pass-turn' || intent === 'declare-action') {
    try {
      resolveActionPlayerId()
      return { gameAction: { ok: true, intent } }
    } catch (error) {
      return {
        gameAction: {
          ok: false,
          intent,
          error: getApiErrorMessage(error, 'Game action failed.'),
        },
      }
    }
  }

  if (intent === 'advance-phase') {
    return { gameAction: { ok: true, intent } }
  }

  return {
    gameAction: {
      ok: false,
      intent,
      error: `Unknown game action '${intent}'.`,
    },
  }
}