import type { IToggleOption } from '@/components/forms'
import type { IAdaptiveFieldConfig } from '@/components/forms'
import type { IDeckOptionsEntryMode, IGameCodeEntryMode } from '@/types/login'

export const deckOptionsModeOptions: readonly IToggleOption<IDeckOptionsEntryMode>[] = [
  { value: 'import', label: 'Import' },
  { value: 'saved_decks', label: 'Saved Decks' },
  { value: 'starter_decks', label: 'Starter Decks' },
]

export const gameCodeModeOptions: readonly IToggleOption<IGameCodeEntryMode>[] = [
  { value: 'quickmatch', label: 'Quick Match' },
  { value: 'join', label: 'Join' },
  { value: 'create', label: 'Create' },
]

export const gameCodeFieldConfigByMode: Record<IGameCodeEntryMode, IAdaptiveFieldConfig> = {
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

export const deckOptionsFieldConfigByMode: Record<IDeckOptionsEntryMode, IAdaptiveFieldConfig> = {
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