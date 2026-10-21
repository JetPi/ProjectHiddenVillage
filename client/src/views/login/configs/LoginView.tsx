import type { IToggleOption } from '@/components/forms'
import type { IAdaptiveFieldConfig } from '@/components/forms'
import type { IDeckOptionsEntryMode, IGameCodeEntryMode } from '@/types/login'

export const deckOptionsModeOptions: readonly IToggleOption<IDeckOptionsEntryMode>[] = [
  { value: 'import', label: 'auth.config.deckImport' },
  { value: 'saved_decks', label: 'auth.config.deckSaved' },
  { value: 'starter_decks', label: 'auth.config.deckStarter' },
]

export const gameCodeModeOptions: readonly IToggleOption<IGameCodeEntryMode>[] = [
  { value: 'quickmatch', label: 'auth.config.modeQuickMatch' },
  { value: 'join', label: 'auth.config.modeJoin' },
  { value: 'create', label: 'auth.config.modeCreate' },
]

export const gameCodeFieldConfigByMode: Record<IGameCodeEntryMode, IAdaptiveFieldConfig> = {
  quickmatch: {
    type: 'select',
    choices: [
      { value: 'casual', label: 'auth.config.casual' }
    ],

  },
  join: {
    type: 'input',
    props: {
      placeholder: 'auth.config.joinCodePlaceholder',
      maxLength: 5,
    },
  },
  create: {
    type: 'input',
    props: {
      placeholder: 'auth.config.createCodePlaceholder',
      maxLength: 5,
    },
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
