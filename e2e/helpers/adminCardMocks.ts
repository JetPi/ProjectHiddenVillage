import type { APIRequestContext, Page, Route } from '@playwright/test'
import { API_BASE_URL } from './multiplayer/api'

/** Every card this spec family used to leave behind starts with this prefix. */
export const ADMIN_CREATE_CARD_PREFIX = 'E2E-CREATE-'

/** Deterministic trait suggestions, so the create spec never depends on seed data. */
export const ADMIN_TRAIT_OPTIONS = ['Ninja', 'Uchiha Clan'] as const

/** A 1x1 WebP, enough for the mocked art endpoint to resolve as a real image. */
const TINY_WEBP_BASE64 = 'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=='

type CreateCardPayload = {
  cardId: string
  displayName: string
  image?: string
  name?: string[]
  mainAlternate?: boolean
  traits?: string[]
  type?: string
  color?: string
  description?: string
  damage?: number
  power?: number
  life?: number
  health?: number
  cannotBeNormalSummoned?: boolean
  supportName?: string
  supportEffect?: string
}

type CatalogCard = {
  id: string
  image: string
  imageVersion: number
  mainAlternate: boolean
  name: string[]
  displayName: string
  type: string
  traits: string[]
  color: string
  description: string
  damage: number
  power: number
  conditions: string[]
  effects: unknown[]
  life: number | null
  health: number | null
  cannotBeNormalSummoned: boolean
  supportName: string | null
  supportEffect: string | null
  supportCost: number | null
}

type PagedCatalogResponse = {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  items: Array<{
    id: string
    displayName: string
    type: string
    color: string
    image: string
    imageVersion: number
  }>
}

export type AdminCardCreateMockState = {
  createPayload: CreateCardPayload | null
  createRequests: number
  uploadRequests: number
  artRequests: number
  createdCard: CatalogCard | null
}

type InstallOptions = {
  cardId: string
  displayName: string
}

function buildCatalogCard(payload: CreateCardPayload): CatalogCard {
  const image = payload.image ?? ''

  return {
    id: payload.cardId,
    image,
    imageVersion: 1,
    mainAlternate: payload.mainAlternate ?? false,
    name: payload.name ?? [],
    displayName: payload.displayName,
    type: payload.type ?? 'Character',
    traits: payload.traits ?? [],
    color: payload.color ?? 'Red',
    description: payload.description ?? '',
    damage: payload.damage ?? 0,
    power: payload.power ?? 0,
    conditions: [],
    // The spec asserts the posted request, not the server's effect rehydration.
    effects: [],
    life: payload.life ?? null,
    health: payload.health ?? null,
    cannotBeNormalSummoned: payload.cannotBeNormalSummoned ?? false,
    supportName: payload.supportName ?? null,
    supportEffect: payload.supportEffect ?? null,
    supportCost: null,
  }
}

function corsHeaders(route: Route): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': route.request().headers()['origin'] ?? 'http://127.0.0.1:4173',
    'Access-Control-Allow-Credentials': 'true',
  }
}

async function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: corsHeaders(route),
    body: JSON.stringify(body),
  })
}

async function handlePreflight(route: Route): Promise<boolean> {
  if (route.request().method() !== 'OPTIONS') {
    return false
  }

  await route.fulfill({
    status: 204,
    headers: {
      ...corsHeaders(route),
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, authorization',
    },
  })

  return true
}

/**
 * Keeps the create-card e2e flow entirely inside the browser.
 *
 * The spec still exercises the real catalogue for its initial read and the real client-side image validation,
 * but the upload and the write are answered here. That is what stops a test card from reaching the database
 * while leaving the user-visible flow - paste, upload, create, search - intact.
 */
