import { expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { APIRequestContext } from '@playwright/test'
import type { GameStateResponse, LoginResponse } from './types'
import type { MultiplayerSeedPlayerProfile, MultiplayerSeedProfileName } from './types'

export const API_BASE_URL = 'http://127.0.0.1:3101'

type SeedManifest = {
  profiles: Array<{
    name: MultiplayerSeedProfileName
    decks: {
      one: { deckId: string }
      two: { deckId: string }
    }
  }>
}

const BASE_PLAYER_ONE = {
  id: '20000000-0000-0000-0000-000000000001',
  email: 'test-user-1@hiddenvillage.local',
  password: 'TestUser1!',
}

const BASE_PLAYER_TWO = {
  id: '20000000-0000-0000-0000-000000000002',
  email: 'test-user-2@hiddenvillage.local',
  password: 'TestUser2!',
}

function loadSeedProfiles(): Record<MultiplayerSeedProfileName, { one: MultiplayerSeedPlayerProfile; two: MultiplayerSeedPlayerProfile }> {
  const manifestPath = resolve(process.cwd(), 'test-data/seed-profiles.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as SeedManifest

  return manifest.profiles.reduce((profiles, profile) => {
    profiles[profile.name] = {
      one: {
        ...BASE_PLAYER_ONE,
        deckId: profile.decks.one.deckId,
      },
      two: {
        ...BASE_PLAYER_TWO,
        deckId: profile.decks.two.deckId,
      },
    }

    return profiles
  }, {} as Record<MultiplayerSeedProfileName, { one: MultiplayerSeedPlayerProfile; two: MultiplayerSeedPlayerProfile }>)
}

export const SEEDED_PLAYER_PROFILES = loadSeedProfiles()

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
