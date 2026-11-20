import type { ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'
import i18n from '@/i18n'
import {
  DESCRIPTION_BOLD_PHRASES,
  DESCRIPTION_KEYWORD_PILL_CLASS_BY_COLOR,
  DESCRIPTION_KEYWORDS_BY_COLOR,
  KEYWORD_DESCRIPTION_KEYS,
  KEYWORD_DESCRIPTION_VARIANTS,
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
      // Sized in `em`, not rem: this pill sits inside the description, and the description is the one run of text in the
      // app that grows with the game unit. Fixed rem made the pill a speck of dust next to a 30px line on a 4K panel and
      // almost as tall as the line on a laptop; as a fraction of its own line it reads the same at every size.
      // `leading-none` is load-bearing: the chip inherits the paragraph's 1.6 line-height, and at 0.9em that would make
      // it taller than the line it sits in, which is exactly how two stacked chips ended up touching.
      <span
        key={`description-keyword-${lineIndex}-${matchIndex}-${keyword}`}
        className={twMerge(
          'mx-[0.25em] inline-flex items-center gap-[0.3em] rounded-full border px-[0.55em] py-[0.12em] align-middle text-[0.9em] font-bold uppercase leading-none tracking-[0.03em]',
          DESCRIPTION_KEYWORD_PILL_CLASS_BY_COLOR[keywordColor],
        )}
        onMouseEnter={(event) => onKeywordMouseEnter(event, keyword)}
        onMouseLeave={onKeywordMouseLeave}
      >
        {keyword || fullMatch}
        {normalizeDescriptionKeyword(keyword) === 'support' && typeof supportCost === 'number' ? (
          <span className="inline-flex h-[1.1em] min-w-[1.1em] items-center justify-center rounded-full bg-black px-[0.3em] text-[0.9em] font-bold leading-none text-white">
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
  const descriptionKey =
    KEYWORD_DESCRIPTION_KEYS[normalizedKeyword as keyof typeof KEYWORD_DESCRIPTION_KEYS] ?? null
  return descriptionKey ? i18n.t(descriptionKey) : null
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
