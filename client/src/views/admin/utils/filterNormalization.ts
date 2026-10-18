export function normalizeFilterValue(value: string | null | undefined): string {
  const normalizedValue = value?.trim().toLowerCase() ?? ''
  return normalizedValue || 'unknown'
}

export function toTitleCaseLabel(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter((entry) => entry.length > 0)
    .map((entry) => `${entry[0].toUpperCase()}${entry.slice(1).toLowerCase()}`)
    .join(' ')
}

