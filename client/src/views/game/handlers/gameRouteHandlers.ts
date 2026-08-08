import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router-dom'
import {
  advancePhase,
  declareActionInActionStep,
  declarePassInActionStep,
  fetchGameById,
  fetchGameCards,
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
    const [gameCards, gameInstance] = await Promise.all([
      fetchGameCards(joinCode),
      fetchGameById(joinCode),
    ])

    return {
      joinCode,
      gameCards,
      gameInstance,
    }
  } catch (error) {
    throw new Response(getApiErrorMessage(error, 'Unable to load this game.'), { status: 400 })
  }
}

export async function gameAction({ params, request }: ActionFunctionArgs): Promise<IGameActionData> {
  const joinCode = resolveJoinCode(params)
  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? '').trim()

  if (!intent) {
    return {}
  }

  try {
    if (intent === 'pass-turn') {
      await declarePassInActionStep(joinCode, { playerId: resolveActionPlayerId() })
      return { gameAction: { ok: true, intent } }
    }

    if (intent === 'declare-action') {
      await declareActionInActionStep(joinCode, { playerId: resolveActionPlayerId() })
      return { gameAction: { ok: true, intent } }
    }

    if (intent === 'advance-phase') {
      await advancePhase(joinCode)
      return { gameAction: { ok: true, intent } }
    }

    return {
      gameAction: {
        ok: false,
        intent,
        error: `Unknown game action '${intent}'.`,
      },
    }
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