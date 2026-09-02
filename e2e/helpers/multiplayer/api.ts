import { expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import type { GameStateResponse, LoginResponse } from './types'

export const API_BASE_URL = 'http://127.0.0.1:3101'

const SEEDED_PLAYER_ONE = {
  id: '20000000-0000-0000-0000-000000000001',
  email: 'test-user-1@hiddenvillage.local',
  password: 'TestUser1!',
  deckId: '10000000-0000-0000-0000-000000000001',
}

const SEEDED_PLAYER_TWO = {
  id: '20000000-0000-0000-0000-000000000002',
  email: 'test-user-2@hiddenvillage.local',
  password: 'TestUser2!',
  deckId: '10000000-0000-0000-0000-000000000002',
}

export const SEEDED_PLAYERS = {
  one: SEEDED_PLAYER_ONE,
  two: SEEDED_PLAYER_TWO,
}

export async function login(request: APIRequestContext, email: string, password: string): Promise<LoginResponse> {
  const maxAttempts = 20

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await request.post(`${API_BASE_URL}/api/user/login`, {
        data: {
          email,
          password,
        },
      })

      if (response.ok()) {
        return await response.json() as LoginResponse
      }
    } catch {
      // Backend can still be warming up when this test starts.
    }

    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  throw new Error(`Failed to login seeded user '${email}' after retries.`)
}

export async function createGame(request: APIRequestContext, userId: string, deckId: string, accessToken: string): Promise<string> {
  const response = await request.post(`${API_BASE_URL}/api/games`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    data: {
      userId,
      deckId,
    },
  })

  expect(response.ok()).toBeTruthy()
  const payload = await response.json() as { id: string }
  return payload.id
}

export async function joinGame(
  request: APIRequestContext,
  gameCode: string,
  userId: string,
  deckId: string,
  accessToken: string,
): Promise<void> {
  const response = await request.post(`${API_BASE_URL}/api/games/${encodeURIComponent(gameCode)}/join`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    data: {
      userId,
      deckId,
    },
  })

  expect(response.ok()).toBeTruthy()
}

export async function fetchGameState(request: APIRequestContext, gameCode: string, accessToken: string): Promise<GameStateResponse> {
  const response = await request.get(`${API_BASE_URL}/api/games/${encodeURIComponent(gameCode)}/state`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  expect(response.ok()).toBeTruthy()
  return await response.json() as GameStateResponse
}
