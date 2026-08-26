import type { ICardCatalogEffectRequest } from '@/services/api/types/cardCatalog'

export type IUpdateEffectAt = (
  effectIndex: number,
  updater: (effect: ICardCatalogEffectRequest) => ICardCatalogEffectRequest,
) => void

export type ICardAdminEffectPanelBaseProps = {
  effect: ICardCatalogEffectRequest
  effectIndex: number
  updateEffectAt: IUpdateEffectAt
}

export type ICardAdminExecutionPanelProps = ICardAdminEffectPanelBaseProps & {
  effectBranchErrors?: string[]
}

export type ICardAdminTargetRulesPanelProps = ICardAdminEffectPanelBaseProps

export type ICardAdminContextRulesPanelProps = ICardAdminEffectPanelBaseProps

export type ICardAdminSummonSettingsPanelProps = ICardAdminEffectPanelBaseProps

export type ICardAdminGainEffectPanelProps = ICardAdminEffectPanelBaseProps & {
  effectConditionKeywordOptions: string[]
}

export type ICardAdminAttributeModificationsPanelProps = ICardAdminEffectPanelBaseProps

export type ICardAdminChakraAdjustmentsPanelProps = ICardAdminEffectPanelBaseProps

export type ICardAdminFaceStateFlipsPanelProps = ICardAdminEffectPanelBaseProps

export type ICardAdminFaceStateLocksPanelProps = ICardAdminEffectPanelBaseProps

export type ICardAdminMoveCardActionsPanelProps = ICardAdminEffectPanelBaseProps

export type ICardAdminRevealCardPanelProps = ICardAdminEffectPanelBaseProps

export type ICardAdminPassiveSettingsPanelProps = ICardAdminEffectPanelBaseProps

export type ICardAdminContextRulePlayerPanelProps = {
  audience: 'player' | 'opponent'
  title: 'Player' | 'Opponent'
  effect: ICardCatalogEffectRequest
  effectIndex: number
  contextRuleIndex: number
  updateEffectAt: IUpdateEffectAt
}
