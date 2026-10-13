import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router-dom'
import i18n from '@/i18n'
import {
  fetchGameCards,
  fetchGameState,
} from '@/services/api/gameApi'
import { appQueryClient } from '@/services/queryClient'
import { cardQueryKeys } from '@/services/queries/cardQueries'
import { gameStateQueryKeys } from '@/services/queries/gameStateQueries'
import { readAuthSession } from '@/state/authSession'
import { getApiErrorMessage } from '@/views/utils/getApiErrorMessage'
import type { IGameActionData, IGameLoaderData } from '@/views/game/types'

function resolveJoinCode(params: LoaderFunctionArgs['params']): string {
  const joinCode = params.joinCode?.trim() ?? ''
  if (!joinCode) {
    throw new Response(i18n.t('game.errors.gameCodeRequired'), { status: 400 })
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
    throw new Error(i18n.t('game.errors.loginRequired'))
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

    appQueryClient.setQueryData(cardQueryKeys.gameCards(joinCode), gameCards)
    appQueryClient.setQueryData(gameStateQueryKeys.byCode(joinCode), gameState)

    return {
      joinCode,
      gameCards,
      gameState,
    }
  } catch (error) {
    throw new Response(getApiErrorMessage(error, i18n.t('game.errors.loadFailed')), { status: 400 })
  }
}

export async function gameAction({ params, request }: ActionFunctionArgs): Promise<IGameActionData> {
  resolveJoinCode(params)
  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? '').trim()

  if (!intent) {
    return {}
  }

  if (intent === 'pass-turn' || intent === 'declare-action' || intent === 'declare-attack') {
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

  return {
    gameAction: {
      ok: false,
      intent,
      error: `Unknown game action '${intent}'.`,
    },
  }
}