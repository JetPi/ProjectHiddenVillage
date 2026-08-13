import type { IPromptPresentation, IPromptPresentationOption, IPromptPresentationSource } from '../types/promptPresentation'

const OVERLAY_PROMPT_TYPES = new Set<string>(['ChooseStartingPlayer'])

const PROMPT_TITLES: Record<string, string> = {
  ChooseStartingPlayer: 'Choose Who Starts',
  Mulligan: 'Mulligan',
}

const PROMPT_SUBTITLES: Record<string, string> = {
  ChooseStartingPlayer: 'Decide whether you or your opponent takes the first turn.',
  Mulligan: 'Choose whether to redraw your opening hand.',
}

const OPTION_LABELS: Record<string, string> = {
  goFirst: 'Go First',
  goSecond: 'Go Second',
  mulligan: 'Take Mulligan',
  noMulligan: 'Keep Hand',
}

function toTitleCaseWords(rawValue: string): string {
  return rawValue
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ')
}

function toReadableOptionLabel(optionValue: string): string {
  return OPTION_LABELS[optionValue] ?? toTitleCaseWords(optionValue)
}

function toPromptOption(optionValue: string): IPromptPresentationOption {
  return {
    value: optionValue,
    label: toReadableOptionLabel(optionValue),
  }
}

function toPromptPresentation(pendingPrompt: IPromptPresentationSource): IPromptPresentation | null {
  if (!pendingPrompt) {
    return null
  }

  const title = PROMPT_TITLES[pendingPrompt.type] ?? toTitleCaseWords(pendingPrompt.type)
  const subtitle = PROMPT_SUBTITLES[pendingPrompt.type] ?? 'Choose one of the available options.'

  return {
    promptType: pendingPrompt.type,
    title,
    subtitle,
    isAwaitingRequestingPlayer: pendingPrompt.isAwaitingRequestingPlayer,
    renderAsOverlay: OVERLAY_PROMPT_TYPES.has(pendingPrompt.type),
    options: pendingPrompt.options.map(toPromptOption),
  }
}

export {
  toPromptPresentation,
  toReadableOptionLabel,
}
