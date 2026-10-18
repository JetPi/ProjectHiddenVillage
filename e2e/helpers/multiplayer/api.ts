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

/**
 * Logs a seeded user in.
 *
 * The retry loop that used to live here (twenty attempts, one second apart) existed only because the
 * API could still be migrating and seeding when the first spec started. `globalSetup` now blocks
 * until `/api/health` answers, and the server does not listen until seeding is done, so a refused
 * login is a real failure: surface it immediately instead of spending up to twenty seconds on it.
 */
export async function login(request: APIRequestContext, email: string, password: string): Promise<LoginResponse> {
  const response = await request.post(`${API_BASE_URL}/api/user/login`, {
    data: {
      email,
      password,
    },
  })

  if (!response.ok()) {
    const failureBody = await response.text()
    throw new Error(`Login for seeded user '${email}' failed with ${response.status()}: ${failureBody}`)
  }

  return await response.json() as LoginResponse
}

export type WarmStartResponse = {
  id: string
  phase: string
  activePlayerId: string
  turnNumber: number
}

/**
 * Walks a freshly created, joined game through its opening on the server: the starting-player choice, both
 * mulligans (answered "keep the hand") and the engine-owned phases, down to the first MainPhase.
 *
 * It exists so a scenario starts where it wants to assert instead of replaying the opening in every test. It is
 * only available on a Development server with `PHV_INCLUDE_TEST_SEED_PROFILES` set (the e2e start script sets
 * it); `globalSetup` guarantees the API is up, so a failure here is a real one.
 */
export async function warmStartGame(
  request: APIRequestContext,
  gameCode: string,
  startingPlayerPosition = 0,
): Promise<WarmStartResponse> {
  const response = await request.post(
    `${API_BASE_URL}/api/test/games/${encodeURIComponent(gameCode)}/warm-start`,
    { data: { startingPlayerPosition } },
  )

  if (!response.ok()) {
    const failureBody = await response.text()
    throw new Error(`Warming game '${gameCode}' failed with ${response.status()}: ${failureBody}`)
  }

  return await response.json() as WarmStartResponse
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
