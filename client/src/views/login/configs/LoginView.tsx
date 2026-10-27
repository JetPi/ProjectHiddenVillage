import type { IToggleOption } from '@/components/forms'
import type { IAdaptiveFieldConfig } from '@/components/forms'
import type { IDeckOptionsEntryMode, IGameEntryMode, IGameIntent } from '@/types/login'

export const deckOptionsModeOptions: readonly IToggleOption<IDeckOptionsEntryMode>[] = [
  { value: 'import', label: 'auth.config.deckImport' },
  { value: 'saved_decks', label: 'auth.config.deckSaved' },
  { value: 'starter_decks', label: 'auth.config.deckStarter' },
]

export const gameEntryModeOptions: readonly IToggleOption<IGameEntryMode>[] = [
  { value: 'quickmatch', label: 'auth.config.modeQuickMatch' },
  { value: 'join_or_host', label: 'auth.config.modeJoinOrHost' },
]

/**
 * Quick match queues inside a format and hosting opens a table bound to one, so both actions pick a format; joining
 * by code does not, because the code decides the table. The question is about the action a button asks for, not the
 * tab it sits on: the Join or Host tab offers both a format-driven action and a code-driven one side by side.
 */
export function isRulesetIntent(intent: IGameIntent): intent is 'quickmatch' | 'host' {
  return intent === 'quickmatch' || intent === 'host'
}

const gameIntents: readonly IGameIntent[] = ['quickmatch', 'join', 'host']

/** Narrowing for the `value` a submit button carries into the form's submit event. */
export function isGameIntent(value: string): value is IGameIntent {
  return gameIntents.some((intent) => intent === value)
}

export const joinGameCodeFieldConfig: IAdaptiveFieldConfig = {
  type: 'input',
  props: {
    placeholder: 'auth.config.joinCodePlaceholder',
    maxLength: 5,
  },
}

export const deckOptionsFieldConfigByMode: Record<IDeckOptionsEntryMode, IAdaptiveFieldConfig> = {
    import: {
      type: 'input',
      props: {
        placeholder: 'auth.config.importPlaceholder',
        readOnly: true,
      },
    },
   saved_decks:{
    type: 'select',
    choices: [
      { value: '', label: 'auth.config.loadingSavedDecks' }
    ],

  },
  starter_decks: {
    type: 'select',
    choices: [
      { value: '', label: 'auth.config.loadingPublicDecks' }
    ],
  },
}
