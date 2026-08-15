import type { ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'
import {
  DESCRIPTION_BOLD_PHRASES,
  DESCRIPTION_KEYWORD_PILL_CLASS_BY_COLOR,
  DESCRIPTION_KEYWORDS_BY_COLOR,
  KEYWORD_DESCRIPTION_VARIANTS,
  KEYWORD_DESCRIPTIONS,
  type DescriptionKeywordColor,
} from '@/components/ui/cards/constants'
import type { ICardCatalogItemResponse } from '@/types/cardCatalog'

function renderDescriptionLineWithKeywordPills(
  line: string,
  lineIndex: number,
  onKeywordMouseEnter: (event: React.MouseEvent<HTMLSpanElement>, keyword: string) => void,
  onKeywordMouseLeave: () => void,
  supportCost: number | null,
): ReactNode {
  const initialMatches = Array.from(line.matchAll(/\[([^\]]+)\]/g))
  const lineKeywords = initialMatches.map((match) => match[1]?.trim() ?? '').filter(Boolean)
  const sanitizedLine = stripKeywordDescriptionText(line, lineKeywords)
  const matches = Array.from(sanitizedLine.matchAll(/\[([^\]]+)\]/g))

  if (!sanitizedLine) {
    return null
  }

  if (matches.length === 0) {
    const standaloneNodes: ReactNode[] = []
    appendTextWithBoldPhrases(standaloneNodes, sanitizedLine, `description-line-${lineIndex}`)
    return standaloneNodes
  }

  const nodes: ReactNode[] = []
  let cursor = 0

  for (let matchIndex = 0; matchIndex < matches.length; matchIndex += 1) {
    const match = matches[matchIndex]
    const matchStart = match.index ?? 0
    const fullMatch = match[0]
    const keyword = match[1]?.trim() ?? ''

    if (matchStart > cursor) {
      appendTextWithBoldPhrases(nodes, sanitizedLine.slice(cursor, matchStart), `description-${lineIndex}-${matchIndex}-before`)
    }

    const keywordColor = resolveDescriptionKeywordColor(keyword)
    if (!keywordColor) {
      nodes.push(
        <strong
          key={`description-keyword-unmatched-${lineIndex}-${matchIndex}`}
          className="font-bold"
        >
          {fullMatch}
        </strong>,
      )
      cursor = matchStart + fullMatch.length
      continue
    }

    nodes.push(
      <span
        key={`description-keyword-${lineIndex}-${matchIndex}-${keyword}`}
        className={twMerge(
          'mx-0.5 inline-flex items-center rounded-full border px-1.5 py-[0.05rem] align-middle text-[0.7rem] font-semibold uppercase tracking-[0.04em]',
          DESCRIPTION_KEYWORD_PILL_CLASS_BY_COLOR[keywordColor],
        )}
        onMouseEnter={(event) => onKeywordMouseEnter(event, keyword)}
        onMouseLeave={onKeywordMouseLeave}
      >
        {keyword || fullMatch}
        {normalizeDescriptionKeyword(keyword) === 'support' && typeof supportCost === 'number' ? (
          <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-black px-1 text-[0.7rem] font-bold leading-none text-white">
            {supportCost}
          </span>
        ) : null}
      </span>,
    )

    cursor = matchStart + fullMatch.length
  }

  if (cursor < sanitizedLine.length) {
    appendTextWithBoldPhrases(nodes, sanitizedLine.slice(cursor), `description-${lineIndex}-tail`)
  }

  return nodes
}

function getPrimaryName(card: ICardCatalogItemResponse): string {
  if (card.displayName.trim()) {
    return card.displayName
  }

  if (card.name.length > 0 && card.name[0].trim()) {
    return card.name[0]
  }

  return card.id
}

function splitDescriptionLines(description: string | null | undefined): string[] {
  if (!description?.trim()) {
    return []
  }

  return description.split(/<br\s*\/?>/gi).map((line) => line.trim())
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeDescriptionKeyword(value: string): string {
  return value.trim().toLowerCase()
}

function resolveKeywordDescription(keyword: string): string | null {
  const normalizedKeyword = normalizeDescriptionKeyword(keyword)
  return KEYWORD_DESCRIPTIONS[normalizedKeyword as keyof typeof KEYWORD_DESCRIPTIONS] ?? null
}

function resolveKeywordDescriptionVariants(keyword: string): string[] {
  const normalizedKeyword = normalizeDescriptionKeyword(keyword)
  const variants = KEYWORD_DESCRIPTION_VARIANTS[normalizedKeyword as keyof typeof KEYWORD_DESCRIPTION_VARIANTS]
  return variants ?? []
}

function stripKeywordDescriptionText(line: string, keywords: string[]): string {
  let nextLine = line

  for (const keyword of keywords) {
    const keywordDescriptionVariants = resolveKeywordDescriptionVariants(keyword)
    if (keywordDescriptionVariants.length === 0) {
      continue
    }

    for (const keywordDescription of keywordDescriptionVariants) {
      const keywordDescriptionPattern = new RegExp(escapeRegExp(keywordDescription), 'gi')
      nextLine = nextLine.replace(keywordDescriptionPattern, '')
    }
  }

  nextLine = nextLine.replace(/\(\s*\)/g, '')

  return nextLine.replace(/\s{2,}/g, ' ').trim()
}

function resolveDescriptionKeywordColor(keyword: string): DescriptionKeywordColor | null {
  const normalizedKeyword = normalizeDescriptionKeyword(keyword)

  for (const [color, keywords] of Object.entries(DESCRIPTION_KEYWORDS_BY_COLOR) as Array<[DescriptionKeywordColor, string[]]>) {
    if (keywords.some((value) => normalizeDescriptionKeyword(value) === normalizedKeyword)) {
      return color
    }
  }

  return null
}

function appendTextWithBoldPhrases(nodes: ReactNode[], text: string, keyPrefix: string): void {
  if (!text) {
    return
  }

  const phrases = DESCRIPTION_BOLD_PHRASES.filter(Boolean)
  if (phrases.length === 0) {
    nodes.push(text)
    return
  }

  const phrasePattern = new RegExp(`(${phrases.map((value) => escapeRegExp(value)).join('|')})`, 'gi')
  const textSegments = text.split(phrasePattern)

  for (let segmentIndex = 0; segmentIndex < textSegments.length; segmentIndex += 1) {
    const segment = textSegments[segmentIndex]
    if (!segment) {
      continue
    }

    const isBoldPhrase = phrases.some((value) => normalizeDescriptionKeyword(value) === normalizeDescriptionKeyword(segment))
    if (isBoldPhrase) {
      nodes.push(
        <strong key={`${keyPrefix}-bold-${segmentIndex}`} className="font-bold">
          {segment}
        </strong>,
      )
      continue
    }

    nodes.push(segment)
  }
}

export {
  getPrimaryName,
  renderDescriptionLineWithKeywordPills,
  resolveKeywordDescription,
  splitDescriptionLines,
}
