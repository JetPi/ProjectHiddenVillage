import type { ToggleOption } from '../../../components/forms'
import type { AdaptiveFieldConfig } from '../../../components/forms'
import type { DeckOptionsEntryMode, GameCodeEntryMode } from '../../../types/login'

export const deckOptionsModeOptions: readonly ToggleOption<DeckOptionsEntryMode>[] = [
  { value: 'import', label: 'Import' },
  { value: 'saved_decks', label: 'Saved Decks' },
  { value: 'starter_decks', label: 'Starter Decks' },
]

export const gameCodeModeOptions: readonly ToggleOption<GameCodeEntryMode>[] = [
  { value: 'quickmatch', label: 'Quick Match' },
  { value: 'join', label: 'Join' },
  { value: 'create', label: 'Create' },
]

export const gameCodeFieldConfigByMode: Record<GameCodeEntryMode, AdaptiveFieldConfig> = {
  quickmatch: {
    type: 'select',
    choices: [
      { value: 'casual', label: 'Casual' }
    ],
    
  },
  join: {
    type: 'input',
    props: {
      placeholder: 'Paste your code here',
      maxLength: 5,
    },
  },
  create: {
    type: 'input',
    props: {
      placeholder: 'Code will be generated on create',
      maxLength: 5,
    },
  },
}

export const deckOptionsFieldConfigByMode: Record<DeckOptionsEntryMode, AdaptiveFieldConfig> = {
    import: {
      type: 'input',
      props: {
        placeholder: 'Use Import to paste your deck list',
        readOnly: true,
      },
    },
   saved_decks:{
    type: 'select',
    choices: [
      { value: '', label: 'Loading saved decks...' }
    ],
    
  },
  starter_decks: {
    type: 'select',
    choices: [
      { value: '', label: 'Loading public decks...' }
    ],
  },
}