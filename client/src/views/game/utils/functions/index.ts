export function buildLeaderCardFrameClass(baseClassName: string, hasCard: boolean): string {
  return `${baseClassName} ${hasCard ? 'border-transparent' : ''}`.trim()
}