export async function installAdminCardCreateMocks(
  page: Page,
  { cardId, displayName }: InstallOptions,
): Promise<AdminCardCreateMockState> {
  const state: AdminCardCreateMockState = {
    createPayload: null,
    createRequests: 0,
    uploadRequests: 0,
    artRequests: 0,
    createdCard: null,
  }

  await page.route('**/api/card-art/**', async (route) => {
    if (await handlePreflight(route)) {
      return
    }

    const url = new URL(route.request().url())
    const cardArtPath = `/api/card-art/${encodeURIComponent(cardId)}`
    if (url.pathname !== cardArtPath) {
      await route.continue()
      return
    }

    switch (route.request().method()) {
      case 'POST': {
        state.uploadRequests += 1
        await fulfillJson(route, 200, {
          cardId,
          reference: `local:${cardId}`,
          version: 1,
        })
        return
      }
      case 'GET': {
        state.artRequests += 1
        await route.fulfill({
          status: 200,
          contentType: 'image/webp',
          headers: corsHeaders(route),
          body: Buffer.from(TINY_WEBP_BASE64, 'base64'),
        })
        return
      }
      case 'DELETE': {
        await route.fulfill({ status: 204, headers: corsHeaders(route) })
        return
      }
      default:
        await route.continue()
    }
  })

  await page.route('**/api/card/catalog**', async (route) => {
    if (await handlePreflight(route)) {
      return
    }

    const request = route.request()
    const url = new URL(request.url())

    if (url.pathname.endsWith('/traits')) {
      await fulfillJson(route, 200, ADMIN_TRAIT_OPTIONS)
      return
    }

    if (url.pathname.endsWith('/by-ids')) {
      if (request.method() !== 'POST') {
        await route.continue()
        return
      }

      const requestedIds = (request.postDataJSON() as string[] | null) ?? []
      if (state.createdCard && requestedIds.some((id) => id.trim().toLowerCase() === cardId.toLowerCase())) {
        await fulfillJson(route, 200, [state.createdCard])
        return
      }

      await route.continue()
      return
    }

    if (url.pathname.endsWith('/effect-condition-keywords')) {
      await route.continue()
      return
    }

    if (url.pathname !== '/api/card/catalog') {
      await route.continue()
      return
    }

    if (request.method() === 'POST') {
      const payload = request.postDataJSON() as CreateCardPayload | null
      if (!payload) {
        await route.fulfill({ status: 400, body: 'Missing create payload.', headers: corsHeaders(route) })
        return
      }

      state.createPayload = payload
      state.createRequests += 1
      state.createdCard = buildCatalogCard(payload)

      await fulfillJson(route, 201, state.createdCard)
      return
    }

    if (request.method() === 'GET') {
      const search = url.searchParams.get('search')?.trim() ?? ''
      if (state.createdCard && search.toLowerCase() === cardId.toLowerCase()) {
        const pageNumber = Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1
        const pageSize = Number.parseInt(url.searchParams.get('pageSize') ?? '100', 10) || 100
        const createdCard = state.createdCard
        const response: PagedCatalogResponse = {
          page: pageNumber,
          pageSize,
          totalCount: 1,
          totalPages: 1,
          items: [
            {
              id: createdCard.id,
              displayName: createdCard.displayName,
              type: createdCard.type,
              color: createdCard.color,
              image: createdCard.image,
              imageVersion: createdCard.imageVersion,
            },
          ],
        }

        await fulfillJson(route, 200, response)
        return
      }

      await route.continue()
      return
    }

    await route.continue()
  })

  return state
}

type CatalogPage = {
  items: Array<{ id: string }>
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` }
}

/**
 * Removes cards the old create spec wrote before it was mocked, and any row a broken mock might have let
 * through. The search matches the `E2E-CREATE-` id prefix, which no real card uses.
 */
export async function deleteLegacyAdminCreateCards(
  request: APIRequestContext,
  accessToken: string,
): Promise<void> {
  for (;;) {
    const response = await request.get(`${API_BASE_URL}/api/card/catalog`, {
      params: {
        page: 1,
        pageSize: 100,
        search: ADMIN_CREATE_CARD_PREFIX,
      },
      headers: authHeaders(accessToken),
    })

    if (!response.ok()) {
      throw new Error(`Could not search for legacy admin-create cards: ${response.status()} ${await response.text()}`)
    }

    const page = (await response.json()) as CatalogPage
    if (page.items.length === 0) {
      return
    }

    for (const item of page.items) {
      const deletion = await request.delete(
        `${API_BASE_URL}/api/card/catalog/${encodeURIComponent(item.id)}?force=true`,
        { headers: authHeaders(accessToken) },
      )

      if (!deletion.ok()) {
        throw new Error(`Could not delete legacy admin-create card '${item.id}': ${deletion.status()} ${await deletion.text()}`)
      }
    }
  }
}

/** Proves the mocked create did not reach the database. */
export async function findAdminCreateCards(
  request: APIRequestContext,
  accessToken: string,
  cardId: string,
): Promise<string[]> {
  const response = await request.get(`${API_BASE_URL}/api/card/catalog`, {
    params: {
      page: 1,
      pageSize: 100,
      search: cardId,
    },
    headers: authHeaders(accessToken),
  })

  if (!response.ok()) {
    throw new Error(`Could not verify the created card stayed out of the catalogue: ${response.status()} ${await response.text()}`)
  }

  const page = (await response.json()) as CatalogPage
  return page.items.map((item) => item.id)
}
