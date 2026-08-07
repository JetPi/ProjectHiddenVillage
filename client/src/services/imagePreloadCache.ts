const preloadedImageSources = new Set<string>()
const inFlightImagePreloads = new Map<string, Promise<void>>()

function normalizeImageSource(src: string): string {
  return src.trim()
}

export function isImagePreloaded(src: string): boolean {
  const normalizedSource = normalizeImageSource(src)
  return normalizedSource.length > 0 && preloadedImageSources.has(normalizedSource)
}

export function isImagePreloadInFlight(src: string): boolean {
  const normalizedSource = normalizeImageSource(src)
  return normalizedSource.length > 0 && inFlightImagePreloads.has(normalizedSource)
}

export async function preloadImageSource(src: string): Promise<void> {
  const normalizedSource = normalizeImageSource(src)
  if (!normalizedSource || isImagePreloaded(normalizedSource)) {
    return
  }

  const existingInFlight = inFlightImagePreloads.get(normalizedSource)
  if (existingInFlight) {
    await existingInFlight
    return
  }

  const preloadPromise = new Promise<void>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'

    image.onload = () => {
      preloadedImageSources.add(normalizedSource)
      resolve()
    }

    image.onerror = () => {
      reject(new Error(`Failed to preload image source: ${normalizedSource}`))
    }

    image.src = normalizedSource
  }).finally(() => {
    inFlightImagePreloads.delete(normalizedSource)
  })

  inFlightImagePreloads.set(normalizedSource, preloadPromise)
  await preloadPromise
}

export async function preloadImageSources(srcList: string[]): Promise<void> {
  const uniqueSources: string[] = []
  const seen = new Set<string>()

  for (const src of srcList) {
    const normalizedSource = normalizeImageSource(src)
    if (!normalizedSource || seen.has(normalizedSource)) {
      continue
    }

    seen.add(normalizedSource)
    uniqueSources.push(normalizedSource)
  }

  if (uniqueSources.length === 0) {
    return
  }

  await Promise.allSettled(uniqueSources.map((source) => preloadImageSource(source)))
}
